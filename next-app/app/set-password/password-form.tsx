"use client";

import { useActionState } from "react";
import { setPassword, type SetPasswordState } from "./actions";

const initialState: SetPasswordState = {};

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(
    setPassword,
    initialState,
  );

  return (
    <form action={formAction} className="auth-form">
      <label>
        Mật khẩu mới
        <input
          autoComplete="new-password"
          minLength={12}
          name="password"
          placeholder="Tối thiểu 12 ký tự"
          required
          type="password"
        />
      </label>
      <label>
        Nhập lại mật khẩu
        <input
          autoComplete="new-password"
          minLength={12}
          name="confirm_password"
          placeholder="Nhập lại mật khẩu"
          required
          type="password"
        />
      </label>
      {state.error ? (
        <p className="form-error" role="alert">{state.error}</p>
      ) : null}
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Đang lưu…" : "Đặt mật khẩu và tiếp tục"}
      </button>
    </form>
  );
}
