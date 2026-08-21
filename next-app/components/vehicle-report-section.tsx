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
  type: "vehicles" | "vehicle_inspections" | "vehicle_repairs" | "vehicle_fuel";
  eyebrow: string;
  title: string;
  description: string;
  icon: AppIconName;
  tone: string;
}[] = [
  { type: "vehicles", eyebrow: "HỒ SƠ XE", title: "Danh sách phương tiện", description: "Thông tin xe, biển số, số chỗ ngồi, tài xế, định mức và trạng thái sử dụng.", icon: "vehicle", tone: "cyan" },
  { type: "vehicle_inspections", eyebrow: "ĐĂNG KIỂM", title: "Lịch sử đăng kiểm", description: "Ngày đăng kiểm, hạn tiếp theo, số chỗ ngồi, chi phí và giấy chứng nhận.", icon: "inspection", tone: "amber" },
  { type: "vehicle_repairs", eyebrow: "BẢO DƯỠNG", title: "Bảo dưỡng và sửa chữa", description: "Nhật ký thực hiện, số km, đơn vị sửa chữa và chi phí có VAT.", icon: "maintenance", tone: "violet" },
  { type: "vehicle_fuel", eyebrow: "NHIÊN LIỆU", title: "Theo dõi mua nhiên liệu", description: "Số lít, hành trình, số tiền và người mua theo từng xe.", icon: "fuel", tone: "green" },
];

export function VehicleReportSection({ vehicles, showHeading = true }: { vehicles: VehicleOption[]; showHeading?: boolean }) {
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: currentYear - 1999 }, (_, index) => currentYear - index), [currentYear]);
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [vehicleId, setVehicleId] = useState("");
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

  return (
    <section className={`vehicle-report-workspace${showHeading ? "" : " vehicle-report-workspace--standalone"}`}>
      {showHeading ? <div className="report-section-heading">
        <div><p className="eyebrow">PHƯƠNG TIỆN</p><h2>Báo cáo quản lý xe</h2><p>Lọc dữ liệu trước khi tạo file XLSX hoặc PDF.</p></div>
        <span><AppIcon name="reports" size={20} />4 mẫu báo cáo</span>
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
      <div className="report-grid vehicle-report-grid">
        {vehicleReports.map((report) => <article className={`panel report-card vehicle-report-card vehicle-report-card--${report.tone}`} key={report.type}>
          <div className="report-icon"><AppIcon name={report.icon} size={22} /></div>
          <div><p className="eyebrow">{report.eyebrow}</p><h2>{report.title}</h2><p>{report.description}</p></div>
          <div className="report-filter-chip">{report.type === "vehicles" ? (selectedVehicle ? filterSummary.split(" · ").slice(1).join(" · ") : "Tất cả xe") : filterSummary}</div>
          <div className="report-actions">
            <ExportReportButton filters={filters} reportType={report.type} />
            <ExportReportButton buttonLabel="Xuất PDF" filters={filters} outputFormat="pdf" reportType={report.type} />
          </div>
        </article>)}
      </div>
    </section>
  );
}
