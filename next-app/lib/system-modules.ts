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
] as const;

export type SystemModule = (typeof systemModuleDefinitions)[number]["code"];

export const systemModuleCodes = systemModuleDefinitions.map(
  (module) => module.code,
) as [SystemModule, ...SystemModule[]];
