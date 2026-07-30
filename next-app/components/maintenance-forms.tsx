"use client";

import { useActionState } from "react";
import {
  createMaintenanceLog,
  createMaintenancePlan,
  type MaintenanceFormState,
} from "@/app/(protected)/maintenance/actions";

type AssetOption = {
  id: string;
  asset_code: string;
  asset_name: string;
};

type PlanOption = {
  id: string;
  asset_id: string;
  title: string;
};

const initialState: MaintenanceFormState = {};

export function MaintenanceForms({
  assets,
  plans,
  today,
}: {
  assets: AssetOption[];
  plans: PlanOption[];
  today: string;
}) {
  const [planState, planAction, planPending] = useActionState(
    createMaintenancePlan,
    initialState,
  );
  const [logState, logAction, logPending] = useActionState(
    createMaintenanceLog,
    initialState,
  );

  return (
    <div className="module-form-grid">
      <form action={planAction} className="panel data-form compact-form">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">KẾ HOẠCH</p>
            <h2>Thêm lịch định kỳ</h2>
          </div>
        </div>
        <label>
          Thiết bị *
          <select name="asset_id" required>
            <option value="">Chọn thiết bị</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.asset_code} — {asset.asset_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tên kế hoạch *
          <input maxLength={200} name="title" placeholder="Ví dụ: Bảo dưỡng định kỳ" required />
        </label>
        <div className="inline-fields">
          <label>
            Chu kỳ
            <select defaultValue="QUARTERLY" name="frequency">
              <option value="MONTHLY">Hàng tháng</option>
              <option value="QUARTERLY">Hàng quý</option>
              <option value="YEARLY">Hàng năm</option>
            </select>
          </label>
          <label>
            Hạn tiếp theo *
            <input defaultValue={today} name="next_due_date" required type="date" />
          </label>
        </div>
        <label>
          Ghi chú
          <textarea maxLength={3000} name="note" rows={3} />
        </label>
        <ActionMessage state={planState} />
        <button className="primary-button" disabled={planPending || !assets.length} type="submit">
          {planPending ? "Đang lưu…" : "Tạo kế hoạch"}
        </button>
      </form>

      <form action={logAction} className="panel data-form compact-form">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">NHẬT KÝ</p>
            <h2>Ghi nhận bảo trì</h2>
          </div>
        </div>
        <label>
          Thiết bị *
          <select name="asset_id" required>
            <option value="">Chọn thiết bị</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.asset_code} — {asset.asset_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kế hoạch liên quan
          <select name="plan_id">
            <option value="">Không gắn kế hoạch</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>{plan.title}</option>
            ))}
          </select>
        </label>
        <div className="inline-fields">
          <label>
            Ngày bảo trì *
            <input defaultValue={today} name="maintenance_date" required type="date" />
          </label>
          <label>
            Hình thức
            <input maxLength={120} name="action_type" placeholder="Kiểm tra / sửa chữa" />
          </label>
        </div>
        <label>
          Nội dung thực hiện *
          <textarea maxLength={3000} name="description" required rows={3} />
        </label>
        <div className="inline-fields">
          <label>
            Chi phí
            <input defaultValue={0} min={0} name="cost" step={1000} type="number" />
          </label>
          <label>
            Bảo hành thêm (tháng)
            <input defaultValue={0} max={600} min={0} name="warranty_months" type="number" />
          </label>
        </div>
        <div className="inline-fields">
          <label>
            Đơn vị thực hiện
            <input maxLength={200} name="vendor" />
          </label>
          <label>
            Người thực hiện
            <input maxLength={200} name="performed_by" />
          </label>
        </div>
        <label>
          Ghi chú
          <textarea maxLength={3000} name="note" rows={2} />
        </label>
        <ActionMessage state={logState} />
        <button className="primary-button" disabled={logPending || !assets.length} type="submit">
          {logPending ? "Đang lưu…" : "Lưu nhật ký"}
        </button>
      </form>
    </div>
  );
}

function ActionMessage({ state }: { state: MaintenanceFormState }) {
  if (state.error) return <p className="form-error" role="alert">{state.error}</p>;
  if (state.success) return <p className="form-success" role="status">{state.success}</p>;
  return null;
}
