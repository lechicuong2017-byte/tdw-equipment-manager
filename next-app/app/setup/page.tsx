import Link from "next/link";
import { hasSupabaseEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  const configured = hasSupabaseEnv();

  return (
    <main className="auth-shell">
      <section className="auth-card setup-card">
        <div className="brand-mark" aria-hidden="true">TDW</div>
        <p className="eyebrow">NEXT.JS + SUPABASE</p>
        <h1>{configured ? "Kết nối đã sẵn sàng" : "Cần kết nối Supabase"}</h1>
        <p className="muted">
          {configured
            ? "Ứng dụng đã nhận cấu hình Supabase và có thể bắt đầu xác thực."
            : "Mã nguồn không chứa khóa thật. Hãy tạo file .env.local từ .env.example và cung cấp URL cùng publishable key của dự án Supabase."}
        </p>
        <div className="setup-status" data-ready={configured}>
          <span aria-hidden="true" />
          {configured ? "Đã cấu hình" : "Chưa có biến môi trường"}
        </div>
        {configured ? (
          <Link className="primary-button" href="/login">
            Đi đến đăng nhập
          </Link>
        ) : (
          <div className="code-note">
            <code>NEXT_PUBLIC_SUPABASE_URL</code>
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>
          </div>
        )}
      </section>
    </main>
  );
}
