"use client";

import { useActionState } from "react";
import {
  recordMovement,
  type MovementFormState,
} from "@/app/(protected)/movements/actions";

type AssetOption = {
  id: string;
  asset_code: string;
  asset_name: string;
  assigned_to_name: string;
  location: string;
};

const initialState: MovementFormState = {};

export function MovementForm({
  assets,
  today,
}: {
  assets: AssetOption[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(recordMovement, initialState);

  return (
    <form action={formAction} className="panel data-form module-single-form">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">PHIẾU LUÂN CHUYỂN</p>
          <h2>Ghi nhận bàn giao</h2>
        </div>
        <small>Thông tin hiện tại được lấy trực tiếp từ hồ sơ thiết bị</small>
      </div>
      <div className="form-grid">
        <label className="span-2">
          Thiết bị *
          <select name="asset_id" required>
            <option value="">Chọn thiết bị</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.asset_code} — {asset.asset_name}
                {asset.location ? ` · ${asset.location}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ngày luân chuyển *
          <input defaultValue={today} name="movement_date" required type="date" />
        </label>
        <label>
          Người nhận mới
          <input maxLength={200} name="to_user_name" />
        </label>
        <label className="span-2">
          Vị trí mới
          <input maxLength={200} name="to_location" />
        </label>
        <label className="span-2">
          Lý do
          <input maxLength={1000} name="reason" />
        </label>
        <label>
          Người phê duyệt
          <input maxLength={200} name="approved_by_name" />
        </label>
        <label className="span-3">
          Ghi chú
          <textarea maxLength={3000} name="note" rows={3} />
        </label>
      </div>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-success" role="status">{state.success}</p> : null}
      <div className="form-actions">
        <button className="primary-button" disabled={pending || !assets.length} type="submit">
          {pending ? "Đang ghi nhận…" : "Xác nhận luân chuyển"}
        </button>
      </div>
    </form>
  );
}
