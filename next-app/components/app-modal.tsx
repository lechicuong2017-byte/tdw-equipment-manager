"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

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
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="app-modal-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`app-modal app-modal-${size}`}
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
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="app-modal-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

export function ModalTrigger({
  children,
  description,
  eyebrow,
  size,
  title,
  triggerClassName = "primary-button",
  triggerLabel,
}: Omit<AppModalProps, "onClose" | "open"> & {
  triggerClassName?: string;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
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
        {children}
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
  return (
    <AppModal
      description={description}
      eyebrow={eyebrow}
      onClose={() => router.push(closeHref)}
      open
      size={size}
      title={title}
    >
      {children}
    </AppModal>
  );
}

type ConfirmActionProps = {
  action: (formData: FormData) => void | Promise<void>;
  confirmLabel?: string;
  description: string;
  fields: Record<string, string | number | boolean | null | undefined>;
  title?: string;
  triggerAriaLabel?: string;
  triggerClassName?: string;
  triggerLabel?: string;
};

export function ConfirmAction({
  action,
  confirmLabel = "Xác nhận xóa",
  description,
  fields,
  title = "Xóa dữ liệu?",
  triggerAriaLabel,
  triggerClassName = "text-button text-danger",
  triggerLabel = "Xóa",
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
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
        <form action={action} className="confirm-action-form">
          {Object.entries(fields).map(([name, value]) => (
            value === null || value === undefined ? null : (
              <input key={name} name={name} type="hidden" value={String(value)} />
            )
          ))}
          <div className="confirm-action-copy">
            <span aria-hidden="true">!</span>
            <p>{description}</p>
          </div>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setOpen(false)} type="button">
              Hủy
            </button>
            <button className="danger-button" type="submit">{confirmLabel}</button>
          </div>
        </form>
      </AppModal>
    </>
  );
}
