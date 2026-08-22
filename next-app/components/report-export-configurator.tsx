"use client";

import { useMemo, useState } from "react";
import {
  ExportReportButton,
  type ReportExportFilters,
} from "@/components/export-assets-button";

type FilterOption = { value: string; label: string };

type FilterOptions = {
  assetGroups: FilterOption[];
  assetTypes: FilterOption[];
  departments: FilterOption[];
  maintenanceTypes: FilterOption[];
  softwareNames: FilterOption[];
  softwareStatuses: FilterOption[];
};

type ConfigurableReportType = "liquidations" | "maintenance" | "movement" | "software";

const recordTypes: FilterOption[] = [
  { value: "PLAN", label: "Kế hoạch định kỳ" },
  { value: "LOG", label: "Nhật ký đã thực hiện" },
];

function OptionGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  if (!options.length) return null;

  function toggle(value: string) {
    onChange(selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value]);
  }

  return (
    <fieldset className="asset-report-options report-basic-options">
      <legend>{label}</legend>
      <div className="asset-report-option-list report-basic-option-list">
        {options.map((option) => (
          <label key={option.value}>
            <input
              checked={selected.includes(option.value)}
              onChange={() => toggle(option.value)}
              type="checkbox"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <button
        className="asset-report-link-button"
        onClick={() => onChange(selected.length === options.length ? [] : options.map((option) => option.value))}
        type="button"
      >
        {selected.length === options.length ? "Bỏ chọn tất cả" : `Chọn tất cả ${label.toLocaleLowerCase("vi")}`}
      </button>
    </fieldset>
  );
}

export function ReportExportConfigurator({
  reportType,
  options,
}: {
  reportType: ConfigurableReportType;
  options: FilterOptions;
}) {
  const currentYear = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: 16 }, (_, index) => currentYear - index),
    [currentYear],
  );
  const [year, setYear] = useState<number | undefined>();
  const [month, setMonth] = useState<number | undefined>();
  const [assetGroups, setAssetGroups] = useState<string[]>([]);
  const [assetTypes, setAssetTypes] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [maintenanceRecordTypes, setMaintenanceRecordTypes] = useState<string[]>([]);
  const [maintenanceTypes, setMaintenanceTypes] = useState<string[]>([]);
  const [softwareNames, setSoftwareNames] = useState<string[]>([]);
  const [softwareStatuses, setSoftwareStatuses] = useState<string[]>([]);

  const filters: ReportExportFilters = {
    ...(year ? { year } : {}),
    ...(year && month ? { month } : {}),
    ...(assetGroups.length ? { asset_groups: assetGroups } : {}),
    ...(assetTypes.length ? { asset_types: assetTypes } : {}),
    ...(departments.length ? { departments } : {}),
    ...(maintenanceRecordTypes.length ? { maintenance_record_types: maintenanceRecordTypes } : {}),
    ...(maintenanceTypes.length ? { maintenance_types: maintenanceTypes } : {}),
    ...(softwareNames.length ? { software_names: softwareNames } : {}),
    ...(softwareStatuses.length ? { software_statuses: softwareStatuses } : {}),
  };

  const activeFilterCount = [
    year,
    month,
    assetGroups.length,
    assetTypes.length,
    departments.length,
    maintenanceRecordTypes.length,
    maintenanceTypes.length,
    softwareNames.length,
    softwareStatuses.length,
  ].filter(Boolean).length;

  function clearFilters() {
    setYear(undefined);
    setMonth(undefined);
    setAssetGroups([]);
    setAssetTypes([]);
    setDepartments([]);
    setMaintenanceRecordTypes([]);
    setMaintenanceTypes([]);
    setSoftwareNames([]);
    setSoftwareStatuses([]);
  }

  return (
    <div className="asset-report-configurator report-export-configurator">
      <div className="report-period-filter">
        <label>
          Năm
          <select
            onChange={(event) => {
              const nextYear = event.target.value ? Number(event.target.value) : undefined;
              setYear(nextYear);
              if (!nextYear) setMonth(undefined);
            }}
            value={year ?? ""}
          >
            <option value="">Tất cả năm</option>
            {years.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          Tháng
          <select
            disabled={!year}
            onChange={(event) => setMonth(event.target.value ? Number(event.target.value) : undefined)}
            value={month ?? ""}
          >
            <option value="">Tất cả tháng</option>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>Tháng {value}</option>
            ))}
          </select>
        </label>
        <div className="report-filter-state">
          <strong>{activeFilterCount ? `${activeFilterCount} bộ lọc đang dùng` : "Chưa chọn bộ lọc"}</strong>
          <small>{activeFilterCount ? "File chỉ chứa dữ liệu phù hợp." : "Mặc định xuất toàn bộ dữ liệu."}</small>
        </div>
        <button className="secondary-button" disabled={!activeFilterCount} onClick={clearFilters} type="button">
          Xóa bộ lọc
        </button>
      </div>

      {reportType === "maintenance" ? (
        <OptionGroup label="Loại bản ghi" onChange={setMaintenanceRecordTypes} options={recordTypes} selected={maintenanceRecordTypes} />
      ) : null}
      {reportType === "maintenance" ? (
        <OptionGroup label="Hình thức bảo trì" onChange={setMaintenanceTypes} options={options.maintenanceTypes} selected={maintenanceTypes} />
      ) : null}
      {reportType === "software" ? (
        <OptionGroup label="Phần mềm" onChange={setSoftwareNames} options={options.softwareNames} selected={softwareNames} />
      ) : null}
      {reportType === "software" ? (
        <OptionGroup label="Trạng thái bản quyền" onChange={setSoftwareStatuses} options={options.softwareStatuses} selected={softwareStatuses} />
      ) : null}

      <OptionGroup label="Nhóm thiết bị" onChange={setAssetGroups} options={options.assetGroups} selected={assetGroups} />
      <OptionGroup label="Loại thiết bị" onChange={setAssetTypes} options={options.assetTypes} selected={assetTypes} />
      <OptionGroup label="Phòng ban" onChange={setDepartments} options={options.departments} selected={departments} />

      <div className="report-actions report-configurator-actions">
        <ExportReportButton filters={filters} reportType={reportType} />
        <ExportReportButton buttonLabel="Xuất PDF" filters={filters} outputFormat="pdf" reportType={reportType} />
      </div>
    </div>
  );
}
