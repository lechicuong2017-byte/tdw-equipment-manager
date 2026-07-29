import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">TDW</div>
        <p className="eyebrow">EQUIPMENT MANAGER</p>
        <h1>Chào mừng trở lại</h1>
        <p className="muted">
          Đăng nhập bằng tài khoản nội bộ đã được quản trị viên mời.
        </p>
        <LoginForm nextPath={next} />
        <p className="security-note">
          Phiên đăng nhập được bảo vệ bằng cookie phía server và quyền truy cập dữ liệu được kiểm tra tại PostgreSQL.
        </p>
      </section>
    </main>
  );
}
