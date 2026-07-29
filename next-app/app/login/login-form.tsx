"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="auth-form">
      <input type="hidden" name="next" value={nextPath ?? ""} />
      <label>
        Email
        <input
          autoComplete="email"
          inputMode="email"
          name="email"
          placeholder="ten@tdw.vn"
          required
          type="email"
        />
      </label>
      <label>
        Mật khẩu
        <input
          autoComplete="current-password"
          minLength={8}
          name="password"
          placeholder="••••••••"
          required
          type="password"
        />
      </label>
      {state.error ? (
        <p className="form-error" role="alert">{state.error}</p>
      ) : null}
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Đang xác thực…" : "Đăng nhập"}
      </button>
    </form>
  );
}
