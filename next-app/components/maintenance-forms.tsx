"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createMaintenanceLog,
  createMaintenancePlan,
  type MaintenanceFormState,
} from "@/app/(protected)/maintenance/actions";
import { ActionStateToast } from "@/components/action-toast";
import { ModalTrigger } from "@/components/app-modal";

type AssetOption = {
  id: string;
  asset_code: string;
  asset_name: string;
  asset_group: string;
  asset_group_label: string;
  asset_type: string;
  department_legacy_name: string;
  departments: { name: string } | { name: string }[] | null;
};

type PlanOption = {
  id: string;
  asset_id: string;
  title: string;
};

type SettingOption = {
  value: string;
  label: string;
};

const initialState: MaintenanceFormState = {};
const ungroupedValue = "__UNGROUPED__";
const untypedValue = "__UNTYPED__";
const unassignedDepartmentValue = "__UNASSIGNED_DEPARTMENT__";

function searchable(value: string) {
  return value.trim().toLocaleLowerCase("vi");
}

function departmentName(asset: AssetOption) {
  const department = Array.isArray(asset.departments)
    ? asset.departments[0]
    : asset.departments;
  return department?.name || asset.department_legacy_name || "";
}

export function MaintenanceForms({
  assets,
  plans,
  today,
  actionTypes = [],
  assetGroups = [],
  assetTypes = [],
}: {
  assets: AssetOption[];
  plans: PlanOption[];
  today: string;
  actionTypes?: SettingOption[];
  assetGroups?: SettingOption[];
  assetTypes?: SettingOption[];
}) {
  const [planState, planAction, planPending] = useActionState(
    createMaintenancePlan,
    initialState,
  );
  const [logState, logAction, logPending] = useActionState(
    createMaintenanceLog,
    initialState,
  );
  const [scopeType, setScopeType] = useState<"ASSET" | "GROUP" | "TYPE">("ASSET");
  const [selectedAsset, setSelectedAsset] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [logAsset, setLogAsset] = useState("");
  const [logGroup, setLogGroup] = useState("");
  const [logType, setLogType] = useState("");
  const [logDepartment, setLogDepartment] = useState("");
  const [logSearch, setLogSearch] = useState("");

  const logGroupOptions = useMemo(() => {
    const labels = new Map<string, string>();
    assets.forEach((asset) => {
      const value = asset.asset_group || ungroupedValue;
      labels.set(
        value,
        asset.asset_group_label || asset.asset_group || "Chưa có nhóm",
      );
    });
    return [...labels.entries()].sort((left, right) =>
      left[1].localeCompare(right[1], "vi"),
    );
  }, [assets]);

  const logTypeOptions = useMemo(() => {
    const values = new Set(assets.map((asset) => asset.asset_type || untypedValue));
    return [...values].sort((left, right) =>
      (left === untypedValue ? "Chưa có loại" : left).localeCompare(
        right === untypedValue ? "Chưa có loại" : right,
        "vi",
      ),
    );
  }, [assets]);

  const logDepartmentOptions = useMemo(() => {
    const values = new Set(
      assets.map((asset) => departmentName(asset) || unassignedDepartmentValue),
    );
    return [...values].sort((left, right) =>
      (left === unassignedDepartmentValue ? "Chưa phân phòng" : left).localeCompare(
        right === unassignedDepartmentValue ? "Chưa phân phòng" : right,
        "vi",
      ),
    );
  }, [assets]);

  const filteredLogAssets = useMemo(() => {
    const keyword = searchable(logSearch);
    return assets.filter((asset) => {
      if (logGroup && (asset.asset_group || ungroupedValue) !== logGroup) return false;
      if (logType && (asset.asset_type || untypedValue) !== logType) return false;
      if (
        logDepartment
        && (departmentName(asset) || unassignedDepartmentValue) !== logDepartment
      ) return false;
      if (!keyword) return true;
      return searchable(`${asset.asset_code} ${asset.asset_name}`).includes(keyword);
    });
  }, [assets, logDepartment, logGroup, logSearch, logType]);

  const targetCount = useMemo(() => {
    if (scopeType === "ASSET") return selectedAsset ? 1 : 0;
    if (scopeType === "GROUP") {
      return selectedGroup
        ? assets.filter((asset) => asset.asset_group === selectedGroup).length
        : 0;
    }
    return selectedType
      ? assets.filter((asset) => asset.asset_type === selectedType).length
      : 0;
  }, [assets, scopeType, selectedAsset, selectedGroup, selectedType]);

  const availablePlans = logAsset
    ? plans.filter((plan) => plan.asset_id === logAsset)
    : [];

  return (
    <div className="module-action-bar">
      <ActionStateToast state={planState} />
      <ActionStateToast state={logState} />
      <ModalTrigger
        description="Tạo lịch cho một thiết bị, nhóm thiết bị hoặc toàn bộ loại thiết bị."
        eyebrow="KẾ HOẠCH"
        size="medium"
        title="Thêm lịch định kỳ"
        triggerLabel="+ Lịch định kỳ"
      >
      <form action={planAction} className="panel data-form compact-form">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">KẾ HOẠCH</p>
            <h2>Thêm lịch định kỳ</h2>
          </div>
        </div>
        <label>
          Áp dụng cho *
          <select
            name="scope_type"
            onChange={(event) => setScopeType(event.target.value as "ASSET" | "GROUP" | "TYPE")}
            value={scopeType}
          >
            <option value="ASSET">Một thiết bị</option>
            <option value="GROUP">Nhóm thiết bị</option>
            <option value="TYPE">Loại thiết bị</option>
          </select>
        </label>
        {scopeType === "ASSET" ? (
          <label>
            Thiết bị *
            <select
              name="asset_id"
              onChange={(event) => setSelectedAsset(event.target.value)}
              required
              value={selectedAsset}
            >
              <option value="">Chọn thiết bị</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.asset_code} — {asset.asset_name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {scopeType === "GROUP" ? (
          <label>
            Nhóm thiết bị *
            <select
              name="asset_group"
              onChange={(event) => setSelectedGroup(event.target.value)}
              required
              value={selectedGroup}
            >
              <option value="">Chọn nhóm thiết bị</option>
              {assetGroups.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
        ) : null}
        {scopeType === "TYPE" ? (
          <label>
            Loại thiết bị *
            <select
              name="asset_type"
              onChange={(event) => setSelectedType(event.target.value)}
              required
              value={selectedType}
            >
              <option value="">Chọn loại thiết bị</option>
              {assetTypes.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
        ) : null}
        <p className={`maintenance-target-count ${targetCount ? "is-ready" : ""}`}>
          {targetCount
            ? `Kế hoạch sẽ được tạo cho ${targetCount} thiết bị hiện có.`
            : "Chọn phạm vi để xem số thiết bị sẽ áp dụng."}
        </p>
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
        <div className="maintenance-plan-options">
          <label>
            Trạng thái
            <select defaultValue="true" name="active">
              <option value="true">Đang áp dụng</option>
              <option value="false">Tạm dừng</option>
            </select>
          </label>
          <label className="maintenance-repeat-toggle">
            <input name="repeat_enabled" type="hidden" value="false" />
            <input defaultChecked name="repeat_enabled" type="checkbox" value="true" />
            <span>
              <strong>Lặp lại định kỳ</strong>
              <small>Tự chuyển sang kỳ tiếp theo khi ghi nhận hoàn thành.</small>
            </span>
          </label>
        </div>
        <ActionMessage state={planState} />
        <button
          className="primary-button"
          disabled={planPending || !targetCount}
          type="submit"
        >
          {planPending ? "Đang lưu…" : "Tạo kế hoạch"}
        </button>
      </form>
      </ModalTrigger>

      <ModalTrigger
        description="Ghi nhận nội dung, chi phí, đơn vị thực hiện và thời gian bảo hành bổ sung."
        eyebrow="NHẬT KÝ"
        size="medium"
        title="Ghi nhận bảo trì"
        triggerClassName="secondary-button"
        triggerLabel="+ Nhật ký bảo trì"
      >
      <form action={logAction} className="panel data-form compact-form">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">NHẬT KÝ</p>
            <h2>Ghi nhận bảo trì</h2>
          </div>
        </div>
        <div className="maintenance-asset-picker">
          <div className="maintenance-asset-filters">
            <label>
              Tìm thiết bị
              <input
                onChange={(event) => {
                  setLogSearch(event.target.value);
                  setLogAsset("");
                }}
                placeholder="Mã hoặc tên thiết bị…"
                type="search"
                value={logSearch}
              />
            </label>
            <label>
              Phòng ban
              <select
                onChange={(event) => {
                  setLogDepartment(event.target.value);
                  setLogAsset("");
                }}
                value={logDepartment}
              >
                <option value="">Tất cả phòng ban</option>
                {logDepartmentOptions.map((value) => (
                  <option key={value} value={value}>
                    {value === unassignedDepartmentValue ? "Chưa phân phòng" : value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nhóm thiết bị
              <select
                onChange={(event) => {
                  setLogGroup(event.target.value);
                  setLogAsset("");
                }}
                value={logGroup}
              >
                <option value="">Tất cả nhóm</option>
                {logGroupOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              Loại thiết bị
              <select
                onChange={(event) => {
                  setLogType(event.target.value);
                  setLogAsset("");
                }}
                value={logType}
              >
                <option value="">Tất cả loại</option>
                {logTypeOptions.map((value) => (
                  <option key={value} value={value}>
                    {value === untypedValue ? "Chưa có loại" : value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="maintenance-asset-select">
            Thiết bị *
            <select
              disabled={!filteredLogAssets.length}
              name="asset_id"
              onChange={(event) => setLogAsset(event.target.value)}
              required
              value={logAsset}
            >
              <option value="">
                {filteredLogAssets.length ? "Chọn thiết bị" : "Không có thiết bị phù hợp"}
              </option>
              {filteredLogAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.asset_code} — {asset.asset_name}
                </option>
              ))}
            </select>
          </label>
          <p className="maintenance-asset-filter-count" aria-live="polite">
            Hiển thị <strong>{filteredLogAssets.length}</strong> / {assets.length} thiết bị.
          </p>
        </div>
        <label>
          Kế hoạch liên quan
          <select name="plan_id">
            <option value="">Không gắn kế hoạch</option>
            {availablePlans.map((plan) => (
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
            {actionTypes.length ? (
              <select name="action_type">
                <option value="">Chọn hình thức</option>
                {actionTypes.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            ) : (
              <input maxLength={120} name="action_type" placeholder="Kiểm tra / sửa chữa" />
            )}
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
        <label className="upload-drop maintenance-log-upload">
          <span aria-hidden="true">＋</span>
          <strong>Thêm hình ảnh bảo trì</strong>
          <small>JPEG, PNG hoặc WebP · tổng tối đa 5 MB/lần · chọn tối đa 5 ảnh</small>
          <input
            accept="image/jpeg,image/png,image/webp"
            multiple
            name="files"
            type="file"
          />
        </label>
        <ActionMessage state={logState} />
        <button className="primary-button" disabled={logPending || !assets.length} type="submit">
          {logPending ? "Đang lưu…" : "Lưu nhật ký"}
        </button>
      </form>
      </ModalTrigger>
    </div>
  );
}

function ActionMessage({ state }: { state: MaintenanceFormState }) {
  if (state.error) return <p className="form-error" role="alert">{state.error}</p>;
  return null;
}
