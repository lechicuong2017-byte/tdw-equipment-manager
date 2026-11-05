import "server-only";
import { canAccessAsset, clean, hasPermission, isAdmin, raise, requireUid, tx, type RpcHandler, type Tx } from "@/lib/db/rpc/helpers";
import { reorderSettings } from "@/lib/db/rpc/vehicles";
import { getPool, query } from "@/lib/db/pool";
import { getMyAccess } from "@/lib/db/client";
import type { AccessContext } from "@/lib/db/policy-fragments";
import { storageRoot } from "@/lib/db/storage";

const SYSTEM_MODULES = ["equipment", "vehicles", "supplies", "telecom", "surveys", "it_costs"];
const SETTING_TYPES = ["asset_group", "asset_type", "status", "maintenance_type", "software_name"];

async function auditLog(t: Tx, action: string, table: string, recordId: string | null, metadata: unknown) {
  await t.exec("INSERT INTO audit_logs (actor_user_id, action, table_name, record_id, metadata) VALUES (?, ?, ?, ?, ?)", [
    t.ctx.session.userId, action, table, recordId, JSON.stringify(metadata ?? {}),
  ]);
}

async function setUserAccess(
  ctx: Parameters<RpcHandler>[1],
  a: { target_user_id: string; target_role_code: string; target_active: boolean; target_must_enroll_mfa: boolean; target_scopes: unknown; target_modules?: unknown },
) {
  if (!isAdmin(ctx)) raise("Administrator AAL2 is required");
  const scopes = a.target_scopes ?? [];
  if (!Array.isArray(scopes)) raise("Scopes must be a JSON array");
  return tx(ctx, async (t) => {
    let modules = a.target_modules;
    if (modules === undefined) {
      modules = (await t.rows<{ module: string }>("SELECT module FROM user_module_access WHERE user_id = ? ORDER BY module", [a.target_user_id])).map((m) => m.module);
    }
    if (!Array.isArray(modules)) raise("Modules must be a JSON array");
    if ((modules as unknown[]).some((m) => typeof m !== "string" || !SYSTEM_MODULES.includes(m))) raise("Unknown system module");
    if (a.target_user_id === ctx.session.userId && (!a.target_active || a.target_role_code !== "admin")) {
      raise("An administrator cannot remove their own access");
    }
    const role = await t.one<{ id: string }>("SELECT id FROM roles WHERE code = ?", [a.target_role_code]);
    if (!role) raise("Unknown role");
    const normalized = a.target_role_code === "admin" ? SYSTEM_MODULES : [...new Set(modules as string[])];
    const n = await t.update("profiles", { active: Boolean(a.target_active), must_enroll_mfa: Boolean(a.target_must_enroll_mfa) }, { id: a.target_user_id });
    if (!n) raise("User profile not found");
    await t.exec("DELETE FROM user_roles WHERE user_id = ?", [a.target_user_id]);
    await t.exec("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [a.target_user_id, role.id]);
    await t.table("user_module_access").delete().eq("user_id", a.target_user_id);
    for (const module of normalized) await t.insert("user_module_access", { user_id: a.target_user_id, module, created_by: ctx.session.userId });
    await t.table("data_access_scopes").delete().eq("user_id", a.target_user_id);
    for (const s of scopes as { module: string; scope_type: string; department_id: string | null }[]) {
      await t.insert("data_access_scopes", {
        user_id: a.target_user_id, module: s.module, scope_type: s.scope_type, department_id: s.department_id ?? null, created_by: ctx.session.userId,
      });
    }
    // Tài khoản bị khoá: huỷ mọi phiên đăng nhập
    if (!a.target_active) await t.exec("DELETE FROM auth_sessions WHERE user_id = ?", [a.target_user_id]);
    await auditLog(t, "ACCESS_UPDATED", "profiles", a.target_user_id, {
      role: a.target_role_code, active: a.target_active, must_enroll_mfa: a.target_must_enroll_mfa, modules: normalized, scopes,
    });
    return null;
  });
}

export const adminRpcs: Record<string, RpcHandler> = {
  async get_my_access(_a, ctx) {
    const access = (ctx.session as { access?: AccessContext }).access;
    if (!access) return null;
    return getMyAccess(access);
  },

  async get_system_capacity_usage(_a, ctx) {
    if (!isAdmin(ctx)) raise("Admin access required", "42501");
    const [db] = await query<{ bytes: string }>(
      getPool(),
      "SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes FROM information_schema.tables WHERE table_schema = DATABASE()",
    );
    const [st] = await query<{ bytes: string; n: string }>(getPool(), "SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS n FROM storage_objects");
    return {
      database_bytes: Number(db?.bytes ?? 0),
      storage_bytes: Number(st?.bytes ?? 0),
      storage_objects: Number(st?.n ?? 0),
      storage_dir: storageRoot(),
      checked_at: new Date().toISOString(),
    };
  },

  async admin_set_user_access(a, ctx) {
    return setUserAccess(ctx, a as never);
  },

  async admin_update_setting({ target_setting_id, target_setting_type, target_setting_value, target_display_name }, ctx) {
    if (!ctx.session.userId || !isAdmin(ctx)) raise("Admin access required");
    const type = clean(target_setting_type), value = clean(target_setting_value).toUpperCase(), name = clean(target_display_name);
    if (!SETTING_TYPES.includes(type)) raise("Invalid setting type");
    if (!name || name.length > 160) raise("Invalid display name");
    if (!value || value.length > 160 || !/^[A-Z0-9]+(_[A-Z0-9]+)*$/.test(value)) raise("Invalid setting value");
    return tx(ctx, async (t) => {
      const cur = await t.one<{ setting_type: string; setting_value: string; display_name: string }>(
        "SELECT setting_type, setting_value, display_name FROM settings WHERE id = ? FOR UPDATE", [target_setting_id],
      );
      if (!cur) raise("Setting not found");
      if (await t.one("SELECT 1 AS x FROM settings WHERE setting_type = ? AND setting_value = ? AND id <> ?", [type, value, target_setting_id])) raise("SETTING_VALUE_EXISTS");
      if (type === cur.setting_type && value === cur.setting_value && name === cur.display_name) return 0;
      const count = async (sql: string, p: unknown[]) => Number((await t.one<{ n: number }>(sql, p))?.n ?? 0);
      let linked = 0;
      switch (cur.setting_type) {
        case "asset_group":
          linked = (await count("SELECT COUNT(*) AS n FROM assets WHERE asset_group = ?", [cur.setting_value]))
            + (await count("SELECT COUNT(*) AS n FROM maintenance_plans WHERE scope_type = 'GROUP' AND scope_value = ?", [cur.setting_value]));
          break;
        case "asset_type":
          linked = (await count("SELECT COUNT(*) AS n FROM assets WHERE asset_type = ?", [cur.setting_value]))
            + (await count("SELECT COUNT(*) AS n FROM maintenance_plans WHERE scope_type = 'TYPE' AND scope_value = ?", [cur.setting_value]));
          break;
        case "status":
          linked = await count("SELECT COUNT(*) AS n FROM assets WHERE status = ?", [cur.setting_value]);
          break;
        case "maintenance_type":
          linked = await count("SELECT COUNT(*) AS n FROM maintenance_logs WHERE action_type = ?", [cur.setting_value]);
          break;
        case "software_name":
          linked = await count("SELECT COUNT(*) AS n FROM software_licenses WHERE software_name = ?", [cur.display_name]);
          break;
      }
      if (type !== cur.setting_type) {
        if (linked > 0) raise("SETTING_TYPE_IN_USE");
        const next = await t.one<{ n: number }>("SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM settings WHERE setting_type = ?", [type]);
        await t.update("settings", { setting_type: type, setting_value: value, display_name: name, sort_order: Number(next?.n ?? 10) }, { id: target_setting_id });
        return 0;
      }
      // Cập nhật cài đặt trước để hook nhãn nhóm tài sản đọc được tên mới
      await t.update("settings", { setting_value: value, display_name: name }, { id: target_setting_id });
      let affected = 0;
      switch (cur.setting_type) {
        case "asset_group":
          affected += await t.update("assets", { asset_group: value, asset_group_label: name }, { asset_group: cur.setting_value });
          affected += await t.update("maintenance_plans", { scope_value: value }, { scope_type: "GROUP", scope_value: cur.setting_value });
          break;
        case "asset_type":
          affected += await t.update("assets", { asset_type: value }, { asset_type: cur.setting_value });
          affected += await t.update("maintenance_plans", { scope_value: value }, { scope_type: "TYPE", scope_value: cur.setting_value });
          break;
        case "status":
          affected = await t.update("assets", { status: value }, { status: cur.setting_value });
          break;
        case "maintenance_type":
          affected = await t.update("maintenance_logs", { action_type: value }, { action_type: cur.setting_value });
          break;
        case "software_name":
          affected = await t.update("software_licenses", { software_name: name }, { software_name: cur.display_name });
          break;
      }
      return affected;
    });
  },

  async admin_update_setting_label({ target_setting_id, target_display_name }, ctx) {
    if (!ctx.session.userId || !isAdmin(ctx)) raise("Admin access required");
    const name = clean(target_display_name);
    if (!name || name.length > 160) raise("Invalid display name");
    return tx(ctx, async (t) => {
      const cur = await t.one<{ setting_type: string; setting_value: string }>("SELECT setting_type, setting_value FROM settings WHERE id = ? FOR UPDATE", [target_setting_id]);
      if (!cur) raise("Setting not found");
      await t.update("settings", { display_name: name }, { id: target_setting_id });
      if (cur.setting_type === "asset_group") {
        await t.update("assets", { asset_group_label: name }, { asset_group: cur.setting_value }, (q) => q.is("deleted_at", null));
      }
      return null;
    });
  },

  async admin_reorder_setting({ target_setting_id, move_direction }, ctx) {
    if (!ctx.session.userId || !isAdmin(ctx)) raise("Admin access required");
    if (!["up", "down"].includes(move_direction)) raise("Invalid direction");
    return tx(ctx, async (t) => {
      const target = await t.one<{ setting_type: string }>("SELECT setting_type FROM settings WHERE id = ? AND active FOR UPDATE", [target_setting_id]);
      if (!target) raise("Active setting not found");
      await reorderSettings(t, target.setting_type, target_setting_id, move_direction);
      return null;
    });
  },

  async admin_set_asset_responsibles({ target_asset_id, target_primary_user_id = null, target_secondary_user_ids = [] }, ctx) {
    if (!isAdmin(ctx)) raise("Administrator AAL2 is required", "42501");
    return tx(ctx, async (t) => {
      if (!(await t.one("SELECT 1 AS x FROM assets WHERE id = ? AND deleted_at IS NULL", [target_asset_id]))) raise("Asset not found", "P0002");
      const secondary: string[] = Array.isArray(target_secondary_user_ids) ? target_secondary_user_ids.filter(Boolean) : [];
      const selected = [...new Set([...secondary, ...(target_primary_user_id ? [target_primary_user_id] : [])])];
      for (const id of selected) {
        const p = await t.one<{ active: number; email: string }>("SELECT active, email FROM profiles WHERE id = ?", [id]);
        if (!p || !Number(p.active) || String(p.email).indexOf("@") < 1) raise("Responsible users must be active and have valid email", "23514");
      }
      await t.table("asset_responsibles").delete().eq("asset_id", target_asset_id);
      if (target_primary_user_id) {
        await t.insert("asset_responsibles", { asset_id: target_asset_id, user_id: target_primary_user_id, responsibility_role: "primary", active: true });
      }
      for (const id of new Set(secondary)) {
        if (id === target_primary_user_id) continue;
        await t.insert("asset_responsibles", { asset_id: target_asset_id, user_id: id, responsibility_role: "secondary", active: true });
      }
      return null;
    });
  },

  async save_software_license_with_assets(a, ctx) {
    const userId = requireUid(ctx);
    if (!hasPermission(ctx, "software.manage")) raise("Software management permission is required", "42501");
    const name = clean(a.target_software_name);
    const status = String(a.target_status ?? "");
    if (!name || name.length > 200) raise("Invalid software name", "22023");
    if (String(a.target_version ?? "").length > 120 || String(a.target_assigned_user_name ?? "").length > 200 || String(a.target_note ?? "").length > 3000
      || !["ACTIVE", "EXPIRING", "EXPIRED", "SUSPENDED", ""].includes(status)) raise("Invalid software license data", "22023");
    const assetIds: string[] = [...new Set<string>((Array.isArray(a.target_assigned_asset_ids) ? a.target_assigned_asset_ids : []).filter(Boolean))];
    if (assetIds.length > 1000) raise("Too many assigned assets", "22023");
    return tx(ctx, async (t) => {
      for (const id of assetIds) {
        const ok = await t.one("SELECT 1 AS x FROM assets WHERE id = ? AND deleted_at IS NULL AND status <> 'DA_THANH_LY'", [id]);
        if (!ok || !(await canAccessAsset(ctx, t.conn, id, "assets", "assets.view"))) raise("One or more assigned assets are invalid or inaccessible", "22023");
      }
      const values = {
        software_name: name,
        version: clean(a.target_version),
        assigned_asset_id: assetIds[0] ?? null,
        assigned_user_name: clean(a.target_assigned_user_name),
        expiry_date: a.target_expiry_date || null,
        status,
        note: clean(a.target_note),
      };
      let licenseId = a.target_license_id as string | null;
      if (!licenseId) {
        licenseId = (await t.insert("software_licenses", { ...values, created_by: userId })).id;
      } else if (!(await t.update("software_licenses", values, { id: licenseId }))) {
        raise("Software license not found", "P0002");
      }
      const existing = await t.rows<{ asset_id: string }>("SELECT asset_id FROM software_license_assets WHERE license_id = ?", [licenseId]);
      for (const e of existing) {
        if (!assetIds.includes(e.asset_id)) await t.delete("software_license_assets", { license_id: licenseId, asset_id: e.asset_id });
      }
      const have = new Set(existing.map((e) => e.asset_id));
      for (const id of assetIds) if (!have.has(id)) await t.insert("software_license_assets", { license_id: licenseId, asset_id: id, assigned_by: userId });
      return licenseId;
    });
  },

  async admin_store_software_license_secret(a, ctx) {
    if (!isAdmin(ctx)) raise("Admin with MFA required");
    const len = (v: unknown) => String(v ?? "").length;
    if (Number(a.target_encryption_version ?? 1) !== 1 || len(a.target_ciphertext) < 1 || len(a.target_ciphertext) > 8192
      || len(a.target_iv) < 1 || len(a.target_iv) > 64 || len(a.target_auth_tag) < 1 || len(a.target_auth_tag) > 64
      || len(a.target_masked) < 1 || len(a.target_masked) > 200) raise("Invalid encrypted license payload");
    return tx(ctx, async (t) => {
      if (!(await t.one("SELECT 1 AS x FROM software_licenses WHERE id = ?", [a.target_license_id]))) raise("Software license not found");
      await t.exec(
        `INSERT INTO software_license_secrets (license_id, ciphertext, iv, auth_tag, encryption_version, updated_by) VALUES (?, ?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE ciphertext = VALUES(ciphertext), iv = VALUES(iv), auth_tag = VALUES(auth_tag),
           encryption_version = VALUES(encryption_version), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP(6)`,
        [a.target_license_id, a.target_ciphertext, a.target_iv, a.target_auth_tag, ctx.session.userId],
      );
      await t.update("software_licenses", { license_key_masked: a.target_masked, license_secret_ref: "encrypted:v1" }, { id: a.target_license_id });
      await auditLog(t, "STORE_SECRET", "software_licenses", a.target_license_id, { encryption_version: 1 });
      return null;
    });
  },

  async admin_get_software_license_secret({ target_license_id }, ctx) {
    if (!isAdmin(ctx)) raise("Admin with MFA required");
    return tx(ctx, async (t) => {
      const rows = await t.rows<any>("SELECT ciphertext, iv, auth_tag, encryption_version FROM software_license_secrets WHERE license_id = ?", [target_license_id]);
      if (rows.length) await auditLog(t, "REVEAL_SECRET", "software_licenses", target_license_id, { encryption_version: 1 });
      return rows.map((r) => ({ ...r, encryption_version: Number(r.encryption_version) }));
    });
  },

  async create_maintenance_plan_batch(a, ctx) {
    const userId = requireUid(ctx);
    const scopeType = clean(a.target_scope_type).toUpperCase(), scopeValue = clean(a.target_scope_value);
    const title = clean(a.target_title), frequency = clean(a.target_frequency).toUpperCase(), note = clean(a.target_note);
    if (!["ASSET", "GROUP", "TYPE"].includes(scopeType)) raise("Invalid maintenance scope", "22023");
    if (!scopeValue || scopeValue.length > 160) raise("Maintenance scope is required", "22023");
    if (!title || title.length > 200) raise("Invalid maintenance title", "22023");
    if (!["MONTHLY", "QUARTERLY", "YEARLY"].includes(frequency)) raise("Invalid maintenance frequency", "22023");
    if (!a.target_next_due_date) raise("Maintenance due date is required", "22023");
    if (note.length > 3000) raise("Maintenance note is too long", "22023");
    return tx(ctx, async (t) => {
      const column = scopeType === "ASSET" ? "id" : scopeType === "GROUP" ? "asset_group" : "asset_type";
      const candidates = await t.rows<{ id: string }>(`SELECT id FROM assets WHERE deleted_at IS NULL AND \`${column}\` = ? ORDER BY asset_code, id`, [scopeValue]);
      const selected: string[] = [];
      for (const c of candidates) if (await canAccessAsset(ctx, t.conn, c.id, "maintenance", "maintenance.manage")) selected.push(c.id);
      if (!selected.length) raise("No assets match the selected maintenance scope", "P0002");
      if (selected.length > 200) raise("A maintenance batch can contain at most 200 assets", "54000");
      const batchId = crypto.randomUUID();
      await t.insertMany("maintenance_plans", selected.map((assetId) => ({
        batch_id: batchId, scope_type: scopeType, scope_value: scopeValue, asset_id: assetId, title, frequency,
        next_due_date: a.target_next_due_date, note, active: a.target_active ?? true, repeat_enabled: a.target_repeat_enabled ?? true, created_by: userId,
      })));
      return selected.length;
    });
  },

  async update_maintenance_plan_schedule(a, ctx) {
    requireUid(ctx);
    const title = clean(a.target_title), frequency = clean(a.target_frequency).toUpperCase(), note = clean(a.target_note);
    if (!title || title.length > 200) raise("Invalid maintenance title", "22023");
    if (!["MONTHLY", "QUARTERLY", "YEARLY"].includes(frequency)) raise("Invalid maintenance frequency", "22023");
    if (!a.target_next_due_date || note.length > 3000) raise("Invalid maintenance schedule", "22023");
    return tx(ctx, async (t) => {
      const plan = await t.one<{ batch_id: string; asset_id: string }>("SELECT batch_id, asset_id FROM maintenance_plans WHERE id = ? FOR UPDATE", [a.target_plan_id]);
      if (!plan) raise("Maintenance plan not found", "P0002");
      if (!(await canAccessAsset(ctx, t.conn, plan.asset_id, "maintenance", "maintenance.manage"))) raise("Maintenance access denied", "42501");
      const values = { title, frequency, next_due_date: a.target_next_due_date, note, active: a.target_active ?? true, repeat_enabled: a.target_repeat_enabled ?? true };
      if (a.target_apply_to_batch) {
        const members = await t.rows<{ asset_id: string }>("SELECT asset_id FROM maintenance_plans WHERE batch_id = ? FOR UPDATE", [plan.batch_id]);
        for (const m of members) {
          if (!(await canAccessAsset(ctx, t.conn, m.asset_id, "maintenance", "maintenance.manage"))) raise("Maintenance access denied for one or more batch assets", "42501");
        }
        return t.update("maintenance_plans", values, { batch_id: plan.batch_id });
      }
      return t.update("maintenance_plans", values, { id: a.target_plan_id });
    });
  },

  async claim_export_job({ target_export_type, target_output_format, target_idempotency_key, target_filters = {} }, ctx) {
    const permission = ({
      assets: "reports.assets.export", liquidations: "reports.assets.export", maintenance: "reports.maintenance.export",
      movement: "reports.movement.export", software: "reports.software.export", vehicles: "reports.vehicles.export",
      vehicle_inspections: "reports.vehicles.export", vehicle_repairs: "reports.vehicles.export", vehicle_fuel: "reports.vehicles.export",
    } as Record<string, string>)[target_export_type];
    if (!permission || !hasPermission(ctx, permission)) raise("Report export permission is required", "42501");
    if (!["xlsx", "pdf"].includes(target_output_format) || !/^[a-f0-9]{64}$/.test(String(target_idempotency_key ?? ""))) raise("Invalid export job request", "22023");
    const userId = requireUid(ctx);
    return tx(ctx, async (t) => {
      let insertedId: string | null = null;
      const existing = await t.one("SELECT id FROM export_jobs WHERE requested_by = ? AND idempotency_key = ?", [userId, target_idempotency_key]);
      if (!existing) {
        insertedId = (await t.insert("export_jobs", {
          export_type: target_export_type, output_format: target_output_format, idempotency_key: target_idempotency_key,
          filters: target_filters ?? {}, status: "processing", requested_by: userId,
        })).id;
      }
      const job = await t.one<{ id: string; status: string; result_url: string | null }>(
        "SELECT id, status, result_url FROM export_jobs WHERE requested_by = ? AND idempotency_key = ? LIMIT 1", [userId, target_idempotency_key],
      );
      return job ? [{ job_id: job.id, job_status: job.status, result_url: job.result_url, is_new: job.id === insertedId }] : [];
    });
  },

  async finish_export_job({ target_job_id, target_status, target_result_url = null, target_error = null }, ctx) {
    if (!["completed", "failed"].includes(target_status)) raise("Invalid export status");
    return tx(ctx, async (t) => {
      const n = await t.update("export_jobs", {
        status: target_status,
        result_url: target_status === "completed" ? target_result_url : null,
        error: target_status === "failed" ? String(target_error ?? "").slice(0, 1000) : null,
        completed_at: new Date().toISOString(),
      }, { id: target_job_id, requested_by: ctx.session.userId }, (q) => q.in("status", ["pending", "processing"]));
      if (!n) raise("Export job not found");
      return null;
    });
  },
};
