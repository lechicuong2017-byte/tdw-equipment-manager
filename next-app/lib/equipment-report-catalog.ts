import type { AppIconName } from "@/components/app-icon";

export type EquipmentReportSlug =
  | "assets"
  | "liquidations"
  | "maintenance"
  | "movements"
  | "software"
  | "qr-labels";

export type EquipmentReportDefinition = {
  slug: EquipmentReportSlug;
  exportType?: "assets" | "liquidations" | "maintenance" | "movement" | "software";
  eyebrow: string;
  title: string;
  description: string;
  icon: AppIconName;
  tone: "blue" | "rose" | "amber" | "violet" | "green" | "cyan";
  permission: string;
};

export const equipmentReports: EquipmentReportDefinition[] = [
  { slug: "assets", exportType: "assets", eyebrow: "THIẾT BỊ", title: "Báo cáo thiết bị", description: "Chọn năm, danh mục, trạng thái và các trường dữ liệu cần xuất.", icon: "assets", tone: "blue", permission: "reports.assets.export" },
  { slug: "liquidations", exportType: "liquidations", eyebrow: "THANH LÝ", title: "Báo cáo thanh lý", description: "Thiết bị đã thanh lý, giá trị thu hồi, lý do và ghi chú.", icon: "archive", tone: "rose", permission: "reports.assets.export" },
  { slug: "maintenance", exportType: "maintenance", eyebrow: "BẢO TRÌ", title: "Báo cáo bảo trì", description: "Kế hoạch định kỳ, lịch sử thực hiện, hình thức và chi phí.", icon: "maintenance", tone: "amber", permission: "reports.maintenance.export" },
  { slug: "movements", exportType: "movement", eyebrow: "LUÂN CHUYỂN", title: "Báo cáo luân chuyển", description: "Lịch sử bàn giao, người nhận, vị trí trước và sau luân chuyển.", icon: "movement", tone: "violet", permission: "reports.movement.export" },
  { slug: "software", exportType: "software", eyebrow: "PHẦN MỀM", title: "Báo cáo phần mềm", description: "Bản quyền, thời hạn và danh sách thiết bị đã được cấp.", icon: "software", tone: "green", permission: "reports.software.export" },
  { slug: "qr-labels", eyebrow: "TEM & QR", title: "In tem QR thiết bị", description: "Chọn nhóm hoặc từng thiết bị để tạo bộ tem QR hàng loạt.", icon: "reports", tone: "cyan", permission: "reports.assets.export" },
];

export function getEquipmentReport(slug: string) {
  return equipmentReports.find((report) => report.slug === slug);
}
