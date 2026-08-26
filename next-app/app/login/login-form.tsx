"use client";

import { useActionState, useEffect } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;

    // Supabase recovery links deliver the access token in the URL fragment.
    // Fragments never reach the server, so bridge the login fallback to the
    // client-side recovery screen while keeping the token out of application
    // state and preserving the hand-off expected by that screen.
    const params = new URLSearchParams(hash.slice(1));
    if (!params.get("access_token")) return;

    window.location.replace(`/auth/set-password${hash}`);
  }, []);

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
