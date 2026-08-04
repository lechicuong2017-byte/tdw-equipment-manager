"use client";

import { useActionState } from "react";
import {
  saveAsset,
  type AssetFormState,
} from "@/app/(protected)/assets/actions";
import { statusLabels } from "@/lib/format";
import type {
  Asset,
  AssetResponsible,
  Department,
  ResponsibleUser,
  Setting,
} from "@/lib/types";

const initialState: AssetFormState = {};

export function AssetForm({
  asset,
  defaultKind = "DEVICE",
  departments,
  responsibleUsers = [],
  responsibles = [],
  settings = [],
}: {
  asset?: Asset;
  defaultKind?: "DEVICE" | "COMPONENT";
  departments: Department[];
  responsibleUsers?: ResponsibleUser[];
  responsibles?: AssetResponsible[];
  settings?: Setting[];
}) {
  const [state, formAction, pending] = useActionState(saveAsset, initialState);
  const primaryUserId = responsibles.find(
    (item) => item.responsibility_role === "primary",
  )?.user_id;
  const secondaryUserIds = new Set(
    responsibles
      .filter((item) => item.responsibility_role === "secondary")
      .map((item) => item.user_id),
  );
  const settingOptions = (type: string, current = "") => {
    const matching = settings.filter(
      (item) => item.setting_type === type && (item.active || item.setting_value === current),
    );
    if (current && !matching.some((item) => item.setting_value === current)) {
      matching.push({
        id: `current-${type}`,
        setting_type: type,
        setting_value: current,
        display_name: current,
        sort_order: Number.MAX_SAFE_INTEGER,
        active: false,
      });
    }
    return matching;
  };
  const groupOptions = settingOptions("asset_group", asset?.asset_group);
  const typeOptions = settingOptions("asset_type", asset?.asset_type);
  const configuredStatuses = settingOptions("status", asset?.status);
  const statusOptions = configuredStatuses.length
    ? configuredStatuses
    : Object.entries(statusLabels).map(([value, label], index) => ({
        id: value,
        setting_type: "status",
        setting_value: value,
        display_name: label,
        sort_order: index,
        active: true,
      }));

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
          Phân loại *
          <select defaultValue={asset?.asset_kind ?? defaultKind} name="asset_kind">
            <option value="DEVICE">Thiết bị hoàn chỉnh</option>
            <option value="COMPONENT">Linh kiện bên trong</option>
          </select>
        </label>
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
          <select defaultValue={asset?.asset_group ?? ""} name="asset_group">
            <option value="">Chưa chọn nhóm</option>
            {groupOptions.map((item) => (
              <option key={item.id} value={item.setting_value}>{item.display_name}</option>
            ))}
          </select>
        </label>
        <label>
          Loại thiết bị
          <select defaultValue={asset?.asset_type ?? ""} name="asset_type">
            <option value="">Chưa chọn loại</option>
            {typeOptions.map((item) => (
              <option key={item.id} value={item.setting_value}>{item.display_name}</option>
            ))}
          </select>
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
            {statusOptions.map((item) => (
              <option key={item.id} value={item.setting_value}>{item.display_name}</option>
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
        <p className="form-help span-2">
          Linh kiện cần số lượng 1 và mã riêng để theo dõi chính xác lịch sử lắp, tháo và bảo hành.
        </p>
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

      {asset && responsibleUsers.length ? (
        <>
          <div className="form-section-heading">
            <div>
              <p className="eyebrow">NGƯỜI PHỤ TRÁCH</p>
              <h2>Người nhận email nhắc bảo trì</h2>
            </div>
            <span>Chỉ quản trị viên thay đổi danh sách này</span>
          </div>
          <input name="manage_responsibles" type="hidden" value="1" />
          <div className="form-grid">
            <label className="span-2">
              Người phụ trách chính
              <select defaultValue={primaryUserId ?? ""} name="primary_responsible_id">
                <option value="">Chưa gán</option>
                {responsibleUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.email} — {user.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Người phối hợp
              <select
                defaultValue={[...secondaryUserIds]}
                multiple
                name="secondary_responsible_ids"
                size={Math.min(5, Math.max(3, responsibleUsers.length))}
              >
                {responsibleUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.email}
                  </option>
                ))}
              </select>
            </label>
            <p className="form-help span-3">
              Email chỉ được gửi khi thiết bị có kế hoạch đến đúng mốc 7, 3, 1,
              0 ngày hoặc quá hạn theo chu kỳ 7 ngày.
            </p>
          </div>
        </>
      ) : null}

      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <div className="form-actions">
        <button className="primary-button" disabled={pending} type="submit">
          {pending
            ? "Đang lưu…"
            : asset
              ? "Lưu thay đổi"
              : defaultKind === "COMPONENT"
                ? "Tạo linh kiện"
                : "Tạo thiết bị"}
        </button>
      </div>
    </form>
  );
}
