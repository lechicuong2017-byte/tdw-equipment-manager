export const baselineMaintenanceSettings = [
  ["KIEM_TRA_SUA_CHUA", "Kiểm tra / sửa chữa", 10],
  ["BAO_DUONG_DINH_KY", "Bảo dưỡng định kỳ", 20],
  ["VE_SINH_LAM_SACH", "Vệ sinh / làm sạch", 30],
  ["THAY_THE_LINH_KIEN", "Thay thế linh kiện", 40],
  ["CAI_DAT_CAU_HINH", "Cài đặt / cấu hình", 50],
  ["XU_LY_SU_CO", "Xử lý sự cố", 60],
];

export function withBaselineMaintenanceSettings(rows) {
  const existing = new Set(
    rows.map((row) => `${String(row.setting_type || "").trim()}\u0000${String(row.setting_value || "").trim()}`),
  );
  const additions = baselineMaintenanceSettings
    .filter(([value]) => !existing.has(`maintenance_type\u0000${value}`))
    .map(([value, displayName, sortOrder]) => ({
      setting_id: null,
      setting_type: "maintenance_type",
      setting_value: value,
      display_name: displayName,
      sort_order: sortOrder,
      active: "TRUE",
    }));
  return [...rows, ...additions];
}
