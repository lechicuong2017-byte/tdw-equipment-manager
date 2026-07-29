import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata = { title: "Phần mềm" };

export default function SoftwarePage() {
  return (
    <ModulePlaceholder
      eyebrow="PHẦN MỀM"
      title="Bản quyền phần mềm"
      description="Quản lý phân bổ và thời hạn mà không đưa license key xuống trình duyệt."
      items={[
        "License key thật tiếp tục tách khỏi bảng nghiệp vụ",
        "Chỉ admin được yêu cầu xem key",
        "Mỗi lượt xem đều được ghi audit",
      ]}
    />
  );
}
