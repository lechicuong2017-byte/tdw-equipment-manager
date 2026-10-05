"use client";

import { useMemo, useState } from "react";
import { AppIcon, type AppIconName } from "@/components/app-icon";
import { ExportReportButton, type ReportExportFilters } from "@/components/export-assets-button";

type VehicleOption = {
  id: string;
  vehicle_code: string;
  vehicle_name: string;
  license_plate: string;
};

const vehicleReports: {
  type: "vehicles" | "vehicle_inspections" | "vehicle_insurance" | "vehicle_repairs" | "vehicle_fuel";
  eyebrow: string;
  title: string;
  description: string;
  icon: AppIconName;
  tone: string;
}[] = [
  { type: "vehicles", eyebrow: "HỒ SƠ XE", title: "Danh sách phương tiện", description: "Thông tin xe, biển số, số chỗ ngồi, tài xế, định mức và trạng thái sử dụng.", icon: "vehicle", tone: "cyan" },
  { type: "vehicle_inspections", eyebrow: "ĐĂNG KIỂM", title: "Lịch sử đăng kiểm", description: "Ngày đăng kiểm, hạn tiếp theo, số chỗ ngồi, chi phí và giấy chứng nhận.", icon: "inspection", tone: "amber" },
  { type: "vehicle_insurance", eyebrow: "BẢO HIỂM", title: "Hồ sơ bảo hiểm xe", description: "Thời hạn, loại bảo hiểm, hãng, số chứng nhận, chi phí và ngày nhắc.", icon: "insurance", tone: "blue" },
  { type: "vehicle_repairs", eyebrow: "BẢO DƯỠNG", title: "Bảo dưỡng và sửa chữa", description: "Nhật ký thực hiện, số km, đơn vị sửa chữa và chi phí có VAT.", icon: "maintenance", tone: "violet" },
  { type: "vehicle_fuel", eyebrow: "NHIÊN LIỆU", title: "Theo dõi mua nhiên liệu", description: "Số lít, hành trình, số tiền và người mua theo từng xe.", icon: "fuel", tone: "green" },
];

const comparisonCategories = [
  { key: "inspection", label: "Đăng kiểm" },
  { key: "insurance", label: "Bảo hiểm" },
  { key: "repair", label: "Bảo dưỡng / sửa chữa" },
  { key: "fuel", label: "Nhiên liệu" },
  { key: "toll", label: "VETC" },
] as const;
type ComparisonCategory = (typeof comparisonCategories)[number]["key"];

export function VehicleReportSection({ vehicles, showHeading = true }: { vehicles: VehicleOption[]; showHeading?: boolean }) {
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: currentYear - 1997 }, (_, index) => currentYear + 2 - index), [currentYear]);
  const [activeGroup, setActiveGroup] = useState<"costs" | "legal" | "operations">("costs");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [compareYearA, setCompareYearA] = useState(String(currentYear - 1));
  const [compareYearB, setCompareYearB] = useState(String(currentYear));
  const [selectedCategories, setSelectedCategories] = useState<ComparisonCategory[]>(comparisonCategories.map((category) => category.key));
  const filters: ReportExportFilters = {
    year: year ? Number(year) : undefined,
    month: year && month ? Number(month) : undefined,
    vehicle_id: vehicleId || undefined,
  };
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);
  const filterSummary = [
    month && year ? `Tháng ${month}/${year}` : year ? `Năm ${year}` : "Tất cả thời gian",
    selectedVehicle ? `${selectedVehicle.license_plate} · ${selectedVehicle.vehicle_name}` : "Tất cả xe",
  ].join(" · ");
  const directXlsxUrl = (reportType: (typeof vehicleReports)[number]["type"]) => `/api/vehicles/reports/xlsx?${new URLSearchParams({
    report_type: reportType,
    year,
    month: year ? month : "",
    vehicle_id: vehicleId,
  })}`;
  const comparisonParams = new URLSearchParams({
    year_a: compareYearA,
    year_b: compareYearB,
    vehicle_id: vehicleId,
    categories_selected: "1",
  });
  selectedCategories.forEach((category) => comparisonParams.append("category", category));
  const comparisonUrl = `/api/vehicles/reports/comparison?${comparisonParams}`;
  const renderReportCard = (report: (typeof vehicleReports)[number]) => <article className={`panel report-card vehicle-report-card vehicle-report-card--${report.tone}`} key={report.type}>
    <div className="vehicle-report-card-header">
      <div className="report-icon"><AppIcon name={report.icon} size={22} /></div>
      <div><p className="eyebrow">{report.eyebrow}</p><h2>{report.title}</h2><p>{report.description}</p></div>
    </div>
    <div className="report-filter-chip">{report.type === "vehicles" ? (selectedVehicle ? filterSummary.split(" · ").slice(1).join(" · ") : "Tất cả xe") : filterSummary}</div>
    <div className="report-actions">
      <a className="primary-button" href={directXlsxUrl(report.type)}>Xuất XLSX</a>
      <ExportReportButton buttonLabel="Xuất PDF" filters={filters} outputFormat="pdf" reportType={report.type} />
    </div>
  </article>;

  return (
    <section className={`vehicle-report-workspace${showHeading ? "" : " vehicle-report-workspace--standalone"}`}>
      {showHeading ? <div className="report-section-heading">
        <div><p className="eyebrow">PHƯƠNG TIỆN</p><h2>Báo cáo quản lý xe</h2><p>Lọc dữ liệu trước khi tạo file XLSX hoặc PDF.</p></div>
        <span><AppIcon name="reports" size={20} />6 mẫu báo cáo</span>
      </div> : null}
      <div className="panel vehicle-report-filter">
        <div className="vehicle-report-filter-title"><span><AppIcon name="settings" size={19} /></span><div><strong>Bộ lọc báo cáo</strong><small>{filterSummary}</small></div></div>
        <div className="vehicle-report-filter-fields">
          <label>Năm<select onChange={(event) => { setYear(event.target.value); if (!event.target.value) setMonth(""); }} value={year}><option value="">Tất cả năm</option>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>Tháng<select disabled={!year} onChange={(event) => setMonth(event.target.value)} value={month}><option value="">Tất cả tháng</option>{Array.from({ length: 12 }, (_, index) => index + 1).map((item) => <option key={item} value={item}>Tháng {item}</option>)}</select></label>
          <label>Xe<select onChange={(event) => setVehicleId(event.target.value)} value={vehicleId}><option value="">Tất cả xe</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.license_plate} · {vehicle.vehicle_name}</option>)}</select></label>
          {(year || month || vehicleId) ? <button className="secondary-button" onClick={() => { setYear(""); setMonth(""); setVehicleId(""); }} type="button">Xóa bộ lọc</button> : null}
        </div>
      </div>
      <nav aria-label="Nhóm báo cáo xe" className="vehicle-report-groups">
        <button aria-selected={activeGroup === "costs"} className={activeGroup === "costs" ? "is-active" : ""} onClick={() => setActiveGroup("costs")} role="tab" type="button"><AppIcon name="reports" size={18} /><span><strong>Tổng hợp chi phí</strong><small>So sánh hai năm và VETC</small></span></button>
        <button aria-selected={activeGroup === "legal"} className={activeGroup === "legal" ? "is-active" : ""} onClick={() => setActiveGroup("legal")} role="tab" type="button"><AppIcon name="inspection" size={18} /><span><strong>Hồ sơ & pháp lý</strong><small>Xe, đăng kiểm, bảo hiểm</small></span></button>
        <button aria-selected={activeGroup === "operations"} className={activeGroup === "operations" ? "is-active" : ""} onClick={() => setActiveGroup("operations")} role="tab" type="button"><AppIcon name="maintenance" size={18} /><span><strong>Vận hành</strong><small>Bảo dưỡng và nhiên liệu</small></span></button>
      </nav>
      {activeGroup === "costs" ? <div className="report-grid vehicle-report-grid vehicle-report-grid--costs" role="tabpanel">
        <article className="panel report-card vehicle-report-card vehicle-report-card--comparison">
          <div className="vehicle-report-card-header">
            <div className="report-icon"><AppIcon name="reports" size={22} /></div>
            <div><p className="eyebrow">SO SÁNH CHI PHÍ</p><h2>Hai năm theo từng xe</h2><p>Chọn khoản chi cần so sánh cho từng xe; file xuất sẽ tính lại tổng chi phí và tỷ lệ tăng giảm theo lựa chọn.</p></div>
          </div>
          <div className="vehicle-comparison-years">
            <label>Năm gốc<select onChange={(event) => setCompareYearA(event.target.value)} value={compareYearA}>{years.map((item) => <option disabled={String(item) === compareYearB} key={item} value={item}>{item}</option>)}</select></label>
            <span>so với</span>
            <label>Năm đối chiếu<select onChange={(event) => setCompareYearB(event.target.value)} value={compareYearB}>{years.map((item) => <option disabled={String(item) === compareYearA} key={item} value={item}>{item}</option>)}</select></label>
          </div>
          <fieldset className="vehicle-comparison-categories">
            <legend>Chọn khoản chi đưa vào báo cáo</legend>
            <div className="vehicle-comparison-category-list">
              {comparisonCategories.map((category) => <label key={category.key}>
                <input checked={selectedCategories.includes(category.key)} onChange={(event) => setSelectedCategories((current) => event.target.checked ? [...current, category.key] : current.filter((key) => key !== category.key))} type="checkbox" />
                <span>{category.label}</span>
              </label>)}
            </div>
            {selectedCategories.length === 0 ? <small role="alert">Chọn ít nhất một khoản chi để xuất báo cáo.</small> : null}
          </fieldset>
          <div className="report-filter-chip">{selectedVehicle ? `${selectedVehicle.license_plate} · ${selectedVehicle.vehicle_name}` : "Tất cả xe"}</div>
          <div className="report-actions"><a aria-disabled={selectedCategories.length === 0} className="primary-button" href={selectedCategories.length ? comparisonUrl : undefined} onClick={(event) => { if (!selectedCategories.length) event.preventDefault(); }}>Xuất XLSX so sánh</a></div>
        </article>
        <article className="panel report-card vehicle-report-card vehicle-report-card--cyan">
          <div className="vehicle-report-card-header">
            <div className="report-icon"><AppIcon name="toll" size={22} /></div>
            <div><p className="eyebrow">VETC</p><h2>Chi phí qua trạm</h2><p>Tổng hợp theo tháng, chi tiết vé lẻ sau thuế và đăng ký vé quý theo ngày bắt đầu.</p></div>
          </div>
          <div className="report-filter-chip">{filterSummary}</div>
          <div className="report-actions"><a className="primary-button" href={`/api/vehicles/tolls/report?${new URLSearchParams({ year, month: year ? month : "", vehicle_id: vehicleId })}`}>Xuất Excel</a></div>
        </article>
      </div> : null}
      {activeGroup === "legal" ? <div className="report-grid vehicle-report-grid" role="tabpanel">{vehicleReports.filter((report) => ["vehicles", "vehicle_inspections", "vehicle_insurance"].includes(report.type)).map(renderReportCard)}</div> : null}
      {activeGroup === "operations" ? <div className="report-grid vehicle-report-grid" role="tabpanel">{vehicleReports.filter((report) => ["vehicle_repairs", "vehicle_fuel"].includes(report.type)).map(renderReportCard)}</div> : null}
    </section>
  );
}
