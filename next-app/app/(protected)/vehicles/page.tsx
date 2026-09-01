import Link from "next/link";
import type { ReactNode } from "react";
import { ConfirmAction, ModalTrigger } from "@/components/app-modal";
import { InteractiveTableRow } from "@/components/interactive-table-row";
import { AppIcon } from "@/components/app-icon";
import { PageHeader } from "@/components/page-header";
import { FuelForm, InspectionForm, InsuranceForm, RepairForm, VehicleActions, VehicleForm } from "@/components/vehicle-forms";
import { VehicleModuleNav } from "@/components/vehicle-module-nav";
import { VehicleSettingEditor } from "@/components/vehicle-setting-editor";
import { can, requireAccess } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { vehicleSettingTypeDefinitions, vehicleSettingTypes } from "@/lib/settings";
import type { Setting } from "@/lib/types";
import { deleteVehicleRecord, moveVehicleSetting, toggleVehicleSetting } from "./actions";

export const metadata = { title: "Quản lý xe" };

type VehicleSection = "overview" | "fleet" | "inspections" | "insurance" | "repairs" | "fuel" | "settings";

type VehicleRelation = { id?: string; vehicle_code?: string; vehicle_name?: string; license_plate?: string } | { id?: string; vehicle_code?: string; vehicle_name?: string; license_plate?: string }[] | null;
function relatedVehicle(value: VehicleRelation) { return Array.isArray(value) ? value[0] : value; }

type VehicleDocument = {
  file_name: string;
  id: string;
  record_id: string;
  record_type: "INSPECTION" | "REPAIR" | "FUEL" | "INSURANCE";
  document_kind: "INVOICE" | "CERTIFICATE";
  stored_byte_size: number | string;
};

type InsuranceRenewalRecord = {
  id: string;
  certificate_number: string;
  starts_on: string;
  expires_on: string;
  renewed_from_id: string | null;
  renewed_at: string | null;
  renewed_by_name: string;
};

function formatFileSize(value: number | string) {
  const bytes = Number(value || 0);
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function VehicleDocumentLink({ document, label = "Hóa đơn PDF" }: { document?: VehicleDocument; label?: string }) {
  if (!document) return <span className="vehicle-document-empty">—</span>;
  return (
    <a
      className="vehicle-document-link"
      href={`/api/vehicle-documents/${document.id}`}
      rel="noreferrer"
      target="_blank"
      title={document.file_name}
    >
      <AppIcon name="reports" size={14} />
      <span>{label}<small>{formatFileSize(document.stored_byte_size)}</small></span>
    </a>
  );
}

function detailValue(value: ReactNode) {
  return value === null || value === undefined || value === "" ? "—" : value;
}

function VehicleDetailGrid({
  fields,
}: {
  fields: { label: string; value: ReactNode; wide?: boolean }[];
}) {
  return (
    <dl className="vehicle-record-detail-grid">
      {fields.map((field) => (
        <div className={field.wide ? "vehicle-record-detail-field vehicle-record-detail-field--wide" : "vehicle-record-detail-field"} key={field.label}>
          <dt>{field.label}</dt>
          <dd>{detailValue(field.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function VehicleDetailNote({ note }: { note?: string | null }) {
  if (!note) return null;
  return (
    <section className="vehicle-record-detail-note">
      <strong>Ghi chú</strong>
      <p>{note}</p>
    </section>
  );
}

function VehicleDocumentDetail({ document, label = "Hóa đơn / chứng từ PDF" }: { document?: VehicleDocument; label?: string }) {
  return (
    <section className={`vehicle-record-document ${document ? "vehicle-record-document--ready" : ""}`}>
      <span className="vehicle-record-document-icon"><AppIcon name="reports" size={21} /></span>
      <div>
        <strong>{label}</strong>
        {document ? <p title={document.file_name}>{document.file_name} · {formatFileSize(document.stored_byte_size)}</p> : <p>Chưa có tài liệu đính kèm cho bản ghi này.</p>}
      </div>
      {document ? <div className="vehicle-record-document-actions">
        <a className="secondary-button" href={`/api/vehicle-documents/${document.id}`} rel="noreferrer" target="_blank">Xem PDF</a>
        <a className="primary-button" href={`/api/vehicle-documents/${document.id}?download=1`}>Tải xuống</a>
      </div> : null}
    </section>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function VehicleInsuranceRenewalHistory({
  current,
  records,
}: {
  current: InsuranceRenewalRecord;
  records: Map<string, InsuranceRenewalRecord>;
}) {
  const entries: { previous: InsuranceRenewalRecord; renewed: InsuranceRenewalRecord }[] = [];
  const visited = new Set<string>();
  let renewed = current;
  while (renewed.renewed_from_id && !visited.has(renewed.renewed_from_id)) {
    visited.add(renewed.renewed_from_id);
    const previous = records.get(renewed.renewed_from_id);
    if (!previous) break;
    entries.push({ previous, renewed });
    renewed = previous;
  }
  if (!entries.length) return null;
  return (
    <section className="vehicle-renewal-history">
      <strong>Nhật ký gia hạn</strong>
      <div>
        {entries.map(({ previous, renewed: renewal }) => (
          <article key={renewal.id}>
            <span>Gia hạn {renewal.renewed_at ? formatDateTime(renewal.renewed_at) : "—"}</span>
            <b>{formatDate(previous.starts_on)}–{formatDate(previous.expires_on)} → {formatDate(renewal.starts_on)}–{formatDate(renewal.expires_on)}</b>
            <small>{renewal.renewed_by_name || "Người dùng hệ thống"}{previous.certificate_number ? ` · Chứng nhận cũ ${previous.certificate_number}` : ""}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function settingLabel(labels: Map<string, string>, value: string) {
  return labels.get(value) ?? value.replaceAll("_", " ");
}

function vietnamToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function daysUntil(date: string, today: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

function nextInsurancePeriod(expiresOn: string) {
  const startsOn = new Date(`${expiresOn}T00:00:00Z`);
  startsOn.setUTCDate(startsOn.getUTCDate() + 1);
  const nextExpiresOn = new Date(startsOn);
  nextExpiresOn.setUTCFullYear(nextExpiresOn.getUTCFullYear() + 1);
  nextExpiresOn.setUTCDate(nextExpiresOn.getUTCDate() - 1);
  return {
    startsOn: startsOn.toISOString().slice(0, 10),
    expiresOn: nextExpiresOn.toISOString().slice(0, 10),
  };
}

function dueTone(days: number) {
  if (days < 0) return { className: "status-pill--retiring", label: `Quá hạn ${Math.abs(days)} ngày` };
  if (days <= 7) return { className: "status-pill--attention", label: `Còn ${days} ngày` };
  if (days <= 30) return { className: "status-pill--new", label: `Còn ${days} ngày` };
  return { className: "status-pill--active", label: "Còn hiệu lực" };
}

const vehiclePageSize = 10;

function boundedPage(requestedPage: number, totalRows: number) {
  const totalPages = Math.max(1, Math.ceil(totalRows / vehiclePageSize));
  return Math.min(Math.max(1, requestedPage), totalPages);
}

function pageRows<T>(rows: T[], page: number) {
  const offset = (page - 1) * vehiclePageSize;
  return rows.slice(offset, offset + vehiclePageSize);
}

function VehiclePagination({ section, page, totalRows }: { section: "inspections" | "insurance" | "repairs" | "fuel"; page: number; totalRows: number }) {
  if (totalRows <= vehiclePageSize) return null;
  const totalPages = Math.max(1, Math.ceil(totalRows / vehiclePageSize));
  const from = totalRows ? (page - 1) * vehiclePageSize + 1 : 0;
  const to = Math.min(page * vehiclePageSize, totalRows);
  return (
    <nav className="vehicle-pagination" aria-label="Phân trang dữ liệu xe">
      <span>Hiển thị {from}–{to} / {totalRows} bản ghi</span>
      <div>
        {page > 1 ? <Link className="secondary-button" href={`/vehicles?section=${section}&page=${page - 1}`}>← Trước</Link> : <span className="secondary-button disabled">← Trước</span>}
        <strong>Trang {page} / {totalPages}</strong>
        {page < totalPages ? <Link className="secondary-button" href={`/vehicles?section=${section}&page=${page + 1}`}>Sau →</Link> : <span className="secondary-button disabled">Sau →</span>}
      </div>
    </nav>
  );
}

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ section?: string; page?: string }> }) {
  const params = await searchParams;
  const requestedSection = params.section;
  const requestedPage = Number.isFinite(Number(params.page)) ? Math.max(1, Math.trunc(Number(params.page))) : 1;
  const section: VehicleSection = ["fleet", "inspections", "insurance", "repairs", "fuel", "settings"].includes(requestedSection ?? "")
    ? requestedSection as VehicleSection
    : "overview";
  const { access, supabase } = await requireAccess();
  const canManage = can(access, "vehicles.manage");
  const canDelete = can(access, "vehicles.delete");
  const today = vietnamToday();
  const currentYear = today.slice(0, 4);
  const currentYearPrefix = `${currentYear}-01-01`;
  const nextYearPrefix = `${Number(currentYear) + 1}-01-01`;
  const needsVehicles = section !== "settings";
  const needsInspections = ["overview", "inspections"].includes(section);
  const needsInsurances = ["overview", "insurance"].includes(section);
  const needsRepairs = ["overview", "repairs"].includes(section);
  const needsFuel = ["overview", "fuel"].includes(section);
  const needsPeople = ["overview", "fleet"].includes(section);
  const pageFrom = (requestedPage - 1) * vehiclePageSize;
  const pageTo = pageFrom + vehiclePageSize - 1;
  const documentRecordType = section === "inspections" ? "INSPECTION"
    : section === "insurance" ? "INSURANCE"
      : section === "repairs" ? "REPAIR"
        : section === "fuel" ? "FUEL"
          : null;
  const neededSettingTypes = section === "settings"
    ? vehicleSettingTypes
    : section === "insurance"
      ? ["vehicle_insurance_type"]
      : section === "repairs"
        ? ["vehicle_maintenance_type"]
        : [];
  const [vehiclesResult, inspectionsResult, insurancesResult, archivedInsurancesResult, repairsResult, fuelResult, departmentsResult, usersResult, documentsResult, settingsResult] = await Promise.all([
    needsVehicles ? supabase.from("vehicles").select("id,vehicle_code,vehicle_name,license_plate,brand,model,production_year,seat_count,fuel_norm_l_per_100km,assigned_driver,status,note,department_id,responsible_user_id,departments(name)").is("deleted_at", null).order("vehicle_code").limit(500) : Promise.resolve({ data: [] }),
    needsInspections ? (section === "inspections" ? supabase.from("vehicle_inspections").select("id,vehicle_id,inspection_date,expires_on,cost,reminder_days,certificate_number,inspection_center,seat_count,odometer_km,note,vehicles(id,vehicle_code,vehicle_name,license_plate)", { count: "exact" }).order("inspection_date", { ascending: false }).range(pageFrom, pageTo) : supabase.from("vehicle_inspections").select("id,vehicle_id,inspection_date,expires_on,cost,reminder_days,certificate_number,inspection_center,seat_count,odometer_km,note,vehicles(id,vehicle_code,vehicle_name,license_plate)").order("inspection_date", { ascending: false }).limit(500)) : Promise.resolve({ data: [], count: 0 }),
    needsInsurances ? (section === "insurance" ? supabase.from("vehicle_insurances").select("id,vehicle_id,insurance_name,insurance_type,insurance_company,certificate_number,starts_on,expires_on,cost,reminder_days,note,renewed_from_id,renewed_at,renewed_by_name,archived_at,vehicles(id,vehicle_code,vehicle_name,license_plate)", { count: "exact" }).is("archived_at", null).order("starts_on", { ascending: false }).range(pageFrom, pageTo) : supabase.from("vehicle_insurances").select("id,vehicle_id,insurance_name,insurance_type,insurance_company,certificate_number,starts_on,expires_on,cost,reminder_days,note,renewed_from_id,renewed_at,renewed_by_name,archived_at,vehicles(id,vehicle_code,vehicle_name,license_plate)").is("archived_at", null).order("starts_on", { ascending: false }).limit(500)) : Promise.resolve({ data: [], count: 0 }),
    section === "insurance" ? supabase.from("vehicle_insurances").select("id,certificate_number,starts_on,expires_on,renewed_from_id,renewed_at,renewed_by_name").not("archived_at", "is", null).order("archived_at", { ascending: false }).limit(1000) : Promise.resolve({ data: [] }),
    needsRepairs ? (section === "repairs" ? supabase.from("vehicle_repairs").select("id,vehicle_id,service_date,service_type,description,odometer_km,vat_amount,vendor,invoice_number,note,source_file,vehicles(id,vehicle_code,vehicle_name,license_plate)", { count: "exact" }).order("service_date", { ascending: false }).range(pageFrom, pageTo) : supabase.from("vehicle_repairs").select("id,vehicle_id,service_date,service_type,description,odometer_km,vat_amount,vendor,invoice_number,note,source_file,vehicles(id,vehicle_code,vehicle_name,license_plate)").gte("service_date", currentYearPrefix).lt("service_date", nextYearPrefix).order("service_date", { ascending: false }).limit(500)) : Promise.resolve({ data: [], count: 0 }),
    needsFuel ? (section === "fuel" ? supabase.from("vehicle_fuel_logs").select("id,vehicle_id,payment_date,liters,odometer_from,odometer_to,amount,purchaser,note,source_file,vehicles(id,vehicle_code,vehicle_name,license_plate)", { count: "exact" }).order("payment_date", { ascending: false }).range(pageFrom, pageTo) : supabase.from("vehicle_fuel_logs").select("id,vehicle_id,payment_date,liters,odometer_from,odometer_to,amount,purchaser,note,source_file,vehicles(id,vehicle_code,vehicle_name,license_plate)").gte("payment_date", currentYearPrefix).lt("payment_date", nextYearPrefix).order("payment_date", { ascending: false }).limit(500)) : Promise.resolve({ data: [], count: 0 }),
    needsPeople ? supabase.from("departments").select("id,name").order("name").limit(500) : Promise.resolve({ data: [] }),
    needsPeople ? supabase.from("profiles").select("id,full_name,email").eq("active", true).order("full_name").limit(500) : Promise.resolve({ data: [] }),
    documentRecordType ? supabase.from("vehicle_documents").select("id,file_name,record_id,record_type,document_kind,stored_byte_size").eq("record_type", documentRecordType).order("created_at", { ascending: false }).limit(1500) : Promise.resolve({ data: [] }),
    neededSettingTypes.length ? supabase.from("settings").select("id,setting_type,setting_value,display_name,sort_order,active").in("setting_type", neededSettingTypes).order("setting_type").order("active", { ascending: false }).order("sort_order").order("display_name") : Promise.resolve({ data: [] }),
  ]);
  const vehicles = vehiclesResult.data ?? [];
  const inspections = inspectionsResult.data ?? [];
  const insurances = insurancesResult.data ?? [];
  const archivedInsurances = archivedInsurancesResult.data ?? [];
  const repairs = repairsResult.data ?? [];
  const fuelLogs = fuelResult.data ?? [];
  const vehicleSettings = (settingsResult.data ?? []) as Setting[];
  const maintenanceSettings = vehicleSettings.filter((item) => item.setting_type === "vehicle_maintenance_type");
  const insuranceSettings = vehicleSettings.filter((item) => item.setting_type === "vehicle_insurance_type");
  const activeMaintenanceTypes = maintenanceSettings.filter((item) => item.active).map((item) => ({ value: item.setting_value, label: item.display_name }));
  const activeInsuranceTypes = insuranceSettings.filter((item) => item.active).map((item) => ({ value: item.setting_value, label: item.display_name }));
  const maintenanceTypeLabels = new Map(maintenanceSettings.map((item) => [item.setting_value, item.display_name]));
  const insuranceTypeLabels = new Map(insuranceSettings.map((item) => [item.setting_value, item.display_name]));
  const vehicleDocuments = (documentsResult.data ?? []) as VehicleDocument[];
  const documentByRecord = new Map(
    vehicleDocuments.map((item) => [
      `${item.record_type}:${item.record_id}:${item.document_kind}`,
      item,
    ]),
  );
  const insuranceRecordsById = new Map<string, InsuranceRenewalRecord>(
    [...insurances, ...archivedInsurances].map((item) => [item.id, item as InsuranceRenewalRecord]),
  );
  const inspectionsTotal = inspectionsResult.count ?? inspections.length;
  const insurancesTotal = insurancesResult.count ?? insurances.length;
  const repairsTotal = repairsResult.count ?? repairs.length;
  const fuelTotal = fuelResult.count ?? fuelLogs.length;
  const inspectionsPage = boundedPage(requestedPage, inspectionsTotal);
  const insurancePage = boundedPage(requestedPage, insurancesTotal);
  const repairsPage = boundedPage(requestedPage, repairsTotal);
  const fuelPage = boundedPage(requestedPage, fuelTotal);
  const visibleInspections = section === "inspections" ? inspections : pageRows(inspections, inspectionsPage);
  const visibleInsurances = section === "insurance" ? insurances : pageRows(insurances, insurancePage);
  const visibleRepairs = section === "repairs" ? repairs : pageRows(repairs, repairsPage);
  const visibleFuelLogs = section === "fuel" ? fuelLogs : pageRows(fuelLogs, fuelPage);
  const latestInspectionByVehicle = new Map<string, (typeof inspections)[number]>();
  inspections.forEach((item) => { if (!latestInspectionByVehicle.has(item.vehicle_id)) latestInspectionByVehicle.set(item.vehicle_id, item); });
  const upcoming = [...latestInspectionByVehicle.values()].filter((item) => daysUntil(item.expires_on, today) <= item.reminder_days).sort((a, b) => a.expires_on.localeCompare(b.expires_on));
  const latestInsuranceByVehicle = new Map<string, (typeof insurances)[number]>();
  insurances.forEach((item) => { if (!latestInsuranceByVehicle.has(item.vehicle_id)) latestInsuranceByVehicle.set(item.vehicle_id, item); });
  const upcomingInsurance = [...latestInsuranceByVehicle.values()].filter((item) => daysUntil(item.expires_on, today) <= item.reminder_days).sort((a, b) => a.expires_on.localeCompare(b.expires_on));
  const currentYearRepairs = repairs.filter((item) => item.service_date.startsWith(`${currentYear}-`));
  const currentYearFuelLogs = fuelLogs.filter((item) => item.payment_date.startsWith(`${currentYear}-`));
  const totalRepairCost = currentYearRepairs.reduce((sum, item) => sum + Number(item.vat_amount || 0), 0);
  const totalFuelCost = currentYearFuelLogs.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const activeVehicles = vehicles.filter((vehicle) => vehicle.status === "ACTIVE").length;
  const maintenanceVehicles = vehicles.filter((vehicle) => vehicle.status === "MAINTENANCE").length;
  const inactiveVehicles = vehicles.filter((vehicle) => !["ACTIVE", "MAINTENANCE"].includes(vehicle.status)).length;
  const vehicleOptions = vehicles.map(({ id, vehicle_code, vehicle_name, license_plate }) => ({ id, vehicle_code, vehicle_name, license_plate }));
  const sections = [
    { key: "overview" as const, label: "Tổng quan", icon: "dashboard" as const, description: "Số liệu và việc cần chú ý" },
    { key: "fleet" as const, label: "Hồ sơ xe", icon: "vehicle" as const, description: "Danh sách phương tiện đang quản lý" },
    { key: "inspections" as const, label: "Đăng kiểm", icon: "inspection" as const, description: "Lịch sử, hạn đăng kiểm và cảnh báo" },
    { key: "insurance" as const, label: "Bảo hiểm", icon: "insurance" as const, description: "Hợp đồng, chứng nhận và cảnh báo hết hạn" },
    { key: "repairs" as const, label: "Bảo dưỡng", icon: "maintenance" as const, description: "Bảo dưỡng và sửa chữa phương tiện" },
    { key: "fuel" as const, label: "Nhiên liệu", icon: "fuel" as const, description: "Theo dõi các lần mua nhiên liệu" },
    { key: "settings" as const, label: "Cấu hình", icon: "settings" as const, description: "Hình thức bảo dưỡng và loại bảo hiểm xe" },
  ];
  const activeSection = sections.find((item) => item.key === section) ?? sections[0];

  return (
    <>
      <div className="vehicle-page-header">
        <PageHeader eyebrow="PHƯƠNG TIỆN" title="Quản lý xe" description="Theo dõi tập trung hồ sơ xe, đăng kiểm, bảo hiểm, bảo dưỡng sửa chữa và nhiên liệu." />
      </div>
      <VehicleModuleNav active={section} />
      <section className={`vehicle-command-bar vehicle-command-bar--${section}`}>
        <div className="vehicle-command-context">
          <span className="vehicle-command-icon"><AppIcon name={activeSection.icon} size={22} /></span>
          <div><small>KHU VỰC ĐANG LÀM VIỆC</small><strong>{activeSection.label}</strong><p>{activeSection.description}</p></div>
        </div>
        {canManage && section !== "settings" ? <VehicleActions vehicles={vehicleOptions} departments={departmentsResult.data ?? []} users={usersResult.data ?? []} maintenanceTypes={activeMaintenanceTypes} insuranceTypes={activeInsuranceTypes} canManage={canManage} section={section} /> : null}
      </section>

      {section === "overview" ? <>
        <section className="metric-grid vehicle-stats-grid" aria-label="Tổng quan phương tiện">
          <article className="metric-card metric-primary"><span className="metric-icon"><AppIcon name="vehicle" /></span><p>Tổng số xe</p><strong>{vehicles.length}</strong><small>Hồ sơ đang quản lý</small></article>
          <article className="metric-card metric-tone-amber"><span className="metric-icon"><AppIcon name="inspection" /></span><p>Đăng kiểm cần chú ý</p><strong>{upcoming.length}</strong><small>Trong hạn nhắc hoặc đã quá hạn</small></article>
          <article className="metric-card metric-tone-blue"><span className="metric-icon"><AppIcon name="insurance" /></span><p>Bảo hiểm cần chú ý</p><strong>{upcomingInsurance.length}</strong><small>Theo ngày nhắc của từng hợp đồng</small></article>
          <article className="metric-card metric-tone-violet"><span className="metric-icon"><AppIcon name="maintenance" /></span><p>Chi phí bảo dưỡng</p><strong className="metric-money">{formatMoney(totalRepairCost)}</strong><small>Năm {currentYear} · {currentYearRepairs.length} lần ghi nhận</small></article>
          <article className="metric-card metric-tone-green"><span className="metric-icon"><AppIcon name="fuel" /></span><p>Chi phí nhiên liệu</p><strong className="metric-money">{formatMoney(totalFuelCost)}</strong><small>Năm {currentYear} · {currentYearFuelLogs.length} lần mua</small></article>
        </section>
        <section className="vehicle-overview-grid">
          <article className="panel vehicle-overview-card vehicle-overview-card--inspection">
            <div className="panel-heading"><div><p className="eyebrow">CẦN THEO DÕI</p><h2>Đăng kiểm sắp tới</h2></div><Link className="text-link" href="/vehicles?section=inspections">Xem chi tiết →</Link></div>
            <div className="vehicle-alert-list">
              {upcoming.slice(0, 5).map((item) => { const vehicle = relatedVehicle(item.vehicles); const due = dueTone(daysUntil(item.expires_on, today)); return <div className="vehicle-alert-item" key={item.id}><span className="vehicle-alert-icon"><AppIcon name="inspection" size={18} /></span><div><strong>{vehicle?.vehicle_name || "Chưa rõ xe"}</strong><small>{vehicle?.license_plate || "Chưa có biển số"} · hết hạn {formatDate(item.expires_on)}</small></div><span className={`status-pill ${due.className}`}>{due.label}</span></div>; })}
              {!upcoming.length ? <div className="vehicle-overview-empty"><span><AppIcon name="checkCircle" size={22} /></span><div><strong>Chưa có đăng kiểm cần xử lý</strong><p>Các xe trong hạn nhắc sẽ xuất hiện tại đây.</p></div></div> : null}
            </div>
          </article>
          <article className="panel vehicle-overview-card vehicle-overview-card--insurance">
            <div className="panel-heading"><div><p className="eyebrow">BẢO HIỂM XE</p><h2>Bảo hiểm sắp hết hạn</h2></div><Link className="text-link" href="/vehicles?section=insurance">Xem chi tiết →</Link></div>
            <div className="vehicle-alert-list">
              {upcomingInsurance.slice(0, 5).map((item) => { const vehicle = relatedVehicle(item.vehicles); const due = dueTone(daysUntil(item.expires_on, today)); return <div className="vehicle-alert-item" key={item.id}><span className="vehicle-alert-icon"><AppIcon name="insurance" size={18} /></span><div><strong>{vehicle?.vehicle_name || "Chưa rõ xe"}</strong><small>{vehicle?.license_plate || "Chưa có biển số"} · hết hạn {formatDate(item.expires_on)}</small></div><span className={`status-pill ${due.className}`}>{due.label}</span></div>; })}
              {!upcomingInsurance.length ? <div className="vehicle-overview-empty"><span><AppIcon name="checkCircle" size={22} /></span><div><strong>Chưa có bảo hiểm cần xử lý</strong><p>Hợp đồng đến hạn nhắc sẽ xuất hiện tại đây.</p></div></div> : null}
            </div>
          </article>
          <article className="panel vehicle-overview-card vehicle-overview-card--fleet">
            <div className="panel-heading"><div><p className="eyebrow">HỒ SƠ XE</p><h2>Tình trạng phương tiện</h2></div><Link className="text-link" href="/vehicles?section=fleet">Mở danh sách →</Link></div>
            <div className="vehicle-status-summary">
              <div className="vehicle-status-row vehicle-status-row--active"><span><i />Đang sử dụng</span><strong>{activeVehicles}</strong></div>
              <div className="vehicle-status-row vehicle-status-row--maintenance"><span><i />Đang sửa chữa</span><strong>{maintenanceVehicles}</strong></div>
              <div className="vehicle-status-row vehicle-status-row--inactive"><span><i />Ngừng dùng / thanh lý</span><strong>{inactiveVehicles}</strong></div>
              <div className="vehicle-status-total"><span>Tổng hồ sơ</span><strong>{vehicles.length} xe</strong></div>
            </div>
          </article>
        </section>
      </> : null}

      {section === "fleet" ? <section className="panel vehicle-section-panel vehicle-section-panel--fleet">
        <div className="panel-heading"><div><p className="eyebrow">DANH SÁCH XE</p><h2>Hồ sơ phương tiện</h2></div><small>{vehicles.length} xe</small></div>
        <div className="table-wrap"><table><thead><tr><th>Mã / xe</th><th>Biển số</th><th>Số chỗ</th><th>Tài xế</th><th>Định mức</th><th>Đăng kiểm gần nhất</th><th>Trạng thái</th><th className="vehicle-actions-column">Thao tác</th></tr></thead><tbody>
          {vehicles.map((vehicle) => {
            const inspection = latestInspectionByVehicle.get(vehicle.id);
            const due = inspection ? dueTone(daysUntil(inspection.expires_on, today)) : null;
            const statusLabel = vehicle.status === "ACTIVE" ? "Đang sử dụng" : vehicle.status === "MAINTENANCE" ? "Đang sửa chữa" : vehicle.status === "LIQUIDATED" ? "Đã thanh lý" : "Ngừng sử dụng";
            return <InteractiveTableRow key={vehicle.id}>
              <td><strong>{vehicle.vehicle_name}</strong><small>{vehicle.vehicle_code} · {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Chưa có hãng/model"}</small></td>
              <td><strong>{vehicle.license_plate}</strong><small>{vehicle.production_year || "Chưa có năm SX"}</small></td>
              <td><strong>{vehicle.seat_count ? `${vehicle.seat_count} chỗ` : "—"}</strong></td>
              <td>{vehicle.assigned_driver || "—"}<small>{vehicle.departments?.[0]?.name}</small></td>
              <td>{vehicle.fuel_norm_l_per_100km ? `${vehicle.fuel_norm_l_per_100km} l/100 km` : "—"}</td>
              <td>{inspection ? <><strong>{formatDate(inspection.expires_on)}</strong><small><span className={`status-pill ${due?.className}`}>{due?.label}</span></small></> : <span className="text-danger">Chưa có đăng kiểm</span>}</td>
              <td><span className={`status-pill ${vehicle.status === "ACTIVE" ? "status-pill--active" : vehicle.status === "MAINTENANCE" ? "status-pill--attention" : "status-pill--inactive"}`}>{statusLabel}</span></td>
              <td className="vehicle-actions-column"><div className="row-actions">
                <ModalTrigger description={`${vehicle.vehicle_code} · ${vehicle.license_plate}`} eyebrow="CHI TIẾT HỒ SƠ XE" size="medium" title={vehicle.vehicle_name} triggerClassName="text-button row-detail-trigger" triggerLabel="Xem">
                  <div className="vehicle-record-detail">
                    <VehicleDetailGrid fields={[
                      { label: "Mã xe", value: vehicle.vehicle_code },
                      { label: "Biển số", value: vehicle.license_plate },
                      { label: "Hãng / model", value: [vehicle.brand, vehicle.model].filter(Boolean).join(" ") },
                      { label: "Năm sản xuất", value: vehicle.production_year },
                      { label: "Số chỗ", value: vehicle.seat_count ? `${vehicle.seat_count} chỗ` : null },
                      { label: "Định mức nhiên liệu", value: vehicle.fuel_norm_l_per_100km ? `${vehicle.fuel_norm_l_per_100km} l/100 km` : null },
                      { label: "Tài xế", value: vehicle.assigned_driver },
                      { label: "Phòng ban", value: vehicle.departments?.[0]?.name },
                      { label: "Trạng thái", value: statusLabel },
                      { label: "Hạn đăng kiểm gần nhất", value: inspection ? formatDate(inspection.expires_on) : null },
                    ]} />
                    <VehicleDetailNote note={vehicle.note} />
                  </div>
                </ModalTrigger>
                {canManage ? <ModalTrigger description="Cập nhật thông tin nhận diện, phân công và trạng thái xe." eyebrow="HỒ SƠ XE" size="large" title="Sửa hồ sơ xe" triggerClassName="text-button" triggerLabel="Sửa"><VehicleForm departments={departmentsResult.data ?? []} users={usersResult.data ?? []} initial={{ id: vehicle.id, vehicle_code: vehicle.vehicle_code, vehicle_name: vehicle.vehicle_name, license_plate: vehicle.license_plate, brand: vehicle.brand, model: vehicle.model, production_year: vehicle.production_year, seat_count: vehicle.seat_count, fuel_norm_l_per_100km: vehicle.fuel_norm_l_per_100km, assigned_driver: vehicle.assigned_driver, department_id: vehicle.department_id, responsible_user_id: vehicle.responsible_user_id, status: vehicle.status as "ACTIVE" | "MAINTENANCE" | "INACTIVE" | "LIQUIDATED", note: vehicle.note }} /></ModalTrigger> : null}
                {canDelete ? <ConfirmAction action={deleteVehicleRecord} description="Xe sẽ được ẩn khỏi danh sách quản lý. Toàn bộ đăng kiểm, bảo dưỡng và nhiên liệu đã ghi nhận vẫn được giữ lại." fields={{ id: vehicle.id, kind: "vehicle" }} title="Xóa hồ sơ xe?" /> : null}
              </div></td>
            </InteractiveTableRow>;
          })}
          {!vehicles.length ? <tr><td className="empty-cell" colSpan={8}>Chưa có hồ sơ xe. Bạn có thể thêm thủ công hoặc nhập từ file XLSX mẫu.</td></tr> : null}
        </tbody></table></div>
      </section> : null}

      {section === "inspections" ? <section className="panel vehicle-section-panel vehicle-section-panel--inspections">
        <div className="panel-heading"><div><p className="eyebrow">ĐĂNG KIỂM</p><h2>Lịch sử và hạn sắp tới</h2></div><small>{inspectionsTotal} lần</small></div>
        <div className="table-wrap"><table><thead><tr><th>Xe</th><th>Ngày đăng kiểm</th><th>Ngày hết hạn</th><th>Số chỗ</th><th>Chi phí</th><th>Thông tin</th><th>Hóa đơn</th><th className="vehicle-actions-column">Thao tác</th></tr></thead><tbody>
          {visibleInspections.map((item) => {
            const vehicle = relatedVehicle(item.vehicles);
            const due = dueTone(daysUntil(item.expires_on, today));
            const document = documentByRecord.get(`INSPECTION:${item.id}:INVOICE`);
            return <InteractiveTableRow key={item.id}>
              <td><strong>{vehicle?.vehicle_name}</strong><small>{vehicle?.license_plate}</small></td>
              <td>{formatDate(item.inspection_date)}</td>
              <td><strong>{formatDate(item.expires_on)}</strong><small><span className={`status-pill ${due.className}`}>{due.label}</span></small></td>
              <td>{item.seat_count ? `${item.seat_count} chỗ` : "—"}</td>
              <td>{formatMoney(Number(item.cost))}</td>
              <td>{item.certificate_number || "—"}<small>{item.inspection_center || `Nhắc trước ${item.reminder_days} ngày`}</small></td>
              <td><VehicleDocumentLink document={document} /></td>
              <td className="vehicle-actions-column"><div className="row-actions">
                <ModalTrigger description={`${vehicle?.license_plate ?? "Chưa có biển số"} · ${vehicle?.vehicle_name ?? "Chưa rõ xe"}`} eyebrow="CHI TIẾT ĐĂNG KIỂM" size="medium" title={`Đăng kiểm ngày ${formatDate(item.inspection_date)}`} triggerClassName="text-button row-detail-trigger" triggerLabel="Xem">
                  <div className="vehicle-record-detail">
                    <VehicleDetailGrid fields={[
                      { label: "Xe", value: vehicle?.vehicle_name },
                      { label: "Biển số", value: vehicle?.license_plate },
                      { label: "Ngày đăng kiểm", value: formatDate(item.inspection_date) },
                      { label: "Ngày hết hạn", value: formatDate(item.expires_on) },
                      { label: "Tình trạng", value: due.label },
                      { label: "Nhắc trước", value: `${item.reminder_days} ngày` },
                      { label: "Số chỗ", value: item.seat_count ? `${item.seat_count} chỗ` : null },
                      { label: "Số km", value: item.odometer_km ? `${Number(item.odometer_km).toLocaleString("vi-VN")} km` : null },
                      { label: "Chi phí", value: formatMoney(Number(item.cost)) },
                      { label: "Số chứng nhận", value: item.certificate_number },
                      { label: "Trung tâm đăng kiểm", value: item.inspection_center, wide: true },
                    ]} />
                    <VehicleDetailNote note={item.note} />
                    <VehicleDocumentDetail document={document} />
                    {canManage || canDelete ? (
                      <div className="vehicle-detail-actions modal-actions">
                        {canManage ? <>
                          <ModalTrigger
                            closeParentOnSuccess
                            description={`Tạo lần đăng kiểm kế tiếp cho ${vehicle?.license_plate ?? vehicle?.vehicle_name ?? "xe này"}. Hồ sơ hiện tại vẫn được giữ nguyên trong lịch sử.`}
                            eyebrow="GIA HẠN ĐĂNG KIỂM"
                            size="large"
                            title="Gia hạn đăng kiểm"
                            triggerClassName="secondary-button"
                            triggerLabel="Gia hạn đăng kiểm"
                          >
                            <InspectionForm
                              mode="renew"
                              vehicles={vehicleOptions}
                              initial={{
                                vehicle_id: item.vehicle_id,
                                inspection_date: "",
                                expires_on: "",
                                cost: 0,
                                reminder_days: item.reminder_days,
                                certificate_number: "",
                                inspection_center: item.inspection_center,
                                seat_count: item.seat_count,
                                odometer_km: item.odometer_km,
                                note: `Gia hạn từ hồ sơ đăng kiểm ngày ${formatDate(item.inspection_date)}.`,
                              }}
                            />
                          </ModalTrigger>
                          <ModalTrigger closeParentOnSuccess description="Cập nhật thời hạn, số chỗ, chi phí và thông tin đăng kiểm." eyebrow="ĐĂNG KIỂM" size="large" title="Sửa đăng kiểm" triggerClassName="primary-button" triggerLabel="Sửa đăng kiểm"><InspectionForm vehicles={vehicleOptions} initial={{ id: item.id, vehicle_id: item.vehicle_id, inspection_date: item.inspection_date, expires_on: item.expires_on, cost: item.cost, reminder_days: item.reminder_days, certificate_number: item.certificate_number, inspection_center: item.inspection_center, seat_count: item.seat_count, odometer_km: item.odometer_km, note: item.note, invoice_file_name: document?.file_name }} /></ModalTrigger>
                        </> : null}
                        {canDelete ? <ConfirmAction action={deleteVehicleRecord} closeParentOnSuccess confirmLabel="Xóa đăng kiểm" description="Bản ghi đăng kiểm sẽ bị xóa khỏi lịch sử." fields={{ id: item.id, kind: "inspection" }} title="Xóa đăng kiểm?" triggerAriaLabel={`Xóa đăng kiểm ngày ${formatDate(item.inspection_date)}`} triggerClassName="danger-button" triggerLabel="Xóa đăng kiểm" /> : null}
                      </div>
                    ) : null}
                  </div>
                </ModalTrigger>
                {canManage ? <ModalTrigger description="Cập nhật thời hạn, số chỗ, chi phí và thông tin đăng kiểm." eyebrow="ĐĂNG KIỂM" size="large" title="Sửa đăng kiểm" triggerClassName="text-button" triggerLabel="Sửa"><InspectionForm vehicles={vehicleOptions} initial={{ id: item.id, vehicle_id: item.vehicle_id, inspection_date: item.inspection_date, expires_on: item.expires_on, cost: item.cost, reminder_days: item.reminder_days, certificate_number: item.certificate_number, inspection_center: item.inspection_center, seat_count: item.seat_count, odometer_km: item.odometer_km, note: item.note, invoice_file_name: document?.file_name }} /></ModalTrigger> : null}
                {canDelete ? <ConfirmAction action={deleteVehicleRecord} description="Bản ghi đăng kiểm sẽ bị xóa khỏi lịch sử." fields={{ id: item.id, kind: "inspection" }} title="Xóa đăng kiểm?" /> : null}
              </div></td>
            </InteractiveTableRow>;
          })}
          {!inspections.length ? <tr><td className="empty-cell" colSpan={8}>Chưa có lịch sử đăng kiểm.</td></tr> : null}
        </tbody></table></div>
        <VehiclePagination page={inspectionsPage} section="inspections" totalRows={inspectionsTotal} />
      </section> : null}

      {section === "insurance" ? <section className="panel vehicle-section-panel vehicle-section-panel--insurance">
        <div className="panel-heading"><div><p className="eyebrow">BẢO HIỂM XE</p><h2>Hợp đồng và hồ sơ bảo hiểm</h2></div><small>{insurancesTotal} hợp đồng</small></div>
        <div className="table-wrap"><table><thead><tr><th>Xe</th><th>Bảo hiểm</th><th>Ngày bắt đầu</th><th>Ngày hết hạn</th><th>Hãng / chứng nhận</th><th>Chi phí</th><th>Hồ sơ PDF</th><th className="vehicle-actions-column">Thao tác</th></tr></thead><tbody>
          {visibleInsurances.map((item) => {
            const vehicle = relatedVehicle(item.vehicles);
            const remainingDays = daysUntil(item.expires_on, today);
            const due = dueTone(remainingDays);
            const canRenewNow = remainingDays <= item.reminder_days;
            const renewalPeriod = nextInsurancePeriod(item.expires_on);
            const invoiceDocument = documentByRecord.get(`INSURANCE:${item.id}:INVOICE`);
            const certificateDocument = documentByRecord.get(`INSURANCE:${item.id}:CERTIFICATE`);
            return <InteractiveTableRow key={item.id}>
              <td><strong>{vehicle?.vehicle_name}</strong><small>{vehicle?.license_plate}</small></td>
              <td><strong>{item.insurance_name}</strong><small>{settingLabel(insuranceTypeLabels, item.insurance_type)}</small></td>
              <td>{formatDate(item.starts_on)}</td>
              <td><strong>{formatDate(item.expires_on)}</strong><small><span className={`status-pill ${due.className}`}>{due.label}</span></small></td>
              <td>{item.insurance_company}<small>{item.certificate_number || "Chưa có số chứng nhận"}</small></td>
              <td>{formatMoney(Number(item.cost))}</td>
              <td><div className="vehicle-document-stack"><VehicleDocumentLink document={invoiceDocument} label="Hóa đơn" /><VehicleDocumentLink document={certificateDocument} label="Chứng nhận" /></div></td>
              <td className="vehicle-actions-column"><div className="row-actions">
                <ModalTrigger description={`${vehicle?.license_plate ?? "Chưa có biển số"} · ${vehicle?.vehicle_name ?? "Chưa rõ xe"}`} eyebrow="CHI TIẾT BẢO HIỂM" size="medium" title={item.insurance_name} triggerClassName="text-button row-detail-trigger" triggerLabel="Xem">
                  <div className="vehicle-record-detail">
                    <VehicleDetailGrid fields={[
                      { label: "Xe", value: vehicle?.vehicle_name },
                      { label: "Biển số", value: vehicle?.license_plate },
                      { label: "Tên bảo hiểm", value: item.insurance_name },
                      { label: "Loại bảo hiểm", value: settingLabel(insuranceTypeLabels, item.insurance_type) },
                      { label: "Hãng bảo hiểm", value: item.insurance_company },
                      { label: "Số giấy chứng nhận", value: item.certificate_number },
                      { label: "Ngày bắt đầu", value: formatDate(item.starts_on) },
                      { label: "Ngày kết thúc", value: formatDate(item.expires_on) },
                      { label: "Tình trạng", value: due.label },
                      { label: "Nhắc trước", value: `${item.reminder_days} ngày` },
                      { label: "Chi phí", value: formatMoney(Number(item.cost)) },
                    ]} />
                    <VehicleDetailNote note={item.note} />
                    <VehicleInsuranceRenewalHistory current={item as InsuranceRenewalRecord} records={insuranceRecordsById} />
                    <VehicleDocumentDetail document={invoiceDocument} label="Hóa đơn bảo hiểm PDF" />
                    <VehicleDocumentDetail document={certificateDocument} label="Giấy chứng nhận bảo hiểm PDF" />
                    {canManage || canDelete ? <div className="vehicle-detail-actions modal-actions">
                      {canManage && canRenewNow ? <ModalTrigger closeParentOnSuccess description="Tạo kỳ bảo hiểm mới, ẩn kỳ cũ khỏi danh sách và lưu ngày, người thực hiện trong nhật ký gia hạn." eyebrow="GIA HẠN BẢO HIỂM" size="large" title="Gia hạn bảo hiểm" triggerClassName="secondary-button" triggerLabel="Gia hạn bảo hiểm"><InsuranceForm mode="renew" renewFromId={item.id} insuranceTypes={activeInsuranceTypes} vehicles={vehicleOptions} initial={{ vehicle_id: item.vehicle_id, insurance_name: item.insurance_name, insurance_type: item.insurance_type, insurance_company: item.insurance_company, certificate_number: "", starts_on: renewalPeriod.startsOn, expires_on: renewalPeriod.expiresOn, cost: item.cost, reminder_days: item.reminder_days, note: `Gia hạn từ hợp đồng hết hạn ngày ${formatDate(item.expires_on)}.` }} /></ModalTrigger> : null}
                      {canManage ? <ModalTrigger closeParentOnSuccess description="Cập nhật hợp đồng, thời hạn, cảnh báo và hồ sơ PDF." eyebrow="BẢO HIỂM XE" size="large" title="Sửa bảo hiểm" triggerClassName="primary-button" triggerLabel="Sửa bảo hiểm"><InsuranceForm insuranceTypes={activeInsuranceTypes} vehicles={vehicleOptions} initial={{ id: item.id, vehicle_id: item.vehicle_id, insurance_name: item.insurance_name, insurance_type: item.insurance_type, insurance_company: item.insurance_company, certificate_number: item.certificate_number, starts_on: item.starts_on, expires_on: item.expires_on, cost: item.cost, reminder_days: item.reminder_days, note: item.note, invoice_file_name: invoiceDocument?.file_name, certificate_file_name: certificateDocument?.file_name }} /></ModalTrigger> : null}
                      {canDelete ? <ConfirmAction action={deleteVehicleRecord} closeParentOnSuccess confirmLabel="Xóa bảo hiểm" description="Hợp đồng bảo hiểm sẽ bị xóa khỏi lịch sử." fields={{ id: item.id, kind: "insurance" }} title="Xóa bảo hiểm?" triggerAriaLabel={`Xóa bảo hiểm ${item.insurance_name}`} triggerClassName="danger-button" triggerLabel="Xóa bảo hiểm" /> : null}
                    </div> : null}
                  </div>
                </ModalTrigger>
                {canManage ? <ModalTrigger description="Cập nhật hợp đồng, thời hạn, cảnh báo và hồ sơ PDF." eyebrow="BẢO HIỂM XE" size="large" title="Sửa bảo hiểm" triggerClassName="text-button" triggerLabel="Sửa"><InsuranceForm insuranceTypes={activeInsuranceTypes} vehicles={vehicleOptions} initial={{ id: item.id, vehicle_id: item.vehicle_id, insurance_name: item.insurance_name, insurance_type: item.insurance_type, insurance_company: item.insurance_company, certificate_number: item.certificate_number, starts_on: item.starts_on, expires_on: item.expires_on, cost: item.cost, reminder_days: item.reminder_days, note: item.note, invoice_file_name: invoiceDocument?.file_name, certificate_file_name: certificateDocument?.file_name }} /></ModalTrigger> : null}
                {canDelete ? <ConfirmAction action={deleteVehicleRecord} description="Hợp đồng bảo hiểm sẽ bị xóa khỏi lịch sử." fields={{ id: item.id, kind: "insurance" }} title="Xóa bảo hiểm?" /> : null}
              </div></td>
            </InteractiveTableRow>;
          })}
          {!insurances.length ? <tr><td className="empty-cell" colSpan={8}>Chưa có hồ sơ bảo hiểm xe.</td></tr> : null}
        </tbody></table></div>
        <VehiclePagination page={insurancePage} section="insurance" totalRows={insurancesTotal} />
      </section> : null}

      {section === "repairs" ? <section className="panel vehicle-section-panel vehicle-section-panel--repairs">
        <div className="panel-heading"><div><p className="eyebrow">BẢO DƯỠNG & SỬA CHỮA</p><h2>Nhật ký phương tiện</h2></div><small>{repairsTotal} bản ghi</small></div>
        <div className="table-wrap"><table className="vehicle-record-table vehicle-repair-table"><colgroup><col className="vehicle-date-col" /><col className="vehicle-description-col" /><col className="vehicle-cost-col" /><col className="vehicle-document-col" /><col className="vehicle-action-col" /></colgroup><thead><tr><th>Ngày / xe</th><th>Nội dung</th><th className="vehicle-cost-cell">Chi phí</th><th>Hóa đơn</th><th className="vehicle-actions-column">Thao tác</th></tr></thead><tbody>
          {visibleRepairs.map((item) => {
            const vehicle = relatedVehicle(item.vehicles);
            const document = documentByRecord.get(`REPAIR:${item.id}:INVOICE`);
            return <InteractiveTableRow key={item.id}>
              <td><strong>{formatDate(item.service_date)}</strong><small>{vehicle?.license_plate} · {vehicle?.vehicle_name}</small></td>
              <td className="vehicle-description-cell"><strong>{item.description}</strong><small>{settingLabel(maintenanceTypeLabels, item.service_type)}{item.source_file ? ` · nhập từ ${item.source_file}` : ""}</small></td>
              <td className="vehicle-cost-cell">{formatMoney(Number(item.vat_amount))}</td>
              <td><VehicleDocumentLink document={document} /></td>
              <td className="vehicle-actions-column"><div className="row-actions">
                <ModalTrigger description={`${vehicle?.license_plate ?? "Chưa có biển số"} · ${vehicle?.vehicle_name ?? "Chưa rõ xe"}`} eyebrow="CHI TIẾT BẢO DƯỠNG" size="medium" title={settingLabel(maintenanceTypeLabels, item.service_type)} triggerClassName="text-button row-detail-trigger" triggerLabel="Xem">
                  <div className="vehicle-record-detail">
                    <VehicleDetailGrid fields={[
                      { label: "Xe", value: vehicle?.vehicle_name },
                      { label: "Biển số", value: vehicle?.license_plate },
                      { label: "Ngày thực hiện", value: formatDate(item.service_date) },
                      { label: "Hình thức", value: settingLabel(maintenanceTypeLabels, item.service_type) },
                      { label: "Số km", value: item.odometer_km ? `${Number(item.odometer_km).toLocaleString("vi-VN")} km` : null },
                      { label: "Chi phí", value: formatMoney(Number(item.vat_amount)) },
                      { label: "Đơn vị thực hiện", value: item.vendor },
                      { label: "Số hóa đơn", value: item.invoice_number },
                      { label: "Nội dung thực hiện", value: item.description, wide: true },
                      { label: "Nguồn dữ liệu", value: item.source_file ? `Nhập từ ${item.source_file}` : null, wide: true },
                    ]} />
                    <VehicleDetailNote note={item.note} />
                    <VehicleDocumentDetail document={document} />
                    {canManage || canDelete ? <div className="vehicle-detail-actions modal-actions">
                      {canManage ? <ModalTrigger closeParentOnSuccess description="Cập nhật nội dung, đơn vị thực hiện, số km và chi phí." eyebrow="BẢO DƯỠNG" size="large" title="Sửa bảo dưỡng" triggerClassName="primary-button" triggerLabel="Sửa bảo dưỡng"><RepairForm maintenanceTypes={activeMaintenanceTypes} vehicles={vehicleOptions} initial={{ id: item.id, vehicle_id: item.vehicle_id, service_date: item.service_date, service_type: item.service_type, description: item.description, odometer_km: item.odometer_km, vat_amount: item.vat_amount, vendor: item.vendor, invoice_number: item.invoice_number, note: item.note, invoice_file_name: document?.file_name }} /></ModalTrigger> : null}
                      {canDelete ? <ConfirmAction action={deleteVehicleRecord} closeParentOnSuccess confirmLabel="Xóa bảo dưỡng" description="Bản ghi bảo dưỡng sẽ bị xóa khỏi lịch sử." fields={{ id: item.id, kind: "repair" }} title="Xóa bảo dưỡng?" triggerAriaLabel={`Xóa bảo dưỡng ngày ${formatDate(item.service_date)}`} triggerClassName="danger-button" triggerLabel="Xóa bảo dưỡng" /> : null}
                    </div> : null}
                  </div>
                </ModalTrigger>
                {canManage ? <ModalTrigger description="Cập nhật nội dung, đơn vị thực hiện, số km và chi phí." eyebrow="BẢO DƯỠNG" size="large" title="Sửa bảo dưỡng" triggerClassName="text-button" triggerLabel="Sửa"><RepairForm maintenanceTypes={activeMaintenanceTypes} vehicles={vehicleOptions} initial={{ id: item.id, vehicle_id: item.vehicle_id, service_date: item.service_date, service_type: item.service_type, description: item.description, odometer_km: item.odometer_km, vat_amount: item.vat_amount, vendor: item.vendor, invoice_number: item.invoice_number, note: item.note, invoice_file_name: document?.file_name }} /></ModalTrigger> : null}
                {canDelete ? <ConfirmAction action={deleteVehicleRecord} description="Bản ghi bảo dưỡng sẽ bị xóa khỏi lịch sử." fields={{ id: item.id, kind: "repair" }} title="Xóa bảo dưỡng?" /> : null}
              </div></td>
            </InteractiveTableRow>;
          })}
          {!repairs.length ? <tr><td className="empty-cell" colSpan={5}>Chưa có lịch sử bảo dưỡng.</td></tr> : null}
        </tbody></table></div>
        <VehiclePagination page={repairsPage} section="repairs" totalRows={repairsTotal} />
      </section> : null}

      {section === "fuel" ? <section className="panel vehicle-section-panel vehicle-section-panel--fuel">
        <div className="panel-heading"><div><p className="eyebrow">NHIÊN LIỆU</p><h2>Sổ theo dõi mua nhiên liệu</h2></div><small>{fuelTotal} bản ghi</small></div>
        <div className="table-wrap"><table className="vehicle-record-table vehicle-fuel-table"><colgroup><col className="vehicle-date-col" /><col className="vehicle-liters-col" /><col className="vehicle-journey-col" /><col className="vehicle-cost-col" /><col className="vehicle-document-col" /><col className="vehicle-action-col" /></colgroup><thead><tr><th>Ngày / xe</th><th>Số lít</th><th>Hành trình km</th><th className="vehicle-cost-cell">Chi phí</th><th>Hóa đơn</th><th className="vehicle-actions-column">Thao tác</th></tr></thead><tbody>
          {visibleFuelLogs.map((item) => {
            const vehicle = relatedVehicle(item.vehicles);
            const document = documentByRecord.get(`FUEL:${item.id}:INVOICE`);
            const distance = item.odometer_from != null && item.odometer_to != null ? Number(item.odometer_to) - Number(item.odometer_from) : null;
            return <InteractiveTableRow key={item.id}>
              <td><strong>{formatDate(item.payment_date)}</strong><small>{vehicle?.license_plate} · {vehicle?.vehicle_name}</small></td>
              <td>{Number(item.liters).toLocaleString("vi-VN")} lít</td>
              <td>{item.odometer_from ?? "—"} → {item.odometer_to ?? "—"}<small>{distance != null ? `${distance.toLocaleString("vi-VN")} km` : ""}</small></td>
              <td className="vehicle-cost-cell">{formatMoney(Number(item.amount))}</td>
              <td><VehicleDocumentLink document={document} /></td>
              <td className="vehicle-actions-column"><div className="row-actions">
                <ModalTrigger description={`${vehicle?.license_plate ?? "Chưa có biển số"} · ${vehicle?.vehicle_name ?? "Chưa rõ xe"}`} eyebrow="CHI TIẾT NHIÊN LIỆU" size="medium" title={`Mua nhiên liệu ngày ${formatDate(item.payment_date)}`} triggerClassName="text-button row-detail-trigger" triggerLabel="Xem">
                  <div className="vehicle-record-detail">
                    <VehicleDetailGrid fields={[
                      { label: "Xe", value: vehicle?.vehicle_name },
                      { label: "Biển số", value: vehicle?.license_plate },
                      { label: "Ngày thanh toán", value: formatDate(item.payment_date) },
                      { label: "Số lít", value: `${Number(item.liters).toLocaleString("vi-VN")} lít` },
                      { label: "Số km từ", value: item.odometer_from != null ? Number(item.odometer_from).toLocaleString("vi-VN") : null },
                      { label: "Số km đến", value: item.odometer_to != null ? Number(item.odometer_to).toLocaleString("vi-VN") : null },
                      { label: "Quãng đường", value: distance != null ? `${distance.toLocaleString("vi-VN")} km` : null },
                      { label: "Chi phí", value: formatMoney(Number(item.amount)) },
                      { label: "Người mua / tài xế", value: item.purchaser },
                      { label: "Nguồn dữ liệu", value: item.source_file ? `Nhập từ ${item.source_file}` : null, wide: true },
                    ]} />
                    <VehicleDetailNote note={item.note} />
                    <VehicleDocumentDetail document={document} />
                    {canManage || canDelete ? <div className="vehicle-detail-actions modal-actions">
                      {canManage ? <ModalTrigger closeParentOnSuccess description="Cập nhật số lít, hành trình, người mua và số tiền." eyebrow="NHIÊN LIỆU" size="large" title="Sửa nhiên liệu" triggerClassName="primary-button" triggerLabel="Sửa nhiên liệu"><FuelForm vehicles={vehicleOptions} initial={{ id: item.id, vehicle_id: item.vehicle_id, payment_date: item.payment_date, liters: item.liters, odometer_from: item.odometer_from, odometer_to: item.odometer_to, amount: item.amount, purchaser: item.purchaser, note: item.note, invoice_file_name: document?.file_name }} /></ModalTrigger> : null}
                      {canDelete ? <ConfirmAction action={deleteVehicleRecord} closeParentOnSuccess confirmLabel="Xóa nhiên liệu" description="Bản ghi nhiên liệu sẽ bị xóa khỏi lịch sử." fields={{ id: item.id, kind: "fuel" }} title="Xóa nhiên liệu?" triggerAriaLabel={`Xóa nhiên liệu ngày ${formatDate(item.payment_date)}`} triggerClassName="danger-button" triggerLabel="Xóa nhiên liệu" /> : null}
                    </div> : null}
                  </div>
                </ModalTrigger>
                {canManage ? <ModalTrigger description="Cập nhật số lít, hành trình, người mua và số tiền." eyebrow="NHIÊN LIỆU" size="large" title="Sửa nhiên liệu" triggerClassName="text-button" triggerLabel="Sửa"><FuelForm vehicles={vehicleOptions} initial={{ id: item.id, vehicle_id: item.vehicle_id, payment_date: item.payment_date, liters: item.liters, odometer_from: item.odometer_from, odometer_to: item.odometer_to, amount: item.amount, purchaser: item.purchaser, note: item.note, invoice_file_name: document?.file_name }} /></ModalTrigger> : null}
                {canDelete ? <ConfirmAction action={deleteVehicleRecord} description="Bản ghi nhiên liệu sẽ bị xóa khỏi lịch sử." fields={{ id: item.id, kind: "fuel" }} title="Xóa nhiên liệu?" /> : null}
              </div></td>
            </InteractiveTableRow>;
          })}
          {!fuelLogs.length ? <tr><td className="empty-cell" colSpan={6}>Chưa có lịch sử nhiên liệu.</td></tr> : null}
        </tbody></table></div>
        <VehiclePagination page={fuelPage} section="fuel" totalRows={fuelTotal} />
      </section> : null}

      {section === "settings" ? <section className="settings-catalog-grid vehicle-settings-grid">
        {vehicleSettingTypes.map((settingType) => {
          const rows = vehicleSettings.filter((item) => item.setting_type === settingType);
          const activeRows = rows.filter((item) => item.active);
          const definition = vehicleSettingTypeDefinitions[settingType];
          return <article className="panel setting-group-card" key={settingType}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">CẤU HÌNH XE</p>
                <h2>{definition.label}</h2>
                <small>{definition.description}</small>
              </div>
              {canManage ? <ModalTrigger description={definition.description} eyebrow="CẤU HÌNH XE" size="medium" title={`Thêm ${definition.label.toLowerCase()}`} triggerClassName="secondary-button" triggerLabel="+ Thêm"><VehicleSettingEditor settingType={settingType} /></ModalTrigger> : <span className="status-pill">{activeRows.length} đang dùng</span>}
            </div>
            <div className="setting-list">
              {rows.map((setting) => {
                const activeIndex = activeRows.findIndex((item) => item.id === setting.id);
                return <div className={`setting-item ${setting.active ? "" : "setting-item-inactive"}`} key={setting.id}>
                  <div className="setting-item-copy">
                    <strong>{setting.display_name}</strong>
                    <small>{setting.setting_value}</small>
                  </div>
                  {canManage ? <div className="row-actions">
                    {setting.active ? <>
                      <form action={moveVehicleSetting}>
                        <input name="id" type="hidden" value={setting.id} />
                        <input name="direction" type="hidden" value="up" />
                        <button aria-label={`Đưa ${setting.display_name} lên`} className="order-button" disabled={activeIndex === 0} type="submit">↑</button>
                      </form>
                      <form action={moveVehicleSetting}>
                        <input name="id" type="hidden" value={setting.id} />
                        <input name="direction" type="hidden" value="down" />
                        <button aria-label={`Đưa ${setting.display_name} xuống`} className="order-button" disabled={activeIndex === activeRows.length - 1} type="submit">↓</button>
                      </form>
                    </> : null}
                    <ModalTrigger description="Đổi tên sẽ cập nhật các hồ sơ xe đang liên kết." eyebrow="SỬA CẤU HÌNH XE" size="medium" title={setting.display_name} triggerClassName="text-button" triggerLabel="Sửa"><VehicleSettingEditor setting={setting} settingType={settingType} /></ModalTrigger>
                    <form action={toggleVehicleSetting}>
                      <input name="id" type="hidden" value={setting.id} />
                      <input name="active" type="hidden" value={String(!setting.active)} />
                      <button className={`text-button ${setting.active ? "text-danger" : ""}`} type="submit">{setting.active ? "Ngừng dùng" : "Bật lại"}</button>
                    </form>
                  </div> : null}
                </div>;
              })}
              {!rows.length ? <p className="empty-setting">Chưa có cấu hình.</p> : null}
            </div>
          </article>;
        })}
      </section> : null}
    </>
  );
}
