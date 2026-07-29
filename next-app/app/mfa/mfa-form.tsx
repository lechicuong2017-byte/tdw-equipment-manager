"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
      const supabase = createClient();
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (!active) return;
      if (listError) {
        setMode({ kind: "error", message: "Không thể đọc cấu hình MFA." });
        return;
      }

      const verified = data.totp.find((factor) => factor.status === "verified");
      if (verified) {
        setMode({ kind: "challenge", factorId: verified.id });
        return;
      }

      const pendingFactors = data.totp.filter(
        (factor) => factor.status !== "verified",
      );
      await Promise.all(
        pendingFactors.map((factor) =>
          supabase.auth.mfa.unenroll({ factorId: factor.id }),
        ),
      );

      const { data: enrollment, error: enrollError } =
        await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "TDW Equipment Manager",
        });
      if (!active) return;
      if (enrollError || !enrollment.totp) {
        setMode({ kind: "error", message: "Không thể khởi tạo mã xác thực." });
        return;
      }

      setMode({
        kind: "enroll",
        factorId: enrollment.id,
        qrCode: enrollment.totp.qr_code,
        secret: enrollment.totp.secret,
      });
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
    const supabase = createClient();
    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: mode.factorId });

    if (challengeError || !challenge) {
      setError("Không thể tạo thử thách MFA.");
      setPending(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: mode.factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) {
      setError("Mã không đúng hoặc đã hết hạn.");
      setPending(false);
      return;
    }

    window.location.assign("/dashboard");
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
          {/* Supabase returns a local data URI; no remote image is loaded here. */}
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
