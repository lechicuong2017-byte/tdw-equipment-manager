import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata = { title: "Cấu hình" };

export default function SettingsPage() {
  return (
    <ModulePlaceholder
      eyebrow="HỆ THỐNG"
      title="Cấu hình danh mục"
      description="Phòng ban, loại thiết bị và trạng thái sẽ được quản lý tập trung."
      items={[
        "Danh mục có khóa duy nhất và trạng thái active",
        "Chỉ admin có quyền thay đổi cấu hình",
        "Thay đổi được ghi audit tự động",
      ]}
    />
  );
}
