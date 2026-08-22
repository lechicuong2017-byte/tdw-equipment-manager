"use client";

import { useMemo, useState } from "react";
import { ExportReportButton, type ReportExportFilters } from "@/components/export-assets-button";

type AssetReportSource = {
  asset_group: string;
  asset_group_label: string;
  purchase_year: number | null;
  status: string;
  status_label: string;
};

const fields = [
  ["asset_name", "Tên thiết bị"],
  ["asset_code", "Mã thiết bị"],
  ["purchase_year", "Năm đề xuất mua"],
  ["quantity", "Số lượng"],
  ["assigned_to_name", "Người sử dụng"],
  ["department", "Phòng ban"],
  ["total_price", "Thành tiền"],
  ["unit_price", "Đơn giá"],
  ["software_license_note", "Phần mềm bản quyền"],
  ["status_label", "Tình trạng thiết bị"],
  ["asset_type", "Loại thiết bị"],
  ["brand", "Thương hiệu"],
  ["model", "Model"],
  ["serial_number", "Serial"],
  ["purchase_date", "Ngày mua"],
  ["warranty_end_date", "Hết bảo hành"],
  ["location", "Vị trí"],
  ["relation", "Cấu trúc thiết bị"],
  ["parent_asset", "Thiết bị cha"],
  ["note", "Ghi chú"],
] as const;

type AssetField = (typeof fields)[number][0];

const sampleFields: AssetField[] = [
  "asset_name",
  "purchase_year",
  "quantity",
  "assigned_to_name",
  "total_price",
  "software_license_note",
  "status_label",
  "note",
];

const groupOrder = [
  "MAY_TINH_LAPTOP",
  "SCADA_LOGGER_DATA",
  "O_CUNG_THIET_BI_DIEN_TU",
  "MAY_IN_PHOTOCOPY_MAY_CHIEU_TV_DIEN_THOAI",
  "LUU_KHO_KEM_PHAM_CHAT",
];

export function AssetReportExportConfigurator({ assets }: { assets: AssetReportSource[] }) {
  const currentYear = new Date().getFullYear();
  const groups = useMemo(() => {
    const values = new Map<string, string>();
    assets.forEach((asset) => {
      if (asset.asset_group) values.set(asset.asset_group, asset.asset_group_label || asset.asset_group);
    });
    return [...values.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => {
        const leftIndex = groupOrder.indexOf(left.value);
        const rightIndex = groupOrder.indexOf(right.value);
        if (leftIndex !== -1 || rightIndex !== -1) {
          return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
        }
        return left.label.localeCompare(right.label, "vi");
      });
  }, [assets]);
  const years = useMemo(() => {
    const values = new Set<number>([currentYear]);
    assets.forEach((asset) => {
      if (asset.purchase_year && asset.purchase_year >= 2000 && asset.purchase_year <= 2100) {
        values.add(asset.purchase_year);
      }
    });
    return [...values].sort((left, right) => right - left);
  }, [assets, currentYear]);
  const statuses = useMemo(() => {
    const values = new Map<string, string>();
    assets.forEach((asset) => {
      if (asset.status) values.set(asset.status, asset.status_label || asset.status);
    });
    return [...values.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "vi"));
  }, [assets]);
  const [year, setYear] = useState(Math.max(...years));
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedFields, setSelectedFields] = useState<AssetField[]>([]);

  function toggleGroup(value: string) {
    setSelectedGroups((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  function toggleField(value: AssetField) {
    setSelectedFields((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  function toggleStatus(value: string) {
    setSelectedStatuses((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  const exportFilters: ReportExportFilters = {
    year,
    asset_groups: selectedGroups,
    asset_statuses: selectedStatuses,
    asset_fields: fields.map(([key]) => key).filter((key) => selectedFields.includes(key)),
  };
  const isReady = selectedGroups.length > 0 && selectedStatuses.length > 0 && selectedFields.length > 0;

  return (
    <div className="asset-report-configurator">
      <div className="asset-report-year">
        <label htmlFor="asset-report-year">Báo cáo đến năm</label>
        <select id="asset-report-year" onChange={(event) => setYear(Number(event.target.value))} value={year}>
          {years.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <small>Tiêu đề và dữ liệu tự cập nhật đến hết năm {year}.</small>
      </div>

      <fieldset className="asset-report-options">
        <legend>Nhóm thiết bị</legend>
        <div className="asset-report-option-list asset-report-option-list--groups">
          {groups.map((group) => (
            <label key={group.value}>
              <input
                checked={selectedGroups.includes(group.value)}
                onChange={() => toggleGroup(group.value)}
                type="checkbox"
              />
              <span>{group.label}</span>
            </label>
          ))}
        </div>
        <button
          className="asset-report-link-button"
          onClick={() => setSelectedGroups(selectedGroups.length === groups.length ? [] : groups.map((group) => group.value))}
          type="button"
        >
          {selectedGroups.length === groups.length ? "Bỏ chọn tất cả" : "Chọn tất cả nhóm"}
        </button>
      </fieldset>

      <fieldset className="asset-report-options">
        <legend>Trạng thái thiết bị</legend>
        <div className="asset-report-option-list asset-report-option-list--statuses">
          {statuses.map((status) => (
            <label key={status.value}>
              <input
                checked={selectedStatuses.includes(status.value)}
                onChange={() => toggleStatus(status.value)}
                type="checkbox"
              />
              <span>{status.label}</span>
            </label>
          ))}
        </div>
        <button
          className="asset-report-link-button"
          onClick={() => setSelectedStatuses(selectedStatuses.length === statuses.length ? [] : statuses.map((status) => status.value))}
          type="button"
        >
          {selectedStatuses.length === statuses.length ? "Bỏ chọn tất cả" : "Chọn tất cả trạng thái"}
        </button>
      </fieldset>

      <fieldset className="asset-report-options">
        <legend>Trường dữ liệu cần xuất</legend>
        <div className="asset-report-option-list asset-report-option-list--fields">
          {fields.map(([key, label]) => (
            <label key={key}>
              <input checked={selectedFields.includes(key)} onChange={() => toggleField(key)} type="checkbox" />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="asset-report-field-actions">
          <button className="asset-report-link-button" onClick={() => setSelectedFields(sampleFields)} type="button">
            Dùng cột giống file mẫu
          </button>
          <button className="asset-report-link-button" onClick={() => setSelectedFields(fields.map(([key]) => key))} type="button">
            Chọn tất cả trường
          </button>
        </div>
      </fieldset>

      <div className="asset-report-footer">
        <p className="asset-report-validation" hidden={isReady} role="status">
          Chọn ít nhất một danh mục, một trạng thái và một trường dữ liệu để xuất.
        </p>
        <div className="report-actions asset-report-export-actions">
          <ExportReportButton disabled={!isReady} filters={exportFilters} reportType="assets" />
          <ExportReportButton disabled={!isReady} buttonLabel="Xuất PDF" filters={exportFilters} outputFormat="pdf" reportType="assets" />
        </div>
      </div>
    </div>
  );
}
