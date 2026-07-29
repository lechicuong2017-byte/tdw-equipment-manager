import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata = { title: "Nhật ký" };

export default function AuditPage() {
  return (
    <ModulePlaceholder
      eyebrow="BẢO MẬT"
      title="Nhật ký hệ thống"
      description="Theo dõi thay đổi dữ liệu quan trọng và người thực hiện."
      items={[
        "Trigger database ghi thao tác thêm, sửa và xóa",
        "Chỉ admin có quyền đọc audit log",
        "Không lưu mật khẩu hoặc license key thật",
      ]}
    />
  );
}
