import {
  assetUnitPrice,
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

function normalized(value) {
  return String(value ?? "").trim().toLocaleLowerCase("vi");
}

function duplicateRows(rows, selector) {
  const indexesByValue = new Map();
  rows.forEach((row, index) => {
    const value = normalized(selector(row));
    if (!value) return;
    const indexes = indexesByValue.get(value) ?? [];
    indexes.push(index + 2);
    indexesByValue.set(value, indexes);
  });
  return [...indexesByValue.values()].filter((indexes) => indexes.length > 1);
}

function invalidOptionalDateRows(rows, fields) {
  const invalid = [];
  rows.forEach((row, index) => {
    for (const field of fields) {
      if (nullable(row[field]) && !dateValue(row[field])) {
        invalid.push({ row: index + 2, field });
      }
    }
  });
  return invalid;
}

const validationErrors = [];
const validationWarnings = [];
const invalidAssetIdentityRows = sourceAssets
  .map((row, index) => ({
    row: index + 2,
    valid: Boolean(nullable(row.asset_code) && nullable(row.asset_name)),
  }))
  .filter((item) => !item.valid)
  .map((item) => item.row);
const duplicateAssetCodeRows = duplicateRows(
  sourceAssets,
  (row) => row.asset_code,
);
const duplicateAssetLegacyIdRows = duplicateRows(
  sourceAssets,
  (row) => row.asset_id,
);
const invalidAssetDateRows = invalidOptionalDateRows(sourceAssets, [
  "purchase_date",
  "warranty_until",
  "last_maintenance_date",
  "next_check_date",
]);
const invalidAssetQuantityRows = sourceAssets
  .map((row, index) => ({
    row: index + 2,
    value: nullable(row.quantity),
  }))
  .filter((item) =>
    item.value !== null
    && (!Number.isInteger(Number(item.value)) || Number(item.value) < 1)
  )
  .map((item) => item.row);
const invalidAssetPriceRows = sourceAssets
  .map((row, index) => ({
    row: index + 2,
    value: nullable(row.unit_price),
  }))
  .filter((item) => {
    if (item.value === null) return false;
    const parsed = numberValue(item.value, Number.NaN);
    return !Number.isFinite(parsed) || parsed < 0;
  })
  .map((item) => item.row);
const assetTotalMismatchRows = sourceAssets
  .map((row, index) => {
    const sourceTotal = nullable(row.total_price);
    if (sourceTotal === null) return null;
    const expected =
      Math.max(1, integerValue(row.quantity, 1)) * assetUnitPrice(row);
    const actual = numberValue(sourceTotal, Number.NaN);
    return Number.isFinite(actual) && Math.abs(actual - expected) < 0.01
      ? null
      : index + 2;
  })
  .filter(Boolean);
const derivedUnitPriceRows = sourceAssets
  .map((row, index) => ({
    row: index + 2,
    derived:
      numberValue(row.unit_price, 0) === 0
      && numberValue(row.total_price, 0) > 0,
  }))
  .filter((item) => item.derived)
  .map((item) => item.row);

const invalidDepartmentRows = sourceDepartments
  .map((row, index) => ({
    row: index + 2,
    valid: Boolean(nullable(row.department_name)),
  }))
  .filter((item) => !item.valid)
  .map((item) => item.row);
const duplicateDepartmentRows = duplicateRows(
  sourceDepartments,
  (row) => row.department_name,
);
const invalidSettingRows = sourceSettings
  .map((row, index) => ({
    row: index + 2,
    valid: Boolean(
      nullable(row.setting_type) && nullable(row.setting_value),
    ),
  }))
  .filter((item) => !item.valid)
  .map((item) => item.row);
const duplicateSettingRows = duplicateRows(
  sourceSettings,
  (row) => `${row.setting_type}\u0000${row.setting_value}`,
);

const sourceAssetLegacyIds = new Set(
  sourceAssets.map((row) => normalized(row.asset_id)).filter(Boolean),
);
const sourceAssetCodesForValidation = new Set(
  sourceAssets.map((row) => normalized(row.asset_code)).filter(Boolean),
);
const sourceHasAsset = (legacyId, assetCode = "") =>
  sourceAssetLegacyIds.has(normalized(legacyId))
  || sourceAssetCodesForValidation.has(normalized(assetCode));
const orphanMaintenanceRows = sourceMaintenanceLogs
  .map((row, index) => ({
    row: index + 2,
    orphan: !sourceHasAsset(row.asset_id, row.asset_code),
  }))
  .filter((item) => item.orphan)
  .map((item) => item.row);
const invalidMaintenanceDateRows = sourceMaintenanceLogs
  .map((row, index) => ({
    row: index + 2,
    invalid:
      !dateValue(row.date || row.maintenance_date),
  }))
  .filter((item) => item.invalid)
  .map((item) => item.row);
const orphanMovementRows = sourceMovements
  .map((row, index) => ({
    row: index + 2,
    orphan: !sourceHasAsset(row.asset_id, row.asset_code),
  }))
  .filter((item) => item.orphan)
  .map((item) => item.row);
const invalidMovementDateRows = sourceMovements
  .map((row, index) => ({
    row: index + 2,
    invalid:
      !nullable(row.movement_date) || !dateValue(row.movement_date),
  }))
  .filter((item) => item.invalid)
  .map((item) => item.row);
const orphanSoftwareRows = sourceSoftware
  .map((row, index) => {
    const hasAssignment =
      nullable(row.assigned_asset_id)
      || nullable(row.assigned_asset_code);
    return {
      row: index + 2,
      orphan:
        Boolean(hasAssignment)
        && !sourceHasAsset(
          row.assigned_asset_id,
          row.assigned_asset_code,
        ),
    };
  })
  .filter((item) => item.orphan)
  .map((item) => item.row);
const invalidSoftwareExpiryRows = invalidOptionalDateRows(
  sourceSoftware,
  ["expiry_date"],
);

const validationGroups = [
  ["Thiết bị thiếu mã hoặc tên", invalidAssetIdentityRows],
  ["Mã thiết bị bị trùng", duplicateAssetCodeRows],
  ["Legacy ID thiết bị bị trùng", duplicateAssetLegacyIdRows],
  ["Ngày thiết bị không hợp lệ", invalidAssetDateRows],
  ["Số lượng thiết bị không hợp lệ", invalidAssetQuantityRows],
  ["Đơn giá thiết bị không hợp lệ", invalidAssetPriceRows],
  ["Phòng ban thiếu tên", invalidDepartmentRows],
  ["Tên phòng ban bị trùng", duplicateDepartmentRows],
  ["Danh mục thiếu loại hoặc giá trị", invalidSettingRows],
  ["Danh mục bị trùng", duplicateSettingRows],
  ["Bảo trì tham chiếu asset không tồn tại", orphanMaintenanceRows],
  ["Bảo trì thiếu ngày hợp lệ", invalidMaintenanceDateRows],
  ["Luân chuyển tham chiếu asset không tồn tại", orphanMovementRows],
  ["Luân chuyển thiếu ngày hợp lệ", invalidMovementDateRows],
  ["Phần mềm tham chiếu asset không tồn tại", orphanSoftwareRows],
  ["Ngày hết hạn phần mềm không hợp lệ", invalidSoftwareExpiryRows],
];
for (const [message, rows] of validationGroups) {
  if (rows.length) {
    validationErrors.push(`${message}: ${rows.length} nhóm/dòng`);
  }
}
if (assetTotalMismatchRows.length) {
  validationWarnings.push(
    `Tổng giá trị nguồn lệch quantity * unit_price: ${assetTotalMismatchRows.length} dòng; PostgreSQL sẽ tính lại`,
  );
}
if (derivedUnitPriceRows.length) {
  validationWarnings.push(
    `Suy ra unit_price từ total_price / quantity: ${derivedUnitPriceRows.length} dòng`,
  );
}

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
  validation: {
    passed: validationErrors.length === 0,
    errors: validationErrors,
    warnings: validationWarnings,
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
  if (!dryRunSummary.validation.passed) process.exitCode = 1;
  process.exit();
}

if (!dryRunSummary.validation.passed) {
  throw new Error(
    `Dữ liệu nguồn không đạt validation: ${validationErrors.join("; ")}`,
  );
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
      unit_price: assetUnitPrice(row),
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
  return {
    legacy_id: legacyId,
    software_name: nullable(row.software_name) ?? "Chưa xác định",
    version: nullable(row.version) ?? "",
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
