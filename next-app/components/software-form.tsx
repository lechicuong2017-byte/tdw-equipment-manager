"use client";

import { useActionState } from "react";
import {
  createSoftwareLicense,
  type SoftwareFormState,
} from "@/app/(protected)/software/actions";
import { ActionStateToast } from "@/components/action-toast";

type AssetOption = {
  id: string;
  asset_code: string;
  asset_name: string;
};

const initialState: SoftwareFormState = {};

export function SoftwareForm({
  assets,
  softwareNames = [],
}: {
  assets: AssetOption[];
  softwareNames?: string[];
}) {
  const [state, formAction, pending] = useActionState(
    createSoftwareLicense,
    initialState,
  );

  return (
    <form action={formAction} className="panel data-form module-single-form">
      <ActionStateToast state={state} />
      <div className="panel-heading">
        <div>
          <p className="eyebrow">BẢN QUYỀN MỚI</p>
          <h2>Thêm phần mềm</h2>
        </div>
        <small>Admin thêm key mã hóa sau khi tạo bản quyền</small>
      </div>
      <div className="form-grid">
        <label className="span-2">
          Tên phần mềm *
          <input list="software-name-options" maxLength={200} name="software_name" required />
          <datalist id="software-name-options">
            {softwareNames.map((name) => <option key={name} value={name} />)}
          </datalist>
        </label>
        <label>
          Phiên bản
          <input maxLength={120} name="version" />
        </label>
        <label>
          Trạng thái
          <select defaultValue="ACTIVE" name="status">
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="EXPIRING">Sắp hết hạn</option>
            <option value="EXPIRED">Đã hết hạn</option>
            <option value="SUSPENDED">Tạm dừng</option>
            <option value="">Chưa xác định</option>
          </select>
        </label>
        <label>
          Ngày hết hạn
          <input name="expiry_date" type="date" />
        </label>
        <label>
          Người được cấp
          <input maxLength={200} name="assigned_user_name" />
        </label>
        <label className="span-2">
          Thiết bị được cấp
          <select name="assigned_asset_id">
            <option value="">Không gắn thiết bị</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.asset_code} — {asset.asset_name}
              </option>
            ))}
          </select>
        </label>
        <label className="span-3">
          Ghi chú
          <textarea maxLength={3000} name="note" rows={3} />
        </label>
      </div>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <div className="form-actions">
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "Đang lưu…" : "Thêm bản quyền"}
        </button>
      </div>
    </form>
  );
}
