"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createMaintenanceLog,
  createMaintenancePlan,
  type MaintenanceFormState,
} from "@/app/(protected)/maintenance/actions";
import { ActionStateToast } from "@/components/action-toast";
import { ModalTrigger } from "@/components/app-modal";
import { ImageFilePicker } from "@/components/image-file-picker";

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
  batch_id: string;
  asset_id: string;
  asset_group: string;
  asset_group_label: string;
  title: string;
  frequency: "MONTHLY" | "QUARTERLY" | "YEARLY";
  scope_type: "ASSET" | "GROUP" | "TYPE";
  scope_value: string;
  next_due_date: string;
};

type PlanBatchOption = {
  key: string;
  batch_id: string | null;
  title: string;
  frequency: PlanOption["frequency"];
  scope_type: PlanOption["scope_type"];
  scope_value: string;
  next_due_date: string;
  assetIds: string[];
  planIds: string[];
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
  const [logPlanBatch, setLogPlanBatch] = useState("");
  const [logAssetIds, setLogAssetIds] = useState<Set<string>>(() => new Set());

  const planBatches = useMemo(() => {
    const plansByBatch = new Map<string, PlanOption[]>();
    plans.forEach((plan) => {
      const current = plansByBatch.get(plan.batch_id) ?? [];
      current.push(plan);
      plansByBatch.set(plan.batch_id, current);
    });

    const grouped: PlanBatchOption[] = [];
    const legacyPlans: PlanOption[] = [];
    plansByBatch.forEach((batchPlans, batchId) => {
      const first = batchPlans[0];
      if (!first) return;
      if (batchPlans.length === 1 && first.scope_type === "ASSET") {
        legacyPlans.push(first);
        return;
      }
      grouped.push({
        key: `batch:${batchId}`,
        batch_id: batchId,
        title: first.title,
        frequency: first.frequency,
        scope_type: first.scope_type,
        scope_value: first.scope_value,
        next_due_date: first.next_due_date,
        assetIds: batchPlans.map((plan) => plan.asset_id),
        planIds: batchPlans.map((plan) => plan.id),
      });
    });

    const legacyGroups = new Map<string, PlanOption[]>();
    legacyPlans.forEach((plan) => {
      const signature = [
        plan.title,
        plan.frequency,
        plan.next_due_date,
        plan.asset_group || ungroupedValue,
      ].join("\u0000");
      const current = legacyGroups.get(signature) ?? [];
      current.push(plan);
      legacyGroups.set(signature, current);
    });
    legacyGroups.forEach((matchingPlans) => {
      const first = matchingPlans[0];
      if (!first) return;
      const isLegacyGroup = matchingPlans.length > 1;
      grouped.push({
        key: isLegacyGroup
          ? `legacy:${matchingPlans.map((plan) => plan.id).sort().join(",")}`
          : `batch:${first.batch_id}`,
        batch_id: isLegacyGroup ? null : first.batch_id,
        title: first.title,
        frequency: first.frequency,
        scope_type: isLegacyGroup ? "GROUP" : first.scope_type,
        scope_value: isLegacyGroup ? first.asset_group : first.scope_value,
        next_due_date: first.next_due_date,
        assetIds: matchingPlans.map((plan) => plan.asset_id),
        planIds: matchingPlans.map((plan) => plan.id),
      });
    });

    return grouped.sort((left, right) =>
      left.next_due_date.localeCompare(right.next_due_date)
      || left.title.localeCompare(right.title, "vi"),
    );
  }, [plans]);

  const selectedPlanBatch = useMemo(
    () => planBatches.find((plan) => plan.key === logPlanBatch),
    [logPlanBatch, planBatches],
  );

  const selectedPlanAssetIds = useMemo(
    () => new Set(selectedPlanBatch?.assetIds ?? []),
    [selectedPlanBatch],
  );

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
      if (logPlanBatch && !selectedPlanAssetIds.has(asset.id)) return false;
      if (logGroup && (asset.asset_group || ungroupedValue) !== logGroup) return false;
      if (logType && (asset.asset_type || untypedValue) !== logType) return false;
      if (
        logDepartment
        && (departmentName(asset) || unassignedDepartmentValue) !== logDepartment
      ) return false;
      if (!keyword) return true;
      return searchable(`${asset.asset_code} ${asset.asset_name}`).includes(keyword);
    });
  }, [
    assets,
    logDepartment,
    logGroup,
    logPlanBatch,
    logSearch,
    logType,
    selectedPlanAssetIds,
  ]);

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

  const selectedLogAssetCount = logPlanBatch ? logAssetIds.size : (logAsset ? 1 : 0);
  const allVisibleLogAssetsSelected = Boolean(
    filteredLogAssets.length
    && filteredLogAssets.every((asset) => logAssetIds.has(asset.id)),
  );

  function selectLogPlanBatch(batchId: string) {
    setLogPlanBatch(batchId);
    setLogAsset("");
    setLogSearch("");
    setLogDepartment("");
    setLogGroup("");
    setLogType("");
    const batch = planBatches.find((plan) => plan.key === batchId);
    setLogAssetIds(new Set(batch?.assetIds ?? []));
  }

  function setLogAssetSelected(assetId: string, selected: boolean) {
    setLogAssetIds((current) => {
      const next = new Set(current);
      if (selected) next.add(assetId);
      else next.delete(assetId);
      return next;
    });
  }

  function toggleVisibleLogAssets() {
    setLogAssetIds((current) => {
      const next = new Set(current);
      filteredLogAssets.forEach((asset) => {
        if (allVisibleLogAssetsSelected) next.delete(asset.id);
        else next.add(asset.id);
      });
      return next;
    });
  }

  function maintenanceScopeLabel(plan: PlanBatchOption) {
    if (plan.scope_type === "GROUP") {
      return assetGroups.find((item) => item.value === plan.scope_value)?.label
        ?? (plan.scope_value || "Chưa có nhóm");
    }
    if (plan.scope_type === "TYPE") {
      return assetTypes.find((item) => item.value === plan.scope_value)?.label
        ?? plan.scope_value;
    }
    return "Một thiết bị";
  }

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
        <label>
          Kế hoạch liên quan
          <select
            onChange={(event) => selectLogPlanBatch(event.target.value)}
            value={logPlanBatch}
          >
            <option value="">Không gắn kế hoạch · chọn một thiết bị</option>
            {planBatches.map((plan) => (
              <option key={plan.key} value={plan.key}>
                {plan.title} · {maintenanceScopeLabel(plan)} · {plan.assetIds.length} thiết bị · hạn {plan.next_due_date}
              </option>
            ))}
          </select>
        </label>
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
          {logPlanBatch ? (
            <div className="maintenance-bulk-assets">
              {selectedPlanBatch?.batch_id ? (
                <input name="plan_batch_id" type="hidden" value={selectedPlanBatch.batch_id} />
              ) : null}
              {selectedPlanBatch?.planIds.map((planId) => (
                <input key={planId} name="plan_ids" type="hidden" value={planId} />
              ))}
              {[...logAssetIds].map((assetId) => (
                <input key={assetId} name="asset_ids" type="hidden" value={assetId} />
              ))}
              <div className="software-asset-selection-summary">
                <button
                  className="software-select-all-button"
                  disabled={!filteredLogAssets.length}
                  onClick={toggleVisibleLogAssets}
                  type="button"
                >
                  {allVisibleLogAssetsSelected
                    ? "Bỏ chọn danh sách đang lọc"
                    : "Chọn tất cả đang lọc"}
                </button>
                <div aria-live="polite" className="software-selection-count">
                  <strong>{logAssetIds.size}</strong>
                  <span>thiết bị đã chọn</span>
                  <small>{selectedPlanAssetIds.size} thiết bị trong kế hoạch</small>
                </div>
              </div>
              <div className="software-asset-checklist maintenance-asset-checklist">
                {filteredLogAssets.map((asset) => (
                  <label className="software-asset-option" key={asset.id}>
                    <input
                      checked={logAssetIds.has(asset.id)}
                      className="software-asset-checkbox"
                      onChange={(event) => setLogAssetSelected(asset.id, event.target.checked)}
                      type="checkbox"
                      value={asset.id}
                    />
                    <span aria-hidden="true" className="software-asset-checkmark">✓</span>
                    <span className="software-asset-copy">
                      <strong>{asset.asset_name}</strong>
                      <small className="software-asset-code">{asset.asset_code}</small>
                      <small className="software-asset-meta">
                        {asset.asset_group_label || asset.asset_group || "Chưa có nhóm"}
                        <i aria-hidden="true" />
                        {asset.asset_type || "Chưa có loại"}
                        <i aria-hidden="true" />
                        {departmentName(asset) || "Chưa phân phòng"}
                      </small>
                    </span>
                  </label>
                ))}
                {!filteredLogAssets.length ? (
                  <p className="empty-state">Không có thiết bị phù hợp với bộ lọc.</p>
                ) : null}
              </div>
              <p className="form-help">
                Mặc định chọn toàn bộ thiết bị trong kế hoạch; có thể bỏ tick thiết bị chưa thực hiện.
              </p>
            </div>
          ) : (
            <label className="maintenance-asset-select">
              Thiết bị *
              <select
                disabled={!filteredLogAssets.length}
                name="asset_ids"
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
          )}
          <p className="maintenance-asset-filter-count" aria-live="polite">
            Hiển thị <strong>{filteredLogAssets.length}</strong> / {logPlanBatch ? selectedPlanAssetIds.size : assets.length} thiết bị.
          </p>
        </div>
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
            {selectedLogAssetCount > 1 ? "Chi phí mỗi thiết bị" : "Chi phí"}
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
        {selectedLogAssetCount > 1 ? (
          <p className="maintenance-bulk-media-note">
            Ảnh không áp dụng cho ghi nhận nhiều thiết bị để tránh tạo bản sao ngoài ý muốn.
            Nếu cần ảnh, hãy ghi riêng cho từng thiết bị.
          </p>
        ) : (
          <ImageFilePicker
            dropClassName="maintenance-log-upload"
            help="JPEG, PNG hoặc WebP · tổng tối đa 5 MB/lần · chọn tối đa 5 ảnh"
            inputName="files"
            label="Thêm hình ảnh bảo trì"
            maxFiles={5}
            multiple
            tone="maintenance"
          />
        )}
        <ActionMessage state={logState} />
        <button
          className="primary-button"
          disabled={logPending || !selectedLogAssetCount}
          type="submit"
        >
          {logPending
            ? "Đang lưu…"
            : selectedLogAssetCount > 1
              ? `Ghi nhận ${selectedLogAssetCount} thiết bị`
              : "Lưu nhật ký"}
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
