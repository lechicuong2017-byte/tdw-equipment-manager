import "server-only";
import { canAccessAsset, clean, hasPermission, raise, requireUid, tx, visible, vnToday, type RpcHandler } from "@/lib/db/rpc/helpers";
import { query, getPool } from "@/lib/db/pool";

const COMPONENT_STATUSES = ["CON_SU_DUNG", "MOI_100", "KEM_PHAM_CHAT", "CAN_KIEM_TRA", "KHONG_SU_DUNG", "LUU_KHO_THANH_LY"];

async function hasActiveLinks(t: { one: (sql: string, p: unknown[]) => Promise<unknown> }, assetId: string) {
  return Boolean(
    await t.one(
      "SELECT 1 AS x FROM asset_component_installations WHERE removed_at IS NULL AND (host_asset_id = ? OR component_asset_id = ?) LIMIT 1",
      [assetId, assetId],
    ),
  );
}

export const assetRpcs: Record<string, RpcHandler> = {
  async archive_asset({ target_asset_id }, ctx) {
    return tx(ctx, async (t) => {
      if (!(await canAccessAsset(ctx, t.conn, target_asset_id, "assets", "assets.manage")) || !hasPermission(ctx, "assets.delete")) {
        raise("Asset archive permission is required", "42501");
      }
      if (await hasActiveLinks(t, target_asset_id)) raise("Remove active component links before archiving the asset", "23503");
      const n = await t.update(
        "assets",
        { deleted_at: new Date().toISOString(), deleted_by: ctx.session.userId, updated_by: ctx.session.userId },
        { id: target_asset_id },
        (q) => q.is("deleted_at", null),
      );
      if (!n) raise("Active asset not found", "P0002");
      return null;
    });
  },

  async liquidate_asset({ target_asset_id, target_liquidation_date, target_recovery_value, target_reason, target_note }, ctx) {
    const userId = requireUid(ctx);
    return tx(ctx, async (t) => {
      if (!(await canAccessAsset(ctx, t.conn, target_asset_id, "assets", "assets.manage")) || !hasPermission(ctx, "assets.delete")) {
        raise("Asset liquidation permission is required", "42501");
      }
      const reason = clean(target_reason);
      if (!target_liquidation_date || String(target_liquidation_date) > vnToday()) raise("Invalid liquidation date", "22023");
      if (target_recovery_value !== null && target_recovery_value !== undefined && Number(target_recovery_value) < 0) raise("Invalid recovery value", "22023");
      if (!reason || reason.length > 500) raise("Invalid liquidation reason", "22023");
      if (String(target_note ?? "").length > 2000) raise("Invalid liquidation note", "22023");
      const asset = await t.one<{ id: string; status: string }>("SELECT id, status FROM assets WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [target_asset_id]);
      if (!asset) raise("Active asset not found", "P0002");
      if (asset.status === "DA_THANH_LY") raise("Asset is already liquidated", "23505");
      if (await hasActiveLinks(t, target_asset_id)) raise("Remove active component links before liquidating the asset", "23503");
      const liquidation = await t.insert("asset_liquidations", {
        asset_id: target_asset_id,
        liquidation_date: target_liquidation_date,
        recovery_value: target_recovery_value ?? null,
        reason,
        note: clean(target_note),
        recorded_by: userId,
      });
      await t.update("assets", { status: "DA_THANH_LY", updated_by: userId }, { id: target_asset_id });
      return liquidation.id;
    });
  },

  async restore_liquidated_asset({ target_asset_id, target_void_reason = "Khôi phục do ghi nhận nhầm" }, ctx) {
    const userId = requireUid(ctx);
    return tx(ctx, async (t) => {
      if (!(await canAccessAsset(ctx, t.conn, target_asset_id, "assets", "assets.manage")) || !hasPermission(ctx, "assets.delete")) {
        raise("Asset liquidation permission is required", "42501");
      }
      const n = await t.update(
        "asset_liquidations",
        { voided_at: new Date().toISOString(), voided_by: userId, void_reason: clean(target_void_reason).slice(0, 500) },
        { asset_id: target_asset_id },
        (q) => q.is("voided_at", null),
      );
      if (!n) raise("Active liquidation record not found", "P0002");
      const m = await t.update("assets", { status: "LUU_KHO_THANH_LY", updated_by: userId }, { id: target_asset_id, status: "DA_THANH_LY" }, (q) => q.is("deleted_at", null));
      if (!m) raise("Liquidated asset not found", "P0002");
      return null;
    });
  },

  async install_asset_component({ target_host_asset_id, target_component_asset_id, target_installed_at, target_slot_name, target_note }, ctx) {
    if (!target_installed_at) raise("Installation date is required", "22023");
    if (target_host_asset_id === target_component_asset_id) raise("An asset cannot contain itself", "22023");
    return tx(ctx, async (t) => {
      if (
        !(await canAccessAsset(ctx, t.conn, target_host_asset_id, "assets", "assets.manage")) ||
        !(await canAccessAsset(ctx, t.conn, target_component_asset_id, "assets", "assets.manage"))
      ) raise("Asset management permission is required", "42501");
      const host = await t.one<any>("SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [target_host_asset_id], "assets");
      const component = await t.one<any>("SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [target_component_asset_id], "assets");
      if (!host || host.asset_kind !== "DEVICE") raise("Host must be an active device", "22023");
      if (!component || component.asset_kind !== "COMPONENT") raise("Installed asset must be an active component", "22023");
      try {
        const inst = await t.insert("asset_component_installations", {
          host_asset_id: target_host_asset_id,
          component_asset_id: target_component_asset_id,
          installed_at: target_installed_at,
          slot_name: String(target_slot_name ?? "").slice(0, 120),
          install_note: String(target_note ?? "").slice(0, 1000),
          installed_by: ctx.session.userId,
        });
        await t.update("assets", {
          status: "CON_SU_DUNG",
          department_id: host.department_id,
          department_legacy_name: host.department_legacy_name,
          assigned_to_name: host.assigned_to_name,
          location: host.location,
          updated_by: ctx.session.userId,
        }, { id: target_component_asset_id });
        return inst.id;
      } catch (e) {
        if ((e as { code?: string }).code === "23505") raise("Component is already installed in another device", "23505");
        throw e;
      }
    });
  },

  async remove_asset_component({ target_installation_id, target_removed_at, target_removal_reason, target_removal_note, target_component_status }, ctx) {
    if (!COMPONENT_STATUSES.includes(target_component_status)) raise("Invalid component status", "22023");
    return tx(ctx, async (t) => {
      const inst = await t.one<any>("SELECT * FROM asset_component_installations WHERE id = ? AND removed_at IS NULL FOR UPDATE", [target_installation_id], "asset_component_installations");
      if (!inst) raise("Active component installation not found", "P0002");
      if (!target_removed_at || String(target_removed_at) < inst.installed_at) raise("Removal date must not precede installation date", "22023");
      if (
        !(await canAccessAsset(ctx, t.conn, inst.host_asset_id, "assets", "assets.manage")) ||
        !(await canAccessAsset(ctx, t.conn, inst.component_asset_id, "assets", "assets.manage"))
      ) raise("Asset management permission is required", "42501");
      await t.update("asset_component_installations", {
        removed_at: target_removed_at,
        removal_reason: String(target_removal_reason ?? "").slice(0, 300),
        removal_note: String(target_removal_note ?? "").slice(0, 1000),
        removed_by: ctx.session.userId,
      }, { id: inst.id });
      await t.update("assets", { status: target_component_status, updated_by: ctx.session.userId }, { id: inst.component_asset_id });
      return null;
    });
  },

  async replace_asset_component({ target_installation_id, target_new_component_asset_id, target_changed_at, target_slot_name, target_note, target_old_component_status }, ctx) {
    if (!COMPONENT_STATUSES.includes(target_old_component_status)) raise("Invalid component status", "22023");
    return tx(ctx, async (t) => {
      const inst = await t.one<any>("SELECT * FROM asset_component_installations WHERE id = ? AND removed_at IS NULL FOR UPDATE", [target_installation_id], "asset_component_installations");
      if (!inst) raise("Active component installation not found", "P0002");
      if (!target_changed_at || String(target_changed_at) < inst.installed_at) raise("Replacement date must not precede installation date", "22023");
      if (target_new_component_asset_id === inst.component_asset_id) raise("Select a different replacement component", "22023");
      for (const id of [inst.host_asset_id, inst.component_asset_id, target_new_component_asset_id]) {
        if (!(await canAccessAsset(ctx, t.conn, id, "assets", "assets.manage"))) raise("Asset management permission is required", "42501");
      }
      const host = await t.one<any>("SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [inst.host_asset_id], "assets");
      const fresh = await t.one<any>("SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [target_new_component_asset_id], "assets");
      if (!fresh || fresh.asset_kind !== "COMPONENT") raise("Replacement must be an active component", "22023");
      try {
        await t.update("asset_component_installations", {
          removed_at: target_changed_at,
          removal_reason: "THAY_THE",
          removal_note: String(target_note ?? "").slice(0, 1000),
          removed_by: ctx.session.userId,
        }, { id: inst.id });
        await t.update("assets", { status: target_old_component_status, updated_by: ctx.session.userId }, { id: inst.component_asset_id });
        const created = await t.insert("asset_component_installations", {
          host_asset_id: inst.host_asset_id,
          component_asset_id: target_new_component_asset_id,
          installed_at: target_changed_at,
          slot_name: String(target_slot_name || inst.slot_name || "").slice(0, 120),
          install_note: String(target_note ?? "").slice(0, 1000),
          installed_by: ctx.session.userId,
        });
        await t.update("assets", {
          status: "CON_SU_DUNG",
          department_id: host?.department_id ?? null,
          department_legacy_name: host?.department_legacy_name ?? "",
          assigned_to_name: host?.assigned_to_name ?? "",
          location: host?.location ?? "",
          updated_by: ctx.session.userId,
        }, { id: target_new_component_asset_id });
        return created.id;
      } catch (e) {
        if ((e as { code?: string }).code === "23505") raise("Replacement component is already installed in another device", "23505");
        throw e;
      }
    });
  },

  async update_asset_component_installation({ target_installation_id, target_installed_at, target_slot_name, target_note }, ctx) {
    if (!target_installed_at) raise("Installation date is required", "22023");
    return tx(ctx, async (t) => {
      const inst = await t.one<any>("SELECT * FROM asset_component_installations WHERE id = ? AND removed_at IS NULL FOR UPDATE", [target_installation_id], "asset_component_installations");
      if (!inst) raise("Active component installation not found", "P0002");
      if (
        !(await canAccessAsset(ctx, t.conn, inst.host_asset_id, "assets", "assets.manage")) ||
        !(await canAccessAsset(ctx, t.conn, inst.component_asset_id, "assets", "assets.manage"))
      ) raise("Asset management permission is required", "42501");
      await t.update("asset_component_installations", {
        installed_at: target_installed_at,
        slot_name: String(target_slot_name ?? "").slice(0, 120),
        install_note: String(target_note ?? "").slice(0, 1000),
      }, { id: inst.id });
      return null;
    });
  },

  async record_inventory_movement(a, ctx) {
    const userId = requireUid(ctx);
    const to = clean(a.target_to_user_name), loc = clean(a.target_to_location);
    const reason = clean(a.target_reason), approver = clean(a.target_approved_by_name), note = clean(a.target_note);
    if (!a.target_movement_date) raise("Movement date is required", "22023");
    if (to.length > 200 || loc.length > 200 || reason.length > 1000 || approver.length > 200 || note.length > 3000) raise("Movement data is too long", "22023");
    if (!to && !loc) raise("A recipient or destination is required", "22023");
    return tx(ctx, async (t) => {
      if (!(await canAccessAsset(ctx, t.conn, a.target_asset_id, "movement", "movement.manage"))) raise("Movement access denied", "42501");
      const cur = await t.one<{ assigned_to_name: string; location: string }>(
        "SELECT assigned_to_name, location FROM assets WHERE id = ? AND deleted_at IS NULL FOR UPDATE",
        [a.target_asset_id],
      );
      if (!cur) raise("Asset not found", "P0002");
      const movement = await t.insert("inventory_movements", {
        asset_id: a.target_asset_id,
        movement_date: a.target_movement_date,
        from_user_name: cur.assigned_to_name ?? "",
        to_user_name: to,
        from_location: cur.location ?? "",
        to_location: loc,
        reason,
        approved_by_name: approver,
        note,
        created_by: userId,
      });
      await t.update("assets", { assigned_to_name: to, location: loc, updated_by: userId }, { id: a.target_asset_id });
      return movement.id;
    });
  },

  async next_asset_code({ target_prefix, target_year }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "assets.manage")) raise("Asset management permission is required", "42501");
    const prefix = clean(target_prefix).toUpperCase();
    const year = Number(target_year);
    if (!/^[A-Z0-9]{2,8}$/.test(prefix) || !Number.isInteger(year) || year < 1990 || year > 2100) raise("Invalid asset code prefix or year", "22023");
    return tx(ctx, async (t) => {
      const pattern = `^TDW-${prefix}-${year}-([0-9]+)$`;
      const max = await t.one<{ m: string | null }>(
        "SELECT MAX(CAST(REGEXP_REPLACE(UPPER(asset_code), ?, '\\\\1') AS UNSIGNED)) AS m FROM assets WHERE UPPER(asset_code) REGEXP ?",
        [pattern, pattern],
      );
      const existing = Number(max?.m ?? 0);
      await t.exec(
        `INSERT INTO asset_code_counters (prefix, code_year, last_sequence, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP(6))
         ON DUPLICATE KEY UPDATE last_sequence = GREATEST(last_sequence, VALUES(last_sequence)), updated_at = CURRENT_TIMESTAMP(6)`,
        [prefix, year, existing],
      );
      await t.exec("UPDATE asset_code_counters SET last_sequence = last_sequence + 1, updated_at = CURRENT_TIMESTAMP(6) WHERE prefix = ? AND code_year = ?", [prefix, year]);
      const row = await t.one<{ last_sequence: number }>("SELECT last_sequence FROM asset_code_counters WHERE prefix = ? AND code_year = ?", [prefix, year]);
      return `TDW-${prefix}-${year}-${String(row?.last_sequence ?? 1).padStart(3, "0")}`;
    });
  },

  /** Thay pg_cron 'tdw-refresh-asset-age-statuses': tài sản MOI_100 quá 1 năm -> CON_SU_DUNG */
  async refresh_asset_age_statuses({ reference_date }, ctx) {
    if (ctx.session.mode !== "service") raise("Service role required", "42501");
    const ref = String(reference_date ?? vnToday()).slice(0, 10);
    const [y, m, d] = ref.split("-").map(Number);
    const cutoff = new Date(Date.UTC(y - 1, m - 1, d)).toISOString().slice(0, 10);
    return tx(ctx, async (t) => {
      const ids = await t.rows<{ id: string }>(
        `SELECT id FROM assets WHERE deleted_at IS NULL AND status = 'MOI_100'
           AND COALESCE(purchase_date, IF(purchase_year BETWEEN 1900 AND 2100, STR_TO_DATE(CONCAT(purchase_year, '-12-31'), '%Y-%m-%d'), NULL)) < ?`,
        [cutoff],
      );
      for (const { id } of ids) await t.update("assets", { status: "CON_SU_DUNG" }, { id });
      return ids.length;
    });
  },

  // ---- thống kê: chạy với quyền người gọi (RLS) ----
  async get_dashboard_stats(_a, ctx) {
    const assets = visible(ctx, "assets");
    const inst = visible(ctx, "asset_component_installations");
    const year = Number(vnToday().slice(0, 4));
    const [r] = await query<any>(
      getPool(),
      `WITH visible_assets AS (SELECT id, asset_kind, status, total_price, purchase_year, purchase_date FROM ${assets} a WHERE deleted_at IS NULL),
       managed AS (SELECT * FROM visible_assets WHERE status <> 'DA_THANH_LY'),
       active_inst AS (SELECT i.component_asset_id FROM ${inst} i JOIN managed h ON h.id = i.host_asset_id JOIN managed c ON c.id = i.component_asset_id WHERE i.removed_at IS NULL),
       cy AS (SELECT * FROM managed WHERE purchase_year = ? OR (purchase_year IS NULL AND purchase_date >= ? AND purchase_date < ?))
       SELECT
        (SELECT COUNT(*) FROM managed) AS total_assets,
        (SELECT COUNT(*) FROM visible_assets WHERE status = 'DA_THANH_LY') AS liquidated_assets,
        (SELECT COUNT(*) FROM managed WHERE asset_kind = 'DEVICE') AS device_assets,
        (SELECT COUNT(*) FROM managed WHERE asset_kind = 'COMPONENT') AS component_assets,
        (SELECT COUNT(*) FROM active_inst) AS installed_components,
        (SELECT COUNT(*) FROM managed m WHERE m.asset_kind = 'COMPONENT' AND NOT EXISTS (SELECT 1 FROM active_inst x WHERE x.component_asset_id = m.id)) AS available_components,
        (SELECT COUNT(*) FROM managed WHERE status = 'CON_SU_DUNG') AS active_assets,
        (SELECT COUNT(*) FROM managed WHERE status IN ('CAN_KIEM_TRA','KEM_PHAM_CHAT')) AS needs_attention,
        (SELECT COUNT(*) FROM managed WHERE status IN ('LUU_KHO_THANH_LY','KHONG_SU_DUNG')) AS stored_assets,
        COALESCE((SELECT SUM(total_price) FROM managed), 0) AS total_value,
        (SELECT COUNT(*) FROM cy) AS current_year_asset_count,
        COALESCE((SELECT SUM(total_price) FROM cy), 0) AS current_year_asset_value,
        (SELECT JSON_OBJECTAGG(status, n) FROM (SELECT status, COUNT(*) AS n FROM managed GROUP BY status) s) AS by_status`,
      [year, `${year}-01-01`, `${year + 1}-01-01`],
    );
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r ?? {})) {
      out[k] = k === "by_status" ? (typeof v === "string" ? JSON.parse(v) : v ?? {}) : Number(v ?? 0);
    }
    return out;
  },

  async get_asset_list_context({ target_scope }, ctx) {
    const assets = visible(ctx, "assets");
    const liquidated = target_scope === "liquidated";
    const pool = getPool();
    const settings = await query<any>(pool, `SELECT setting_type, setting_value, display_name FROM ${visible(ctx, "settings")} s WHERE setting_type IN ('status','asset_type') AND active ORDER BY setting_type, sort_order, display_name`);
    const departments = await query<any>(pool, `SELECT id, name FROM ${visible(ctx, "departments")} d ORDER BY name`);
    const categories = await query<any>(
      pool,
      `SELECT TRIM(asset_type) AS category, COUNT(*) AS item_count FROM ${assets} a WHERE deleted_at IS NULL AND TRIM(asset_type) <> '' AND ${liquidated ? "status = 'DA_THANH_LY'" : "status <> 'DA_THANH_LY'"} GROUP BY TRIM(asset_type) ORDER BY LOWER(TRIM(asset_type))`,
    );
    const [counts] = await query<any>(
      pool,
      `SELECT SUM(status <> 'DA_THANH_LY') AS active_count, SUM(status = 'DA_THANH_LY') AS liquidated_count FROM ${assets} a WHERE deleted_at IS NULL`,
    );
    return {
      settings,
      departments,
      categories: categories.map((c) => ({ category: c.category, item_count: Number(c.item_count) })),
      active_count: Number(counts?.active_count ?? 0),
      liquidated_count: Number(counts?.liquidated_count ?? 0),
    };
  },
};
