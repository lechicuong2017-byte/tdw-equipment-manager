export const systemModuleDefinitions = [
  {
    code: "equipment",
    label: "Quản lý thiết bị",
    description: "Thiết bị, bảo trì, luân chuyển, phần mềm và báo cáo thiết bị.",
  },
  {
    code: "vehicles",
    label: "Quản lý xe",
    description: "Hồ sơ xe, đăng kiểm, bảo hiểm, bảo dưỡng và nhiên liệu.",
  },
  {
    code: "supplies",
    label: "Văn phòng phẩm & vệ sinh",
    description: "Danh mục hàng hóa, kho, phiếu yêu cầu và báo cáo mua sắm.",
  },
  { code: "telecom", label: "Chi phí viễn thông", description: "Tuyến ống & ICCPs, điện thoại bàn và điện thoại TGĐ. Người được cấp quyền xem có thể xem toàn bộ chi phí viễn thông." },
] as const;

export type SystemModule = (typeof systemModuleDefinitions)[number]["code"];

export const systemModuleCodes = systemModuleDefinitions.map(
  (module) => module.code,
) as [SystemModule, ...SystemModule[]];
