import "server-only";
// Thay thế các trigger PostgreSQL. Hook chạy trong cùng giao dịch với câu lệnh ghi.
// Danh sách trigger gốc: supabase/migrations/*.sql (write_audit_log, set_updated_at, ...).

import type { PoolConnection } from "mysql2/promise";
import { execute, query } from "@/lib/db/pool";
import { DbError } from "@/lib/db/sql";
import type { Session } from "@/lib/db/builder";

export type HookArgs = {
  row: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
  session: Session;
  conn: PoolConnection;
};

type BeforeHook = (args: HookArgs & { row: Record<string, unknown> }) => Promise<Record<string, unknown>> | Record<string, unknown>;
type AfterHook = (args: HookArgs) => Promise<void> | void;

const AUDITED = new Set([
  "asset_component_installations", "asset_documents", "asset_liquidations", "asset_responsibles", "assets",
  "data_access_scopes", "departments", "inventory_movements", "it_cost_categories", "it_cost_entries",
  "it_cost_entry_lines", "it_document_links", "it_documents", "it_service_periods", "it_services", "maintenance_logs",
  "maintenance_plans", "media_files", "settings", "software_license_assets", "software_licenses",
  "supply_inventory_movements", "supply_items", "supply_quote_lines", "supply_quotes", "supply_request_lines",
  "supply_requests", "telecom_invoices", "telecom_phones", "user_module_access", "vehicle_documents",
  "vehicle_fuel_logs", "vehicle_inspections", "vehicle_insurances", "vehicle_repairs", "vehicle_toll_monthly_batches",
  "vehicle_toll_quarterly_passes", "vehicle_toll_transactions", "vehicles",
]);

/** Ngày hiện tại theo giờ Việt Nam (vietnam_current_date) */
export function vietnamToday(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function minusOneYear(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y - 1, m - 1, d));
  if (t.getUTCMonth() !== m - 1) t.setUTCDate(0); // 29/02 -> 28/02
  return t.toISOString().slice(0, 10);
}

export function assetEffectivePurchaseDate(purchaseDate: unknown, purchaseYear: unknown): string | null {
  if (purchaseDate) return String(purchaseDate).slice(0, 10);
  const y = Number(purchaseYear);
  if (Number.isInteger(y) && y >= 1900 && y <= 2100) return `${y}-12-31`;
  return null;
}

/** maintenance_add_months: cộng tháng, giữ ngày trong tháng (kẹp về cuối tháng) */
export function maintenanceAddMonths(anchor: string, months: number) {
  const [y, m, d] = anchor.slice(0, 10).split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(d, lastDay));
  return start.toISOString().slice(0, 10);
}

const before: Record<string, Record<string, BeforeHook[]>> = {
  beforeInsert: {},
  beforeUpdate: {},
  beforeDelete: {},
};
const after: Record<string, Record<string, AfterHook[]>> = {
  afterInsert: {},
  afterUpdate: {},
  afterDelete: {},
};

function on(event: "beforeInsert" | "beforeUpdate", tables: string[], hook: BeforeHook): void;
function on(event: "afterInsert" | "afterUpdate" | "afterDelete", tables: string[], hook: AfterHook): void;
function on(event: string, tables: string[], hook: BeforeHook | AfterHook) {
  const map = event.startsWith("before") ? before[event] : after[event];
  for (const t of tables) {
    (map as Record<string, unknown[]>)[t] ??= [];
    (map as Record<string, unknown[]>)[t].push(hook);
  }
}

// ---------------- assets ----------------
on("beforeInsert", ["assets"], async ({ row, conn }) => syncAssetGroupLabel(row, conn));
on("beforeUpdate", ["assets"], async ({ row, conn }) => syncAssetGroupLabel(row, conn));

async function syncAssetGroupLabel(row: Record<string, unknown>, conn: PoolConnection) {
  const group = String(row.asset_group ?? "");
  if (!group) {
    row.asset_group_label = "";
  } else {
    const [found] = await query<{ display_name: string }>(
      conn,
      "SELECT display_name FROM settings WHERE setting_type = 'asset_group' AND setting_value = ? LIMIT 1",
      [group],
    );
    row.asset_group_label = found?.display_name ?? group;
  }
  // apply_asset_age_status
  if (!row.deleted_at && row.status === "MOI_100") {
    const effective = assetEffectivePurchaseDate(row.purchase_date, row.purchase_year);
    if (effective && effective < minusOneYear(vietnamToday())) row.status = "CON_SU_DUNG";
  }
  return row;
}

on("beforeUpdate", ["assets"], async ({ row, old, session }) => {
  // enforce_asset_department_scope
  if (session.mode === "user" && old && old.department_id !== row.department_id) {
    const f = session.fragments;
    const allowed = f
      ? f.canCreateForDepartment(row.department_id ? `'${String(row.department_id).replace(/'/g, "''")}'` : "NULL", "assets", "assets.manage")
      : "0";
    if (allowed === "0") throw new DbError("Not allowed to move asset to this department", "42501");
    if (allowed !== "1") {
      const ok = await query(session.conn!, `SELECT ${allowed} AS ok`);
      if (!Number((ok[0] as { ok: number })?.ok)) throw new DbError("Not allowed to move asset to this department", "42501");
    }
  }
  return row;
});

on("afterUpdate", ["assets"], async ({ row, old, session, conn }) => {
  // sync_installed_component_assignment: linh kiện đang lắp đi theo máy chủ
  if (!row || !old || row.asset_kind !== "DEVICE") return;
  const fields = ["department_id", "department_legacy_name", "assigned_to_name", "location"];
  if (!fields.some((f) => old[f] !== row[f])) return;
  await execute(
    conn,
    `UPDATE assets component JOIN asset_component_installations installation
       ON installation.component_asset_id = component.id
     SET component.department_id = ?, component.department_legacy_name = ?, component.assigned_to_name = ?,
         component.location = ?, component.updated_by = ?, component.updated_at = CURRENT_TIMESTAMP(6)
     WHERE installation.host_asset_id = ? AND installation.removed_at IS NULL`,
    [row.department_id, row.department_legacy_name, row.assigned_to_name, row.location, session.userId, row.id],
  );
});

// ---------------- asset_component_installations ----------------
const preventLiquidated: BeforeHook = async ({ row, conn }) => {
  if (!row.removed_at) {
    const found = await query(conn, "SELECT 1 FROM assets WHERE id IN (?, ?) AND status = 'DA_THANH_LY' LIMIT 1", [
      row.host_asset_id,
      row.component_asset_id,
    ]);
    if (found.length) throw new DbError("Liquidated assets cannot have active component links", "23514");
  }
  return row;
};
on("beforeInsert", ["asset_component_installations"], preventLiquidated);
on("beforeUpdate", ["asset_component_installations"], preventLiquidated);

// ---------------- maintenance ----------------
const fillPlanScope: BeforeHook = ({ row }) => {
  row.batch_id = row.batch_id ?? crypto.randomUUID();
  row.scope_type = String(row.scope_type ?? "ASSET").trim().toUpperCase();
  const value = String(row.scope_value ?? "").trim();
  row.scope_value = row.scope_type === "ASSET" && !value ? String(row.asset_id ?? "") : value;
  return row;
};
on("beforeInsert", ["maintenance_plans"], fillPlanScope);
on("beforeUpdate", ["maintenance_plans"], fillPlanScope);

const validateLogPlan: BeforeHook = async ({ row, conn }) => {
  if (row.plan_id) {
    const found = await query(conn, "SELECT 1 FROM maintenance_plans WHERE id = ? AND asset_id = ?", [row.plan_id, row.asset_id]);
    if (!found.length) throw new DbError("Maintenance plan does not belong to the selected asset", "23514");
  }
  return row;
};
on("beforeInsert", ["maintenance_logs"], validateLogPlan);
on("beforeUpdate", ["maintenance_logs"], validateLogPlan);

async function refreshLastMaintenance(conn: PoolConnection, assetId: unknown, userId: string | null) {
  if (!assetId) return;
  await execute(
    conn,
    `UPDATE assets SET last_maintenance_date = (SELECT MAX(maintenance_date) FROM maintenance_logs WHERE asset_id = ?),
       updated_by = ?, updated_at = CURRENT_TIMESTAMP(6) WHERE id = ?`,
    [assetId, userId, assetId],
  );
}

on("afterInsert", ["maintenance_logs"], async ({ row, conn, session }) => {
  await refreshLastMaintenance(conn, row?.asset_id, session.userId);
  // advance_maintenance_plan_after_log
  if (!row?.plan_id) return;
  const [plan] = await query<{ asset_id: string; frequency: string; next_due_date: string; active: number; repeat_enabled: number }>(
    conn,
    "SELECT asset_id, frequency, next_due_date, active, repeat_enabled FROM maintenance_plans WHERE id = ? FOR UPDATE",
    [row.plan_id],
  );
  if (!plan || plan.asset_id !== row.asset_id) throw new DbError("Maintenance plan does not belong to the selected asset", "23514");
  if (!Number(plan.active)) throw new DbError("Maintenance plan is inactive", "23514");
  if (!Number(plan.repeat_enabled)) {
    await execute(conn, "UPDATE maintenance_plans SET active = 0, updated_at = CURRENT_TIMESTAMP(6) WHERE id = ?", [row.plan_id]);
    return;
  }
  const step = ({ MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 } as Record<string, number>)[plan.frequency];
  if (!step) throw new DbError("Invalid maintenance frequency", "23514");
  const due = String(plan.next_due_date).slice(0, 10);
  const done = String(row.maintenance_date).slice(0, 10);
  let elapsed = step;
  let candidate = maintenanceAddMonths(due, elapsed);
  while (candidate <= done) {
    elapsed += step;
    candidate = maintenanceAddMonths(due, elapsed);
  }
  await execute(conn, "UPDATE maintenance_plans SET next_due_date = ?, updated_at = CURRENT_TIMESTAMP(6) WHERE id = ?", [candidate, row.plan_id]);
});
on("afterUpdate", ["maintenance_logs"], async ({ row, old, conn, session }) => {
  if (old?.asset_id && old.asset_id !== row?.asset_id) await refreshLastMaintenance(conn, old.asset_id, session.userId);
  await refreshLastMaintenance(conn, row?.asset_id, session.userId);
});
on("afterDelete", ["maintenance_logs"], async ({ old, conn, session }) => {
  await refreshLastMaintenance(conn, old?.asset_id, session.userId);
});

// ---------------- media / documents ----------------
const validateMediaOwner: BeforeHook = async ({ row, conn }) => {
  if (row.owner_type === "ASSET" && row.owner_id !== row.asset_id) throw new DbError("Asset media owner must match asset_id", "P0001");
  if (row.owner_type === "MAINTENANCE") {
    const found = await query(conn, "SELECT 1 FROM maintenance_logs WHERE id = ? AND asset_id = ?", [row.owner_id, row.asset_id]);
    if (!found.length) throw new DbError("Maintenance media owner is invalid", "P0001");
  }
  return row;
};
on("beforeInsert", ["media_files"], validateMediaOwner);
on("beforeUpdate", ["media_files"], validateMediaOwner);

const VEHICLE_DOC_TABLES: Record<string, string> = {
  INSPECTION: "vehicle_inspections",
  REPAIR: "vehicle_repairs",
  FUEL: "vehicle_fuel_logs",
  INSURANCE: "vehicle_insurances",
};
const validateVehicleDoc: BeforeHook = async ({ row, conn }) => {
  const table = VEHICLE_DOC_TABLES[String(row.record_type)];
  if (table) {
    const found = await query(conn, `SELECT 1 FROM \`${table}\` WHERE id = ? AND vehicle_id = ?`, [row.record_id, row.vehicle_id]);
    if (!found.length) throw new DbError(`Vehicle ${String(row.record_type).toLowerCase()} document owner is invalid`, "P0001");
  }
  return row;
};
on("beforeInsert", ["vehicle_documents"], validateVehicleDoc);
on("beforeUpdate", ["vehicle_documents"], validateVehicleDoc);

// ---------------- kho VPP ----------------
on("beforeInsert", ["supply_inventory_movements"], async ({ row, conn }) => {
  const [item] = await query<{ item_name: string }>(conn, "SELECT item_name FROM supply_items WHERE id = ? FOR UPDATE", [row.item_id]);
  if (!item) throw new DbError("Không tìm thấy hàng hóa trong kho.", "P0001");
  const inbound = ["RECEIPT", "ADJUSTMENT_IN", "RETURN_IN"].includes(String(row.movement_type));
  const delta = inbound ? Number(row.quantity) : -Number(row.quantity);
  if (delta < 0) {
    const [bal] = await query<{ b: string }>(
      conn,
      `SELECT COALESCE(SUM(CASE WHEN movement_type IN ('RECEIPT','ADJUSTMENT_IN','RETURN_IN') THEN quantity ELSE -quantity END), 0) AS b
       FROM supply_inventory_movements WHERE item_id = ?`,
      [row.item_id],
    );
    const balance = Number(bal?.b ?? 0);
    if (balance + delta < 0) throw new DbError(`Kho không đủ ${item.item_name}: còn ${balance}, cần ${Math.abs(delta)}.`, "P0001");
  }
  return row;
});

// ---------------- nhật ký kiểm toán (write_audit_log) ----------------
async function audit(action: "INSERT" | "UPDATE" | "DELETE", table: string, args: HookArgs) {
  if (!AUDITED.has(table)) return;
  const recordId = (args.row?.id ?? args.old?.id ?? null) as string | null;
  await execute(
    args.conn,
    "INSERT INTO audit_logs (actor_user_id, action, table_name, record_id, old_data, new_data) VALUES (?, ?, ?, ?, ?, ?)",
    [
      args.session.userId,
      action,
      table,
      typeof recordId === "string" ? recordId : null,
      action === "INSERT" ? null : JSON.stringify(args.old),
      action === "DELETE" ? null : JSON.stringify(args.row),
    ],
  );
}

// ---------------- điểm vào ----------------
export async function runHooks(
  event: "beforeInsert" | "beforeUpdate" | "beforeDelete",
  table: string,
  args: HookArgs & { row: Record<string, unknown> },
): Promise<Record<string, unknown>>;
export async function runHooks(event: "afterInsert" | "afterUpdate" | "afterDelete", table: string, args: HookArgs): Promise<void>;
export async function runHooks(event: string, table: string, args: HookArgs): Promise<Record<string, unknown> | void> {
  const withConn = { ...args, session: { ...args.session, conn: args.conn } };
  if (event.startsWith("before")) {
    let row = args.row as Record<string, unknown>;
    for (const hook of before[event]?.[table] ?? []) row = await hook({ ...withConn, row });
    return row;
  }
  for (const hook of after[event]?.[table] ?? []) await hook(withConn);
  if (event === "afterInsert") await audit("INSERT", table, args);
  if (event === "afterUpdate") await audit("UPDATE", table, args);
  if (event === "afterDelete") await audit("DELETE", table, args);
}
