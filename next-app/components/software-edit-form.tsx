"use client";

import { useActionState } from "react";
import {
  updateSoftwareLicense,
  type SoftwareFormState,
} from "@/app/(protected)/software/actions";
import { ActionStateToast } from "@/components/action-toast";

type AssetOption = {
  id: string;
  asset_code: string;
  asset_name: string;
};

type EditableSoftwareLicense = {
  id: string;
  software_name: string;
  version: string;
  assigned_asset_id: string | null;
  assigned_user_name: string;
  expiry_date: string | null;
  status: string;
  note: string;
};

const initialState: SoftwareFormState = {};

export function SoftwareEditForm({
  assets,
  license,
  softwareNames = [],
}: {
  assets: AssetOption[];
  license: EditableSoftwareLicense;
  softwareNames?: string[];
}) {
  const [state, formAction, pending] = useActionState(
    updateSoftwareLicense,
    initialState,
  );

  return (
    <form action={formAction} className="panel data-form form-panel">
      <ActionStateToast state={state} />
      <input name="id" type="hidden" value={license.id} />
      <div className="panel-heading">
        <div>
          <p className="eyebrow">THÔNG TIN BẢN QUYỀN</p>
          <h2>{license.software_name}</h2>
        </div>
        <small>Thông tin phân bổ và thời hạn sử dụng</small>
      </div>

      <div className="form-grid">
        <label className="span-2">
          Tên phần mềm *
          <input
            defaultValue={license.software_name}
            list="software-edit-name-options"
            maxLength={200}
            name="software_name"
            required
          />
          <datalist id="software-edit-name-options">
            {softwareNames.map((name) => <option key={name} value={name} />)}
          </datalist>
        </label>
        <label>
          Phiên bản
          <input defaultValue={license.version} maxLength={120} name="version" />
        </label>
        <label>
          Trạng thái
          <select defaultValue={license.status} name="status">
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="EXPIRING">Sắp hết hạn</option>
            <option value="EXPIRED">Đã hết hạn</option>
            <option value="SUSPENDED">Tạm dừng</option>
            <option value="">Chưa xác định</option>
          </select>
        </label>
        <label>
          Ngày hết hạn
          <input defaultValue={license.expiry_date ?? ""} name="expiry_date" type="date" />
        </label>
        <label>
          Người được cấp
          <input
            defaultValue={license.assigned_user_name}
            maxLength={200}
            name="assigned_user_name"
          />
        </label>
        <label className="span-2">
          Thiết bị được cấp
          <select defaultValue={license.assigned_asset_id ?? ""} name="assigned_asset_id">
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
          <textarea defaultValue={license.note} maxLength={3000} name="note" rows={4} />
        </label>
      </div>

      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <div className="form-actions">
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "Đang cập nhật…" : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}
