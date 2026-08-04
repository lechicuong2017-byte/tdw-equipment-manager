"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  revealSoftwareLicenseSecret,
  saveSoftwareLicenseSecret,
  type SoftwareSecretFormState,
} from "@/app/(protected)/software/actions";

const initialState: SoftwareSecretFormState = {};

export function SoftwareLicenseSecretPanel({
  licenseId,
  maskedKey,
  hasEncryptedSecret,
}: {
  licenseId: string;
  maskedKey: string;
  hasEncryptedSecret: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    saveSoftwareLicenseSecret,
    initialState,
  );
  const [revealedKey, setRevealedKey] = useState("");
  const [revealError, setRevealError] = useState("");
  const [revealing, startRevealTransition] = useTransition();
  const secretInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.clearSecretInput && secretInput.current) {
      secretInput.current.value = "";
      setRevealedKey("");
    }
  }, [state.clearSecretInput]);

  useEffect(() => {
    if (!revealedKey) return;
    const timeout = window.setTimeout(() => setRevealedKey(""), 60_000);
    return () => window.clearTimeout(timeout);
  }, [revealedKey]);

  function revealKey() {
    setRevealError("");
    startRevealTransition(async () => {
      const result = await revealSoftwareLicenseSecret(licenseId);
      if (result.key) {
        setRevealedKey(result.key);
        return;
      }
      setRevealedKey("");
      setRevealError(result.error || "Không thể xem key bản quyền.");
    });
  }

  return (
    <section className="panel form-panel software-secret-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">KEY BẢN QUYỀN · CHỈ ADMIN</p>
          <h2>Key được mã hóa</h2>
        </div>
        <small>AES-256-GCM · yêu cầu tài khoản Admin và MFA</small>
      </div>

      <form action={formAction} className="data-form">
        <input name="id" type="hidden" value={licenseId} />
        <div className="form-grid">
          <label className="span-3">
            Nhập hoặc dán key mới
            <input
              aria-describedby="software-key-note"
              autoComplete="new-password"
              maxLength={4096}
              name="license_key_plaintext"
              ref={secretInput}
              required
              spellCheck={false}
              type="password"
            />
          </label>
        </div>
        <p className="form-help" id="software-key-note">
          Key tự che khi nhập, được mã hóa trên server và không lưu trong bảng
          danh sách hoặc báo cáo.
        </p>
        {state.error ? (
          <p className="form-error" role="alert">{state.error}</p>
        ) : null}
        {state.success ? (
          <p className="form-success" role="status">{state.success}</p>
        ) : null}
        <div className="form-actions software-secret-actions">
          <span className="masked-key">
            {maskedKey || "Chưa có key được mã hóa"}
          </span>
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? "Đang mã hóa…" : "Mã hóa và lưu key"}
          </button>
        </div>
      </form>

      <div className="software-secret-reveal">
        <div>
          <strong>Xem key đã lưu</strong>
          <small>Mỗi lần xem đều được ghi vào Nhật ký hệ thống.</small>
        </div>
        <div className="row-actions">
          {revealedKey ? (
            <button
              className="secondary-button"
              onClick={() => setRevealedKey("")}
              type="button"
            >
              Ẩn key
            </button>
          ) : (
            <button
              className="secondary-button"
              disabled={!hasEncryptedSecret || revealing}
              onClick={revealKey}
              type="button"
            >
              {revealing ? "Đang giải mã…" : "Xem key"}
            </button>
          )}
        </div>
      </div>
      {revealedKey ? (
        <code className="software-secret-value" role="status">
          {revealedKey}
        </code>
      ) : null}
      {revealError ? (
        <p className="form-error" role="alert">{revealError}</p>
      ) : null}
    </section>
  );
}
