import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata = { title: "Bảo trì" };

export default function MaintenancePage() {
  return (
    <ModulePlaceholder
      eyebrow="BẢO TRÌ"
      title="Bảo trì thiết bị"
      description="Theo dõi lịch sử, kế hoạch và các mốc sắp đến hạn."
      items={[
        "Danh sách lịch sử bảo trì theo thiết bị",
        "Kế hoạch định kỳ và ngày đến hạn",
        "Ảnh trước/sau bảo trì trong Supabase Storage",
        "Apps Script tiếp tục gửi email nhắc việc",
      ]}
    />
  );
}
