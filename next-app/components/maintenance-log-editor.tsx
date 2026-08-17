"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateMaintenanceLog,
  type MaintenanceFormState,
} from "@/app/(protected)/maintenance/actions";
import { ActionStateToast } from "@/components/action-toast";
import { AppModal } from "@/components/app-modal";

type EditableMaintenanceLog = {
  id: string;
  asset_id: string;
  maintenance_date: string;
  action_type: string;
  description: string;
  cost: number | string;
  vendor: string;
  warranty_months: number;
  performed_by: string;
  note: string;
  plan_id: string | null;
};

type Option = { label: string; value: string };
type PlanOption = { asset_id: string; id: string; title: string };

const initialState: MaintenanceFormState = {};

export function MaintenanceLogEditor({
  actionTypes,
  assetLabel,
  log,
  plans,
  triggerClassName = "text-button",
}: {
  actionTypes: Option[];
  assetLabel: string;
  log: EditableMaintenanceLog;
  plans: PlanOption[];
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    updateMaintenanceLog,
    initialState,
  );
  const [open, setOpen] = useState(false);
  const matchingPlans = plans.filter((plan) => plan.asset_id === log.asset_id);
  const hasCurrentActionType = actionTypes.some(
    (item) => item.value === log.action_type,
  );

  useEffect(() => {
    if (!state.success) return;
    setOpen(false);
    router.refresh();
  }, [router, state.success]);

  return (
    <>
      <ActionStateToast state={state} />
      <button className={triggerClassName} onClick={() => setOpen(true)} type="button">
        Sửa
      </button>
      <AppModal
        description={`${assetLabel} · Thiết bị được giữ nguyên để bảo toàn ảnh và lịch sử.`}
        eyebrow="NHẬT KÝ"
        onClose={() => setOpen(false)}
        open={open}
        size="medium"
        title="Sửa ghi nhận bảo trì"
      >
        <form action={action} className="data-form compact-form">
          <input name="id" type="hidden" value={log.id} />
          <input name="asset_id" type="hidden" value={log.asset_id} />
          <div className="inline-fields">
            <label>
              Ngày bảo trì *
              <input defaultValue={log.maintenance_date} name="maintenance_date" required type="date" />
            </label>
            <label>
              Hình thức
              {actionTypes.length ? (
                <select defaultValue={log.action_type} name="action_type">
                  <option value="">Chọn hình thức</option>
                  {log.action_type && !hasCurrentActionType ? (
                    <option value={log.action_type}>{log.action_type} (đang dùng)</option>
                  ) : null}
                  {actionTypes.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              ) : (
                <input defaultValue={log.action_type} maxLength={120} name="action_type" />
              )}
            </label>
          </div>
          <label>
            Kế hoạch liên quan
            <select defaultValue={log.plan_id ?? ""} name="plan_id">
              <option value="">Không gắn kế hoạch</option>
              {matchingPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.title}</option>
              ))}
            </select>
          </label>
          <label>
            Nội dung thực hiện *
            <textarea defaultValue={log.description} maxLength={3000} name="description" required rows={4} />
          </label>
          <div className="inline-fields">
            <label>
              Chi phí
              <input defaultValue={log.cost} min={0} name="cost" step={1000} type="number" />
            </label>
            <label>
              Bảo hành thêm (tháng)
              <input defaultValue={log.warranty_months} max={600} min={0} name="warranty_months" type="number" />
            </label>
          </div>
          <div className="inline-fields">
            <label>
              Đơn vị thực hiện
              <input defaultValue={log.vendor} maxLength={200} name="vendor" />
            </label>
            <label>
              Người thực hiện
              <input defaultValue={log.performed_by} maxLength={200} name="performed_by" />
            </label>
          </div>
          <label>
            Ghi chú
            <textarea defaultValue={log.note} maxLength={3000} name="note" rows={3} />
          </label>
          {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setOpen(false)} type="button">Hủy</button>
            <button className="primary-button" disabled={pending} type="submit">
              {pending ? "Đang lưu…" : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </AppModal>
    </>
  );
}
