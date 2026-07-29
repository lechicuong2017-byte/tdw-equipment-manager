"use client";

import { useActionState } from "react";
import {
  saveAsset,
  type AssetFormState,
} from "@/app/(protected)/assets/actions";
import { statusLabels } from "@/lib/format";
import type { Asset, Department } from "@/lib/types";

const initialState: AssetFormState = {};

export function AssetForm({
  asset,
  departments,
}: {
  asset?: Asset;
  departments: Department[];
}) {
  const [state, formAction, pending] = useActionState(saveAsset, initialState);

  return (
    <form action={formAction} className="data-form">
      <input name="id" type="hidden" value={asset?.id ?? ""} />
      <div className="form-section-heading">
        <div>
          <p className="eyebrow">THÔNG TIN CHÍNH</p>
          <h2>Nhận diện thiết bị</h2>
        </div>
        <span>Các trường có dấu * là bắt buộc</span>
      </div>

      <div className="form-grid">
        <label>
          Mã thiết bị *
          <input defaultValue={asset?.asset_code} maxLength={80} name="asset_code" required />
        </label>
        <label className="span-2">
          Tên thiết bị *
          <input defaultValue={asset?.asset_name} maxLength={200} name="asset_name" required />
        </label>
        <label>
          Nhóm thiết bị
          <input defaultValue={asset?.asset_group} maxLength={120} name="asset_group" />
        </label>
        <label>
          Loại thiết bị
          <input defaultValue={asset?.asset_type} maxLength={120} name="asset_type" />
        </label>
        <label>
          Thương hiệu
          <input defaultValue={asset?.brand} maxLength={120} name="brand" />
        </label>
        <label>
          Model
          <input defaultValue={asset?.model} maxLength={120} name="model" />
        </label>
        <label>
          Số serial
          <input defaultValue={asset?.serial_number} maxLength={160} name="serial_number" />
        </label>
      </div>

      <div className="form-section-heading">
        <div>
          <p className="eyebrow">SỬ DỤNG & GIÁ TRỊ</p>
          <h2>Phân bổ tài sản</h2>
        </div>
      </div>

      <div className="form-grid">
        <label>
          Trạng thái
          <select defaultValue={asset?.status ?? "CON_SU_DUNG"} name="status">
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Phòng ban
          <select defaultValue={asset?.department_id ?? ""} name="department_id">
            <option value="">Chưa phân phòng</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
        </label>
        <label>
          Người đang sử dụng
          <input defaultValue={asset?.assigned_to_name} maxLength={200} name="assigned_to_name" />
        </label>
        <label className="span-2">
          Vị trí
          <input defaultValue={asset?.location} maxLength={200} name="location" />
        </label>
        <label>
          Chất lượng
          <input defaultValue={asset?.quality_level} maxLength={120} name="quality_level" />
        </label>
        <label>
          Số lượng
          <input defaultValue={asset?.quantity ?? 1} min={1} name="quantity" type="number" />
        </label>
        <label>
          Đơn giá
          <input defaultValue={asset?.unit_price ?? 0} min={0} name="unit_price" step="1000" type="number" />
        </label>
        <label>
          Năm mua
          <input defaultValue={asset?.purchase_year ?? ""} max={2100} min={1990} name="purchase_year" type="number" />
        </label>
        <label>
          Ngày mua
          <input defaultValue={asset?.purchase_date ?? ""} name="purchase_date" type="date" />
        </label>
        <label>
          Hết bảo hành
          <input defaultValue={asset?.warranty_end_date ?? ""} name="warranty_end_date" type="date" />
        </label>
        <label>
          Bảo trì gần nhất
          <input defaultValue={asset?.last_maintenance_date ?? ""} name="last_maintenance_date" type="date" />
        </label>
        <label>
          Ngày kiểm tra tiếp
          <input defaultValue={asset?.next_check_date ?? ""} name="next_check_date" type="date" />
        </label>
        <label className="span-3">
          Ghi chú
          <textarea defaultValue={asset?.note} maxLength={3000} name="note" rows={4} />
        </label>
      </div>

      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <div className="form-actions">
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "Đang lưu…" : asset ? "Lưu thay đổi" : "Tạo thiết bị"}
        </button>
      </div>
    </form>
  );
}
