"use client";

import { useActionState, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ActionSuccessContext,
  ActionStateToast,
  ActionSuccessBoundary,
} from "@/components/action-toast";
import { AppIcon } from "@/components/app-icon";

type ModalSize = "small" | "medium" | "large" | "wide";

type AppModalProps = {
  children: ReactNode;
  description?: string;
  eyebrow?: string;
  onClose: () => void;
  open: boolean;
  size?: ModalSize;
  title: string;
};

let bodyScrollLockCount = 0;
let bodyOverflowBeforeModal = "";

function acquireBodyScrollLock() {
  if (bodyScrollLockCount === 0) {
    bodyOverflowBeforeModal = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  bodyScrollLockCount += 1;

  return () => {
    bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
    if (bodyScrollLockCount === 0) {
      document.body.style.overflow = bodyOverflowBeforeModal;
      bodyOverflowBeforeModal = "";
    }
  };
}

export function AppModal({
  children,
  description,
  eyebrow = "THAO TÁC",
  onClose,
  open,
  size = "medium",
  title,
}: AppModalProps) {
  const [mounted, setMounted] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);

  const markFormDirty = useCallback((event: SyntheticEvent<HTMLElement>) => {
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    setFormDirty(true);
  }, []);

  const requestClose = useCallback(() => {
    const modal = modalRef.current;
    const hasSelectedFile = Array.from(
      modal?.querySelectorAll<HTMLInputElement>('input[type="file"]') ?? [],
    ).some((input) => Boolean(input.files?.length));
    const hasUnsavedReview = Boolean(
      modal?.querySelector('[data-unsaved-changes="true"]'),
    );

    if (formDirty || hasSelectedFile || hasUnsavedReview) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  }, [formDirty, onClose]);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    return acquireBodyScrollLock();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirmingClose) setConfirmingClose(false);
      else requestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [confirmingClose, open, requestClose]);

  useEffect(() => {
    if (!open) {
      setConfirmingClose(false);
      setFormDirty(false);
    }
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="app-modal-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !confirmingClose) requestClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`app-modal app-modal-${size}`}
        onChangeCapture={markFormDirty}
        onInputCapture={markFormDirty}
        ref={modalRef}
        role="dialog"
      >
        <header className="app-modal-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={titleId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button
            aria-label="Đóng popup"
            className="app-modal-close"
            onClick={requestClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="app-modal-body">{children}</div>
        {confirmingClose ? (
          <div className="app-modal-unsaved-backdrop" role="presentation">
            <section
              aria-describedby={`${titleId}-unsaved-description`}
              aria-labelledby={`${titleId}-unsaved-title`}
              aria-modal="true"
              className="app-modal-unsaved"
              role="alertdialog"
            >
              <span aria-hidden="true" className="app-modal-unsaved-icon">!</span>
              <div>
                <p className="eyebrow">DỮ LIỆU CHƯA LƯU</p>
                <h3 id={`${titleId}-unsaved-title`}>Đóng và bỏ dữ liệu đang nhập?</h3>
                <p id={`${titleId}-unsaved-description`}>Dữ liệu bạn vừa nhập hoặc lựa chọn vẫn chưa được lưu. Nếu đóng popup, các thay đổi hiện tại sẽ bị mất.</p>
              </div>
              <div className="app-modal-unsaved-actions">
                <button className="secondary-button" onClick={() => setConfirmingClose(false)} type="button">Tiếp tục chỉnh sửa</button>
                <button className="danger-button" onClick={onClose} type="button">Đóng và bỏ dữ liệu</button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}

export function ModalTrigger({
  children,
  closeParentOnSuccess = false,
  description,
  eyebrow,
  size,
  title,
  triggerClassName = "primary-button",
  triggerLabel,
}: Omit<AppModalProps, "onClose" | "open"> & {
  closeParentOnSuccess?: boolean;
  triggerClassName?: string;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const parentSuccess = useContext(ActionSuccessContext);
  const handleSuccess = useCallback(() => {
    setOpen(false);
    if (closeParentOnSuccess) parentSuccess();
  }, [closeParentOnSuccess, parentSuccess]);
  return (
    <>
      <button className={triggerClassName} onClick={() => setOpen(true)} type="button">
        {triggerLabel}
      </button>
      <AppModal
        description={description}
        eyebrow={eyebrow}
        onClose={() => setOpen(false)}
        open={open}
        size={size}
        title={title}
      >
        <ActionSuccessBoundary onSuccess={handleSuccess}>
          {children}
        </ActionSuccessBoundary>
      </AppModal>
    </>
  );
}

export function ModalPage({
  children,
  closeHref,
  description,
  eyebrow,
  size,
  title,
}: Omit<AppModalProps, "onClose" | "open"> & { closeHref: string }) {
  const router = useRouter();
  const handleSuccess = useCallback(() => {
    // Route-backed modals must leave the intercepted route after a successful
    // mutation. Replacing avoids reopening the completed form with Back, while
    // refresh makes the destination list read the newly persisted data.
    router.replace(closeHref);
    router.refresh();
  }, [closeHref, router]);

  return (
    <AppModal
      description={description}
      eyebrow={eyebrow}
      onClose={() => router.push(closeHref)}
      open
      size={size}
      title={title}
    >
      <ActionSuccessBoundary onSuccess={handleSuccess}>
        {children}
      </ActionSuccessBoundary>
    </AppModal>
  );
}

type ConfirmActionProps = {
  action: (
    formData: FormData,
  ) => void | ConfirmActionState | Promise<void | ConfirmActionState>;
  confirmLabel?: string;
  closeParentOnSuccess?: boolean;
  description: string;
  fields: Record<string, string | number | boolean | null | undefined>;
  title?: string;
  triggerAriaLabel?: string;
  triggerClassName?: string;
  triggerLabel?: string;
};

type ConfirmActionState = {
  error?: string;
  success?: string;
};

const initialConfirmActionState: ConfirmActionState = {};

export function ConfirmAction({
  action,
  confirmLabel = "Xác nhận xóa",
  closeParentOnSuccess = false,
  description,
  fields,
  title = "Xóa dữ liệu?",
  triggerAriaLabel,
  triggerClassName = "text-button text-danger",
  triggerLabel = "Xóa",
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const parentSuccess = useContext(ActionSuccessContext);
  const [state, formAction, pending] = useActionState(
    async (_previousState: ConfirmActionState, formData: FormData) => {
      const result = await action(formData);
      return result ?? { success: "Đã xóa dữ liệu thành công." };
    },
    initialConfirmActionState,
  );

  useEffect(() => {
    if (!state.success) return;
    setOpen(false);
    if (closeParentOnSuccess) parentSuccess();
  }, [closeParentOnSuccess, parentSuccess, state]);

  return (
    <>
      <ActionStateToast state={state} />
      <button
        aria-label={triggerAriaLabel}
        className={triggerClassName}
        onClick={() => setOpen(true)}
        type="button"
      >
        {triggerLabel}
      </button>
      <AppModal
        description="Hãy kiểm tra kỹ trước khi tiếp tục."
        eyebrow="XÁC NHẬN"
        onClose={() => setOpen(false)}
        open={open}
        size="small"
        title={title}
      >
        <form action={formAction} className="confirm-action-form">
          {Object.entries(fields).map(([name, value]) => (
            value === null || value === undefined ? null : (
              <input key={name} name={name} type="hidden" value={String(value)} />
            )
          ))}
          <div className="confirm-action-copy">
            <span aria-hidden="true"><AppIcon name="warningTriangle" size={15} /></span>
            <p>{description}</p>
          </div>
          {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setOpen(false)} type="button">
              Hủy
            </button>
            <button className="danger-button" disabled={pending} type="submit">
              {pending ? "Đang xử lý…" : confirmLabel}
            </button>
          </div>
        </form>
      </AppModal>
    </>
  );
}
