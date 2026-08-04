"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppIcon } from "@/components/app-icon";

type ActionToastTone = "success" | "error" | "info" | "warning";

type ActionToast = {
  id: string;
  message: string;
  tone: ActionToastTone;
};

type ActionToastContextValue = {
  showToast: (message: string, tone?: ActionToastTone) => void;
};

const ActionToastContext = createContext<ActionToastContextValue | null>(null);
const ActionSuccessContext = createContext<() => void>(() => undefined);

export function ActionSuccessBoundary({
  children,
  onSuccess,
}: {
  children: ReactNode;
  onSuccess: () => void;
}) {
  return (
    <ActionSuccessContext.Provider value={onSuccess}>
      {children}
    </ActionSuccessContext.Provider>
  );
}

export function ActionToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActionToast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, tone: ActionToastTone = "success") => {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => {
      if (current.some((toast) => toast.message === normalizedMessage && toast.tone === tone)) {
        return current;
      }
      return [...current, { id, message: normalizedMessage, tone }].slice(-3);
    });

    window.setTimeout(() => removeToast(id), 4_500);
  }, [removeToast]);

  return (
    <ActionToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-atomic="false"
        aria-live="polite"
        className="action-toast-region"
        role="status"
      >
        {toasts.map((toast) => (
          <div className={`action-toast action-toast-${toast.tone}`} key={toast.id}>
            <span aria-hidden="true" className="action-toast-icon">
              <AppIcon
                name={toast.tone === "success"
                  ? "checkCircle"
                  : toast.tone === "warning"
                    ? "warningTriangle"
                    : toast.tone === "info"
                      ? "infoCircle"
                      : "alertCircle"}
                size={18}
              />
            </span>
            <div>
              <strong>
                {toast.tone === "success"
                  ? "Thành công"
                  : toast.tone === "warning"
                    ? "Cần lưu ý"
                    : toast.tone === "info"
                      ? "Thông tin"
                      : "Có lỗi xảy ra"}
              </strong>
              <p>{toast.message}</p>
            </div>
            <button
              aria-label="Đóng thông báo"
              onClick={() => removeToast(toast.id)}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ActionToastContext.Provider>
  );
}

export function useActionToast() {
  const context = useContext(ActionToastContext);
  if (!context) throw new Error("useActionToast phải được dùng trong ActionToastProvider.");
  return context;
}

export function ActionStateToast({
  state,
}: {
  state: { success?: string };
}) {
  const { showToast } = useActionToast();
  const onSuccess = useContext(ActionSuccessContext);
  const previousState = useRef(state);

  useEffect(() => {
    if (previousState.current === state) return;
    previousState.current = state;
    if (state.success) {
      showToast(state.success);
      onSuccess();
    }
  }, [onSuccess, showToast, state]);

  return null;
}

export function ActionUrlToast() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useActionToast();

  useEffect(() => {
    const success = searchParams.get("ok");
    if (!success) return;

    showToast(success);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("ok");
    const query = nextParams.toString();
    window.history.replaceState(
      window.history.state,
      "",
      query ? `${pathname}?${query}` : pathname,
    );
  }, [pathname, searchParams, showToast]);

  return null;
}
