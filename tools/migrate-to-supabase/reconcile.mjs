import {
  assetUnitPrice,
  numberValue,
  printSummary,
  readCsv,
  supabaseRest,
} from "./shared.mjs";

const sourceAssets = await readCsv("Assets.csv");
const sourceSettings = await readCsv("Settings.csv");
const sourceDepartments = await readCsv("Departments.csv");
const sourceMaintenance = await readCsv("MaintenanceLogs.csv");
const sourceMovements = await readCsv("InventoryMovements.csv");
const sourceSoftware = await readCsv("SoftwareLicenses.csv");

const expectedDepartmentNames = new Set(
  [
    ...sourceDepartments.map((row) => row.department_name),
    ...sourceAssets.map((row) => row.department),
  ]
    .map((value) => String(value || "").trim().toLocaleLowerCase("vi"))
    .filter(Boolean),
);
const expectedSettings = sourceSettings.filter(
  (row) =>
    String(row.setting_type || "").trim()
    && String(row.setting_value || "").trim(),
);

const [
  { data: targetAssets },
  { data: targetSettings },
  { data: targetDepartments },
  { data: targetMaintenance },
  { data: targetMovements },
  { data: targetSoftware },
] =
  await Promise.all([
    supabaseRest(
      "assets?select=legacy_id,asset_code,quantity,unit_price,total_price&deleted_at=is.null",
    ),
    supabaseRest("settings?select=legacy_id,setting_type,setting_value"),
    supabaseRest("departments?select=legacy_id,name"),
    supabaseRest("maintenance_logs?select=id,legacy_id,asset_id"),
    supabaseRest("inventory_movements?select=id,legacy_id,asset_id"),
    supabaseRest("software_licenses?select=id,legacy_id,assigned_asset_id"),
  ]);

const sourceAssetCodes = new Set(
  sourceAssets.map((row) => String(row.asset_code || "").trim()).filter(Boolean),
);
const targetAssetCodes = new Set(
  (targetAssets ?? []).map((row) => String(row.asset_code || "").trim()),
);

const missingAssetCodes = [...sourceAssetCodes].filter(
  (code) => !targetAssetCodes.has(code),
);
const unexpectedAssetCodes = [...targetAssetCodes].filter(
  (code) => !sourceAssetCodes.has(code),
);

const sourceAssetValue = sourceAssets.reduce(
  (sum, row) =>
    sum +
    Math.max(1, numberValue(row.quantity, 1)) * assetUnitPrice(row),
  0,
);
const targetAssetValue = (targetAssets ?? []).reduce(
  (sum, row) => sum + numberValue(row.total_price, 0),
  0,
);

const result = {
  checked_at: new Date().toISOString(),
  counts: {
    assets: {
      source: sourceAssets.length,
      target: targetAssets?.length ?? 0,
    },
    settings: {
      source: expectedSettings.length,
      target: targetSettings?.length ?? 0,
    },
    departments: {
      explicit_source: sourceDepartments.length,
      source_including_derived: expectedDepartmentNames.size,
      target_including_derived: targetDepartments?.length ?? 0,
    },
    maintenance_logs: {
      source: sourceMaintenance.length,
      target: targetMaintenance?.length ?? 0,
    },
    inventory_movements: {
      source: sourceMovements.length,
      target: targetMovements?.length ?? 0,
    },
    software_licenses: {
      source: sourceSoftware.length,
      target: targetSoftware?.length ?? 0,
    },
  },
  asset_value: {
    source: sourceAssetValue,
    target: targetAssetValue,
    difference: targetAssetValue - sourceAssetValue,
  },
  missing_asset_codes: missingAssetCodes,
  unexpected_asset_codes: unexpectedAssetCodes,
};

result.passed =
  result.counts.assets.source === result.counts.assets.target &&
  result.counts.settings.source === result.counts.settings.target &&
  result.counts.departments.source_including_derived ===
    result.counts.departments.target_including_derived &&
  result.counts.maintenance_logs.source ===
    result.counts.maintenance_logs.target &&
  result.counts.inventory_movements.source ===
    result.counts.inventory_movements.target &&
  result.counts.software_licenses.source ===
    result.counts.software_licenses.target &&
  result.asset_value.difference === 0 &&
  missingAssetCodes.length === 0 &&
  unexpectedAssetCodes.length === 0;

printSummary(result);
if (!result.passed) process.exitCode = 1;
