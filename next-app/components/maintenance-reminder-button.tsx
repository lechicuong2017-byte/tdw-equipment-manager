"use client";

import { useActionState } from "react";
import {
  sendMaintenanceReminders,
  type ReminderFormState,
} from "@/app/(protected)/maintenance/actions";

const initialState: ReminderFormState = {};

export function MaintenanceReminderButton() {
  const [state, formAction, pending] = useActionState(
    sendMaintenanceReminders,
    initialState,
  );

  return (
    <form action={formAction} className="header-action-stack">
      <button className="secondary-button" disabled={pending} type="submit">
        {pending ? "Đang kiểm tra…" : "Gửi nhắc bảo trì"}
      </button>
      {state.error ? (
        <small className="action-message action-error" role="alert">{state.error}</small>
      ) : null}
      {state.success ? (
        <small className="action-message action-success" role="status">{state.success}</small>
      ) : null}
    </form>
  );
}
