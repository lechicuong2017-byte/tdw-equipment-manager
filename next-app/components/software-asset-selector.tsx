"use client";

import { useMemo, useState } from "react";

export type SoftwareAssetOption = {
  id: string;
  asset_code: string;
  asset_name: string;
  asset_group: string;
  asset_group_label: string;
  asset_type: string;
  department_legacy_name: string;
  departments: { name: string } | { name: string }[] | null;
};

const ungroupedValue = "__UNGROUPED__";
const untypedValue = "__UNTYPED__";
const unassignedDepartmentValue = "__UNASSIGNED_DEPARTMENT__";

function searchable(value: string) {
  return value.trim().toLocaleLowerCase("vi");
}

function departmentName(asset: SoftwareAssetOption) {
  const department = Array.isArray(asset.departments)
    ? asset.departments[0]
    : asset.departments;
  return department?.name || asset.department_legacy_name || "";
}

export function SoftwareAssetSelector({
  assets,
  initialSelectedIds = [],
}: {
  assets: SoftwareAssetOption[];
  initialSelectedIds?: string[];
}) {
  const [group, setGroup] = useState("");
  const [type, setType] = useState("");
  const [department, setDepartment] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(initialSelectedIds),
  );

  const groupOptions = useMemo(() => {
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

  const typeOptions = useMemo(() => {
    const values = new Set(
      assets.map((asset) => asset.asset_type || untypedValue),
    );
    return [...values].sort((left, right) =>
      (left === untypedValue ? "Chưa có loại" : left).localeCompare(
        right === untypedValue ? "Chưa có loại" : right,
        "vi",
      ),
    );
  }, [assets]);

  const departmentOptions = useMemo(() => {
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

  const visibleAssets = useMemo(() => {
    const keyword = searchable(search);
    return assets.filter((asset) => {
      if (group && (asset.asset_group || ungroupedValue) !== group) return false;
      if (type && (asset.asset_type || untypedValue) !== type) return false;
      if (
        department
        && (departmentName(asset) || unassignedDepartmentValue) !== department
      ) return false;
      if (!keyword) return true;
      return searchable(
        `${asset.asset_code} ${asset.asset_name} ${asset.asset_group_label} ${asset.asset_type} ${departmentName(asset)}`,
      ).includes(keyword);
    });
  }, [assets, department, group, search, type]);

  const selectedVisibleCount = visibleAssets.filter((asset) =>
    selectedIds.has(asset.id),
  ).length;
  const allVisibleSelected = Boolean(visibleAssets.length)
    && selectedVisibleCount === visibleAssets.length;

  function setAssetSelected(assetId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(assetId);
      else next.delete(assetId);
      return next;
    });
  }

  function toggleVisibleAssets() {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleAssets.forEach((asset) => {
        if (allVisibleSelected) next.delete(asset.id);
        else next.add(asset.id);
      });
      return next;
    });
  }

  return (
    <fieldset className="software-asset-selector span-3">
      <legend>Thiết bị được cấp</legend>
      {[...selectedIds].map((assetId) => (
        <input key={assetId} name="assigned_asset_ids" type="hidden" value={assetId} />
      ))}

      <div className="software-asset-filters">
        <label>
          Nhóm thiết bị
          <select value={group} onChange={(event) => setGroup(event.target.value)}>
            <option value="">Tất cả nhóm</option>
            {groupOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Loại thiết bị
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">Tất cả loại</option>
            {typeOptions.map((value) => (
              <option key={value} value={value}>
                {value === untypedValue ? "Chưa có loại" : value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Phòng ban
          <select
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <option value="">Tất cả phòng ban</option>
            {departmentOptions.map((value) => (
              <option key={value} value={value}>
                {value === unassignedDepartmentValue ? "Chưa phân phòng" : value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tìm thiết bị
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Mã hoặc tên thiết bị…"
            type="search"
            value={search}
          />
        </label>
      </div>

      <div className="software-asset-selection-summary">
        <button className="software-select-all-button" onClick={toggleVisibleAssets} type="button">
          {allVisibleSelected ? "Bỏ chọn danh sách đang lọc" : "Chọn tất cả đang lọc"}
        </button>
        <div aria-live="polite" className="software-selection-count">
          <strong>{selectedIds.size}</strong>
          <span>đã chọn</span>
          <small>{visibleAssets.length} đang hiển thị</small>
        </div>
      </div>

      <div className="software-asset-list-heading">
        <strong>Danh sách thiết bị</strong>
        <small>Tick vào thiết bị cần cấp bản quyền</small>
      </div>
      <div className="software-asset-checklist">
        {visibleAssets.map((asset) => (
          <label className="software-asset-option" key={asset.id}>
            <input
              className="software-asset-checkbox"
              checked={selectedIds.has(asset.id)}
              onChange={(event) => setAssetSelected(asset.id, event.target.checked)}
              type="checkbox"
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
        {!visibleAssets.length ? (
          <p className="empty-state">Không có thiết bị phù hợp với bộ lọc.</p>
        ) : null}
      </div>
      <p className="form-help">
        Các thiết bị đã tick vẫn được giữ khi bạn đổi nhóm, loại, phòng ban hoặc từ khóa lọc.
      </p>
    </fieldset>
  );
}
