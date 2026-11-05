import "server-only";
import { canAccessVehicle, clean, hasPermission, raise, requireUid, tx, visible, type RpcHandler, type Tx } from "@/lib/db/rpc/helpers";
import { getPool, query } from "@/lib/db/pool";

const VEHICLE_SETTING_TYPES = ["vehicle_maintenance_type", "vehicle_insurance_type"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function actorName(t: Tx, userId: string) {
  const p = await t.one<{ full_name: string; email: string }>("SELECT full_name, email FROM profiles WHERE id = ?", [userId]);
  return (p?.full_name?.trim() || p?.email || "Người dùng hệ thống") as string;
}

/** VN 00:00 ngày 1/1 -> mốc UTC */
function vnYearStartUtc(year: number) {
  return new Date(Date.UTC(year, 0, 1) - 7 * 3600_000).toISOString().replace("T", " ").replace("Z", "");
}

async function canAccessTollBatch(ctx: Parameters<RpcHandler>[1], t: Tx, batchId: string, permission: string) {
  if (!hasPermission(ctx, permission)) return false;
  const rows = await t.rows<{ vehicle_id: string | null }>("SELECT DISTINCT vehicle_id FROM vehicle_toll_transactions WHERE batch_id = ?", [batchId]);
  for (const r of rows) {
    if (!r.vehicle_id || !(await canAccessVehicle(ctx, t.conn, r.vehicle_id, permission))) return false;
  }
  return true;
}

async function claimNotifications(
  t: Tx,
  table: "maintenance_notification_logs" | "vehicle_inspection_notification_logs",
  ownerColumn: "plan_id" | "inspection_id",
  row: Record<string, unknown>,
) {
  try {
    const created = await t.insert(table, { ...row, status: "PROCESSING", error: "" });
    return created.id as string;
  } catch (e) {
    if ((e as { code?: string }).code !== "23505") throw e;
  }
  const existing = await t.one<{ id: string }>(
    `SELECT id FROM \`${table}\` WHERE ${ownerColumn} = ? AND recipient_email = ? AND notification_type = ? AND due_date = ? AND status = 'FAILED' FOR UPDATE`,
    [row[ownerColumn], row.recipient_email, row.notification_type, row.due_date],
  );
  if (!existing) return null;
  await t.update(table, { status: "PROCESSING", error: "", sent_at: null }, { id: existing.id });
  return existing.id;
}

export const vehicleRpcs: Record<string, RpcHandler> = {
  async can_access_vehicle({ target_vehicle_id, required_permission }, ctx) {
    return canAccessVehicle(ctx, getPool(), target_vehicle_id, required_permission);
  },

  async archive_vehicle({ target_vehicle_id }, ctx) {
    return tx(ctx, async (t) => {
      if (!(await canAccessVehicle(ctx, t.conn, target_vehicle_id, "vehicles.delete"))) raise("Vehicle archive permission is required", "42501");
      const n = await t.update("vehicles", { deleted_at: new Date().toISOString(), updated_by: ctx.session.userId }, { id: target_vehicle_id }, (q) => q.is("deleted_at", null));
      if (!n) raise("Active vehicle not found", "P0002");
      return null;
    });
  },

  async save_vehicle_setting({ target_setting_id, target_setting_type, target_setting_value, target_display_name }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "vehicles.manage")) raise("Vehicle management access required");
    const type = clean(target_setting_type);
    const value = clean(target_setting_value).toUpperCase();
    const name = clean(target_display_name);
    if (!VEHICLE_SETTING_TYPES.includes(type)) raise("Invalid vehicle setting type");
    if (!name || name.length > 160) raise("Invalid display name");
    if (!value || value.length > 160 || !/^[A-Z0-9]+(_[A-Z0-9]+)*$/.test(value)) raise("Invalid setting value");
    return tx(ctx, async (t) => {
      if (!target_setting_id) {
        if (await t.one("SELECT 1 AS x FROM settings WHERE setting_type = ? AND setting_value = ?", [type, value])) raise("VEHICLE_SETTING_VALUE_EXISTS");
        const next = await t.one<{ n: number }>("SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM settings WHERE setting_type = ?", [type]);
        await t.insert("settings", { setting_type: type, setting_value: value, display_name: name, sort_order: Number(next?.n ?? 10), active: true });
        return 0;
      }
      const current = await t.one<{ setting_type: string; setting_value: string }>(
        "SELECT setting_type, setting_value FROM settings WHERE id = ? AND setting_type IN ('vehicle_maintenance_type','vehicle_insurance_type') FOR UPDATE",
        [target_setting_id],
      );
      if (!current) raise("Vehicle setting not found");
      if (await t.one("SELECT 1 AS x FROM settings WHERE setting_type = ? AND setting_value = ? AND id <> ?", [type, value, target_setting_id])) raise("VEHICLE_SETTING_VALUE_EXISTS");
      const linked = current.setting_type === "vehicle_maintenance_type"
        ? await t.one<{ n: number }>("SELECT COUNT(*) AS n FROM vehicle_repairs WHERE service_type = ? FOR UPDATE", [current.setting_value])
        : await t.one<{ n: number }>("SELECT COUNT(*) AS n FROM vehicle_insurances WHERE insurance_type = ? FOR UPDATE", [current.setting_value]);
      const linkedCount = Number(linked?.n ?? 0);
      if (type !== current.setting_type) {
        if (linkedCount > 0) raise("VEHICLE_SETTING_TYPE_IN_USE");
        const next = await t.one<{ n: number }>("SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM settings WHERE setting_type = ?", [type]);
        await t.update("settings", { setting_type: type, setting_value: value, display_name: name, sort_order: Number(next?.n ?? 10) }, { id: target_setting_id });
        return 0;
      }
      if (current.setting_value !== value) {
        if (current.setting_type === "vehicle_maintenance_type") await t.update("vehicle_repairs", { service_type: value }, { service_type: current.setting_value });
        else await t.update("vehicle_insurances", { insurance_type: value }, { insurance_type: current.setting_value });
      }
      await t.update("settings", { setting_value: value, display_name: name }, { id: target_setting_id });
      return linkedCount;
    });
  },

  async toggle_vehicle_setting({ target_setting_id, target_active }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "vehicles.manage")) raise("Vehicle management access required");
    return tx(ctx, async (t) => {
      const n = await t.update("settings", { active: Boolean(target_active) }, { id: target_setting_id }, (q) => q.in("setting_type", VEHICLE_SETTING_TYPES));
      if (!n) raise("Vehicle setting not found");
      return null;
    });
  },

  async reorder_vehicle_setting({ target_setting_id, move_direction }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "vehicles.manage")) raise("Vehicle management access required");
    if (!["up", "down"].includes(move_direction)) raise("Invalid direction");
    return tx(ctx, async (t) => {
      const target = await t.one<{ setting_type: string }>(
        "SELECT setting_type FROM settings WHERE id = ? AND active AND setting_type IN ('vehicle_maintenance_type','vehicle_insurance_type') FOR UPDATE",
        [target_setting_id],
      );
      if (!target) raise("Active vehicle setting not found");
      await reorderSettings(t, target.setting_type, target_setting_id, move_direction);
      return null;
    });
  },

  async renew_vehicle_insurance(a, ctx) {
    const userId = requireUid(ctx);
    return tx(ctx, async (t) => {
      const src = await t.one<any>("SELECT * FROM vehicle_insurances WHERE id = ? AND archived_at IS NULL FOR UPDATE", [a.target_source_insurance_id], "vehicle_insurances");
      if (!src) raise("VEHICLE_INSURANCE_NOT_ACTIVE");
      if (src.vehicle_id !== a.target_vehicle_id) raise("VEHICLE_INSURANCE_VEHICLE_MISMATCH");
      if (!(await canAccessVehicle(ctx, t.conn, src.vehicle_id, "vehicles.manage"))) raise("VEHICLE_INSURANCE_RENEWAL_FORBIDDEN");
      if (!a.target_starts_on || !a.target_expires_on || a.target_expires_on < a.target_starts_on) raise("VEHICLE_INSURANCE_INVALID_DATES");
      if (!clean(a.target_insurance_name) || !clean(a.target_insurance_type) || !clean(a.target_insurance_company)) raise("VEHICLE_INSURANCE_REQUIRED_FIELDS");
      const days = Number(a.target_reminder_days);
      if (Number(a.target_cost ?? 0) < 0 || !(days >= 1 && days <= 365)) raise("VEHICLE_INSURANCE_INVALID_VALUES");
      const now = new Date().toISOString();
      try {
        const created = await t.insert("vehicle_insurances", {
          vehicle_id: a.target_vehicle_id,
          insurance_name: clean(a.target_insurance_name),
          insurance_type: clean(a.target_insurance_type),
          insurance_company: clean(a.target_insurance_company),
          certificate_number: clean(a.target_certificate_number),
          starts_on: a.target_starts_on,
          expires_on: a.target_expires_on,
          cost: a.target_cost ?? 0,
          reminder_days: days,
          note: clean(a.target_note),
          created_by: userId,
          updated_by: userId,
          renewed_from_id: src.id,
          renewed_at: now,
          renewed_by: userId,
          renewed_by_name: await actorName(t, userId),
        });
        await t.update("vehicle_insurances", { archived_at: now, archived_by: userId, updated_by: userId }, { id: src.id });
        return created.id;
      } catch (e) {
        if ((e as { code?: string }).code === "23505") raise("VEHICLE_INSURANCE_ALREADY_RENEWED");
        throw e;
      }
    });
  },

  async renew_vehicle_inspection(a, ctx) {
    const userId = requireUid(ctx);
    return tx(ctx, async (t) => {
      const src = await t.one<any>("SELECT * FROM vehicle_inspections WHERE id = ? AND archived_at IS NULL FOR UPDATE", [a.target_source_inspection_id], "vehicle_inspections");
      if (!src) raise("VEHICLE_INSPECTION_NOT_ACTIVE");
      if (src.vehicle_id !== a.target_vehicle_id) raise("VEHICLE_INSPECTION_VEHICLE_MISMATCH");
      if (!(await canAccessVehicle(ctx, t.conn, src.vehicle_id, "vehicles.manage"))) raise("VEHICLE_INSPECTION_RENEWAL_FORBIDDEN");
      if (!a.target_inspection_date || !a.target_expires_on || a.target_expires_on < a.target_inspection_date || a.target_inspection_date <= src.inspection_date) {
        raise("VEHICLE_INSPECTION_INVALID_DATES");
      }
      const days = Number(a.target_reminder_days);
      const seats = a.target_seat_count === null || a.target_seat_count === undefined ? null : Number(a.target_seat_count);
      const odo = a.target_odometer_km === null || a.target_odometer_km === undefined ? null : Number(a.target_odometer_km);
      if (Number(a.target_cost ?? 0) < 0 || !(days >= 1 && days <= 180) || (seats !== null && !(seats >= 1 && seats <= 100)) || (odo !== null && odo < 0)) {
        raise("VEHICLE_INSPECTION_INVALID_VALUES");
      }
      const name = await actorName(t, userId);
      const now = new Date().toISOString();
      try {
        await t.update("vehicle_inspections", { archived_at: now, archived_by: userId, archived_by_name: name, updated_by: userId }, { id: src.id });
        const created = await t.insert("vehicle_inspections", {
          vehicle_id: a.target_vehicle_id,
          inspection_date: a.target_inspection_date,
          expires_on: a.target_expires_on,
          cost: a.target_cost ?? 0,
          reminder_days: days,
          certificate_number: clean(a.target_certificate_number),
          inspection_center: clean(a.target_inspection_center),
          seat_count: seats,
          odometer_km: odo,
          note: clean(a.target_note),
          created_by: userId,
          updated_by: userId,
          renewed_from_id: src.id,
          renewed_at: now,
          renewed_by: userId,
          renewed_by_name: name,
        });
        return created.id;
      } catch (e) {
        if ((e as { code?: string }).code === "23505") raise("VEHICLE_INSPECTION_ALREADY_RENEWED");
        throw e;
      }
    });
  },

  async vehicle_toll_year_totals({ target_year }, ctx) {
    const y = Number(target_year);
    const [r] = await query<{ monthly: string; quarterly: string }>(
      getPool(),
      `SELECT
        (SELECT COALESCE(SUM(amount_after_tax), 0) FROM ${visible(ctx, "vehicle_toll_transactions")} t WHERE transaction_at >= ? AND transaction_at < ?) AS monthly,
        (SELECT COALESCE(SUM(amount), 0) FROM ${visible(ctx, "vehicle_toll_quarterly_passes")} p WHERE starts_on >= ? AND starts_on < ?) AS quarterly`,
      [vnYearStartUtc(y), vnYearStartUtc(y + 1), `${y}-01-01`, `${y + 1}-01-01`],
    );
    return { monthly: Number(r?.monthly ?? 0), quarterly: Number(r?.quarterly ?? 0) };
  },

  async delete_vehicle_toll({ target_kind, target_id }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "vehicles.delete")) raise("VETC_FORBIDDEN");
    return tx(ctx, async (t) => {
      await t.one("SELECT GET_LOCK('tdw_vetc', 10) AS l");
      try {
        if (target_kind === "monthly") {
          if (!(await canAccessTollBatch(ctx, t, target_id, "vehicles.delete"))) raise("VETC_FORBIDDEN");
          await t.delete("vehicle_toll_transactions", { batch_id: target_id });
          return (await t.delete("vehicle_toll_monthly_batches", { id: target_id })) > 0;
        }
        if (target_kind === "quarterly") {
          const pass = await t.one<{ vehicle_id: string }>("SELECT vehicle_id FROM vehicle_toll_quarterly_passes WHERE id = ?", [target_id]);
          if (!pass || !(await canAccessVehicle(ctx, t.conn, pass.vehicle_id, "vehicles.delete"))) raise("VETC_FORBIDDEN");
          return (await t.delete("vehicle_toll_quarterly_passes", { id: target_id })) > 0;
        }
        raise("VETC_INVALID_INPUT");
      } finally {
        await t.one("SELECT RELEASE_LOCK('tdw_vetc') AS l");
      }
    });
  },

  async import_vehicle_tolls({ target_kind, target_source, target_rows, target_month = null, target_checksum = null, target_pages = null }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "vehicles.import")) raise("VETC_FORBIDDEN");
    const rows = Array.isArray(target_rows) ? target_rows : null;
    const source = clean(target_source);
    if (!["monthly", "quarterly"].includes(target_kind) || !rows || rows.length < 1 || rows.length > 1000 || source.length < 1 || source.length > 200) {
      raise("VETC_INVALID_INPUT");
    }
    return tx(ctx, async (t) => {
      await t.one("SELECT GET_LOCK('tdw_vetc', 10) AS l");
      try {
        for (const r of rows) {
          if (!r.vehicle_id || !(await canAccessVehicle(ctx, t.conn, r.vehicle_id, "vehicles.import"))) raise("VETC_VEHICLE_FORBIDDEN");
        }
        let saved = 0;
        if (target_kind === "monthly") {
          const month = String(target_month ?? "");
          const pages = Number(target_pages);
          if (!/^\d{4}-\d{2}-01$/.test(month) || !/^[0-9a-f]{64}$/.test(String(target_checksum ?? "")) || !(pages >= 1 && pages <= 500)) raise("VETC_INVALID_MONTH");
          let batch = await t.one<{ id: string }>("SELECT id FROM vehicle_toll_monthly_batches WHERE period_month = ?", [month]);
          if (batch && !(await canAccessTollBatch(ctx, t, batch.id, "vehicles.import"))) raise("VETC_BATCH_FORBIDDEN");
          if (batch) {
            await t.update("vehicle_toll_monthly_batches", { source_file_name: source, source_checksum: target_checksum, source_page_count: pages, updated_by: ctx.session.userId }, { id: batch.id });
          } else {
            batch = { id: (await t.insert("vehicle_toll_monthly_batches", { period_month: month, source_file_name: source, source_checksum: target_checksum, source_page_count: pages, created_by: ctx.session.userId, updated_by: ctx.session.userId })).id };
          }
          for (const r of rows) {
            const at = new Date(String(r.transaction_at));
            const vnMonth = new Date(at.getTime() + 7 * 3600_000).toISOString().slice(0, 7) + "-01";
            if (Number.isNaN(at.getTime()) || vnMonth !== month || Math.abs(Number(r.amount_before_tax) + Number(r.tax_amount) - Number(r.amount_after_tax)) > 1 || Number(r.page) > pages) {
              raise("VETC_INVALID_TRANSACTION");
            }
            if (await t.one("SELECT 1 AS x FROM vehicle_toll_transactions WHERE fingerprint = ?", [r.fingerprint])) continue;
            await t.insert("vehicle_toll_transactions", {
              batch_id: batch.id, vehicle_id: r.vehicle_id, license_plate: r.license_plate, toll_station: r.toll_station,
              transaction_at: r.transaction_at, invoice_number: r.invoice_number, transaction_code: r.transaction_code,
              amount_before_tax: r.amount_before_tax, tax_amount: r.tax_amount, amount_after_tax: r.amount_after_tax,
              source_page: r.page, fingerprint: r.fingerprint,
            });
            saved++;
          }
          const s = await t.one<any>(
            `SELECT COUNT(*) AS transactions, COUNT(DISTINCT vehicle_id) AS vehicles, COUNT(DISTINCT toll_station) AS stations,
               COALESCE(SUM(amount_before_tax),0) AS before_tax, COALESCE(SUM(tax_amount),0) AS tax, COALESCE(SUM(amount_after_tax),0) AS after_tax
             FROM vehicle_toll_transactions WHERE batch_id = ?`,
            [batch.id],
          );
          await t.update("vehicle_toll_monthly_batches", {
            transaction_count: Number(s.transactions), vehicle_count: Number(s.vehicles), station_count: Number(s.stations),
            amount_before_tax: s.before_tax, tax_amount: s.tax, amount_after_tax: s.after_tax,
          }, { id: batch.id });
        } else {
          for (const r of rows) {
            if (await t.one("SELECT 1 AS x FROM vehicle_toll_quarterly_passes WHERE fingerprint = ?", [r.fingerprint])) continue;
            await t.insert("vehicle_toll_quarterly_passes", {
              vehicle_id: r.vehicle_id, vehicle_type: r.vehicle_type, vehicle_color: r.vehicle_color, license_plate: r.license_plate,
              starts_on: r.starts_on, expires_on: r.expires_on, toll_station: r.toll_station, amount: r.amount,
              source_file: source, source_sheet: r.sheet, source_row: r.row, fingerprint: r.fingerprint,
              created_by: ctx.session.userId, updated_by: ctx.session.userId,
            });
            saved++;
          }
        }
        return saved;
      } finally {
        await t.one("SELECT RELEASE_LOCK('tdw_vetc') AS l");
      }
    });
  },

  async claim_vehicle_inspection_notifications({ target_candidates }, ctx) {
    if (!Array.isArray(target_candidates) || target_candidates.length > 500) raise("Candidates must be an array of at most 500 items");
    return tx(ctx, async (t) => {
      const out: Record<string, unknown>[] = [];
      for (const c of target_candidates) {
        const email = clean(c.recipient_email).toLowerCase();
        if (!EMAIL_RE.test(email) || !/^(DUE_(30|7|0)|OVERDUE_[0-9]+)$/.test(String(c.notification_type ?? ""))) continue;
        const valid = await t.one(
          "SELECT 1 AS x FROM vehicle_inspections vi JOIN vehicles v ON v.id = vi.vehicle_id WHERE vi.id = ? AND vi.vehicle_id = ? AND vi.expires_on = ? AND v.deleted_at IS NULL",
          [c.inspection_id, c.vehicle_id, c.due_date],
        );
        if (!valid) continue;
        const id = await claimNotifications(t, "vehicle_inspection_notification_logs", "inspection_id", {
          inspection_id: c.inspection_id, vehicle_id: c.vehicle_id, recipient_email: email, notification_type: c.notification_type, due_date: c.due_date,
        });
        if (id) out.push({ notification_id: id, inspection_id: c.inspection_id, vehicle_id: c.vehicle_id, recipient_email: email, notification_type: c.notification_type, due_date: c.due_date });
      }
      return out;
    });
  },

  async finish_vehicle_inspection_notifications({ target_results }, ctx) {
    return finishNotifications(ctx, "vehicle_inspection_notification_logs", target_results);
  },

  async claim_maintenance_notifications({ target_candidates }, ctx) {
    if (!Array.isArray(target_candidates) || target_candidates.length > 500) raise("Candidates must be an array of at most 500 items", "22023");
    return tx(ctx, async (t) => {
      const out: Record<string, unknown>[] = [];
      for (const c of target_candidates) {
        const email = clean(c.recipient_email).toLowerCase();
        if (!EMAIL_RE.test(email) || email.length > 320 || !/^(DUE_(7|3|1|0)|OVERDUE_[0-9]+)$/.test(String(c.notification_type ?? ""))) continue;
        const valid = await t.one(
          "SELECT 1 AS x FROM maintenance_plans mp JOIN assets a ON a.id = mp.asset_id WHERE mp.id = ? AND mp.asset_id = ? AND mp.next_due_date = ? AND mp.active AND a.deleted_at IS NULL",
          [c.plan_id, c.asset_id, c.due_date],
        );
        if (!valid) continue;
        const id = await claimNotifications(t, "maintenance_notification_logs", "plan_id", {
          plan_id: c.plan_id, asset_id: c.asset_id, recipient_email: email, notification_type: c.notification_type, due_date: c.due_date,
        });
        if (id) out.push({ notification_id: id, plan_id: c.plan_id, asset_id: c.asset_id, recipient_email: email, notification_type: c.notification_type, due_date: c.due_date });
      }
      return out;
    });
  },

  async finish_maintenance_notifications({ target_results }, ctx) {
    return finishNotifications(ctx, "maintenance_notification_logs", target_results);
  },
};

async function finishNotifications(ctx: Parameters<RpcHandler>[1], table: string, results: unknown) {
  if (!Array.isArray(results) || results.length > 500) raise("Results must be an array of at most 500 items", "22023");
  return tx(ctx, async (t) => {
    for (const r of results as Record<string, unknown>[]) {
      const status = clean(r.status).toUpperCase();
      if (!["SENT", "FAILED", "UNKNOWN"].includes(status)) continue;
      await t.update(table, { status, sent_at: status === "SENT" ? new Date().toISOString() : null, error: String(r.error ?? "").slice(0, 500) }, { id: r.notification_id, status: "PROCESSING" });
    }
    return null;
  });
}

/** Đổi chỗ thứ tự 1 mục cài đặt trong nhóm (dùng chung cho admin_reorder_setting) */
export async function reorderSettings(t: Tx, settingType: string, targetId: string, direction: string) {
  const items = await t.rows<{ id: string }>(
    "SELECT id FROM settings WHERE setting_type = ? AND active ORDER BY sort_order, display_name, id FOR UPDATE",
    [settingType],
  );
  const ids = items.map((i) => i.id);
  const pos = ids.indexOf(targetId);
  const swap = direction === "up" ? pos - 1 : pos + 1;
  if (pos < 0 || swap < 0 || swap >= ids.length) return;
  [ids[pos], ids[swap]] = [ids[swap], ids[pos]];
  for (let i = 0; i < ids.length; i++) await t.update("settings", { sort_order: (i + 1) * 10 }, { id: ids[i] });
}
