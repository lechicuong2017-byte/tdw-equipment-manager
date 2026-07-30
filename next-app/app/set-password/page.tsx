import { redirect } from "next/navigation";
import { PasswordForm } from "./password-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thiết lập mật khẩu" };

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login?error=invite");

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">TDW</div>
        <p className="eyebrow">TÀI KHOẢN NỘI BỘ</p>
        <h1>Tạo mật khẩu</h1>
        <p className="muted">
          Đặt mật khẩu riêng cho tài khoản. Sau bước này, quản trị viên phải
          đăng ký xác thực hai lớp.
        </p>
        <PasswordForm />
        <p className="security-note">
          Mật khẩu được gửi trực tiếp đến Supabase Auth và không được lưu trong
          mã nguồn hay cơ sở dữ liệu nghiệp vụ.
        </p>
      </section>
    </main>
  );
}
