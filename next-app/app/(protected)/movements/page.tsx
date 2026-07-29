import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata = { title: "Luân chuyển" };

export default function MovementsPage() {
  return (
    <ModulePlaceholder
      eyebrow="LUÂN CHUYỂN"
      title="Luân chuyển thiết bị"
      description="Ghi nhận người sử dụng và vị trí của thiết bị theo thời gian."
      items={[
        "Lịch sử luân chuyển theo thiết bị",
        "Người giao, người nhận và người phê duyệt",
        "Audit log cho từng thay đổi",
      ]}
    />
  );
}
