"use client";

import { useEffect, useState } from "react";
import { prepareMfa, verifyMfa } from "./actions";

type MfaMode =
  | { kind: "loading" }
  | { kind: "enroll"; factorId: string; qrCode: string; secret: string }
  | { kind: "challenge"; factorId: string }
  | { kind: "error"; message: string };

export function MfaForm() {
  const [mode, setMode] = useState<MfaMode>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function prepare() {
      const result = await prepareMfa().catch(() => ({ kind: "error" as const, message: "Không thể đọc cấu hình MFA." }));
      if (!active) return;
      setMode(result);
    }

    prepare();
    return () => {
      active = false;
    };
  }, []);

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode.kind !== "enroll" && mode.kind !== "challenge") return;
    if (!/^\d{6}$/.test(code)) {
      setError("Mã xác thực phải gồm 6 chữ số.");
      return;
    }

    setPending(true);
    setError("");
    const result = await verifyMfa(mode.factorId, code).catch(() => ({ error: "Không thể xác minh mã." }));
    if (result.error) {
      setError(result.error);
      setPending(false);
      return;
    }

    window.location.assign("/modules");
  }

  if (mode.kind === "loading") {
    return <p className="muted">Đang chuẩn bị xác thực hai lớp…</p>;
  }

  if (mode.kind === "error") {
    return <p className="form-error" role="alert">{mode.message}</p>;
  }

  return (
    <form className="auth-form" onSubmit={verify}>
      {mode.kind === "enroll" ? (
        <div className="mfa-enroll">
          <p>Quét mã bằng Google Authenticator, Microsoft Authenticator hoặc ứng dụng TOTP khác.</p>
          {/* Mã QR là data URI tạo phía server; không tải ảnh từ bên ngoài. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Mã QR thiết lập MFA" height="210" src={mode.qrCode} width="210" />
          <details>
            <summary>Không quét được mã?</summary>
            <code>{mode.secret}</code>
          </details>
        </div>
      ) : (
        <p className="muted">Nhập mã 6 chữ số từ ứng dụng xác thực của bạn.</p>
      )}

      <label>
        Mã xác thực
        <input
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          minLength={6}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          pattern="\d{6}"
          placeholder="000000"
          required
          value={code}
        />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Đang xác minh…" : "Xác minh và tiếp tục"}
      </button>
    </form>
  );
}
