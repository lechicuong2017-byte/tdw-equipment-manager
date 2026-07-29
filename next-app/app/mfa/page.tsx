import { redirect } from "next/navigation";
import { MfaForm } from "./mfa-form";
import { requireAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Xác thực hai lớp" };

export default async function MfaPage() {
  const { supabase, access } = await requireAccess({ allowAal1: true });
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === "aal2") redirect("/dashboard");

  const required = access.roles.includes("admin") || access.must_enroll_mfa;
  if (!required) redirect("/dashboard");

  return (
    <main className="auth-shell">
      <section className="auth-card setup-card">
        <div className="brand-mark" aria-hidden="true">2FA</div>
        <p className="eyebrow">BẢO MẬT TÀI KHOẢN</p>
        <h1>Xác thực hai lớp</h1>
        <p className="muted">
          Tài khoản quản trị phải xác minh thêm một bước trước khi truy cập dữ liệu.
        </p>
        <MfaForm />
      </section>
    </main>
  );
}
