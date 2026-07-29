import {
  booleanValue,
  dateValue,
  importDirectory,
  integerValue,
  nullable,
  numberValue,
  printSummary,
  readCsv,
  supabaseRest,
  timestampValue,
  upsertBatches,
} from "./shared.mjs";

const apply = process.argv.includes("--apply");

const [
  sourceAssets,
  sourceDepartments,
  sourceSettings,
  sourceMaintenanceLogs,
  sourceMovements,
  sourceSoftware,
] = await Promise.all([
  readCsv("Assets.csv"),
  readCsv("Departments.csv"),
  readCsv("Settings.csv"),
  readCsv("MaintenanceLogs.csv"),
  readCsv("InventoryMovements.csv"),
  readCsv("SoftwareLicenses.csv"),
]);

const derivedDepartmentNames = [
  ...new Set(
    sourceAssets
      .map((row) => nullable(row.department))
      .filter(Boolean),
  ),
];

const departmentsByName = new Map();
for (const row of sourceDepartments) {
  const name = nullable(row.department_name);
  if (!name) continue;
  departmentsByName.set(name.toLocaleLowerCase("vi"), {
    legacy_id: nullable(row.department_id),
    name,
    manager_name: nullable(row.manager) ?? "",
    location: nullable(row.location) ?? "",
    note: nullable(row.note) ?? "",
  });
}
for (const name of derivedDepartmentNames) {
  const key = name.toLocaleLowerCase("vi");
  if (!departmentsByName.has(key)) {
    departmentsByName.set(key, {
      legacy_id: null,
      name,
      manager_name: "",
      location: "",
      note: "Được suy ra từ dữ liệu thiết bị cũ",
    });
  }
}

const departments = [...departmentsByName.values()];
const settings = sourceSettings
  .filter((row) => nullable(row.setting_type) && nullable(row.setting_value))
  .map((row) => ({
    legacy_id: nullable(row.setting_id),
    setting_type: row.setting_type,
    setting_value: row.setting_value,
    display_name: nullable(row.display_name) ?? row.setting_value,
    sort_order: integerValue(row.sort_order, 0),
    active: booleanValue(row.active, true),
  }));

const dryRunSummary = {
  mode: apply ? "apply" : "dry-run",
  source_directory: importDirectory,
  rows: {
    departments: departments.length,
    settings: settings.length,
    assets: sourceAssets.length,
    maintenance_logs: sourceMaintenanceLogs.length,
    inventory_movements: sourceMovements.length,
    software_licenses: sourceSoftware.length,
  },
  warnings: [
    ...(sourceMaintenanceLogs.length
      ? []
      : ["MaintenanceLogs.csv chưa có dữ liệu"]),
    ...(sourceMovements.length
      ? []
      : ["InventoryMovements.csv chưa có dữ liệu"]),
    ...(sourceSoftware.length
      ? []
      : ["SoftwareLicenses.csv chưa có dữ liệu"]),
    "Tài khoản Auth không được tạo tự động từ Users.csv",
    "Hình ảnh Google Drive được di chuyển bằng tác vụ riêng sau khi có quyền Drive",
  ],
};

if (!apply) {
  printSummary(dryRunSummary);
  process.exit(0);
}

if (process.env.TDW_MIGRATION_CONFIRM !== "APPLY_TO_SUPABASE") {
  throw new Error(
    "Để ghi dữ liệu, đặt TDW_MIGRATION_CONFIRM=APPLY_TO_SUPABASE trong phiên chạy.",
  );
}

await upsertBatches("departments", departments, "name");
await upsertBatches("settings", settings, "setting_type,setting_value");

const { data: remoteDepartments } = await supabaseRest(
  "departments?select=id,name",
);
const departmentIdByName = new Map(
  (remoteDepartments ?? []).map((row) => [
    String(row.name).toLocaleLowerCase("vi"),
    row.id,
  ]),
);

const assets = sourceAssets
  .filter((row) => nullable(row.asset_code) && nullable(row.asset_name))
  .map((row) => {
    const createdAt = timestampValue(row.created_at);
    const updatedAt = timestampValue(row.updated_at);
    const departmentName = nullable(row.department);
    return {
      legacy_id: nullable(row.asset_id) ?? `asset-code:${row.asset_code}`,
      asset_code: row.asset_code,
      asset_name: row.asset_name,
      asset_group: nullable(row.asset_group) ?? "",
      asset_group_label: nullable(row.asset_group_label) ?? "",
      asset_type: nullable(row.asset_type) ?? "",
      brand: nullable(row.brand) ?? "",
      model: nullable(row.model) ?? "",
      serial_number: nullable(row.serial_number) ?? "",
      purchase_year: integerValue(row.purchase_year),
      purchase_date: dateValue(row.purchase_date),
      quantity: Math.max(1, integerValue(row.quantity, 1)),
      unit_price: Math.max(0, numberValue(row.unit_price, 0)),
      assigned_to_name: nullable(row.assigned_to) ?? "",
      department_id: departmentName
        ? departmentIdByName.get(departmentName.toLocaleLowerCase("vi")) ?? null
        : null,
      department_legacy_name: departmentName ?? "",
      location: nullable(row.location) ?? "",
      software_license_note: nullable(row.software_license) ?? "",
      status: nullable(row.status) ?? "CON_SU_DUNG",
      quality_level: nullable(row.quality_level) ?? "",
      warranty_end_date: dateValue(
        row.warranty_end_date || row.warranty_until,
      ),
      last_maintenance_date: dateValue(row.last_maintenance_date),
      next_check_date: dateValue(row.next_check_date),
      note: nullable(row.note) ?? "",
      source_row: integerValue(row.source_row),
      ...(createdAt ? { created_at: createdAt } : {}),
      ...(updatedAt ? { updated_at: updatedAt } : {}),
    };
  });

await upsertBatches("assets", assets, "legacy_id");

const { data: remoteAssets } = await supabaseRest(
  "assets?select=id,legacy_id,asset_code",
);
const assetIdByLegacyId = new Map(
  (remoteAssets ?? [])
    .filter((row) => row.legacy_id)
    .map((row) => [String(row.legacy_id), row.id]),
);
const assetIdByCode = new Map(
  (remoteAssets ?? [])
    .filter((row) => row.asset_code)
    .map((row) => [String(row.asset_code).toLocaleLowerCase("vi"), row.id]),
);
const resolveAssetId = (legacyId, assetCode = "") =>
  assetIdByLegacyId.get(String(legacyId || "")) ??
  assetIdByCode.get(String(assetCode || "").toLocaleLowerCase("vi")) ??
  null;

const orphanWarnings = [];
const maintenanceLogs = sourceMaintenanceLogs.flatMap((row, index) => {
  const assetId = resolveAssetId(row.asset_id, row.asset_code);
  if (!assetId) {
    orphanWarnings.push(`MaintenanceLogs dòng ${index + 2} không tìm thấy asset`);
    return [];
  }
  const maintenanceDate = dateValue(row.date || row.maintenance_date);
  if (!maintenanceDate) {
    orphanWarnings.push(`MaintenanceLogs dòng ${index + 2} thiếu ngày hợp lệ`);
    return [];
  }
  const createdAt = timestampValue(row.created_at);
  const updatedAt = timestampValue(row.updated_at);
  return [{
    legacy_id: nullable(row.log_id) ?? `maintenance-row:${index + 2}`,
    asset_id: assetId,
    maintenance_date: maintenanceDate,
    action_type: nullable(row.action_type) ?? "",
    description:
      nullable(row.description) ??
      nullable(row.action_type) ??
      "Bảo trì thiết bị",
    cost: Math.max(0, numberValue(row.cost, 0)),
    vendor: nullable(row.vendor) ?? "",
    warranty_months: Math.max(0, integerValue(row.warranty_months, 0)),
    performed_by: nullable(row.performed_by) ?? "",
    note: nullable(row.note) ?? "",
    ...(createdAt ? { created_at: createdAt } : {}),
    ...(updatedAt ? { updated_at: updatedAt } : {}),
  }];
});

const movements = sourceMovements.flatMap((row, index) => {
  const assetId = resolveAssetId(row.asset_id, row.asset_code);
  if (!assetId) {
    orphanWarnings.push(`InventoryMovements dòng ${index + 2} không tìm thấy asset`);
    return [];
  }
  const movementDate = dateValue(row.movement_date);
  if (!movementDate) {
    orphanWarnings.push(`InventoryMovements dòng ${index + 2} thiếu ngày hợp lệ`);
    return [];
  }
  const createdAt = timestampValue(row.created_at);
  const updatedAt = timestampValue(row.updated_at);
  return [{
    legacy_id: nullable(row.movement_id) ?? `movement-row:${index + 2}`,
    asset_id: assetId,
    movement_date: movementDate,
    from_user_name: nullable(row.from_user) ?? "",
    to_user_name: nullable(row.to_user) ?? "",
    from_location: nullable(row.from_location) ?? "",
    to_location: nullable(row.to_location) ?? "",
    reason: nullable(row.reason) ?? "",
    approved_by_name: nullable(row.approved_by) ?? "",
    note: nullable(row.note) ?? "",
    ...(createdAt ? { created_at: createdAt } : {}),
    ...(updatedAt ? { updated_at: updatedAt } : {}),
  }];
});

const softwareLicenses = sourceSoftware.map((row, index) => {
  const createdAt = timestampValue(row.created_at);
  const updatedAt = timestampValue(row.updated_at);
  const legacyId = nullable(row.license_id) ?? `software-row:${index + 2}`;
  const hasLegacySecret = Boolean(nullable(row.license_key_or_note));
  return {
    legacy_id: legacyId,
    software_name: nullable(row.software_name) ?? "Chưa xác định",
    version: nullable(row.version) ?? "",
    license_key_masked: hasLegacySecret ? "•••• (chờ chuyển secret)" : "",
    license_secret_ref: hasLegacySecret
      ? `legacy-apps-script:${legacyId}`
      : "",
    assigned_asset_id: resolveAssetId(
      row.assigned_asset_id,
      row.assigned_asset_code,
    ),
    assigned_user_name: nullable(row.assigned_user) ?? "",
    expiry_date: dateValue(row.expiry_date),
    status: nullable(row.status) ?? "",
    note: nullable(row.note) ?? "",
    ...(createdAt ? { created_at: createdAt } : {}),
    ...(updatedAt ? { updated_at: updatedAt } : {}),
  };
});

await upsertBatches("maintenance_logs", maintenanceLogs, "legacy_id");
await upsertBatches("inventory_movements", movements, "legacy_id");
await upsertBatches("software_licenses", softwareLicenses, "legacy_id");

printSummary({
  ...dryRunSummary,
  imported: {
    departments: departments.length,
    settings: settings.length,
    assets: assets.length,
    maintenance_logs: maintenanceLogs.length,
    inventory_movements: movements.length,
    software_licenses: softwareLicenses.length,
  },
  warnings: [...dryRunSummary.warnings, ...orphanWarnings],
  result: "Dữ liệu nền và nghiệp vụ đã được upsert. Hãy chạy migration:reconcile trước khi cho phép ghi production.",
});
