import Link from "next/link";
import { hasDatabaseEnv } from "@/lib/env";
import { databaseState } from "@/lib/db/setup";
import { runSetup } from "./actions";

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const configured = hasDatabaseEnv();
  const state = configured ? await databaseState() : null;
  const ready = Boolean(state?.connected && state.initialized && state.hasAdmin);
  const canSetup = Boolean(state?.connected && !state.hasAdmin && process.env.SETUP_TOKEN);

  return (
    <main className="auth-shell">
      <section className="auth-card setup-card">
        <div className="brand-mark" aria-hidden="true">TDW</div>
        <p className="eyebrow">NEXT.JS + MARIADB</p>
        <h1>{ready ? "Hệ thống đã sẵn sàng" : !configured ? "Cần cấu hình cơ sở dữ liệu" : !state?.connected ? "Chưa kết nối được MariaDB" : "Khởi tạo hệ thống"}</h1>
        <p className="muted">
          {ready
            ? "Cơ sở dữ liệu đã có bảng và tài khoản quản trị."
            : !configured
              ? "Hãy khai báo biến môi trường DATABASE_URL (hoặc DB_HOST, DB_NAME, DB_USER, DB_PASSWORD) trong cấu hình Web App."
              : !state?.connected
                ? "Kiểm tra lại máy chủ, tên CSDL, người dùng và mật khẩu MariaDB."
                : "Tạo bảng dữ liệu và tài khoản quản trị đầu tiên. Thao tác chỉ chạy được một lần."}
        </p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="setup-status" data-ready={ready}>
          <span aria-hidden="true" />
          {ready ? "Đã cấu hình" : state?.initialized ? "Đã có bảng, chưa có quản trị viên" : "Chưa khởi tạo"}
        </div>
        {ready ? (
          <Link className="primary-button" href="/login">Đi đến đăng nhập</Link>
        ) : canSetup ? (
          <form action={runSetup} className="auth-form">
            <label>Mã khởi tạo (SETUP_TOKEN)<input name="token" type="password" required autoComplete="off" /></label>
            <label>Email quản trị viên<input name="email" type="email" required autoComplete="email" /></label>
            <label>Họ tên<input name="full_name" required /></label>
            <label>Mật khẩu (tối thiểu 12 ký tự)<input name="password" type="password" minLength={12} required autoComplete="new-password" /></label>
            <button className="primary-button" type="submit">Khởi tạo hệ thống</button>
          </form>
        ) : state?.connected && !process.env.SETUP_TOKEN ? (
          <div className="code-note"><code>SETUP_TOKEN</code></div>
        ) : !configured ? (
          <div className="code-note"><code>DATABASE_URL</code></div>
        ) : null}
      </section>
    </main>
  );
}
