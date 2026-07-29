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

printSummary({
  ...dryRunSummary,
  result: "Dữ liệu nền đã được upsert. Hãy chạy migration:reconcile trước khi cho phép ghi production.",
});
