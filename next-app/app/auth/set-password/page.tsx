"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseEnv } from "@/lib/env";

type PageState = "loading" | "ready" | "invalid";

export default function AuthSetPasswordPage() {
  const accessTokenRef = useRef<string | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;

    function prepareRecovery() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = params.get("access_token");
      const expiresAt = Number(params.get("expires_at"));

      window.history.replaceState(
        {},
        document.title,
        `${window.location.pathname}${window.location.search}`,
      );

      if (
        !accessToken
        || (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= Date.now() / 1000)
      ) {
        if (active) setPageState("invalid");
        return;
      }

      accessTokenRef.current = accessToken;
      if (active) setPageState("ready");
    }

    prepareRecovery();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 12) {
      setError("Mật khẩu phải có ít nhất 12 ký tự.");
      return;
    }
    if (password !== confirmation) {
      setError("Hai mật khẩu chưa trùng nhau.");
      return;
    }

    setPending(true);
    const accessToken = accessTokenRef.current;
    if (!accessToken) {
      setError("Phiên đặt mật khẩu chưa sẵn sàng.");
      setPending(false);
      return;
    }

    const { url, publishableKey } = getSupabaseEnv();
    let response: Response;
    try {
      response = await fetch(`${url}/auth/v1/user`, {
        method: "PUT",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      setError("Không thể kết nối tới dịch vụ xác thực. Hãy thử lại.");
      setPending(false);
      return;
    }

    if (!response.ok) {
      setError("Không thể đặt mật khẩu. Liên kết có thể đã hết hạn.");
      setPending(false);
      return;
    }

    accessTokenRef.current = null;
    window.location.replace("/login?status=password-set");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">TDW</div>
        <p className="eyebrow">TÀI KHOẢN NỘI BỘ</p>
        <h1>Tạo mật khẩu</h1>
        {pageState === "loading" ? (
          <p className="muted">Đang xác nhận liên kết bảo mật…</p>
        ) : null}
        {pageState === "invalid" ? (
          <p className="form-error" role="alert">
            Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu gửi lại email.
          </p>
        ) : null}
        {pageState === "ready" ? (
          <>
            <p className="muted">
              Đặt mật khẩu riêng cho tài khoản. Sau bước này, quản trị viên phải
              đăng ký xác thực hai lớp.
            </p>
            <form className="auth-form" onSubmit={submit}>
              <label>
                Mật khẩu mới
                <input
                  autoComplete="new-password"
                  minLength={12}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Tối thiểu 12 ký tự"
                  required
                  type="password"
                  value={password}
                />
              </label>
              <label>
                Nhập lại mật khẩu
                <input
                  autoComplete="new-password"
                  minLength={12}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  required
                  type="password"
                  value={confirmation}
                />
              </label>
              {error ? (
                <p className="form-error" role="alert">{error}</p>
              ) : null}
              <button
                className="primary-button"
                disabled={pending}
                type="submit"
              >
                {pending ? "Đang lưu…" : "Đặt mật khẩu và tiếp tục"}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}
