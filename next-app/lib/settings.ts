export const settingTypeDefinitions = {
  asset_group: {
    label: "Nhóm thiết bị",
    description: "Nhóm lớn dùng để lọc, đánh mã và tổng hợp báo cáo thiết bị.",
  },
  asset_type: {
    label: "Loại thiết bị",
    description: "Loại chi tiết như Laptop, Desktop PC, ổ cứng hoặc RAM.",
  },
  status: {
    label: "Tình trạng",
    description: "Trạng thái hiện tại của thiết bị và linh kiện.",
  },
  maintenance_type: {
    label: "Loại bảo trì",
    description: "Hình thức được chọn khi ghi nhận một lần bảo trì.",
  },
  software_name: {
    label: "Tên phần mềm",
    description: "Danh sách gợi ý khi khai báo bản quyền phần mềm.",
  },
} as const;

export type SettingType = keyof typeof settingTypeDefinitions;

export const settingTypes = Object.keys(
  settingTypeDefinitions,
) as SettingType[];

export function settingValueFromDisplayName(displayName: string) {
  return displayName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}
