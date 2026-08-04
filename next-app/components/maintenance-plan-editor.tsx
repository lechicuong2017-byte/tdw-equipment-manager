"use client";

import { useActionState, useState } from "react";
import {
  updateMaintenancePlan,
  type MaintenanceFormState,
} from "@/app/(protected)/maintenance/actions";
import { AppModal } from "@/components/app-modal";

type EditablePlan = {
  id: string;
  title: string;
  frequency: string;
  next_due_date: string;
  note: string;
  active: boolean;
  repeat_enabled: boolean;
};

const initialState: MaintenanceFormState = {};

export function MaintenancePlanEditor({
  plan,
  batchSize,
  scopeLabel,
}: {
  plan: EditablePlan;
  batchSize: number;
  scopeLabel: string;
}) {
  const [state, action, pending] = useActionState(
    updateMaintenancePlan,
    initialState,
  );
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="text-button" onClick={() => setOpen(true)} type="button">Sửa</button>
      <AppModal
        description={scopeLabel}
        eyebrow="KẾ HOẠCH"
        onClose={() => setOpen(false)}
        open={open}
        size="medium"
        title="Sửa kế hoạch bảo trì"
      >
          <form action={action} className="data-form compact-form">
            <input name="id" type="hidden" value={plan.id} />
            <label>
              Tên kế hoạch
              <input defaultValue={plan.title} maxLength={200} name="title" required />
            </label>
            <div className="inline-fields">
              <label>
                Chu kỳ
                <select defaultValue={plan.frequency} name="frequency">
                  <option value="MONTHLY">Hàng tháng</option>
                  <option value="QUARTERLY">Hàng quý</option>
                  <option value="YEARLY">Hàng năm</option>
                </select>
              </label>
              <label>
                Hạn tiếp theo
                <input defaultValue={plan.next_due_date} name="next_due_date" required type="date" />
              </label>
            </div>
            <label>
              Ghi chú
              <textarea defaultValue={plan.note} maxLength={3000} name="note" rows={2} />
            </label>
            <label>
              Trạng thái
              <select defaultValue={String(plan.active)} name="active">
                <option value="true">Đang áp dụng</option>
                <option value="false">Tạm dừng</option>
              </select>
            </label>
            <label className="maintenance-repeat-toggle">
              <input name="repeat_enabled" type="hidden" value="false" />
              <input
                defaultChecked={plan.repeat_enabled}
                name="repeat_enabled"
                type="checkbox"
                value="true"
              />
              <span>
                <strong>Lặp lại định kỳ</strong>
                <small>Tự chuyển hạn khi ghi nhận bảo trì.</small>
              </span>
            </label>
            <input name="apply_to_batch" type="hidden" value="false" />
            {batchSize > 1 ? (
              <label className="maintenance-repeat-toggle maintenance-batch-toggle">
                <input name="apply_to_batch" type="checkbox" value="true" />
                <span>
                  <strong>Áp dụng cho cả đợt</strong>
                  <small>Cập nhật đồng thời {batchSize} thiết bị.</small>
                </span>
              </label>
            ) : null}
            {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
            {state.success ? <p className="form-success" role="status">{state.success}</p> : null}
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
