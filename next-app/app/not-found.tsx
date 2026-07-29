import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">404</p>
        <h1>Không tìm thấy nội dung</h1>
        <p className="muted">Dữ liệu có thể đã được lưu trữ hoặc bạn không có quyền truy cập.</p>
        <Link className="primary-button" href="/dashboard">Về tổng quan</Link>
      </section>
    </main>
  );
}
