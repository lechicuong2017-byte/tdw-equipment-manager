const SHEET_NAMES = {
  assets: "Assets",
  users: "Users",
  departments: "Departments",
  maintenanceLogs: "MaintenanceLogs",
  maintenancePlans: "MaintenancePlans",
  maintenanceNotificationLogs: "MaintenanceNotificationLogs",
  softwareLicenses: "SoftwareLicenses",
  inventoryMovements: "InventoryMovements",
  assetResponsibles: "AssetResponsibles",
  mediaFiles: "MediaFiles",
  settings: "Settings",
  auditLogs: "AuditLogs",
};

const AUDIT_LOG_HEADERS = ["audit_id", "created_at", "actor_user_id", "actor_username", "action", "entity_type", "entity_id", "entity_name"];
const TDW_SCHEMA_VERSION = "2026.07.18.1";
const MIN_PASSWORD_LENGTH = 10;
const MAINTENANCE_REMINDER_DAYS = [7, 3, 1, 0];
const MAINTENANCE_OVERDUE_REMINDER_INTERVAL_DAYS = 7;
const TDW_REPORT_LOGO_JPEG_BASE64 = "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";
const DEFAULT_SETTING_IDS = new Set([
  "asset_group_MAY_TINH_LAPTOP",
  "asset_group_SCADA_LOGGER_DATA",
  "asset_group_O_CUNG_THIET_BI_DIEN_TU",
  "asset_group_MAY_IN_PHOTOCOPY_MAY_CHIEU_TV_DIEN_THOAI",
  "asset_group_LUU_KHO_KEM_PHAM_CHAT",
  "status_CON_SU_DUNG",
  "status_MOI_100",
  "status_KEM_PHAM_CHAT",
  "status_KHONG_SU_DUNG",
  "status_LUU_KHO_THANH_LY",
  "status_CAN_KIEM_TRA",
]);

const LEGACY_PERMISSION_PRESETS = {
  view: ["overview.view", "assets.view", "maintenance.view", "movement.view", "software.view", "reports.view", "settings.view"],
  edit: ["overview.view", "assets.view", "assets.manage", "assets.delete", "maintenance.view", "maintenance.manage", "movement.view", "movement.manage", "software.view", "software.manage", "reports.view"],
  report: ["overview.view", "assets.view", "reports.view", "reports.assets.export"],
  "reports.export": ["reports.assets.export"],
};

const MODULE_PERMISSION_CODES = [
  "assets.view", "assets.manage", "assets.delete",
  "maintenance.view", "maintenance.manage", "maintenance.delete",
  "movement.view", "movement.manage",
  "software.view", "software.manage", "software.delete",
  "reports.view", "reports.assets.export", "reports.maintenance.export", "reports.software.export", "reports.movement.export",
];

const ASSET_HEADERS = [
  "asset_id", "asset_code", "asset_name", "asset_group", "asset_group_label", "asset_type", "brand", "serial_number",
  "purchase_year", "quantity", "unit_price", "location", "assigned_to", "department", "warranty_end_date",
  "last_maintenance_date", "software_license", "status", "note", "created_at", "updated_at", "deleted_at", "deleted_by",
];

const HEALTH_CHECK_HEADERS = {
  Assets: ASSET_HEADERS,
  Users: ["user_id", "username", "email", "role", "active"],
  Departments: ["department_id", "department_name"],
  MaintenanceLogs: ["log_id", "asset_id", "date"],
  MaintenancePlans: ["plan_id", "asset_id", "frequency", "next_due_date"],
  SoftwareLicenses: ["license_id", "software_name"],
  InventoryMovements: ["movement_id", "asset_id", "movement_date"],
  AssetResponsibles: ["responsibility_id", "asset_id", "user_id", "responsibility_role"],
  MediaFiles: ["media_id", "owner_type", "owner_id", "asset_id", "drive_file_id"],
  Settings: ["setting_id", "setting_type", "setting_value", "display_name"],
};

function doGet(event) {
  return jsonResponse_({
    ok: true,
    service: "TDW Equipment Manager API",
    message: "Frontend chỉ được triển khai trên Vercel.",
    updated_at: new Date().toISOString(),
  });
}

function getReadableSheetRows_(user, sheetName) {
  if (sheetName === SHEET_NAMES.assets && hasPermission_(user, "assets.view")) return readActiveAssets_();
  if (sheetName === SHEET_NAMES.assetResponsibles && hasPermission_(user, "assets.view")) return readActiveAssetResponsibles_();
  if (sheetName === SHEET_NAMES.maintenanceLogs && hasPermission_(user, "maintenance.view")) return readSheetAsObjects_(SHEET_NAMES.maintenanceLogs);
  if (sheetName === SHEET_NAMES.maintenancePlans && hasPermission_(user, "maintenance.view")) return readSheetAsObjects_(SHEET_NAMES.maintenancePlans);
  if (sheetName === SHEET_NAMES.inventoryMovements && hasPermission_(user, "movement.view")) return readSheetAsObjects_(SHEET_NAMES.inventoryMovements);
  if (sheetName === SHEET_NAMES.softwareLicenses && hasPermission_(user, "software.view")) return readSheetAsObjects_(SHEET_NAMES.softwareLicenses).map(publicSoftwareLicense_);
  if ([SHEET_NAMES.settings, SHEET_NAMES.departments].indexOf(sheetName) !== -1) return readSheetAsObjects_(sheetName);
  throw new Error("Không có quyền đọc sheet này");
}

function getAppData(token) {
  const user = requireAuth_(token);
  return {
    ok: true,
    assets: hasPermission_(user, "assets.view") ? readActiveAssets_() : [],
    settings: readSheetAsObjects_(SHEET_NAMES.settings),
    departments: readSheetAsObjects_(SHEET_NAMES.departments),
    assetResponsibles: hasPermission_(user, "assets.view") ? readActiveAssetResponsibles_() : [],
    responsibleUsers: hasPermission_(user, "assets.view") ? readUsers_().filter(isNotificationReadyUser_).map(publicResponsibleUser_) : [],
    maintenanceLogs: hasPermission_(user, "maintenance.view") ? readSheetAsObjects_(SHEET_NAMES.maintenanceLogs) : [],
    maintenancePlans: hasPermission_(user, "maintenance.view") ? readSheetAsObjects_(SHEET_NAMES.maintenancePlans) : [],
    inventoryMovements: hasPermission_(user, "movement.view") ? readSheetAsObjects_(SHEET_NAMES.inventoryMovements) : [],
    softwareLicenses: hasPermission_(user, "software.view") ? readSheetAsObjects_(SHEET_NAMES.softwareLicenses).map(publicSoftwareLicense_) : [],
    mediaFiles: readableMediaFiles_(user),
    currentUser: publicUser_(user),
    updated_at: new Date().toISOString(),
  };
}

function readableMediaFiles_(user) {
  const activeAssetIds = new Set(readActiveAssets_().map((asset) => asset.asset_id));
  return readSheetAsObjects_(SHEET_NAMES.mediaFiles)
    .filter((item) => activeAssetIds.has(item.asset_id))
    .filter((item) => (item.owner_type === "ASSET" && hasPermission_(user, "assets.view")) || (item.owner_type === "MAINTENANCE" && hasPermission_(user, "maintenance.view")))
    .map(publicMediaFile_);
}

function publicMediaFile_(item) {
  return {
    media_id: item.media_id,
    owner_type: item.owner_type,
    owner_id: item.owner_id,
    asset_id: item.asset_id,
    file_name: item.file_name,
    mime_type: item.mime_type,
    sort_order: item.sort_order,
    created_at: item.created_at,
  };
}

function publicSoftwareLicense_(license) {
  const result = Object.assign({}, license);
  const key = licenseKeyFor_(result);
  delete result.license_key_or_note;
  result.license_key_masked = maskLicenseKey_(key);
  return result;
}

function maskLicenseKey_(key) {
  if (!key) return "Chưa có";
  return String(key).length > 4 ? `••••-••••-${String(key).slice(-4)}` : "••••";
}

function getSoftwareLicenseKey(licenseId, token) {
  try {
    const admin = requireAdmin_(token);
    if (!licenseId) throw new Error("Missing license_id");
    const license = readSheetAsObjects_(SHEET_NAMES.softwareLicenses)
      .find((item) => item.license_id === licenseId);
    if (!license) throw new Error("Không tìm thấy bản quyền phần mềm");
    logAudit_(admin, "LICENSE_KEY_VIEWED", "software_license", licenseId, license.software_name);
    return {
      ok: true,
      license_id: licenseId,
      license_key: migrateLegacyLicenseKey_(license),
      updated_at: new Date().toISOString(),
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function healthCheck(token) {
  try {
    const user = requireAdmin_(token);
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = Object.entries(HEALTH_CHECK_HEADERS).map(([name, requiredHeaders]) => {
      const sheet = spreadsheet.getSheetByName(name);
      if (!sheet) {
        return { name, exists: false, headers: [], missing: requiredHeaders };
      }
      const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
        .getDisplayValues()[0]
        .map((header) => String(header).trim())
        .filter(Boolean);
      return {
        name,
        exists: true,
        headers,
        missing: requiredHeaders.filter((header) => !headers.includes(header)),
      };
    });
    return {
      ok: true,
      healthy: sheets.every((sheet) => sheet.exists && sheet.missing.length === 0),
      checked_by: user.username,
      checked_at: new Date().toISOString(),
      schema_version: PropertiesService.getScriptProperties().getProperty("TDW_SCHEMA_VERSION") || "not_migrated",
      expected_schema_version: TDW_SCHEMA_VERSION,
      sheets,
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function migrateSchema() {
  ensureUsersReady_();
  readSheetAsObjects_(SHEET_NAMES.softwareLicenses).forEach((license) => migrateLegacyLicenseKey_(license));
  PropertiesService.getScriptProperties().setProperty("TDW_SCHEMA_VERSION", TDW_SCHEMA_VERSION);
  return { ok: true, schema_version: TDW_SCHEMA_VERSION, migrated_at: new Date().toISOString() };
}

function backupSystemData(options) {
  const properties = PropertiesService.getScriptProperties();
  const rawBackupFolderId = properties.getProperty("TDW_BACKUP_FOLDER_ID") || "";
  if (!rawBackupFolderId) throw new Error("Thiếu Script Property TDW_BACKUP_FOLDER_ID");
  const backupFolderId = normalizeMediaFolderId_(rawBackupFolderId);
  const backupRoot = DriveApp.getFolderById(backupFolderId);
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  const snapshotFolder = backupRoot.createFolder(`TDW-backup-${timestamp}`);
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  DriveApp.getFileById(spreadsheet.getId()).makeCopy(`TDW-data-${timestamp}`, snapshotFolder);

  const rawMediaFolderId = properties.getProperty("TDW_MEDIA_FOLDER_ID") || "";
  const includeMedia = !options || options.includeMedia !== false;
  if (includeMedia && rawMediaFolderId) copyDriveFolder_(DriveApp.getFolderById(normalizeMediaFolderId_(rawMediaFolderId)), snapshotFolder.createFolder("media"));
  properties.setProperty("TDW_LAST_BACKUP_AT", new Date().toISOString());
  properties.setProperty("TDW_LAST_BACKUP_FOLDER_ID", snapshotFolder.getId());
  return { ok: true, folder_id: snapshotFolder.getId(), folder_name: snapshotFolder.getName(), media_included: includeMedia, created_at: new Date().toISOString() };
}

function createBackup(token) {
  const actor = requireAdmin_(token);
  const result = backupSystemData();
  logAudit_(actor, "SYSTEM_BACKUP_CREATED", "backup", result.folder_id, result.folder_name);
  return result;
}

function listBackups(token) {
  requireAdmin_(token);
  const folders = getBackupRoot_().getFolders();
  const backups = [];
  while (folders.hasNext()) {
    const folder = folders.next();
    if (!/^TDW-backup-\d{8}-\d{6}$/.test(folder.getName())) continue;
    const spreadsheetFile = findBackupSpreadsheetFile_(folder);
    if (!spreadsheetFile) continue;
    backups.push({ folder_id: folder.getId(), name: folder.getName(), created_at: folder.getDateCreated().toISOString() });
  }
  backups.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const latest = backups[0] || null;
  const ageHours = latest ? (Date.now() - new Date(latest.created_at).getTime()) / 3600000 : null;
  return {
    ok: true,
    healthy: ageHours !== null && ageHours <= 48,
    backup_count: backups.length,
    latest_backup_at: latest ? latest.created_at : "",
    age_hours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
    last_restore_at: PropertiesService.getScriptProperties().getProperty("TDW_LAST_RESTORE_AT") || "",
    backups: backups.slice(0, 30),
  };
}

function verifyBackup(folderId, token) {
  requireAdmin_(token);
  const backupFolder = findBackupFolder_(folderId);
  const spreadsheetFile = findBackupSpreadsheetFile_(backupFolder);
  if (!spreadsheetFile) throw new Error("Bản backup không chứa file dữ liệu Google Sheet.");
  const inspection = inspectBackupSpreadsheet_(SpreadsheetApp.openById(spreadsheetFile.getId()));
  return Object.assign({ ok: true, backup_name: backupFolder.getName() }, inspection);
}

function restoreBackup(folderId, token) {
  const actor = requireAdmin_(token);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Hệ thống đang có tác vụ dữ liệu khác. Vui lòng thử lại sau.");
  try {
    const backupFolder = findBackupFolder_(folderId);
    const spreadsheetFile = findBackupSpreadsheetFile_(backupFolder);
    if (!spreadsheetFile) throw new Error("Bản backup không chứa file dữ liệu Google Sheet.");
    const source = SpreadsheetApp.openById(spreadsheetFile.getId());
    if (!source.getSheetByName(SHEET_NAMES.assets)) throw new Error("Bản backup không có sheet Assets nên không thể khôi phục.");
    const safetyBackup = backupSystemData({ includeMedia: false });
    const target = SpreadsheetApp.getActiveSpreadsheet();
    const protectedSheets = [SHEET_NAMES.users, SHEET_NAMES.auditLogs];
    const verification = [];
    let restoredSheets = 0;
    source.getSheets().forEach((sourceSheet) => {
      if (protectedSheets.indexOf(sourceSheet.getName()) !== -1) return;
      const targetSheet = target.getSheetByName(sourceSheet.getName());
      if (!targetSheet) return;
      const rows = Math.max(sourceSheet.getLastRow(), 1);
      const columns = Math.max(sourceSheet.getLastColumn(), 1);
      ensureSheetSize_(targetSheet, rows, columns);
      const sourceRange = sourceSheet.getRange(1, 1, rows, columns);
      const values = sourceRange.getValues();
      const formulas = sourceRange.getFormulas();
      const restoredValues = values.map((row, rowIndex) => row.map((value, columnIndex) => formulas[rowIndex][columnIndex] || value));
      targetSheet.clearContents();
      targetSheet.getRange(1, 1, rows, columns).setValues(restoredValues);
      verification.push({ sheet: sourceSheet.getName(), expected_rows: rows });
      restoredSheets += 1;
    });
    SpreadsheetApp.flush();
    verification.forEach((item) => {
      item.actual_rows = Math.max(target.getSheetByName(item.sheet).getLastRow(), 1);
      item.matched = item.actual_rows === item.expected_rows;
    });
    if (verification.some((item) => !item.matched)) throw new Error("Dữ liệu đã khôi phục nhưng kiểm tra số dòng không khớp. Hãy dùng safety backup để phục hồi lại.");
    PropertiesService.getScriptProperties().setProperty("TDW_LAST_RESTORE_AT", new Date().toISOString());
    logAudit_(actor, "SYSTEM_BACKUP_RESTORED", "backup", backupFolder.getId(), backupFolder.getName());
    return { ok: true, verified: true, verification: verification, restored_sheets: restoredSheets, restored_from: backupFolder.getName(), safety_backup_folder_id: safetyBackup.folder_id, restored_at: new Date().toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function inspectBackupSpreadsheet_(spreadsheet) {
  const sheets = Object.entries(HEALTH_CHECK_HEADERS).map(([name, requiredHeaders]) => {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) return { name: name, exists: false, rows: 0, missing_headers: requiredHeaders };
    const columns = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet.getRange(1, 1, 1, columns).getDisplayValues()[0].map((header) => String(header).trim()).filter(Boolean);
    return {
      name: name,
      exists: true,
      rows: Math.max(sheet.getLastRow() - 1, 0),
      missing_headers: requiredHeaders.filter((header) => headers.indexOf(header) === -1),
    };
  });
  return {
    valid: sheets.every((sheet) => sheet.exists && sheet.missing_headers.length === 0),
    expected_schema_version: TDW_SCHEMA_VERSION,
    sheets: sheets,
  };
}

function getBackupRoot_() {
  const rawId = PropertiesService.getScriptProperties().getProperty("TDW_BACKUP_FOLDER_ID") || "";
  if (!rawId) throw new Error("Thiếu Script Property TDW_BACKUP_FOLDER_ID");
  return DriveApp.getFolderById(normalizeMediaFolderId_(rawId));
}

function findBackupFolder_(folderId) {
  const normalizedId = normalizeMediaFolderId_(folderId);
  const folders = getBackupRoot_().getFolders();
  while (folders.hasNext()) {
    const folder = folders.next();
    if (folder.getId() === normalizedId && /^TDW-backup-\d{8}-\d{6}$/.test(folder.getName())) return folder;
  }
  throw new Error("Không tìm thấy bản backup trong thư mục sao lưu đã cấu hình.");
}

function findBackupSpreadsheetFile_(folder) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS && /^TDW-data-/.test(file.getName())) return file;
  }
  return null;
}

function ensureSheetSize_(sheet, rows, columns) {
  if (sheet.getMaxRows() < rows) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  if (sheet.getMaxColumns() < columns) sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
}

function copyDriveFolder_(source, destination) {
  const files = source.getFiles();
  while (files.hasNext()) files.next().makeCopy(destination);
  const folders = source.getFolders();
  while (folders.hasNext()) {
    const child = folders.next();
    copyDriveFolder_(child, destination.createFolder(child.getName()));
  }
}

function installDailyBackupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "backupSystemData")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("backupSystemData").timeBased().everyDays(1).atHour(2).create();
  return { ok: true };
}

function saveAsset(asset) {
  try {
    const actor = requirePermission_(arguments[1] || "", "assets.manage");
    const action = asset && asset.asset_id ? "ASSET_UPDATED" : "ASSET_CREATED";
    const hasResponsibles = Object.prototype.hasOwnProperty.call(asset || {}, "responsibles");
    const normalized = normalizeAsset_(asset || {});
    const previousResponsibles = hasResponsibles ? readActiveAssetResponsibles_(normalized.asset_id) : [];
    const responsibles = hasResponsibles ? normalizeAssetResponsibles_(asset.responsibles, normalized.asset_id) : [];
    delete normalized.responsibles;
    const saved = upsertObject_(SHEET_NAMES.assets, "asset_id", normalized);
    if (hasResponsibles) {
      replaceAssetResponsibles_(saved.asset_id, responsibles);
      if (responsibilitiesSignature_(previousResponsibles) !== responsibilitiesSignature_(responsibles)) {
        logAudit_(actor, "ASSET_RESPONSIBLES_UPDATED", "asset", saved.asset_id, saved.asset_name);
      }
    }
    logAudit_(actor, action, "asset", saved.asset_id, saved.asset_name);
    return { ok: true, data: saved, updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function deleteAsset(assetId) {
  try {
    const user = requirePermission_(arguments[1] || "", "assets.delete");
    if (!assetId) throw new Error("Missing asset_id");
    const asset = readSheetAsObjects_(SHEET_NAMES.assets).find((item) => item.asset_id === assetId);
    if (!asset) throw new Error("Không tìm thấy thiết bị để xóa");
    asset.deleted_at = new Date().toISOString();
    asset.deleted_by = user ? user.username : "";
    upsertObject_(SHEET_NAMES.assets, "asset_id", asset);
    logAudit_(user, "ASSET_DELETED", "asset", assetId, asset.asset_name);
    return { ok: true, asset_id: assetId, updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// ==========================================
// THIẾT LẬP HỆ THỐNG
// ==========================================

const LICENSE_SECRET_MARKER = "SCRIPT_PROPERTY_V1";

function licenseSecretProperty_(licenseId) {
  return `TDW_LICENSE_KEY_${licenseId}`;
}

function decodeLegacyLicenseKey_(encoded) {
  if (!encoded || typeof encoded !== "string" || !encoded.startsWith("ENC:")) return encoded;
  try {
    const b64 = encoded.substring(4).split('').reverse().join('');
    const decoded = Utilities.base64Decode(b64);
    return Utilities.newBlob(decoded).getDataAsString();
  } catch(e) { return encoded; }
}

function licenseKeyFor_(license) {
  if (!license) return "";
  if (license.license_key_or_note === LICENSE_SECRET_MARKER) {
    return PropertiesService.getScriptProperties().getProperty(licenseSecretProperty_(license.license_id)) || "";
  }
  return decodeLegacyLicenseKey_(license.license_key_or_note || "");
}

function migrateLegacyLicenseKey_(license) {
  const key = licenseKeyFor_(license);
  if (key && license.license_key_or_note !== LICENSE_SECRET_MARKER) {
    PropertiesService.getScriptProperties().setProperty(licenseSecretProperty_(license.license_id), key);
    license.license_key_or_note = LICENSE_SECRET_MARKER;
    upsertObject_(SHEET_NAMES.softwareLicenses, "license_id", license);
  }
  return key;
}

function saveSetting(setting, token) {
  try {
    const actor = requireAdmin_(token || "");
    const action = setting && setting.setting_id ? "SETTING_UPDATED" : "SETTING_CREATED";
    const existing = setting && setting.setting_id
      ? readSheetAsObjects_(SHEET_NAMES.settings).find((item) => item.setting_id === setting.setting_id)
      : null;
    const previous = existing || (setting && setting.setting_id ? {
      setting_type: String(setting.original_setting_type || setting.setting_type || "").trim(),
      setting_value: String(setting.original_setting_value || "").trim(),
      display_name: String(setting.original_display_name || "").trim(),
    } : null);
    const normalized = normalizeSetting_(setting || {});
    assertUniqueSettingValue_(normalized);
    const saved = upsertObject_(SHEET_NAMES.settings, "setting_id", normalized);
    const updatedReferences = previous && previous.setting_value
      && (previous.setting_value !== saved.setting_value || previous.display_name !== saved.display_name)
      ? replaceSettingReferences_(previous.setting_type, previous.setting_value, saved.setting_value, saved.display_name)
      : 0;
    logAudit_(actor, action, "setting", saved.setting_id, saved.display_name);
    return { ok: true, data: saved, updated_references: updatedReferences, updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function deleteSetting(settingOrId) {
  try {
    const actor = requireAdmin_(arguments[1] || "");
    const settingPayload = settingOrId && typeof settingOrId === "object" ? settingOrId : null;
    const settingId = settingPayload ? settingPayload.setting_id : settingOrId;
    if (!settingId) throw new Error("Missing setting_id");
    const sheet = getSheet_(SHEET_NAMES.settings);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map((header) => String(header).trim());
    const keyIndex = headers.indexOf("setting_id");
    if (keyIndex === -1) throw new Error("Missing setting_id column");
    const rowIndex = values.findIndex((row, index) => index > 0 && row[keyIndex] === settingId);
    if (DEFAULT_SETTING_IDS.has(settingId)) {
      const existing = rowIndex >= 1 ? readSheetAsObjects_(SHEET_NAMES.settings).find((item) => item.setting_id === settingId) : null;
      const disabled = normalizeSetting_(Object.assign({}, settingPayload || {}, existing || {}, { setting_id: settingId }));
      disabled.active = "FALSE";
      upsertObject_(SHEET_NAMES.settings, "setting_id", disabled);
      logAudit_(actor, "SETTING_DISABLED", "setting", settingId, disabled.display_name);
      return { ok: true, setting_id: settingId, disabled: true, updated_at: new Date().toISOString() };
    }
    if (rowIndex < 1) throw new Error("Không tìm thấy cấu hình để xóa");
    const nameIndex = headers.indexOf("display_name");
    const settingName = nameIndex >= 0 ? String(values[rowIndex][nameIndex] || "") : "";
    sheet.deleteRow(rowIndex + 1);
    logAudit_(actor, "SETTING_DELETED", "setting", settingId, settingName);
    return { ok: true, setting_id: settingId, updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function doPost(event) {
  try {
    const body = JSON.parse(event.postData.contents || "{}");
    const action = body.action;
    const args = body.args || [];

    if (action === "exportSupabaseReport") {
      const payload = requireSignedIntegrationRequest_(body);
      return jsonResponse_(exportSupabaseReport_(payload));
    }
    if (action === "exportSupabaseReportFile") {
      const payload = requireSignedIntegrationRequest_(body);
      return jsonResponse_(exportSupabaseReportFile_(payload));
    }
    if (action === "sendSupabaseMaintenanceReminders") {
      const payload = requireSignedIntegrationRequest_(body);
      return jsonResponse_(sendSupabaseMaintenanceReminders_(payload));
    }

    requireProxySecret_(body.proxy_secret);
    requireLegacyActionAllowed_(action);

    if (action === "loginUser") {
      return jsonResponse_(loginUser(args[0] || body.credentials || {}));
    }
    if (action === "loginSupabaseUser") {
      return jsonResponse_(loginSupabaseUser(args[0] || body.email || ""));
    }
    if (action === "markSupabaseMigration") {
      return jsonResponse_(markSupabaseMigration(args[0] || body.email || "", args[1] || body.supabase_user_id || "", args[2] || body.token || ""));
    }
    if (action === "getCurrentAuthLink") {
      return jsonResponse_(getCurrentAuthLink(args[0] || body.token || ""));
    }
    if (action === "getUserAuthLink") {
      return jsonResponse_(getUserAuthLink(args[0] || body.user_id || "", args[1] || body.token || ""));
    }
    if (action === "currentUser") {
      return jsonResponse_(currentUser(args[0] || body.token || ""));
    }
    if (action === "logoutUser") {
      return jsonResponse_(logoutUser(args[0] || body.token || ""));
    }
    if (action === "logoutAllSessions") {
      return jsonResponse_(logoutAllSessions(args[0] || body.token || ""));
    }
    if (action === "getAppData") {
      return jsonResponse_(getAppData(args[0] || body.token || ""));
    }
    if (action === "getSoftwareLicenseKey") {
      return jsonResponse_(getSoftwareLicenseKey(args[0] || body.license_id || "", args[1] || body.token || ""));
    }
    if (action === "healthCheck") {
      return jsonResponse_(healthCheck(args[0] || body.token || ""));
    }
    if (action === "createBackup") {
      return jsonResponse_(createBackup(args[0] || body.token || ""));
    }
    if (action === "listBackups") {
      return jsonResponse_(listBackups(args[0] || body.token || ""));
    }
    if (action === "verifyBackup") {
      return jsonResponse_(verifyBackup(args[0] || body.folder_id || "", args[1] || body.token || ""));
    }
    if (action === "restoreBackup") {
      return jsonResponse_(restoreBackup(args[0] || body.folder_id || "", args[1] || body.token || ""));
    }
    if (action === "saveAsset" || action === "upsertAsset") {
      return jsonResponse_(saveAsset(args[0] || body.asset || {}, args[1] || body.token || ""));
    }
    if (action === "deleteAsset") {
      return jsonResponse_(deleteAsset(args[0] || body.asset_id || "", args[1] || body.token || ""));
    }
    if (action === "saveMaintenanceLog") {
      return jsonResponse_(saveMaintenanceLog(args[0] || body.log || {}, args[1] || body.token || ""));
    }
    if (action === "saveMaintenanceLogs") {
      return jsonResponse_(saveMaintenanceLogs(args[0] || body.logs || [], args[1] || body.token || ""));
    }
    if (action === "deleteMaintenanceLog") {
      const logId = args[0] && typeof args[0] === "object" ? args[0].logId : args[0] || body.logId || "";
      return jsonResponse_(deleteMaintenanceLog(logId, args[1] || body.token || ""));
    }
    if (action === "saveMaintenancePlan") {
      return jsonResponse_(saveMaintenancePlan(args[0] || body.plan || {}, args[1] || body.token || ""));
    }
    if (action === "saveMaintenancePlans") {
      return jsonResponse_(saveMaintenancePlans(args[0] || body.plans || [], args[1] || body.token || ""));
    }
    if (action === "deleteMaintenancePlan") {
      const planId = args[0] && typeof args[0] === "object" ? args[0].planId : args[0] || body.planId || "";
      return jsonResponse_(deleteMaintenancePlan(planId, args[1] || body.token || ""));
    }
    if (action === "saveMediaFile") {
      return jsonResponse_(saveMediaFile(args[0] || body.media || {}, args[1] || body.token || ""));
    }
    if (action === "getMediaFile") {
      return jsonResponse_(getMediaFile(args[0] || body.media_id || "", args[1] || body.token || ""));
    }
    if (action === "deleteMediaFile") {
      return jsonResponse_(deleteMediaFile(args[0] || body.media_id || "", args[1] || body.token || ""));
    }
    if (action === "sendMaintenancePlanReminders") {
      return jsonResponse_(sendMaintenancePlanReminders(args[0] || body.token || ""));
    }
    if (action === "saveMovementLog") {
      return jsonResponse_(saveMovementLog(args[0] || body.log || {}, args[1] || body.token || ""));
    }
    if (action === "saveSoftwareLicense") {
      return jsonResponse_(saveSoftwareLicense(args[0] || body.license || {}, args[1] || body.token || ""));
    }
    if (action === "deleteSoftwareLicense") {
      const licenseId = args[0] && typeof args[0] === "object" ? args[0].licenseId : args[0] || body.licenseId || "";
      return jsonResponse_(deleteSoftwareLicense(licenseId, args[1] || body.token || ""));
    }
    if (action === "saveSetting") {
      return jsonResponse_(saveSetting(args[0] || body.setting || {}, args[1] || body.token || ""));
    }
    if (action === "deleteSetting") {
      return jsonResponse_(deleteSetting(args[0] || body.setting_id || "", args[1] || body.token || ""));
    }
    if (action === "saveDepartment") {
      return jsonResponse_(saveDepartment(args[0] || body.department || {}, args[1] || body.token || ""));
    }
    if (action === "deleteDepartment") {
      return jsonResponse_(deleteDepartment(args[0] || body.department_id || "", args[1] || body.token || ""));
    }
    if (action === "listUsers") {
      return jsonResponse_(listUsers(args[0] || body.token || ""));
    }
    if (action === "saveUser") {
      return jsonResponse_(saveUser(args[0] || body.user || {}, args[1] || body.token || ""));
    }
    if (action === "deleteUser") {
      return jsonResponse_(deleteUser(args[0] || body.user_id || "", args[1] || body.token || ""));
    }
    if (action === "resetUserPassword") {
      return jsonResponse_(resetUserPassword(args[0] || body.user_id || "", args[1] || body.new_password || "", args[2] || body.token || ""));
    }
    if (action === "changeOwnPassword") {
      return jsonResponse_(changeOwnPassword(args[0] || body.new_password || "", args[1] || body.token || ""));
    }

    throw new Error("Unsupported action");
  } catch (error) {
    return jsonResponse_({ ok: false, error: error.message });
  }
}

function requireProxySecret_(providedSecret) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty("TDW_API_PROXY_SECRET");
  if (!expectedSecret) throw new Error("Thiếu Script Property TDW_API_PROXY_SECRET");
  if (!constantTimeEqual_(String(providedSecret || ""), expectedSecret)) throw new Error("Yêu cầu API không hợp lệ");
}

function requireLegacyActionAllowed_(action) {
  const mode = String(
    PropertiesService.getScriptProperties().getProperty("TDW_LEGACY_MODE") ||
      "read-write",
  ).trim().toLowerCase();
  if (["read-write", "read-only", "disabled"].indexOf(mode) === -1) {
    throw new Error("TDW_LEGACY_MODE không hợp lệ");
  }
  if (mode === "disabled") {
    throw new Error("API nghiệp vụ Google Sheets đã ngừng hoạt động");
  }

  const mutatingActions = [
    "markSupabaseMigration",
    "logoutAllSessions",
    "restoreBackup",
    "saveAsset",
    "upsertAsset",
    "deleteAsset",
    "saveMaintenanceLog",
    "saveMaintenanceLogs",
    "deleteMaintenanceLog",
    "saveMaintenancePlan",
    "saveMaintenancePlans",
    "deleteMaintenancePlan",
    "sendMaintenancePlanReminders",
    "saveMediaFile",
    "deleteMediaFile",
    "saveMovementLog",
    "saveSoftwareLicense",
    "deleteSoftwareLicense",
    "saveSetting",
    "deleteSetting",
    "saveDepartment",
    "deleteDepartment",
    "saveUser",
    "deleteUser",
    "resetUserPassword",
    "changeOwnPassword",
  ];
  if (mode === "read-only" && mutatingActions.indexOf(String(action || "")) !== -1) {
    throw new Error("Hệ thống Google Sheets đang ở chế độ chỉ đọc");
  }
}

function requireSignedIntegrationRequest_(body) {
  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty("TDW_NEXT_INTEGRATION_SECRET");
  if (!secret) throw new Error("Thiếu Script Property TDW_NEXT_INTEGRATION_SECRET");

  const timestamp = Number(body.timestamp || 0);
  const nonce = String(body.nonce || "");
  const payloadJson = String(body.payload_json || "");
  const signature = String(body.signature || "");
  if (!timestamp || !nonce || !payloadJson || !signature) throw new Error("Yêu cầu tích hợp không đầy đủ");
  if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp)) throw new Error("Timestamp không hợp lệ");
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) throw new Error("Yêu cầu tích hợp đã hết hạn");
  if (!/^[a-zA-Z0-9_-]{16,120}$/.test(nonce)) throw new Error("Nonce không hợp lệ");
  if (payloadJson.length > 1500000) throw new Error("Dữ liệu xuất vượt quá giới hạn");

  const canonical = `${timestamp}.${nonce}.${payloadJson}`;
  const expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(canonical, secret, Utilities.Charset.UTF_8),
  ).replace(/=+$/g, "");
  if (!constantTimeEqual_(signature, expected)) throw new Error("Chữ ký tích hợp không hợp lệ");

  claimIntegrationNonce_(properties, nonce, timestamp);

  return JSON.parse(payloadJson);
}

function claimIntegrationNonce_(properties, nonce, timestamp) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Không thể xác nhận yêu cầu tích hợp");

  try {
    const propertyName = "TDW_INTEGRATION_NONCE_LEDGER";
    const now = Date.now();
    const cutoff = now - 10 * 60 * 1000;
    let previous = {};
    try {
      previous = JSON.parse(properties.getProperty(propertyName) || "{}");
    } catch (_error) {
      previous = {};
    }

    const activeEntries = Object.keys(previous)
      .map((key) => [key, Number(previous[key] || 0)])
      .filter((entry) => entry[1] >= cutoff && entry[1] <= now + 5 * 60 * 1000);
    if (activeEntries.some((entry) => entry[0] === nonce)) {
      throw new Error("Yêu cầu tích hợp đã được sử dụng");
    }

    activeEntries.push([nonce, timestamp]);
    const ledger = {};
    activeEntries.slice(-50).forEach((entry) => {
      ledger[entry[0]] = entry[1];
    });
    properties.setProperty(propertyName, JSON.stringify(ledger));
  } finally {
    lock.releaseLock();
  }
}

function exportSupabaseReport_(payload) {
  const reportType = String(payload.report_type || "");
  const title = String(payload.title || "TDW Export").trim().slice(0, 120);
  const columns = Array.isArray(payload.columns) ? payload.columns : [];
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const requestedBy = String(payload.requested_by || "").trim().slice(0, 200);

  if (["assets", "maintenance", "software", "movement"].indexOf(reportType) === -1) {
    throw new Error("Loại báo cáo không được hỗ trợ");
  }
  if (!columns.length || columns.length > 50) throw new Error("Cấu trúc cột không hợp lệ");
  if (rows.length > 5000) throw new Error("Báo cáo vượt quá 5.000 dòng");

  const normalizedColumns = columns.map((column) => ({
    key: String(column.key || "").trim(),
    label: String(column.label || column.key || "").trim().slice(0, 120),
  }));
  if (normalizedColumns.some((column) => !/^[a-zA-Z0-9_]+$/.test(column.key))) {
    throw new Error("Khóa cột không hợp lệ");
  }

  const spreadsheet = SpreadsheetApp.create(title || "TDW Export", Math.max(rows.length + 1, 2), normalizedColumns.length);
  const sheet = spreadsheet.getSheets()[0];
  sheet.setName(reportType.slice(0, 80));
  const values = [
    normalizedColumns.map((column) => column.label),
    ...rows.map((row) => normalizedColumns.map((column) => safeSpreadsheetValue_(row[column.key]))),
  ];
  sheet.getRange(1, 1, values.length, normalizedColumns.length).setValues(values);
  sheet.getRange(1, 1, 1, normalizedColumns.length)
    .setBackground("#0e6e8e")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, normalizedColumns.length);

  const spreadsheetFile = DriveApp.getFileById(spreadsheet.getId());
  const folderId = propertiesSafeGet_("TDW_EXPORT_FOLDER_ID");
  if (folderId) spreadsheetFile.moveTo(DriveApp.getFolderById(folderId));
  shareExportFileWithRequester_(spreadsheetFile, requestedBy);

  return {
    ok: true,
    report_type: reportType,
    row_count: rows.length,
    spreadsheet_id: spreadsheet.getId(),
    spreadsheet_url: spreadsheet.getUrl(),
    requested_by: requestedBy,
    created_at: new Date().toISOString(),
  };
}

function exportSupabaseReportFile_(payload) {
  const jobId = String(payload.job_id || "").trim();
  const reportType = String(payload.report_type || "").trim();
  const outputFormat = String(payload.output_format || "").trim();
  const title = safeDocumentText_(payload.title || "TDW Export", 120);
  const reportName = safeDocumentText_(payload.report_name || title, 160).toUpperCase();
  const requestedBy = safeDocumentText_(payload.requested_by || "", 200);
  const columns = Array.isArray(payload.columns) ? payload.columns : [];
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new Error("Mã tác vụ xuất file không hợp lệ");
  }
  if (["assets", "maintenance", "software", "movement"].indexOf(reportType) === -1) {
    throw new Error("Loại báo cáo không được hỗ trợ");
  }
  if (["xlsx", "pdf"].indexOf(outputFormat) === -1) {
    throw new Error("Định dạng file không hợp lệ");
  }
  if (!columns.length || columns.length > 50) throw new Error("Cấu trúc cột không hợp lệ");
  if (rows.length > 5000) throw new Error("Báo cáo vượt quá 5.000 dòng");

  const normalizedColumns = columns.map((column) => ({
    key: String(column.key || "").trim(),
    label: safeDocumentText_(column.label || column.key || "", 120),
  }));
  if (normalizedColumns.some((column) => !/^[a-zA-Z0-9_]+$/.test(column.key))) {
    throw new Error("Khóa cột không hợp lệ");
  }

  const previous = getReportFileLedgerEntry_(jobId);
  if (previous) {
    if (previous.output_format !== outputFormat) {
      throw new Error("Mã tác vụ đã được dùng cho định dạng khác");
    }
    return Object.assign({ ok: true, reused: true }, previous);
  }

  const spreadsheet = SpreadsheetApp.create(
    title || "TDW Export",
    Math.max(rows.length + 6, 7),
    normalizedColumns.length + 1,
  );
  const spreadsheetFile = DriveApp.getFileById(spreadsheet.getId());
  try {
    const sheet = spreadsheet.getSheets()[0];
    sheet.setName("Báo cáo");
    formatTdwReportSheet_(sheet, reportName, normalizedColumns, rows, outputFormat);
    for (let columnIndex = 2; columnIndex <= normalizedColumns.length + 1; columnIndex += 1) {
      const currentWidth = sheet.getColumnWidth(columnIndex);
      sheet.setColumnWidth(columnIndex, Math.min(Math.max(currentWidth, 80), 220));
    }
    SpreadsheetApp.flush();
    Utilities.sleep(500);

    const folderId = propertiesSafeGet_("TDW_EXPORT_FOLDER_ID");
    const folder = folderId ? DriveApp.getFolderById(folderId) : null;
    if (folder) spreadsheetFile.moveTo(folder);
    shareExportFileWithRequester_(spreadsheetFile, requestedBy);

    const result = {
      ok: true,
      job_id: jobId,
      report_type: reportType,
      output_format: outputFormat,
      row_count: rows.length,
      result_url: spreadsheetExportUrl_(spreadsheet.getId(), sheet.getSheetId(), outputFormat),
      file_id: spreadsheet.getId(),
      created_at: new Date().toISOString(),
    };
    saveReportFileLedgerEntry_(result);
    return result;
  } catch (error) {
    spreadsheetFile.setTrashed(true);
    throw error;
  }
}

function formatTdwReportSheet_(sheet, reportName, columns, rows, outputFormat) {
  const totalColumns = columns.length + 1;
  const titleStartColumn = Math.min(3, totalColumns);
  const titleColumnCount = Math.max(totalColumns - titleStartColumn + 1, 1);
  const headerRow = 5;
  const firstDataRow = headerRow + 1;
  const summaryRow = firstDataRow + rows.length;
  const exportedAt = new Date();
  const dateText = Utilities.formatDate(exportedAt, "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm");

  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(headerRow);
  sheet.getRange(1, titleStartColumn, 1, titleColumnCount).merge()
    .setValue("CÔNG TY CỔ PHẦN NƯỚC THỦ ĐỨC — TDW")
    .setFontFamily("Arial")
    .setFontSize(10)
    .setFontWeight("bold")
    .setFontColor("#444444")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.getRange(2, titleStartColumn, 1, titleColumnCount).merge()
    .setValue(reportName)
    .setFontFamily("Arial")
    .setFontSize(outputFormat === "pdf" ? 13 : 14)
    .setFontWeight("bold")
    .setFontColor("#176da5")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);
  sheet.getRange(3, titleStartColumn, 1, titleColumnCount).merge()
    .setValue(`Ngày xuất: ${dateText}  |  Tổng: ${rows.length} dòng`)
    .setFontFamily("Arial")
    .setFontSize(9)
    .setFontColor("#666666")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.getRange(3, 1, 1, totalColumns)
    .setBorder(false, false, true, false, false, false, "#176da5", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.setRowHeight(1, 28);
  sheet.setRowHeight(2, 32);
  sheet.setRowHeight(3, 24);
  sheet.setRowHeight(4, 10);
  insertTdwReportLogo_(sheet);

  const headerRange = sheet.getRange(headerRow, 1, 1, totalColumns);
  headerRange
    .setValues([["STT", ...columns.map((column) => column.label)]])
    .setFontFamily("Arial")
    .setFontSize(outputFormat === "pdf" ? 8 : 10)
    .setFontWeight("bold")
    .setFontColor("#ffffff")
    .setBackground("#176da5")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true)
    .setBorder(true, true, true, true, true, true, "#0e5080", SpreadsheetApp.BorderStyle.SOLID);
  sheet.setRowHeight(headerRow, 30);

  if (rows.length) {
    const values = rows.map((row, index) => [
      index + 1,
      ...columns.map((column) => safeSpreadsheetValue_(row[column.key])),
    ]);
    const bodyRange = sheet.getRange(firstDataRow, 1, rows.length, totalColumns);
    bodyRange
      .setValues(values)
      .setFontFamily("Arial")
      .setFontSize(outputFormat === "pdf" ? 8 : 10)
      .setFontColor("#111111")
      .setVerticalAlignment("top")
      .setWrap(true)
      .setBorder(true, true, true, true, true, true, "#c8d8e8", SpreadsheetApp.BorderStyle.SOLID);
    bodyRange.setBackgrounds(rows.map((_row, index) =>
      Array(totalColumns).fill(index % 2 === 1 ? "#f0f6fb" : "#ffffff"),
    ));
    sheet.getRange(firstDataRow, 1, rows.length, 1).setHorizontalAlignment("center");
    columns.forEach((column, index) => {
      if (/quantity|price|cost|total/i.test(column.key)) {
        sheet.getRange(firstDataRow, index + 2, rows.length, 1)
          .setNumberFormat("#,##0")
          .setHorizontalAlignment("right");
      }
    });
  }

  sheet.getRange(summaryRow, 1, 1, totalColumns).merge()
    .setValue(`TỔNG CỘNG · ${rows.length} dòng · Ngày xuất: ${dateText}`)
    .setFontFamily("Arial")
    .setFontSize(outputFormat === "pdf" ? 8 : 10)
    .setFontWeight("bold")
    .setFontColor("#ffffff")
    .setBackground("#0d4f7c")
    .setVerticalAlignment("middle")
    .setBorder(true, true, true, true, false, false, "#0d4f7c", SpreadsheetApp.BorderStyle.SOLID);
  sheet.setRowHeight(summaryRow, 28);

  sheet.setColumnWidth(1, 55);
  sheet.autoResizeColumns(2, columns.length);
}

function insertTdwReportLogo_(sheet) {
  const logoBlob = Utilities.newBlob(
    Utilities.base64Decode(TDW_REPORT_LOGO_JPEG_BASE64),
    "image/jpeg",
    "tdw-logo.jpg",
  );
  sheet.insertImage(logoBlob, 1, 1).setWidth(112).setHeight(41);
}

function spreadsheetExportUrl_(spreadsheetId, sheetId, outputFormat) {
  const baseUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export`;
  if (outputFormat === "xlsx") return `${baseUrl}?format=xlsx`;
  const params = [
    "format=pdf",
    "size=A4",
    "portrait=false",
    "fitw=true",
    "sheetnames=false",
    "printtitle=false",
    "pagenumbers=true",
    "gridlines=false",
    "fzr=true",
    "top_margin=0.4",
    "bottom_margin=0.4",
    "left_margin=0.35",
    "right_margin=0.35",
    `gid=${encodeURIComponent(sheetId)}`,
  ];
  return `${baseUrl}?${params.join("&")}`;
}

function safeDocumentText_(value, maxLength) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function safeDriveFileName_(value) {
  return safeDocumentText_(value, 120).replace(/[\\/:*?"<>|]/g, "-") || "TDW Report";
}

function shareExportFileWithRequester_(file, requestedBy) {
  const email = normalizeEmail_(requestedBy || "");
  if (email && file.getAccess(email) === DriveApp.Permission.NONE) {
    file.addViewer(email);
  }
}

function getReportFileLedgerEntry_(jobId) {
  const entries = readReportFileLedger_();
  return entries.find((entry) => entry.job_id === jobId) || null;
}

function saveReportFileLedgerEntry_(result) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Không thể lưu kết quả tác vụ xuất file");
  try {
    const entries = readReportFileLedger_()
      .filter((entry) => entry.job_id !== result.job_id)
      .slice(-19);
    entries.push({
      job_id: result.job_id,
      report_type: result.report_type,
      output_format: result.output_format,
      row_count: result.row_count,
      result_url: result.result_url,
      file_id: result.file_id,
      created_at: result.created_at,
    });
    PropertiesService.getScriptProperties().setProperty(
      "TDW_REPORT_FILE_LEDGER",
      JSON.stringify(entries),
    );
  } finally {
    lock.releaseLock();
  }
}

function readReportFileLedger_() {
  try {
    const value = PropertiesService.getScriptProperties().getProperty(
      "TDW_REPORT_FILE_LEDGER",
    );
    const entries = JSON.parse(value || "[]");
    return Array.isArray(entries) ? entries : [];
  } catch (_error) {
    return [];
  }
}

function safeSpreadsheetValue_(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value).slice(0, 50000);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function propertiesSafeGet_(name) {
  return String(PropertiesService.getScriptProperties().getProperty(name) || "").trim();
}

function sendSupabaseMaintenanceReminders_(payload) {
  const notifications = Array.isArray(payload.notifications)
    ? payload.notifications
    : [];
  if (!notifications.length || notifications.length > 200) {
    throw new Error("Danh sách email phải có từ 1 đến 200 mục");
  }

  const results = notifications.map((item) => {
    const notificationId = String(item.notification_id || "").trim();
    const recipientEmail = normalizeEmail_(item.recipient_email || "");
    const recipientName = String(item.recipient_name || recipientEmail)
      .trim()
      .slice(0, 160);
    const assetCode = String(item.asset_code || "").trim().slice(0, 80);
    const assetName = String(item.asset_name || "Thiết bị TDW")
      .trim()
      .slice(0, 200);
    const title = String(item.title || "Bảo trì định kỳ")
      .trim()
      .slice(0, 200);
    const dueDate = normalizeIsoDate_(item.due_date || "");
    const notificationType = String(item.notification_type || "").trim();

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId)) {
      throw new Error("Mã email nhắc không hợp lệ");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      throw new Error("Ngày đến hạn không hợp lệ");
    }
    if (!/^(DUE_(7|3|1|0)|OVERDUE_[0-9]+)$/.test(notificationType)) {
      throw new Error("Loại nhắc bảo trì không hợp lệ");
    }

    try {
      MailApp.sendEmail({
        to: recipientEmail,
        subject: `[TDW] Nhắc bảo trì: ${assetName}`.slice(0, 240),
        body: supabaseMaintenanceReminderText_({
          asset_code: assetCode,
          asset_name: assetName,
          title,
          due_date: dueDate,
          notification_type: notificationType,
        }),
        htmlBody: supabaseMaintenanceReminderHtml_({
          recipient_name: recipientName,
          asset_code: assetCode,
          asset_name: assetName,
          title,
          due_date: dueDate,
          notification_type: notificationType,
        }),
        name: "TDW Equipment Manager",
      });
      return {
        notification_id: notificationId,
        status: "SENT",
        error: "",
      };
    } catch (error) {
      return {
        notification_id: notificationId,
        status: "FAILED",
        error: String(error && error.message ? error.message : error).slice(0, 500),
      };
    }
  });

  return {
    ok: true,
    processed: results.length,
    sent: results.filter((item) => item.status === "SENT").length,
    failed: results.filter((item) => item.status === "FAILED").length,
    results,
  };
}

function supabaseMaintenanceReminderText_(item) {
  return `TDW Equipment Manager\n\nNhắc bảo trì: ${item.asset_name}\nMã tài sản: ${item.asset_code || "Chưa có"}\nNội dung: ${item.title}\nNgày đến hạn: ${formatIsoDate_(item.due_date)}\nTrạng thái: ${maintenanceReminderStatus_(item.notification_type)}\n\nVui lòng kiểm tra và cập nhật lịch sử bảo trì sau khi thực hiện.`;
}

function supabaseMaintenanceReminderHtml_(item) {
  return `<div style="font-family:Arial,sans-serif;color:#17202a;line-height:1.55"><h2 style="color:#176fa6">Nhắc bảo trì thiết bị TDW</h2><p>Chào ${escapeHtml_(item.recipient_name)},</p><p>Thiết bị sau cần được theo dõi:</p><table style="border-collapse:collapse"><tr><td style="padding:4px 12px 4px 0;color:#64748b">Thiết bị</td><td><strong>${escapeHtml_(item.asset_name)}</strong></td></tr><tr><td style="padding:4px 12px 4px 0;color:#64748b">Mã tài sản</td><td>${escapeHtml_(item.asset_code || "Chưa có")}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#64748b">Nội dung</td><td>${escapeHtml_(item.title)}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#64748b">Đến hạn</td><td><strong>${escapeHtml_(formatIsoDate_(item.due_date))}</strong></td></tr><tr><td style="padding:4px 12px 4px 0;color:#64748b">Trạng thái</td><td>${escapeHtml_(maintenanceReminderStatus_(item.notification_type))}</td></tr></table><p>Vui lòng kiểm tra và cập nhật lịch sử bảo trì sau khi thực hiện.</p></div>`;
}

function readSheetAsObjects_(sheetName) {
  const sheet = getSheet_(sheetName);
  ensureSheetHeaders_(sheetName, sheet);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0].map((header) => String(header).trim());
  return values
    .slice(1)
    .filter((row) => row.some((cell) => String(cell).trim() !== ""))
    .map((row, index) => {
      const item = {};
      headers.forEach((header, colIndex) => {
        item[header] = row[colIndex] || "";
      });
      if (!item.source_row) item.source_row = index + 2;
      return item;
    });
}

function readActiveAssets_() {
  return readSheetAsObjects_(SHEET_NAMES.assets).filter((asset) => !String(asset.deleted_at || "").trim());
}

function upsertObject_(sheetName, keyField, object) {
  const sheet = getSheet_(sheetName);
  ensureSheetHeaders_(sheetName, sheet);
  const range = sheet.getDataRange();
  const values = range.getValues();
  const headers = values[0].map((header) => String(header).trim());
  const keyIndex = headers.indexOf(keyField);
  if (keyIndex === -1) throw new Error(`Missing key field: ${keyField}`);

  if (!object[keyField]) {
    object[keyField] = Utilities.getUuid();
  }

  object.updated_at = new Date().toISOString();
  const row = headers.map((header) => object[header] || "");
  const existingIndex = values.findIndex((valueRow, index) => index > 0 && valueRow[keyIndex] === object[keyField]);

  if (existingIndex >= 1) {
    sheet.getRange(existingIndex + 1, 1, 1, headers.length).setValues([row]);
  } else {
    object.created_at = object.created_at || object.updated_at;
    sheet.appendRow(headers.map((header) => object[header] || ""));
  }

  return object;
}

function deleteObject_(sheetName, keyField, keyValue) {
  const sheet = getSheet_(sheetName);
  ensureSheetHeaders_(sheetName, sheet);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map((header) => String(header).trim());
  const keyIndex = headers.indexOf(keyField);
  if (keyIndex === -1) throw new Error(`Missing key field: ${keyField}`);
  const rowIndex = values.findIndex((row, index) => index > 0 && String(row[keyIndex]) === String(keyValue));
  if (rowIndex < 1) return false;
  sheet.deleteRow(rowIndex + 1);
  return true;
}

function normalizeAsset_(asset) {
  const now = new Date().toISOString();
  const normalized = Object.assign({}, asset);
  normalized.asset_id = normalized.asset_id || Utilities.getUuid();
  normalized.asset_name = String(normalized.asset_name || "").trim();
  if (!normalized.asset_name) throw new Error("Tên thiết bị là bắt buộc");
  normalized.asset_group = normalized.asset_group || "MAY_TINH_LAPTOP";
  normalized.asset_group_label = normalized.asset_group_label || groupLabel_(normalized.asset_group);
  normalized.status = normalized.status || "CON_SU_DUNG";
  normalized.quantity = normalized.quantity || "1";
  normalized.purchase_year = normalized.purchase_year || "";
  normalized.asset_type = normalized.asset_type || "";
  normalized.brand = normalized.brand || "";
  normalized.serial_number = normalized.serial_number || "";
  normalized.location = normalized.location || "";
  normalized.warranty_end_date = normalized.warranty_end_date || "";
  normalized.unit_price = normalized.unit_price || "";
  normalized.last_maintenance_date = normalized.last_maintenance_date || "";
  normalized.updated_at = now;
  normalized.created_at = normalized.created_at || now;
  normalized.asset_code = normalized.asset_code || nextAssetCode_(normalized.asset_group, normalized.purchase_year);
  return normalized;
}

function normalizeAssetResponsibles_(responsibles, assetId) {
  if (!Array.isArray(responsibles)) throw new Error("Danh sách người phụ trách không hợp lệ");
  const seenUserIds = new Set();
  const normalized = responsibles.map((item) => {
    const userId = String(item.user_id || "").trim();
    const role = String(item.responsibility_role || "").trim().toLowerCase();
    if (!userId || ["primary", "secondary"].indexOf(role) === -1) throw new Error("Người phụ trách không hợp lệ");
    if (seenUserIds.has(userId)) throw new Error("Một user chỉ được chọn một lần cho mỗi thiết bị");
    seenUserIds.add(userId);
    const user = findUserById_(userId);
    if (!isNotificationReadyUser_(user)) throw new Error("Người phụ trách phải đang hoạt động và có email hợp lệ");
    return {
      responsibility_id: Utilities.getUuid(),
      asset_id: assetId,
      user_id: userId,
      responsibility_role: role,
      active: "TRUE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });
  const primaryCount = normalized.filter((item) => item.responsibility_role === "primary").length;
  if (primaryCount > 1) throw new Error("Mỗi thiết bị chỉ có một người phụ trách chính");
  if (normalized.length && primaryCount !== 1) throw new Error("Cần chọn một người phụ trách chính trước khi thêm người phụ trách phụ");
  return normalized;
}

function readActiveAssetResponsibles_(assetId) {
  return readSheetAsObjects_(SHEET_NAMES.assetResponsibles)
    .filter((item) => String(item.active || "TRUE").toUpperCase() !== "FALSE")
    .filter((item) => !assetId || item.asset_id === assetId);
}

function replaceAssetResponsibles_(assetId, responsibles) {
  const sheet = getSheet_(SHEET_NAMES.assetResponsibles);
  ensureSheetHeaders_(SHEET_NAMES.assetResponsibles, sheet);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map((header) => String(header).trim());
  const assetIndex = headers.indexOf("asset_id");
  for (let index = values.length - 1; index > 0; index -= 1) {
    if (values[index][assetIndex] === assetId) sheet.deleteRow(index + 1);
  }
  responsibles.forEach((responsibility) => upsertObject_(SHEET_NAMES.assetResponsibles, "responsibility_id", responsibility));
}

function responsibilitiesSignature_(responsibles) {
  return responsibles
    .map((item) => `${item.user_id}:${item.responsibility_role}`)
    .sort()
    .join(",");
}

function normalizeSetting_(setting) {
  const normalized = Object.assign({}, setting);
  const type = String(normalized.setting_type || "").trim();
  const displayName = String(normalized.display_name || "").trim();
  const value = settingValueFromDisplayName_(displayName);
  if (!type) throw new Error("Loại cấu hình là bắt buộc");
  if (!displayName) throw new Error("Tên hiển thị là bắt buộc");
  if (!value) throw new Error("Tên hiển thị phải có ít nhất một chữ cái hoặc chữ số");
  normalized.setting_id = normalized.setting_id || `${type}_${Utilities.getUuid()}`;
  normalized.setting_type = type;
  normalized.setting_value = value;
  normalized.display_name = displayName;
  normalized.sort_order = normalized.sort_order || "999";
  normalized.active = normalized.active || "TRUE";
  return normalized;
}

function settingValueFromDisplayName_(displayName) {
  return String(displayName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function assertUniqueSettingValue_(setting) {
  const duplicate = readSheetAsObjects_(SHEET_NAMES.settings).find((item) =>
    item.setting_id !== setting.setting_id
      && item.setting_type === setting.setting_type
      && item.setting_value === setting.setting_value
  );
  if (duplicate) throw new Error(`Tên hiển thị tạo ra biến đã tồn tại: ${setting.setting_value}`);
}

function replaceSettingReferences_(settingType, oldValue, newValue, displayName) {
  const references = {
    asset_group: [{ sheetName: SHEET_NAMES.assets, field: "asset_group", labelField: "asset_group_label" }],
    asset_type: [{ sheetName: SHEET_NAMES.assets, field: "asset_type" }],
    status: [{ sheetName: SHEET_NAMES.assets, field: "status" }],
    maintenance_type: [{ sheetName: SHEET_NAMES.maintenanceLogs, field: "action_type" }],
  }[settingType] || [];

  return references.reduce((total, reference) => {
    const sheet = getSheet_(reference.sheetName);
    ensureSheetHeaders_(reference.sheetName, sheet);
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return total;
    const headers = values[0].map((header) => String(header).trim());
    const fieldIndex = headers.indexOf(reference.field);
    const labelIndex = reference.labelField ? headers.indexOf(reference.labelField) : -1;
    if (fieldIndex === -1) throw new Error(`Missing reference field: ${reference.sheetName}.${reference.field}`);
    let changed = 0;
    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      if (String(values[rowIndex][fieldIndex] || "") !== oldValue) continue;
      values[rowIndex][fieldIndex] = newValue;
      if (labelIndex >= 0) values[rowIndex][labelIndex] = displayName;
      changed += 1;
    }
    if (changed) sheet.getRange(2, 1, values.length - 1, headers.length).setValues(values.slice(1));
    return total + changed;
  }, 0);
}

function saveMaintenanceLog(log, token) {
  try {
    const actor = requirePermission_(token || "", "maintenance.manage");
    const isNew = !(log && log.log_id);
    const action = isNew ? "MAINTENANCE_CREATED" : "MAINTENANCE_UPDATED";
    const normalized = normalizeMaintenanceLog_(log || {});
    const linkedPlan = normalized.plan_id ? findMaintenancePlanForLog_(normalized, !isNew) : null;
    const saved = upsertObject_(SHEET_NAMES.maintenanceLogs, "log_id", normalized);
    if (isNew && linkedPlan) completeMaintenancePlan_(linkedPlan, saved.date);
    logAudit_(actor, action, "maintenance_log", saved.log_id, saved.action_type || saved.asset_id);
    return { ok: true, data: saved, updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function saveMaintenanceLogs(logs, token) {
  try {
    const actor = requirePermission_(token || "", "maintenance.manage");
    if (!Array.isArray(logs) || !logs.length) throw new Error("Danh sách thiết bị bảo trì đang trống");
    if (logs.length > 200) throw new Error("Mỗi lần chỉ được ghi nhận tối đa 200 thiết bị");
    const activeAssetIds = new Set(readActiveAssets_().map((asset) => asset.asset_id));
    const plans = readSheetAsObjects_(SHEET_NAMES.maintenancePlans);
    const linkedPlans = [];
    const normalizedLogs = logs.map((log) => {
      if (log && log.log_id) throw new Error("Ghi nhận hàng loạt không hỗ trợ cập nhật lịch sử đã có");
      const normalized = normalizeMaintenanceLog_(log || {});
      if (!activeAssetIds.has(normalized.asset_id)) throw new Error("Thiết bị không tồn tại hoặc đã bị xóa");
      if (!normalized.plan_id) throw new Error("Mỗi thiết bị phải thuộc một kế hoạch bảo trì");
      const linkedPlan = plans.find((plan) => plan.plan_id === normalized.plan_id);
      if (!linkedPlan) throw new Error("Kế hoạch bảo trì liên kết không tồn tại");
      if (linkedPlan.asset_id !== normalized.asset_id) throw new Error("Kế hoạch bảo trì không thuộc thiết bị đã chọn");
      if (linkedPlan.active === "FALSE") throw new Error("Kế hoạch bảo trì liên kết đang tạm dừng");
      linkedPlans.push(linkedPlan);
      return normalized;
    });
    const assetIds = normalizedLogs.map((log) => log.asset_id);
    if (new Set(assetIds).size !== assetIds.length) throw new Error("Danh sách có thiết bị bị trùng");
    const sheet = getSheet_(SHEET_NAMES.maintenanceLogs);
    ensureSheetHeaders_(SHEET_NAMES.maintenanceLogs, sheet);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((header) => String(header).trim());
    const now = new Date().toISOString();
    normalizedLogs.forEach((log) => {
      log.created_at = log.created_at || now;
      log.updated_at = now;
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, normalizedLogs.length, headers.length)
      .setValues(normalizedLogs.map((log) => headers.map((header) => log[header] || "")));
    linkedPlans.forEach((plan, index) => completeMaintenancePlan_(plan, normalizedLogs[index].date));
    logAudit_(actor, "MAINTENANCE_LOGS_CREATED", "maintenance_log", "", `${normalizedLogs.length} thiết bị`);
    return { ok: true, created: normalizedLogs.length, data: normalizedLogs, updated_at: now };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function normalizeMaintenanceLog_(log) {
  const now = new Date().toISOString();
  const normalized = Object.assign({}, log);
  normalized.log_id = normalized.log_id || Utilities.getUuid();
  normalized.asset_id = String(normalized.asset_id || "").trim();
  normalized.plan_id = String(normalized.plan_id || "").trim();
  if (!normalized.asset_id) throw new Error("Thiếu asset_id cho log bảo trì");
  if (!normalized.action_type) throw new Error("Thiếu action_type cho log bảo trì");
  
  normalized.date = normalized.date || now.split("T")[0];
  normalized.action_type = normalized.action_type || "";
  normalized.description = normalized.description || "";
  normalized.cost = normalized.cost || "";
  normalized.vendor = normalized.vendor || "";
  normalized.warranty_months = normalized.warranty_months || "";
  normalized.performed_by = normalized.performed_by || "";
  normalized.note = normalized.note || "";
  normalized.created_at = normalized.created_at || now;
  return normalized;
}

function findMaintenancePlanForLog_(log, allowInactive) {
  const plan = readSheetAsObjects_(SHEET_NAMES.maintenancePlans).find((item) => item.plan_id === log.plan_id);
  if (!plan) throw new Error("Kế hoạch bảo trì liên kết không tồn tại");
  if (plan.asset_id !== log.asset_id) throw new Error("Kế hoạch bảo trì không thuộc thiết bị đã chọn");
  if (!allowInactive && plan.active === "FALSE") throw new Error("Kế hoạch bảo trì liên kết đang tạm dừng");
  return plan;
}

function completeMaintenancePlan_(plan, completionDate) {
  if (plan.repeat_enabled === "FALSE") {
    plan.active = "FALSE";
  } else {
    plan.next_due_date = nextMaintenanceDueDate_(plan.next_due_date, plan.frequency, completionDate);
  }
  upsertObject_(SHEET_NAMES.maintenancePlans, "plan_id", plan);
}

function nextMaintenanceDueDate_(currentDueDate, frequency, completionDate) {
  const months = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }[String(frequency || "").toUpperCase()];
  if (!months) throw new Error("Chu kỳ bảo trì không hợp lệ");
  const dueDate = normalizeIsoDate_(currentDueDate);
  const completed = normalizeIsoDate_(completionDate);
  let elapsedMonths = months;
  let nextDate;
  do {
    nextDate = addMonthsToIsoDate_(dueDate, elapsedMonths);
    elapsedMonths += months;
  } while (nextDate <= completed);
  return nextDate;
}

function addMonthsToIsoDate_(isoDate, months) {
  const parts = normalizeIsoDate_(isoDate).split("-").map(Number);
  const targetMonth = parts[1] - 1 + months;
  const targetYear = parts[0] + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(Math.min(parts[2], lastDay)).padStart(2, "0")}`;
}

function deleteMaintenanceLog(logId, token) {
  try {
    const actor = requirePermission_(token || "", "maintenance.delete");
    const deleted = deleteObject_(SHEET_NAMES.maintenanceLogs, "log_id", logId);
    if (deleted) deleteMediaForOwner_("MAINTENANCE", logId);
    if (deleted) logAudit_(actor, "MAINTENANCE_DELETED", "maintenance_log", logId, logId);
    return { ok: deleted, deleted_id: logId, updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function saveMaintenancePlan(plan, token) {
  try {
    const actor = requirePermission_(token || "", "maintenance.manage");
    const action = plan && plan.plan_id ? "MAINTENANCE_PLAN_UPDATED" : "MAINTENANCE_PLAN_CREATED";
    const normalized = normalizeMaintenancePlan_(plan || {});
    const saved = upsertObject_(SHEET_NAMES.maintenancePlans, "plan_id", normalized);
    logAudit_(actor, action, "maintenance_plan", saved.plan_id, saved.title || saved.asset_id);
    return { ok: true, data: saved, updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function saveMaintenancePlans(plans, token) {
  try {
    const actor = requirePermission_(token || "", "maintenance.manage");
    if (!Array.isArray(plans) || !plans.length) throw new Error("Danh sách kế hoạch bảo trì đang trống");
    if (plans.length > 200) throw new Error("Mỗi lần chỉ được tạo tối đa 200 kế hoạch bảo trì");
    const activeAssets = readActiveAssets_();
    const normalizedPlans = plans.map((plan) => {
      if (plan && plan.plan_id) throw new Error("Tạo hàng loạt không hỗ trợ cập nhật kế hoạch đã có");
      return normalizeMaintenancePlan_(plan || {}, activeAssets);
    });
    const sheet = getSheet_(SHEET_NAMES.maintenancePlans);
    ensureSheetHeaders_(SHEET_NAMES.maintenancePlans, sheet);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((header) => String(header).trim());
    const now = new Date().toISOString();
    normalizedPlans.forEach((plan) => {
      plan.created_at = plan.created_at || now;
      plan.updated_at = now;
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, normalizedPlans.length, headers.length)
      .setValues(normalizedPlans.map((plan) => headers.map((header) => plan[header] || "")));
    logAudit_(actor, "MAINTENANCE_PLANS_CREATED", "maintenance_plan", "", `${normalizedPlans.length} kế hoạch`);
    return { ok: true, created: normalizedPlans.length, data: normalizedPlans, updated_at: now };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function normalizeMaintenancePlan_(plan, activeAssets) {
  const now = new Date().toISOString();
  const normalized = Object.assign({}, plan);
  const frequencies = ["MONTHLY", "QUARTERLY", "YEARLY"];
  normalized.plan_id = normalized.plan_id || Utilities.getUuid();
  normalized.asset_id = String(normalized.asset_id || "").trim();
  normalized.title = String(normalized.title || "").trim();
  normalized.frequency = String(normalized.frequency || "").trim().toUpperCase();
  normalized.next_due_date = normalizeIsoDate_(normalized.next_due_date);
  if (!normalized.asset_id) throw new Error("Thiếu thiết bị cho kế hoạch bảo trì");
  if (!(activeAssets || readActiveAssets_()).some((asset) => asset.asset_id === normalized.asset_id)) throw new Error("Thiết bị của kế hoạch không tồn tại hoặc đã bị xóa");
  if (!normalized.title) throw new Error("Nội dung kế hoạch là bắt buộc");
  if (frequencies.indexOf(normalized.frequency) === -1) throw new Error("Chu kỳ bảo trì không hợp lệ");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.next_due_date)) throw new Error("Ngày đến hạn phải có định dạng YYYY-MM-DD");
  normalized.note = String(normalized.note || "").trim();
  normalized.active = String(normalized.active || "TRUE").toUpperCase() === "FALSE" ? "FALSE" : "TRUE";
  normalized.repeat_enabled = String(normalized.repeat_enabled || "TRUE").toUpperCase() === "FALSE" ? "FALSE" : "TRUE";
  normalized.created_at = normalized.created_at || now;
  return normalized;
}

function deleteMaintenancePlan(planId, token) {
  try {
    const actor = requirePermission_(token || "", "maintenance.delete");
    const deleted = deleteObject_(SHEET_NAMES.maintenancePlans, "plan_id", planId);
    if (deleted) logAudit_(actor, "MAINTENANCE_PLAN_DELETED", "maintenance_plan", planId, planId);
    return { ok: deleted, deleted_id: planId, updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function saveMediaFile(payload, token) {
  try {
    const media = payload || {};
    const ownerType = String(media.owner_type || "").trim().toUpperCase();
    const permission = ownerType === "ASSET" ? "assets.manage" : ownerType === "MAINTENANCE" ? "maintenance.manage" : "";
    if (!permission) throw new Error("Loại ảnh không hợp lệ");
    const actor = requirePermission_(token || "", permission);
    const ownerId = String(media.owner_id || "").trim();
    const assetId = String(media.asset_id || "").trim();
    if (!ownerId || !assetId) throw new Error("Thiếu thông tin liên kết ảnh");
    if (ownerType === "ASSET" && ownerId !== assetId) throw new Error("Liên kết ảnh thiết bị không hợp lệ");
    if (!readActiveAssets_().some((asset) => asset.asset_id === assetId)) throw new Error("Thiết bị không tồn tại hoặc đã bị xóa");
    if (ownerType === "MAINTENANCE" && !readSheetAsObjects_(SHEET_NAMES.maintenanceLogs).some((log) => log.log_id === ownerId && log.asset_id === assetId)) {
      throw new Error("Lịch sử bảo trì không hợp lệ");
    }
    const existing = readSheetAsObjects_(SHEET_NAMES.mediaFiles).filter((item) => item.owner_type === ownerType && item.owner_id === ownerId);
    if (existing.length >= 4) throw new Error("Mỗi mục chỉ được lưu tối đa 4 ảnh");
    if (String(media.mime_type || "") !== "image/webp") throw new Error("Ảnh phải được chuyển sang WebP trước khi tải lên");
    const bytes = Utilities.base64Decode(String(media.data_base64 || ""));
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new Error("Ảnh WebP phải nhỏ hơn 2 MB");

    const mediaId = Utilities.getUuid();
    const fileName = `${ownerType.toLowerCase()}-${ownerId}-${mediaId}.webp`;
    const file = getMediaFolder_().createFile(Utilities.newBlob(bytes, "image/webp", fileName));
    const saved = upsertObject_(SHEET_NAMES.mediaFiles, "media_id", {
      media_id: mediaId,
      owner_type: ownerType,
      owner_id: ownerId,
      asset_id: assetId,
      drive_file_id: file.getId(),
      file_name: fileName,
      mime_type: "image/webp",
      sort_order: String(existing.length + 1),
      created_by: actor.username,
      created_at: new Date().toISOString(),
    });
    logAudit_(actor, "MEDIA_CREATED", "media_file", saved.media_id, fileName);
    return { ok: true, data: publicMediaFile_(saved) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function getMediaFile(mediaId, token) {
  try {
    const user = requireAuth_(token || "");
    const media = readSheetAsObjects_(SHEET_NAMES.mediaFiles).find((item) => item.media_id === mediaId);
    if (!media) throw new Error("Không tìm thấy ảnh");
    const permission = media.owner_type === "MAINTENANCE" ? "maintenance.view" : "assets.view";
    if (!hasPermission_(user, permission)) throw new Error("Không có quyền xem ảnh này");
    assertMediaOwnerExists_(media);
    const blob = DriveApp.getFileById(media.drive_file_id).getBlob();
    return { ok: true, media_id: mediaId, mime_type: "image/webp", data_base64: Utilities.base64Encode(blob.getBytes()) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function deleteMediaFile(mediaId, token) {
  try {
    const media = readSheetAsObjects_(SHEET_NAMES.mediaFiles).find((item) => item.media_id === mediaId);
    if (!media) throw new Error("Không tìm thấy ảnh");
    const permission = media.owner_type === "MAINTENANCE" ? "maintenance.manage" : "assets.manage";
    const actor = requirePermission_(token || "", permission);
    assertMediaOwnerExists_(media);
    DriveApp.getFileById(media.drive_file_id).setTrashed(true);
    deleteObject_(SHEET_NAMES.mediaFiles, "media_id", mediaId);
    logAudit_(actor, "MEDIA_DELETED", "media_file", mediaId, media.file_name || mediaId);
    return { ok: true, deleted_id: mediaId };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function assertMediaOwnerExists_(media) {
  if (!readActiveAssets_().some((asset) => asset.asset_id === media.asset_id)) {
    throw new Error("Thiết bị chứa ảnh không tồn tại hoặc đã bị xóa");
  }
  if (media.owner_type === "MAINTENANCE" && !readSheetAsObjects_(SHEET_NAMES.maintenanceLogs).some((log) => log.log_id === media.owner_id && log.asset_id === media.asset_id)) {
    throw new Error("Lịch sử bảo trì chứa ảnh không còn tồn tại");
  }
  if (["ASSET", "MAINTENANCE"].indexOf(media.owner_type) === -1) throw new Error("Loại ảnh không hợp lệ");
}

function getMediaFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const configuredValue = String(properties.getProperty("TDW_MEDIA_FOLDER_ID") || "").trim();
  if (configuredValue) {
    const folderId = normalizeMediaFolderId_(configuredValue);
    try {
      const folder = DriveApp.getFolderById(folderId);
      if (configuredValue !== folderId) properties.setProperty("TDW_MEDIA_FOLDER_ID", folderId);
      return folder;
    } catch (error) {
      throw new Error("Không truy cập được thư mục ảnh. Hãy cấp quyền Editor cho tài khoản sở hữu Apps Script hoặc kiểm tra TDW_MEDIA_FOLDER_ID");
    }
  }
  const folder = DriveApp.createFolder("TDW Equipment Manager Media");
  properties.setProperty("TDW_MEDIA_FOLDER_ID", folder.getId());
  return folder;
}

function normalizeMediaFolderId_(value) {
  const text = String(value || "").trim();
  const urlMatch = text.match(/\/folders\/([A-Za-z0-9_-]+)/);
  const folderId = urlMatch ? urlMatch[1] : text;
  if (!/^[A-Za-z0-9_-]{10,}$/.test(folderId)) throw new Error("TDW_MEDIA_FOLDER_ID phải là ID hoặc URL thư mục Google Drive");
  return folderId;
}

function checkMediaFolderConfiguration() {
  const folder = getMediaFolder_();
  const result = { ok: true, folder_id: folder.getId(), folder_name: folder.getName(), folder_url: folder.getUrl() };
  console.log(JSON.stringify(result));
  return result;
}

function deleteMediaForOwner_(ownerType, ownerId) {
  readSheetAsObjects_(SHEET_NAMES.mediaFiles)
    .filter((item) => item.owner_type === ownerType && item.owner_id === ownerId)
    .forEach((item) => {
      try { DriveApp.getFileById(item.drive_file_id).setTrashed(true); } catch (error) { console.warn(error.message); }
      deleteObject_(SHEET_NAMES.mediaFiles, "media_id", item.media_id);
    });
}

function sendMaintenancePlanReminders(token) {
  try {
    const admin = requireAdmin_(token || "");
    const result = sendDueMaintenancePlanReminders_();
    logAudit_(admin, "MAINTENANCE_REMINDERS_SENT", "maintenance_plan", "", `${result.sent} email`);
    return Object.assign({ ok: true }, result);
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function runMaintenancePlanReminders() {
  return sendDueMaintenancePlanReminders_();
}

function installMaintenancePlanReminderTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "runMaintenancePlanReminders")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("runMaintenancePlanReminders").timeBased().everyDays(1).atHour(8).create();
  return { ok: true, message: "Đã cài lịch kiểm tra email nhắc bảo trì hằng ngày" };
}

function sendDueMaintenancePlanReminders_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Hệ thống đang gửi email nhắc, vui lòng thử lại sau ít phút");
  try {
    return sendDueMaintenancePlanRemindersUnlocked_();
  } finally {
    lock.releaseLock();
  }
}

function sendDueMaintenancePlanRemindersUnlocked_() {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const assetsById = {};
  readActiveAssets_().forEach((asset) => { assetsById[asset.asset_id] = asset; });
  const usersById = {};
  readUsers_().filter(isNotificationReadyUser_).forEach((user) => { usersById[user.user_id] = user; });
  const responsiblesByAsset = {};
  readActiveAssetResponsibles_().forEach((responsibility) => {
    if (!responsiblesByAsset[responsibility.asset_id]) responsiblesByAsset[responsibility.asset_id] = [];
    responsiblesByAsset[responsibility.asset_id].push(responsibility);
  });

  const sentSignatures = new Set(readSheetAsObjects_(SHEET_NAMES.maintenanceNotificationLogs)
    .filter((item) => item.status === "SENT")
    .map((item) => maintenanceNotificationSignature_(item.plan_id, item.recipient_email, item.notification_type, item.due_date)));
  const result = { checked: 0, sent: 0, skipped: 0, failed: 0, today };

  readSheetAsObjects_(SHEET_NAMES.maintenancePlans)
    .filter((plan) => String(plan.active || "TRUE").toUpperCase() !== "FALSE")
    .forEach((plan) => {
      const dueDate = normalizeIsoDate_(plan.next_due_date);
      const notificationType = maintenanceReminderType_(dueDate, today);
      if (!notificationType) return;
      result.checked += 1;
      const reminderPlan = Object.assign({}, plan, { next_due_date: dueDate });
      const asset = assetsById[plan.asset_id];
      const recipients = (responsiblesByAsset[plan.asset_id] || [])
        .map((responsibility) => usersById[responsibility.user_id])
        .filter(Boolean);
      if (!asset || !recipients.length) {
        result.skipped += 1;
        return;
      }
      recipients.forEach((recipient) => {
        const signature = maintenanceNotificationSignature_(reminderPlan.plan_id, recipient.email, notificationType, reminderPlan.next_due_date);
        if (sentSignatures.has(signature)) {
          result.skipped += 1;
          return;
        }
        try {
          MailApp.sendEmail({
            to: recipient.email,
            subject: `[TDW] Nhắc bảo trì: ${asset.asset_name}`,
            body: maintenanceReminderText_(asset, reminderPlan, notificationType),
            htmlBody: maintenanceReminderHtml_(recipient, asset, reminderPlan, notificationType),
            name: "TDW Equipment Manager",
          });
          writeMaintenanceNotificationLog_(reminderPlan, recipient.email, notificationType, "SENT", "");
          sentSignatures.add(signature);
          result.sent += 1;
        } catch (error) {
          writeMaintenanceNotificationLog_(reminderPlan, recipient.email, notificationType, "FAILED", error.message);
          result.failed += 1;
        }
      });
    });
  return result;
}

function maintenanceReminderType_(dueDate, today) {
  const daysUntil = daysBetweenIsoDates_(today, dueDate);
  if (MAINTENANCE_REMINDER_DAYS.indexOf(daysUntil) !== -1) return `DUE_${daysUntil}`;
  if (daysUntil < 0 && Math.abs(daysUntil) % MAINTENANCE_OVERDUE_REMINDER_INTERVAL_DAYS === 0) return `OVERDUE_${Math.abs(daysUntil)}`;
  return "";
}

function daysBetweenIsoDates_(fromDate, toDate) {
  const from = String(fromDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const to = String(toDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!from || !to) return NaN;
  const fromTime = Date.UTC(Number(from[1]), Number(from[2]) - 1, Number(from[3]));
  const toTime = Date.UTC(Number(to[1]), Number(to[2]) - 1, Number(to[3]));
  return Math.round((toTime - fromTime) / 86400000);
}

function normalizeIsoDate_(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text;
  const vietnamese = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!vietnamese) return text;
  return `${vietnamese[3]}-${String(vietnamese[2]).padStart(2, "0")}-${String(vietnamese[1]).padStart(2, "0")}`;
}

function maintenanceNotificationSignature_(planId, email, type, dueDate) {
  return [planId, String(email || "").toLowerCase(), type, dueDate].join("|");
}

function maintenanceReminderText_(asset, plan, notificationType) {
  return `TDW Equipment Manager\n\nNhắc bảo trì: ${asset.asset_name}\nMã tài sản: ${asset.asset_code || "Chưa có"}\nNội dung: ${plan.title}\nNgày đến hạn: ${formatIsoDate_(plan.next_due_date)}\nTrạng thái: ${maintenanceReminderStatus_(notificationType)}\n\nVui lòng kiểm tra và cập nhật lịch sử bảo trì sau khi thực hiện.`;
}

function maintenanceReminderHtml_(recipient, asset, plan, notificationType) {
  return `<div style="font-family:Arial,sans-serif;color:#17202a;line-height:1.55"><h2 style="color:#176fa6">Nhắc bảo trì thiết bị TDW</h2><p>Chào ${escapeHtml_(recipient.full_name || recipient.username)},</p><p>Thiết bị sau cần được theo dõi:</p><table style="border-collapse:collapse"><tr><td style="padding:4px 12px 4px 0;color:#64748b">Thiết bị</td><td><strong>${escapeHtml_(asset.asset_name)}</strong></td></tr><tr><td style="padding:4px 12px 4px 0;color:#64748b">Mã tài sản</td><td>${escapeHtml_(asset.asset_code || "Chưa có")}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#64748b">Nội dung</td><td>${escapeHtml_(plan.title)}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#64748b">Đến hạn</td><td><strong>${escapeHtml_(formatIsoDate_(plan.next_due_date))}</strong></td></tr><tr><td style="padding:4px 12px 4px 0;color:#64748b">Trạng thái</td><td>${escapeHtml_(maintenanceReminderStatus_(notificationType))}</td></tr></table><p>Vui lòng kiểm tra và cập nhật lịch sử bảo trì sau khi thực hiện.</p></div>`;
}

function formatIsoDate_(value) {
  const match = normalizeIsoDate_(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || "");
}

function maintenanceReminderStatus_(type) {
  if (String(type).indexOf("OVERDUE_") === 0) return "Đã quá hạn";
  const days = String(type).replace("DUE_", "");
  return days === "0" ? "Đến hạn hôm nay" : `Còn ${days} ngày đến hạn`;
}

function writeMaintenanceNotificationLog_(plan, email, type, status, error) {
  upsertObject_(SHEET_NAMES.maintenanceNotificationLogs, "notification_id", {
    notification_id: Utilities.getUuid(),
    plan_id: plan.plan_id,
    asset_id: plan.asset_id,
    recipient_email: email,
    notification_type: type,
    due_date: plan.next_due_date,
    sent_at: new Date().toISOString(),
    status,
    error: String(error || "").slice(0, 500),
  });
}

function escapeHtml_(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function saveMovementLog(log, token) {
  try {
    const actor = requirePermission_(token || "", "movement.manage");
    const action = log && log.movement_id ? "MOVEMENT_UPDATED" : "MOVEMENT_CREATED";
    const normalized = normalizeMovementLog_(log || {});
    const saved = upsertObject_(SHEET_NAMES.inventoryMovements, "movement_id", normalized);

    // Tự động cập nhật tài sản
    if (saved.asset_id && saved.to_user) {
      const assets = readActiveAssets_();
      const asset = assets.find(a => a.asset_id === saved.asset_id);
      if (asset) {
        asset.assigned_to = saved.to_user;
        if (saved.to_location) asset.location = saved.to_location;
        upsertObject_(SHEET_NAMES.assets, "asset_id", asset);
      }
    }
    logAudit_(actor, action, "inventory_movement", saved.movement_id, saved.asset_id);
    return { ok: true, data: saved, updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function normalizeMovementLog_(log) {
  const now = new Date().toISOString();
  const normalized = Object.assign({}, log);
  normalized.movement_id = normalized.movement_id || Utilities.getUuid();
  normalized.asset_id = String(normalized.asset_id || "").trim();
  if (!normalized.asset_id) throw new Error("Thiếu asset_id");
  normalized.movement_date = normalized.movement_date || now.split("T")[0];
  normalized.from_user = normalized.from_user || "";
  normalized.to_user = normalized.to_user || "";
  normalized.from_location = normalized.from_location || "";
  normalized.to_location = normalized.to_location || "";
  normalized.reason = normalized.reason || "";
  normalized.approved_by = normalized.approved_by || "";
  normalized.note = normalized.note || "";
  normalized.created_at = normalized.created_at || now;
  return normalized;
}

function saveSoftwareLicense(license, token) {
  try {
    const actor = requirePermission_(token || "", "software.manage");
    const action = license && license.license_id ? "LICENSE_UPDATED" : "LICENSE_CREATED";
    const normalized = normalizeSoftwareLicense_(license || {});
    const saved = upsertObject_(SHEET_NAMES.softwareLicenses, "license_id", normalized);
    logAudit_(actor, action, "software_license", saved.license_id, saved.software_name);
    return { ok: true, data: saved, updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function normalizeSoftwareLicense_(license) {
  const normalized = Object.assign({}, license);
  normalized.license_id = normalized.license_id || Utilities.getUuid();
  normalized.software_name = String(normalized.software_name || "").trim();
  if (!normalized.software_name) throw new Error("Tên phần mềm là bắt buộc");
  normalized.version = normalized.version || "";
  
  const existing = normalized.license_id
    ? readSheetAsObjects_(SHEET_NAMES.softwareLicenses).find((item) => item.license_id === normalized.license_id)
    : null;
  const licenseKey = String(normalized.license_key || "");
  if (licenseKey) {
    PropertiesService.getScriptProperties().setProperty(licenseSecretProperty_(normalized.license_id), licenseKey);
    normalized.license_key_or_note = LICENSE_SECRET_MARKER;
  } else {
    normalized.license_key_or_note = existing ? existing.license_key_or_note || "" : "";
  }
  delete normalized.license_key;

  normalized.assigned_asset_id = normalized.assigned_asset_id || "";
  normalized.assigned_user = normalized.assigned_user || "";
  normalized.expiry_date = normalized.expiry_date || "";
  if (!normalized.status) normalized.status = "ACTIVE";
  normalized.note = normalized.note || "";
  return normalized;
}

function deleteSoftwareLicense(licenseId, token) {
  try {
    const actor = requirePermission_(token || "", "software.delete");
    const deleted = deleteObject_(SHEET_NAMES.softwareLicenses, "license_id", licenseId);
    if (deleted) PropertiesService.getScriptProperties().deleteProperty(licenseSecretProperty_(licenseId));
    if (deleted) logAudit_(actor, "LICENSE_DELETED", "software_license", licenseId, licenseId);
    return { ok: deleted, deleted_id: licenseId, updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function saveDepartment(department, token) {
  try {
    const actor = requireAdmin_(token || "");
    const action = department && department.department_id ? "DEPARTMENT_UPDATED" : "DEPARTMENT_CREATED";
    const normalized = normalizeDepartment_(department || {});
    const saved = upsertObject_(SHEET_NAMES.departments, "department_id", normalized);
    logAudit_(actor, action, "department", saved.department_id, saved.department_name);
    return { ok: true, data: saved, updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function normalizeDepartment_(department) {
  const normalized = Object.assign({}, department);
  normalized.department_id = normalized.department_id || Utilities.getUuid();
  normalized.department_name = String(normalized.department_name || "").trim();
  if (!normalized.department_name) throw new Error("Tên phòng ban là bắt buộc");
  normalized.manager = normalized.manager || "";
  normalized.location = normalized.location || "";
  normalized.note = normalized.note || "";
  return normalized;
}

function deleteDepartment(departmentId, token) {
  try {
    const actor = requireAdmin_(token || "");
    if (!departmentId) throw new Error("Missing department_id");
    const sheet = getSheet_(SHEET_NAMES.departments);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map((header) => String(header).trim());
    const keyIndex = headers.indexOf("department_id");
    if (keyIndex === -1) throw new Error("Missing department_id column");
    const rowIndex = values.findIndex((row, index) => index > 0 && row[keyIndex] === departmentId);
    if (rowIndex < 1) throw new Error("Không tìm thấy phòng ban để xóa");
    const nameIndex = headers.indexOf("department_name");
    const departmentName = nameIndex >= 0 ? String(values[rowIndex][nameIndex] || "") : "";
    sheet.deleteRow(rowIndex + 1);
    logAudit_(actor, "DEPARTMENT_DELETED", "department", departmentId, departmentName);
    return { ok: true, department_id: departmentId, updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function groupLabel_(groupCode) {
  const labels = {
    MAY_TINH_LAPTOP: "Máy tính - Laptop",
    SCADA_LOGGER_DATA: "SCADA - Logger - Data TDW",
    O_CUNG_THIET_BI_DIEN_TU: "Ổ cứng - Thiết bị điện tử",
    MAY_IN_PHOTOCOPY_MAY_CHIEU_TV_DIEN_THOAI: "Máy in - Photocopy - Máy chiếu - TV - Điện thoại",
    LUU_KHO_KEM_PHAM_CHAT: "Thiết bị lưu kho - Kém phẩm chất",
  };
  return labels[groupCode] || groupCode || "";
}

function groupPrefix_(groupCode) {
  const prefixes = {
    MAY_TINH_LAPTOP: "LAP",
    SCADA_LOGGER_DATA: "SCA",
    O_CUNG_THIET_BI_DIEN_TU: "DEV",
    MAY_IN_PHOTOCOPY_MAY_CHIEU_TV_DIEN_THOAI: "PRN",
    LUU_KHO_KEM_PHAM_CHAT: "STO",
  };
  return prefixes[groupCode] || "AST";
}

function nextAssetCode_(groupCode, year) {
  const prefix = groupPrefix_(groupCode);
  const codeYear = String(year || new Date().getFullYear()).replace(/\D/g, "") || String(new Date().getFullYear());
  const rows = readSheetAsObjects_(SHEET_NAMES.assets);
  const nextNumber =
    rows.filter((row) => String(row.asset_code || "").startsWith(`TDW-${prefix}-`)).length + 1;
  return `TDW-${prefix}-${codeYear}-${String(nextNumber).padStart(3, "0")}`;
}

function getSheet_(sheetName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet && [SHEET_NAMES.users, SHEET_NAMES.assetResponsibles, SHEET_NAMES.maintenanceLogs, SHEET_NAMES.maintenancePlans, SHEET_NAMES.maintenanceNotificationLogs, SHEET_NAMES.mediaFiles].indexOf(sheetName) !== -1) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  return sheet;
}

function logAudit_(actor, action, entityType, entityId, entityName) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName(SHEET_NAMES.auditLogs);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAMES.auditLogs);
      sheet.getRange(1, 1, 1, AUDIT_LOG_HEADERS.length).setValues([AUDIT_LOG_HEADERS]);
    }
    const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
      .getDisplayValues()[0]
      .map((header) => String(header).trim());
    if (AUDIT_LOG_HEADERS.some((header) => !headers.includes(header))) {
      throw new Error("AuditLogs thiếu cột bắt buộc");
    }
    const entry = {
      audit_id: Utilities.getUuid(),
      created_at: new Date().toISOString(),
      actor_user_id: actor ? actor.user_id : "",
      actor_username: actor ? actor.username : "system",
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
    };
    sheet.appendRow(headers.map((header) => entry[header] || ""));
  } catch (error) {
    console.error(`Không thể ghi AuditLogs: ${error.message}`);
  }
}

function ensureSheetHeaders_(sheetName, sheet) {
  if (sheetName === SHEET_NAMES.users) {
    ensureUsersSheet_(sheet);
    return;
  }
  if (sheetName === SHEET_NAMES.assets) {
    ensureAssetsSheet_(sheet);
    return;
  }
  if (sheetName === SHEET_NAMES.assetResponsibles) {
    ensureAssetResponsiblesSheet_(sheet);
    return;
  }
  if (sheetName === SHEET_NAMES.maintenanceLogs) {
    ensureMaintenanceLogsSheet_(sheet);
    return;
  }
  if (sheetName === SHEET_NAMES.maintenancePlans) {
    ensureMaintenancePlansSheet_(sheet);
    return;
  }
  if (sheetName === SHEET_NAMES.maintenanceNotificationLogs) {
    ensureMaintenanceNotificationLogsSheet_(sheet);
    return;
  }
  if (sheetName === SHEET_NAMES.mediaFiles) {
    ensureMediaFilesSheet_(sheet);
    return;
  }
  if (sheetName !== SHEET_NAMES.settings) return;
  const firstRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const headers = firstRow.map((header) => String(header).trim()).filter(Boolean);
  if (headers.indexOf("setting_id") !== -1) return;
  const desired = ["setting_id", "setting_type", "setting_value", "display_name", "sort_order", "active"];
  if (!headers.length) {
    sheet.getRange(1, 1, 1, desired.length).setValues([desired]);
    return;
  }
  sheet.insertColumnBefore(1);
  sheet.getRange(1, 1).setValue("setting_id");
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const values = sheet.getRange(2, 2, lastRow - 1, Math.max(sheet.getLastColumn() - 1, 1)).getValues();
    const ids = values.map((row, index) => {
      const type = row[0] || "setting";
      const value = row[1] || index + 1;
      return [`${type}_${value}_${index + 1}`.replace(/[^A-Za-z0-9_]/g, "_")];
    });
    sheet.getRange(2, 1, ids.length, 1).setValues(ids);
  }
}

function ensureAssetsSheet_(sheet) {
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map((header) => String(header).trim()).filter(Boolean);
  if (!headers.length) {
    sheet.getRange(1, 1, 1, ASSET_HEADERS.length).setValues([ASSET_HEADERS]);
    return;
  }
  ASSET_HEADERS.forEach((header) => {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });
}

function ensureAssetResponsiblesSheet_(sheet) {
  const desired = ["responsibility_id", "asset_id", "user_id", "responsibility_role", "active", "created_at", "updated_at"];
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map((header) => String(header).trim()).filter(Boolean);
  if (!headers.length) {
    sheet.getRange(1, 1, 1, desired.length).setValues([desired]);
    return;
  }
  desired.forEach((header) => {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });
}

function ensureMaintenanceLogsSheet_(sheet) {
  const desired = ["log_id", "asset_id", "plan_id", "date", "action_type", "description", "cost", "vendor", "warranty_months", "performed_by", "note", "created_at", "updated_at"];
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map((header) => String(header).trim()).filter(Boolean);
  if (!headers.length) {
    sheet.getRange(1, 1, 1, desired.length).setValues([desired]);
    return;
  }
  desired.forEach((header) => {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });
}

function ensureMaintenancePlansSheet_(sheet) {
  const desired = ["plan_id", "asset_id", "title", "frequency", "next_due_date", "note", "active", "repeat_enabled", "created_at", "updated_at"];
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map((header) => String(header).trim()).filter(Boolean);
  if (!headers.length) {
    sheet.getRange(1, 1, 1, desired.length).setValues([desired]);
    return;
  }
  desired.forEach((header) => {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });
}

function ensureMaintenanceNotificationLogsSheet_(sheet) {
  const desired = ["notification_id", "plan_id", "asset_id", "recipient_email", "notification_type", "due_date", "sent_at", "status", "error", "created_at", "updated_at"];
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map((header) => String(header).trim()).filter(Boolean);
  if (!headers.length) {
    sheet.getRange(1, 1, 1, desired.length).setValues([desired]);
    return;
  }
  desired.forEach((header) => {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });
}

function ensureMediaFilesSheet_(sheet) {
  const desired = ["media_id", "owner_type", "owner_id", "asset_id", "drive_file_id", "file_name", "mime_type", "sort_order", "created_by", "created_at", "updated_at"];
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map((header) => String(header).trim()).filter(Boolean);
  if (!headers.length) {
    sheet.getRange(1, 1, 1, desired.length).setValues([desired]);
    return;
  }
  desired.forEach((header) => {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function loginUser(credentials) {
  try {
    const username = String(credentials.username || "").trim().toLowerCase();
    const password = String(credentials.password || "");
    if (!username || !password) throw new Error("Vui lòng nhập tài khoản và mật khẩu");
    enforceLoginThrottle_(username);

    ensureUsersReady_();
    const user = username.indexOf("@") !== -1 ? findUserByEmail_(username) : findUserByUsername_(username);
    if (!user || String(user.active || "TRUE").toUpperCase() === "FALSE") throwInvalidLogin_(username);
    if (String(user.auth_provider || "").toUpperCase() === "SUPABASE") throw new Error("Tài khoản này sử dụng đăng nhập Supabase");
    if (!verifyPassword_(password, user)) throwInvalidLogin_(username);

    if (String(user.password_hash_version || "v1") !== PASSWORD_HASH_VERSION) setPassword_(user, password);

    user.last_login_at = new Date().toISOString();
    upsertObject_(SHEET_NAMES.users, "user_id", user);

    const token = issueSession_(user);
    clearLoginFailures_(username);
    return { ok: true, token, user: publicUser_(user), updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function loginSupabaseUser(email) {
  try {
    const normalizedEmail = normalizeEmail_(email);
    const user = findUserByEmail_(normalizedEmail);
    if (!user || String(user.active || "TRUE").toUpperCase() === "FALSE") throw new Error("Tài khoản không tồn tại hoặc đã bị khóa");
    if (String(user.auth_provider || "").toUpperCase() !== "SUPABASE" || !user.supabase_user_id) throw new Error("Tài khoản chưa hoàn tất chuyển đổi đăng nhập");
    user.last_login_at = new Date().toISOString();
    upsertObject_(SHEET_NAMES.users, "user_id", user);
    return { ok: true, token: issueSession_(user), user: publicUser_(user), updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function markSupabaseMigration(email, supabaseUserId, token) {
  try {
    const user = requireAuth_(token);
    const normalizedEmail = normalizeEmail_(email);
    if (!normalizedEmail || normalizedEmail !== String(user.email || "").trim().toLowerCase()) throw new Error("Email chuyển đổi không khớp tài khoản đăng nhập");
    if (!supabaseUserId) throw new Error("Thiếu Supabase user ID");
    user.auth_provider = "SUPABASE";
    user.supabase_user_id = String(supabaseUserId);
    user.auth_migrated_at = new Date().toISOString();
    const saved = upsertObject_(SHEET_NAMES.users, "user_id", user);
    logAudit_(user, "AUTH_MIGRATED_TO_SUPABASE", "user", saved.user_id, saved.username);
    return { ok: true, user: publicUser_(saved), updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function getCurrentAuthLink(token) {
  try {
    return { ok: true, auth: authLinkFor_(requireAuth_(token)) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function getUserAuthLink(userId, token) {
  try {
    requireAdmin_(token);
    const user = findUserById_(userId);
    if (!user) throw new Error("Không tìm thấy user");
    return { ok: true, auth: authLinkFor_(user) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function authLinkFor_(user) {
  return {
    auth_provider: String(user.auth_provider || "LEGACY").toUpperCase(),
    supabase_user_id: String(user.supabase_user_id || ""),
  };
}

function logoutUser(token) {
  if (token) CacheService.getScriptCache().remove(`session_${token}`);
  return { ok: true };
}

function logoutAllSessions(token) {
  try {
    const user = requireAuth_(token);
    revokeUserSessions_(user);
    upsertObject_(SHEET_NAMES.users, "user_id", user);
    logAudit_(user, "ALL_SESSIONS_REVOKED", "user", user.user_id, user.username);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function currentUser(token) {
  try {
    return { ok: true, user: publicUser_(requireAuth_(token)) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function listUsers(token) {
  try {
    requireAdmin_(token);
    return { ok: true, users: readUsers_().map(publicUser_) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function saveUser(user, token) {
  try {
    const actor = requireAdmin_(token);
    const existing = user && user.user_id ? findUserById_(user.user_id) : null;
    if (user && user.user_id && !existing) throw new Error("Không tìm thấy user để cập nhật");
    const action = existing ? "USER_UPDATED" : "USER_CREATED";
    const normalized = normalizeUser_(existing ? Object.assign({}, existing, user || {}) : user || {});
    if (existing && normalized.username !== existing.username) throw new Error("Tên tài khoản không được phép thay đổi");
    const duplicate = readUsers_().find((item) => item.username === normalized.username && item.user_id !== normalized.user_id);
    if (duplicate) throw new Error("Tên đăng nhập đã tồn tại");
    const duplicateEmail = normalized.email && readUsers_().find((item) => String(item.email || "").trim().toLowerCase() === normalized.email && item.user_id !== normalized.user_id);
    if (duplicateEmail) throw new Error("Email này đã được dùng cho user khác");
    assertUserCanRemainResponsible_(normalized);
    const saved = upsertObject_(SHEET_NAMES.users, "user_id", normalized);
    logAudit_(actor, action, "user", saved.user_id, saved.username);
    return { ok: true, data: publicUser_(saved), updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function deleteUser(userId, token) {
  try {
    const admin = requireAdmin_(token);
    if (!userId) throw new Error("Missing user_id");
    if (userId === admin.user_id) throw new Error("Không thể xóa chính tài khoản đang đăng nhập");
    const user = findUserById_(userId);
    if (!user) throw new Error("Không tìm thấy user");
    assertUserCanRemainResponsible_(Object.assign({}, user, { active: "FALSE" }));
    user.active = "FALSE";
    revokeUserSessions_(user);
    upsertObject_(SHEET_NAMES.users, "user_id", user);
    logAudit_(admin, "USER_DISABLED", "user", userId, user.username);
    return { ok: true, user_id: userId, updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function resetUserPassword(userId, newPassword, token) {
  try {
    const admin = requireAdmin_(token);
    if (!userId) throw new Error("Missing user_id");
    validateNewPassword_(newPassword);
    const user = findUserById_(userId);
    if (!user) throw new Error("Không tìm thấy user");
    setPassword_(user, newPassword);
    revokeUserSessions_(user);
    user.must_change_password = "TRUE";
    upsertObject_(SHEET_NAMES.users, "user_id", user);
    logAudit_(admin, "PASSWORD_RESET", "user", userId, user.username);
    return { ok: true, user_id: userId, updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function changeOwnPassword(newPassword, token) {
  try {
    const user = requireAuth_(token);
    validateNewPassword_(newPassword);
    setPassword_(user, newPassword);
    revokeUserSessions_(user);
    user.must_change_password = "FALSE";
    const saved = upsertObject_(SHEET_NAMES.users, "user_id", user);
    logAudit_(user, "PASSWORD_CHANGED", "user", saved.user_id, saved.username);
    return { ok: true, token: issueSession_(saved), user: publicUser_(saved), updated_at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function requireAuth_(token) {
  ensureUsersReady_();
  const rawSession = CacheService.getScriptCache().get(`session_${token || ""}`);
  if (!rawSession) throw new Error("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại");
  let session;
  try {
    session = JSON.parse(rawSession);
  } catch (_error) {
    throw new Error("Phiên đăng nhập cũ không còn hiệu lực, vui lòng đăng nhập lại");
  }
  const user = findUserById_(session.user_id);
  if (!user || String(user.active || "TRUE").toUpperCase() === "FALSE") throw new Error("Tài khoản không còn hiệu lực");
  if (Number(session.version) !== Number(user.session_version || 1)) throw new Error("Phiên đăng nhập đã bị thu hồi, vui lòng đăng nhập lại");
  return user;
}

function issueSession_(user) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  const session = JSON.stringify({ user_id: user.user_id, version: Number(user.session_version || 1) });
  CacheService.getScriptCache().put(`session_${token}`, session, 21600);
  return token;
}

function revokeUserSessions_(user) {
  user.session_version = Number(user.session_version || 1) + 1;
  return user.session_version;
}

function requireAdmin_(token) {
  const user = requireAuth_(token);
  if (String(user.role || "").toLowerCase() !== "admin") throw new Error("Chỉ admin mới được thực hiện thao tác này");
  return user;
}

function permissionCodes_(user) {
  const raw = String(user.permissions || "").trim().toLowerCase();
  if (String(user.role || "").toLowerCase() === "admin" || raw === "all") return ["*"];

  const values = raw.split(",").map((item) => item.trim()).filter(Boolean);
  const codes = new Set();
  values.forEach((value) => {
    (LEGACY_PERMISSION_PRESETS[value] || [value]).forEach((code) => codes.add(code));
  });
  return [...codes];
}

function hasPermission_(user, permission) {
  const codes = permissionCodes_(user);
  if (codes.indexOf("*") !== -1 || codes.indexOf(permission) !== -1) return true;

  const [module, action] = String(permission).split(".");
  if (!module || !action) return false;
  if (action === "view") return codes.indexOf(`${module}.manage`) !== -1 || codes.indexOf(`${module}.delete`) !== -1;
  if (action === "manage") return codes.indexOf(`${module}.delete`) !== -1;
  return false;
}

function requirePermission_(token, permission) {
  const user = requireAuth_(token);
  if (!hasPermission_(user, permission)) throw new Error("Tài khoản không có quyền thực hiện thao tác này");
  return user;
}

function defaultPermissionsForRole_(role) {
  if (role === "admin") return "all";
  if (role === "manager") return "edit,report";
  return "view";
}

function normalizePermissions_(permissions, role) {
  const values = String(permissions || defaultPermissionsForRole_(role))
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const allowed = values.filter((value) => value === "all" || LEGACY_PERMISSION_PRESETS[value] || MODULE_PERMISSION_CODES.indexOf(value) !== -1);
  return allowed.length ? [...new Set(allowed)].join(",") : defaultPermissionsForRole_(role);
}

function enforceLoginThrottle_(username) {
  const cache = CacheService.getScriptCache();
  const attempts = Number(cache.get(`login_fail_${username}`) || 0);
  if (attempts >= 5) throw new Error("Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút");
}

function throwInvalidLogin_(username) {
  const cache = CacheService.getScriptCache();
  const key = `login_fail_${username}`;
  const attempts = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(attempts), 900);
  throw new Error("Tài khoản hoặc mật khẩu không đúng");
}

function clearLoginFailures_(username) {
  CacheService.getScriptCache().remove(`login_fail_${username}`);
}

function ensureUsersReady_() {
  ensureSheetHeaders_(SHEET_NAMES.users, getSheet_(SHEET_NAMES.users));
}

function ensureUsersSheet_(sheet) {
  const desired = ["user_id", "username", "full_name", "email", "role", "permissions", "active", "password_salt", "password_hash", "password_hash_version", "session_version", "must_change_password", "auth_provider", "supabase_user_id", "auth_migrated_at", "created_at", "updated_at", "last_login_at"];
  const firstRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const headers = firstRow.map((header) => String(header).trim()).filter(Boolean);
  if (!headers.length) {
    sheet.getRange(1, 1, 1, desired.length).setValues([desired]);
  }
  const currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), desired.length)).getValues()[0].map((header) => String(header).trim());
  desired.forEach((header) => {
    if (currentHeaders.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      currentHeaders.push(header);
    }
  });
  ensureDefaultAdmin_(sheet, currentHeaders);
}

function ensureDefaultAdmin_(sheet, headers) {
  const values = sheet.getDataRange().getValues();
  if (values.length > 1) {
    const headerRow = values[0].map((header) => String(header).trim());
    const roleIndex = headerRow.indexOf("role");
    const activeIndex = headerRow.indexOf("active");
    const hasActiveAdmin = values.some((row, index) => {
      if (index === 0) return false;
      const role = String(row[roleIndex] || "").toLowerCase();
      const active = String(row[activeIndex] || "TRUE").toUpperCase();
      return role === "admin" && active !== "FALSE";
    });
    if (hasActiveAdmin) return;
  }

  const admin = normalizeUser_({
    username: "admin",
    full_name: "TDW Admin",
    role: "admin",
    permissions: "all",
    active: "TRUE",
    password: bootstrapAdminPassword_(),
    must_change_password: "TRUE",
  });
  sheet.appendRow(headers.map((header) => admin[header] || ""));
}

function bootstrapAdminPassword_() {
  const password = PropertiesService.getScriptProperties().getProperty("TDW_BOOTSTRAP_ADMIN_PASSWORD");
  if (password && password.length >= MIN_PASSWORD_LENGTH) return password;
  throw new Error("Thiếu Script Property TDW_BOOTSTRAP_ADMIN_PASSWORD để tạo admin đầu tiên");
}

function normalizeUser_(user) {
  const now = new Date().toISOString();
  const normalized = Object.assign({}, user);
  normalized.user_id = normalized.user_id || Utilities.getUuid();
  normalized.username = String(normalized.username || "").trim().toLowerCase();
  if (!normalized.username) throw new Error("Tên đăng nhập là bắt buộc");
  normalized.full_name = String(normalized.full_name || normalized.username).trim();
  normalized.email = normalizeEmail_(normalized.email);
  normalized.role = String(normalized.role || "user").trim().toLowerCase();
  if (["admin", "manager", "user", "viewer"].indexOf(normalized.role) === -1) normalized.role = "user";
  normalized.permissions = normalizePermissions_(normalized.permissions, normalized.role);
  normalized.active = String(normalized.active || "TRUE").toUpperCase() === "FALSE" ? "FALSE" : "TRUE";
  normalized.password_hash_version = String(normalized.password_hash_version || "v1");
  normalized.session_version = Number(normalized.session_version || 1);
  normalized.must_change_password = String(normalized.must_change_password || "FALSE").toUpperCase() === "TRUE" ? "TRUE" : "FALSE";
  normalized.auth_provider = String(normalized.auth_provider || "LEGACY").toUpperCase() === "SUPABASE" ? "SUPABASE" : "LEGACY";
  normalized.supabase_user_id = String(normalized.supabase_user_id || "");
  normalized.auth_migrated_at = String(normalized.auth_migrated_at || "");
  normalized.created_at = normalized.created_at || now;
  normalized.updated_at = now;
  if (normalized.password) {
    validateNewPassword_(normalized.password);
    setPassword_(normalized, normalized.password);
  }
  else if (!normalized.password_hash) throw new Error("Mật khẩu là bắt buộc khi tạo user mới");
  delete normalized.password;
  return normalized;
}

function readUsers_() {
  return readSheetAsObjects_(SHEET_NAMES.users);
}

function findUserByEmail_(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return readUsers_().find((user) => String(user.email || "").trim().toLowerCase() === normalizedEmail) || null;
}

function normalizeEmail_(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Email không đúng định dạng");
  return normalized;
}

function isNotificationReadyUser_(user) {
  return Boolean(user) && String(user.active || "TRUE").toUpperCase() !== "FALSE" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(user.email || "").trim());
}

function assertUserCanRemainResponsible_(user) {
  const assignments = readActiveAssetResponsibles_()
    .filter((item) => item.user_id === user.user_id);
  if (!assignments.length || isNotificationReadyUser_(user)) return;
  const assetNames = readActiveAssets_()
    .filter((asset) => assignments.some((item) => item.asset_id === asset.asset_id))
    .slice(0, 3)
    .map((asset) => asset.asset_name)
    .join(", ");
  throw new Error(`Không thể khóa hoặc bỏ email của user đang phụ trách thiết bị. Hãy chuyển trách nhiệm trước${assetNames ? `: ${assetNames}` : ""}`);
}

function findUserByUsername_(username) {
  return readUsers_().find((user) => String(user.username || "").toLowerCase() === username);
}

function findUserById_(userId) {
  return readUsers_().find((user) => user.user_id === userId);
}

function setPassword_(user, password) {
  user.password_salt = Utilities.getUuid();
  user.password_hash = hashPassword_(password, user.password_salt);
  user.password_hash_version = PASSWORD_HASH_VERSION;
}

function validateNewPassword_(password) {
  if (String(password || "").length < MIN_PASSWORD_LENGTH) throw new Error(`Mật khẩu mới cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự`);
}

const PASSWORD_HASH_VERSION = "v2";
const PASSWORD_HASH_ROUNDS = 10000;

function hashPassword_(password, salt) {
  let value = `${salt}:${password}`;
  for (let round = 0; round < PASSWORD_HASH_ROUNDS; round += 1) value = sha256Hex_(value);
  return value;
}

function legacyHashPassword_(password, salt) {
  return sha256Hex_(`${salt}:${password}`);
}

function verifyPassword_(password, user) {
  const version = String(user.password_hash_version || "v1");
  const actual = version === PASSWORD_HASH_VERSION
    ? hashPassword_(password, user.password_salt)
    : legacyHashPassword_(password, user.password_salt);
  return constantTimeEqual_(actual, String(user.password_hash || ""));
}

function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytes.map((byte) => (`0${(byte < 0 ? byte + 256 : byte).toString(16)}`).slice(-2)).join("");
}

function constantTimeEqual_(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function publicUser_(user) {
  return {
    user_id: user.user_id,
    username: user.username,
    full_name: user.full_name,
    email: user.email || "",
    role: user.role,
    permissions: user.permissions,
    active: String(user.active || "TRUE").toUpperCase() !== "FALSE",
    must_change_password: String(user.must_change_password || "FALSE").toUpperCase() === "TRUE",
    auth_provider: String(user.auth_provider || "LEGACY").toUpperCase(),
    created_at: user.created_at || "",
    updated_at: user.updated_at || "",
    last_login_at: user.last_login_at || "",
  };
}

function publicResponsibleUser_(user) {
  return {
    user_id: user.user_id,
    full_name: user.full_name,
    username: user.username,
  };
}
