import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata = { title: "Người dùng" };

export default function UsersPage() {
  return (
    <ModulePlaceholder
      eyebrow="QUẢN TRỊ"
      title="Người dùng và vai trò"
      description="Tài khoản được mời qua Supabase Auth và mặc định chỉ có quyền Viewer."
      items={[
        "Tắt đăng ký công khai",
        "Admin gán vai trò sau khi mời",
        "MFA bắt buộc với tài khoản quản trị",
        "RLS thực thi quyền tại database",
      ]}
    />
  );
}
