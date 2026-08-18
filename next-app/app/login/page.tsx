import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ next?: string; error?: string; status?: string }>;
};

const errorMessages: Record<string, string> = {
  inactive: "Tài khoản chưa được kích hoạt hoặc đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.",
  logout: "Phiên trên máy này đã được xóa, nhưng máy chủ chưa thể xác nhận đăng xuất. Bạn vẫn có thể đăng nhập lại.",
  callback: "Liên kết đăng nhập không hợp lệ hoặc đã hết hạn.",
  confirmation: "Không thể xác nhận tài khoản. Vui lòng yêu cầu một lời mời mới.",
  invite: "Phiên thiết lập mật khẩu không hợp lệ hoặc đã hết hạn.",
};

const statusMessages: Record<string, string> = {
  "signed-out": "Bạn đã đăng xuất khỏi phiên trên thiết bị này.",
  "password-set": "Đã thiết lập mật khẩu. Bạn có thể đăng nhập ngay.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, error, status } = await searchParams;
  const pageError = error ? errorMessages[error] : undefined;
  const pageStatus = status ? statusMessages[status] : undefined;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">TDW</div>
        <p className="eyebrow">EQUIPMENT MANAGER</p>
        <h1>Chào mừng trở lại</h1>
        <p className="muted">
          Đăng nhập bằng tài khoản nội bộ đã được quản trị viên mời.
        </p>
        {pageError ? <p className="form-error" role="alert">{pageError}</p> : null}
        {pageStatus ? <p className="form-success" role="status">{pageStatus}</p> : null}
        <LoginForm nextPath={next} />
        <p className="security-note">
          Phiên đăng nhập được bảo vệ bằng cookie phía server và quyền truy cập dữ liệu được kiểm tra tại PostgreSQL.
        </p>
      </section>
    </main>
  );
}
