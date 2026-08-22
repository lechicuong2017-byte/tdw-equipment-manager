import Link from "next/link";
import type { ReactNode } from "react";
import { ConfirmAction, ModalTrigger } from "@/components/app-modal";
import { AppIcon } from "@/components/app-icon";
import { PageHeader } from "@/components/page-header";
import { FuelForm, InspectionForm, RepairForm, VehicleActions, VehicleForm } from "@/components/vehicle-forms";
import { VehicleModuleNav } from "@/components/vehicle-module-nav";
import { can, requireAccess } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { deleteVehicleRecord } from "./actions";

export const metadata = { title: "Quản lý xe" };

type VehicleSection = "overview" | "fleet" | "inspections" | "repairs" | "fuel";

type VehicleRelation = { id?: string; vehicle_code?: string; vehicle_name?: string; license_plate?: string } | { id?: string; vehicle_code?: string; vehicle_name?: string; license_plate?: string }[] | null;
function relatedVehicle(value: VehicleRelation) { return Array.isArray(value) ? value[0] : value; }

type VehicleDocument = {
  file_name: string;
  id: string;
  record_id: string;
  record_type: "INSPECTION" | "REPAIR" | "FUEL";
  stored_byte_size: number | string;
};

function formatFileSize(value: number | string) {
  const bytes = Number(value || 0);
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function VehicleDocumentLink({ document }: { document?: VehicleDocument }) {
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
      <span>Hóa đơn PDF<small>{formatFileSize(document.stored_byte_size)}</small></span>
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

function VehicleDocumentDetail({ document }: { document?: VehicleDocument }) {
  return (
    <section className={`vehicle-record-document ${document ? "vehicle-record-document--ready" : ""}`}>
      <span className="vehicle-record-document-icon"><AppIcon name="reports" size={21} /></span>
      <div>
        <strong>Hóa đơn / chứng từ PDF</strong>
        {document ? <p title={document.file_name}>{document.file_name} · {formatFileSize(document.stored_byte_size)}</p> : <p>Chưa có tài liệu đính kèm cho bản ghi này.</p>}
      </div>
      {document ? <div className="vehicle-record-document-actions">
        <a className="secondary-button" href={`/api/vehicle-documents/${document.id}`} rel="noreferrer" target="_blank">Xem PDF</a>
        <a className="primary-button" href={`/api/vehicle-documents/${document.id}?download=1`}>Tải xuống</a>
      </div> : null}
    </section>
  );
}

function serviceTypeLabel(value: string) {
  const labels: Record<string, string> = {
    BAO_DUONG: "Bảo dưỡng",
    SUA_CHUA: "Sửa chữa",
    THAY_THE: "Thay thế phụ tùng",
    BAO_DUONG_SUA_CHUA: "Bảo dưỡng / sửa chữa",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function vietnamToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function daysUntil(date: string, today: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
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

function VehiclePagination({ section, page, totalRows }: { section: "inspections" | "repairs" | "fuel"; page: number; totalRows: number }) {
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
  const section: VehicleSection = ["fleet", "inspections", "repairs", "fuel"].includes(requestedSection ?? "")
    ? requestedSection as VehicleSection
    : "overview";
  const { access, supabase } = await requireAccess();
  const canManage = can(access, "vehicles.manage");
  const canDelete = can(access, "vehicles.delete");
  const [vehiclesResult, inspectionsResult, repairsResult, fuelResult, departmentsResult, usersResult, documentsResult] = await Promise.all([
    supabase.from("vehicles").select("id,vehicle_code,vehicle_name,license_plate,brand,model,production_year,seat_count,fuel_norm_l_per_100km,assigned_driver,status,note,department_id,responsible_user_id,departments(name)").is("deleted_at", null).order("vehicle_code").limit(500),
    supabase.from("vehicle_inspections").select("id,vehicle_id,inspection_date,expires_on,cost,reminder_days,certificate_number,inspection_center,seat_count,odometer_km,note,vehicles(id,vehicle_code,vehicle_name,license_plate)").order("inspection_date", { ascending: false }).limit(500),
    supabase.from("vehicle_repairs").select("id,vehicle_id,service_date,service_type,description,odometer_km,vat_amount,vendor,invoice_number,note,source_file,vehicles(id,vehicle_code,vehicle_name,license_plate)").order("service_date", { ascending: false }).limit(500),
    supabase.from("vehicle_fuel_logs").select("id,vehicle_id,payment_date,liters,odometer_from,odometer_to,amount,purchaser,note,source_file,vehicles(id,vehicle_code,vehicle_name,license_plate)").order("payment_date", { ascending: false }).limit(500),
    supabase.from("departments").select("id,name").order("name").limit(500),
    supabase.from("profiles").select("id,full_name,email").eq("active", true).order("full_name").limit(500),
    supabase.from("vehicle_documents").select("id,file_name,record_id,record_type,stored_byte_size").order("created_at", { ascending: false }).limit(1500),
  ]);
  const vehicles = vehiclesResult.data ?? [];
  const inspections = inspectionsResult.data ?? [];
  const repairs = repairsResult.data ?? [];
  const fuelLogs = fuelResult.data ?? [];
  const vehicleDocuments = (documentsResult.data ?? []) as VehicleDocument[];
  const documentByRecord = new Map(
    vehicleDocuments.map((item) => [
      `${item.record_type}:${item.record_id}`,
      item,
    ]),
  );
  const inspectionsPage = boundedPage(requestedPage, inspections.length);
  const repairsPage = boundedPage(requestedPage, repairs.length);
  const fuelPage = boundedPage(requestedPage, fuelLogs.length);
  const visibleInspections = pageRows(inspections, inspectionsPage);
  const visibleRepairs = pageRows(repairs, repairsPage);
  const visibleFuelLogs = pageRows(fuelLogs, fuelPage);
  const today = vietnamToday();
  const latestInspectionByVehicle = new Map<string, (typeof inspections)[number]>();
  inspections.forEach((item) => { if (!latestInspectionByVehicle.has(item.vehicle_id)) latestInspectionByVehicle.set(item.vehicle_id, item); });
  const upcoming = [...latestInspectionByVehicle.values()].filter((item) => daysUntil(item.expires_on, today) <= item.reminder_days).sort((a, b) => a.expires_on.localeCompare(b.expires_on));
  const totalRepairCost = repairs.reduce((sum, item) => sum + Number(item.vat_amount || 0), 0);
  const totalFuelCost = fuelLogs.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const activeVehicles = vehicles.filter((vehicle) => vehicle.status === "ACTIVE").length;
  const maintenanceVehicles = vehicles.filter((vehicle) => vehicle.status === "MAINTENANCE").length;
  const inactiveVehicles = vehicles.filter((vehicle) => !["ACTIVE", "MAINTENANCE"].includes(vehicle.status)).length;
  const vehicleOptions = vehicles.map(({ id, vehicle_code, vehicle_name, license_plate }) => ({ id, vehicle_code, vehicle_name, license_plate }));
  const sections = [
    { key: "overview" as const, label: "Tổng quan", icon: "dashboard" as const, description: "Số liệu và việc cần chú ý" },
    { key: "fleet" as const, label: "Hồ sơ xe", icon: "vehicle" as const, description: "Danh sách phương tiện đang quản lý" },
    { key: "inspections" as const, label: "Đăng kiểm", icon: "inspection" as const, description: "Lịch sử, hạn đăng kiểm và cảnh báo" },
    { key: "repairs" as const, label: "Bảo dưỡng", icon: "maintenance" as const, description: "Bảo dưỡng và sửa chữa phương tiện" },
    { key: "fuel" as const, label: "Nhiên liệu", icon: "fuel" as const, description: "Theo dõi các lần mua nhiên liệu" },
  ];
  const activeSection = sections.find((item) => item.key === section) ?? sections[0];

  return (
    <>
      <div className="vehicle-page-header">
        <PageHeader eyebrow="PHƯƠNG TIỆN" title="Quản lý xe" description="Theo dõi tập trung hồ sơ xe, đăng kiểm, bảo dưỡng sửa chữa và nhiên liệu." />
      </div>
      <VehicleModuleNav active={section} />
      <section className={`vehicle-command-bar vehicle-command-bar--${section}`}>
        <div className="vehicle-command-context">
          <span className="vehicle-command-icon"><AppIcon name={activeSection.icon} size={22} /></span>
          <div><small>KHU VỰC ĐANG LÀM VIỆC</small><strong>{activeSection.label}</strong><p>{activeSection.description}</p></div>
        </div>
        {canManage ? <VehicleActions vehicles={vehicleOptions} departments={departmentsResult.data ?? []} users={usersResult.data ?? []} canManage={canManage} section={section} /> : null}
      </section>

      {section === "overview" ? <>
        <section className="metric-grid vehicle-stats-grid" aria-label="Tổng quan phương tiện">
          <article className="metric-card metric-primary"><span className="metric-icon"><AppIcon name="vehicle" /></span><p>Tổng số xe</p><strong>{vehicles.length}</strong><small>Hồ sơ đang quản lý</small></article>
          <article className="metric-card metric-tone-amber"><span className="metric-icon"><AppIcon name="inspection" /></span><p>Đăng kiểm cần chú ý</p><strong>{upcoming.length}</strong><small>Trong hạn nhắc hoặc đã quá hạn</small></article>
          <article className="metric-card metric-tone-violet"><span className="metric-icon"><AppIcon name="maintenance" /></span><p>Chi phí bảo dưỡng</p><strong className="metric-money">{formatMoney(totalRepairCost)}</strong><small>{repairs.length} lần ghi nhận</small></article>
          <article className="metric-card metric-tone-green"><span className="metric-icon"><AppIcon name="fuel" /></span><p>Chi phí nhiên liệu</p><strong className="metric-money">{formatMoney(totalFuelCost)}</strong><small>{fuelLogs.length} lần mua</small></article>
        </section>
        <section className="vehicle-overview-grid">
          <article className="panel vehicle-overview-card vehicle-overview-card--inspection">
            <div className="panel-heading"><div><p className="eyebrow">CẦN THEO DÕI</p><h2>Đăng kiểm sắp tới</h2></div><Link className="text-link" href="/vehicles?section=inspections">Xem chi tiết →</Link></div>
            <div className="vehicle-alert-list">
              {upcoming.slice(0, 5).map((item) => { const vehicle = relatedVehicle(item.vehicles); const due = dueTone(daysUntil(item.expires_on, today)); return <div className="vehicle-alert-item" key={item.id}><span className="vehicle-alert-icon"><AppIcon name="inspection" size={18} /></span><div><strong>{vehicle?.vehicle_name || "Chưa rõ xe"}</strong><small>{vehicle?.license_plate || "Chưa có biển số"} · hết hạn {formatDate(item.expires_on)}</small></div><span className={`status-pill ${due.className}`}>{due.label}</span></div>; })}
              {!upcoming.length ? <div className="vehicle-overview-empty"><span><AppIcon name="checkCircle" size={22} /></span><div><strong>Chưa có đăng kiểm cần xử lý</strong><p>Các xe trong hạn nhắc sẽ xuất hiện tại đây.</p></div></div> : null}
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
            return <tr key={vehicle.id}>
              <td><strong>{vehicle.vehicle_name}</strong><small>{vehicle.vehicle_code} · {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Chưa có hãng/model"}</small></td>
              <td><strong>{vehicle.license_plate}</strong><small>{vehicle.production_year || "Chưa có năm SX"}</small></td>
              <td><strong>{vehicle.seat_count ? `${vehicle.seat_count} chỗ` : "—"}</strong></td>
              <td>{vehicle.assigned_driver || "—"}<small>{vehicle.departments?.[0]?.name}</small></td>
              <td>{vehicle.fuel_norm_l_per_100km ? `${vehicle.fuel_norm_l_per_100km} l/100 km` : "—"}</td>
              <td>{inspection ? <><strong>{formatDate(inspection.expires_on)}</strong><small><span className={`status-pill ${due?.className}`}>{due?.label}</span></small></> : <span className="text-danger">Chưa có đăng kiểm</span>}</td>
              <td><span className={`status-pill ${vehicle.status === "ACTIVE" ? "status-pill--active" : vehicle.status === "MAINTENANCE" ? "status-pill--attention" : "status-pill--inactive"}`}>{statusLabel}</span></td>
              <td className="vehicle-actions-column"><div className="row-actions">
                <ModalTrigger description={`${vehicle.vehicle_code} · ${vehicle.license_plate}`} eyebrow="CHI TIẾT HỒ SƠ XE" size="medium" title={vehicle.vehicle_name} triggerClassName="text-button" triggerLabel="Xem">
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
            </tr>;
          })}
          {!vehicles.length ? <tr><td className="empty-cell" colSpan={8}>Chưa có hồ sơ xe. Bạn có thể thêm thủ công hoặc nhập từ file XLSX mẫu.</td></tr> : null}
        </tbody></table></div>
      </section> : null}

      {section === "inspections" ? <section className="panel vehicle-section-panel vehicle-section-panel--inspections">
        <div className="panel-heading"><div><p className="eyebrow">ĐĂNG KIỂM</p><h2>Lịch sử và hạn sắp tới</h2></div><small>{inspections.length} lần</small></div>
        <div className="table-wrap"><table><thead><tr><th>Xe</th><th>Ngày đăng kiểm</th><th>Ngày hết hạn</th><th>Số chỗ</th><th>Chi phí</th><th>Thông tin</th><th>Hóa đơn</th><th className="vehicle-actions-column">Thao tác</th></tr></thead><tbody>
          {visibleInspections.map((item) => {
            const vehicle = relatedVehicle(item.vehicles);
            const due = dueTone(daysUntil(item.expires_on, today));
            const document = documentByRecord.get(`INSPECTION:${item.id}`);
            return <tr key={item.id}>
              <td><strong>{vehicle?.vehicle_name}</strong><small>{vehicle?.license_plate}</small></td>
              <td>{formatDate(item.inspection_date)}</td>
              <td><strong>{formatDate(item.expires_on)}</strong><small><span className={`status-pill ${due.className}`}>{due.label}</span></small></td>
              <td>{item.seat_count ? `${item.seat_count} chỗ` : "—"}</td>
              <td>{formatMoney(Number(item.cost))}</td>
              <td>{item.certificate_number || "—"}<small>{item.inspection_center || `Nhắc trước ${item.reminder_days} ngày`}</small></td>
              <td><VehicleDocumentLink document={document} /></td>
              <td className="vehicle-actions-column"><div className="row-actions">
                <ModalTrigger description={`${vehicle?.license_plate ?? "Chưa có biển số"} · ${vehicle?.vehicle_name ?? "Chưa rõ xe"}`} eyebrow="CHI TIẾT ĐĂNG KIỂM" size="medium" title={`Đăng kiểm ngày ${formatDate(item.inspection_date)}`} triggerClassName="text-button" triggerLabel="Xem">
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
                  </div>
                </ModalTrigger>
                {canManage ? <ModalTrigger description="Cập nhật thời hạn, số chỗ, chi phí và thông tin đăng kiểm." eyebrow="ĐĂNG KIỂM" size="large" title="Sửa đăng kiểm" triggerClassName="text-button" triggerLabel="Sửa"><InspectionForm vehicles={vehicleOptions} initial={{ id: item.id, vehicle_id: item.vehicle_id, inspection_date: item.inspection_date, expires_on: item.expires_on, cost: item.cost, reminder_days: item.reminder_days, certificate_number: item.certificate_number, inspection_center: item.inspection_center, seat_count: item.seat_count, odometer_km: item.odometer_km, note: item.note, invoice_file_name: document?.file_name }} /></ModalTrigger> : null}
                {canDelete ? <ConfirmAction action={deleteVehicleRecord} description="Bản ghi đăng kiểm sẽ bị xóa khỏi lịch sử." fields={{ id: item.id, kind: "inspection" }} title="Xóa đăng kiểm?" /> : null}
              </div></td>
            </tr>;
          })}
          {!inspections.length ? <tr><td className="empty-cell" colSpan={8}>Chưa có lịch sử đăng kiểm.</td></tr> : null}
        </tbody></table></div>
        <VehiclePagination page={inspectionsPage} section="inspections" totalRows={inspections.length} />
      </section> : null}

      {section === "repairs" ? <section className="panel vehicle-section-panel vehicle-section-panel--repairs">
        <div className="panel-heading"><div><p className="eyebrow">BẢO DƯỠNG & SỬA CHỮA</p><h2>Nhật ký phương tiện</h2></div><small>{repairs.length} bản ghi</small></div>
        <div className="table-wrap"><table><thead><tr><th>Ngày / xe</th><th>Nội dung</th><th>Đơn vị</th><th>Số km</th><th>Chi phí VAT</th><th>Hóa đơn</th><th className="vehicle-actions-column">Thao tác</th></tr></thead><tbody>
          {visibleRepairs.map((item) => {
            const vehicle = relatedVehicle(item.vehicles);
            const document = documentByRecord.get(`REPAIR:${item.id}`);
            return <tr key={item.id}>
              <td><strong>{formatDate(item.service_date)}</strong><small>{vehicle?.license_plate} · {vehicle?.vehicle_name}</small></td>
              <td><strong>{item.description}</strong><small>{serviceTypeLabel(item.service_type)}{item.source_file ? ` · nhập từ ${item.source_file}` : ""}</small></td>
              <td>{item.vendor || "—"}<small>{item.invoice_number}</small></td>
              <td>{item.odometer_km ? `${Number(item.odometer_km).toLocaleString("vi-VN")} km` : "—"}</td>
              <td>{formatMoney(Number(item.vat_amount))}</td>
              <td><VehicleDocumentLink document={document} /></td>
              <td className="vehicle-actions-column"><div className="row-actions">
                <ModalTrigger description={`${vehicle?.license_plate ?? "Chưa có biển số"} · ${vehicle?.vehicle_name ?? "Chưa rõ xe"}`} eyebrow="CHI TIẾT BẢO DƯỠNG" size="medium" title={serviceTypeLabel(item.service_type)} triggerClassName="text-button" triggerLabel="Xem">
                  <div className="vehicle-record-detail">
                    <VehicleDetailGrid fields={[
                      { label: "Xe", value: vehicle?.vehicle_name },
                      { label: "Biển số", value: vehicle?.license_plate },
                      { label: "Ngày thực hiện", value: formatDate(item.service_date) },
                      { label: "Hình thức", value: serviceTypeLabel(item.service_type) },
                      { label: "Số km", value: item.odometer_km ? `${Number(item.odometer_km).toLocaleString("vi-VN")} km` : null },
                      { label: "Chi phí gồm VAT", value: formatMoney(Number(item.vat_amount)) },
                      { label: "Đơn vị thực hiện", value: item.vendor },
                      { label: "Số hóa đơn", value: item.invoice_number },
                      { label: "Nội dung thực hiện", value: item.description, wide: true },
                      { label: "Nguồn dữ liệu", value: item.source_file ? `Nhập từ ${item.source_file}` : null, wide: true },
                    ]} />
                    <VehicleDetailNote note={item.note} />
                    <VehicleDocumentDetail document={document} />
                  </div>
                </ModalTrigger>
                {canManage ? <ModalTrigger description="Cập nhật nội dung, đơn vị thực hiện, số km và chi phí." eyebrow="BẢO DƯỠNG" size="large" title="Sửa bảo dưỡng" triggerClassName="text-button" triggerLabel="Sửa"><RepairForm vehicles={vehicleOptions} initial={{ id: item.id, vehicle_id: item.vehicle_id, service_date: item.service_date, service_type: item.service_type, description: item.description, odometer_km: item.odometer_km, vat_amount: item.vat_amount, vendor: item.vendor, invoice_number: item.invoice_number, note: item.note, invoice_file_name: document?.file_name }} /></ModalTrigger> : null}
                {canDelete ? <ConfirmAction action={deleteVehicleRecord} description="Bản ghi bảo dưỡng sẽ bị xóa khỏi lịch sử." fields={{ id: item.id, kind: "repair" }} title="Xóa bảo dưỡng?" /> : null}
              </div></td>
            </tr>;
          })}
          {!repairs.length ? <tr><td className="empty-cell" colSpan={7}>Chưa có lịch sử bảo dưỡng.</td></tr> : null}
        </tbody></table></div>
        <VehiclePagination page={repairsPage} section="repairs" totalRows={repairs.length} />
      </section> : null}

      {section === "fuel" ? <section className="panel vehicle-section-panel vehicle-section-panel--fuel">
        <div className="panel-heading"><div><p className="eyebrow">NHIÊN LIỆU</p><h2>Sổ theo dõi mua nhiên liệu</h2></div><small>{fuelLogs.length} bản ghi</small></div>
        <div className="table-wrap"><table><thead><tr><th>Ngày / xe</th><th>Số lít</th><th>Hành trình km</th><th>Người mua</th><th>Số tiền</th><th>Hóa đơn</th><th className="vehicle-actions-column">Thao tác</th></tr></thead><tbody>
          {visibleFuelLogs.map((item) => {
            const vehicle = relatedVehicle(item.vehicles);
            const document = documentByRecord.get(`FUEL:${item.id}`);
            const distance = item.odometer_from != null && item.odometer_to != null ? Number(item.odometer_to) - Number(item.odometer_from) : null;
            return <tr key={item.id}>
              <td><strong>{formatDate(item.payment_date)}</strong><small>{vehicle?.license_plate} · {vehicle?.vehicle_name}</small></td>
              <td>{Number(item.liters).toLocaleString("vi-VN")} lít</td>
              <td>{item.odometer_from ?? "—"} → {item.odometer_to ?? "—"}<small>{distance != null ? `${distance.toLocaleString("vi-VN")} km` : ""}</small></td>
              <td>{item.purchaser || "—"}<small>{item.source_file ? `Nhập từ ${item.source_file}` : item.note}</small></td>
              <td>{formatMoney(Number(item.amount))}</td>
              <td><VehicleDocumentLink document={document} /></td>
              <td className="vehicle-actions-column"><div className="row-actions">
                <ModalTrigger description={`${vehicle?.license_plate ?? "Chưa có biển số"} · ${vehicle?.vehicle_name ?? "Chưa rõ xe"}`} eyebrow="CHI TIẾT NHIÊN LIỆU" size="medium" title={`Mua nhiên liệu ngày ${formatDate(item.payment_date)}`} triggerClassName="text-button" triggerLabel="Xem">
                  <div className="vehicle-record-detail">
                    <VehicleDetailGrid fields={[
                      { label: "Xe", value: vehicle?.vehicle_name },
                      { label: "Biển số", value: vehicle?.license_plate },
                      { label: "Ngày thanh toán", value: formatDate(item.payment_date) },
                      { label: "Số lít", value: `${Number(item.liters).toLocaleString("vi-VN")} lít` },
                      { label: "Số km từ", value: item.odometer_from != null ? Number(item.odometer_from).toLocaleString("vi-VN") : null },
                      { label: "Số km đến", value: item.odometer_to != null ? Number(item.odometer_to).toLocaleString("vi-VN") : null },
                      { label: "Quãng đường", value: distance != null ? `${distance.toLocaleString("vi-VN")} km` : null },
                      { label: "Số tiền", value: formatMoney(Number(item.amount)) },
                      { label: "Người mua / tài xế", value: item.purchaser },
                      { label: "Nguồn dữ liệu", value: item.source_file ? `Nhập từ ${item.source_file}` : null, wide: true },
                    ]} />
                    <VehicleDetailNote note={item.note} />
                    <VehicleDocumentDetail document={document} />
                  </div>
                </ModalTrigger>
                {canManage ? <ModalTrigger description="Cập nhật số lít, hành trình, người mua và số tiền." eyebrow="NHIÊN LIỆU" size="large" title="Sửa nhiên liệu" triggerClassName="text-button" triggerLabel="Sửa"><FuelForm vehicles={vehicleOptions} initial={{ id: item.id, vehicle_id: item.vehicle_id, payment_date: item.payment_date, liters: item.liters, odometer_from: item.odometer_from, odometer_to: item.odometer_to, amount: item.amount, purchaser: item.purchaser, note: item.note, invoice_file_name: document?.file_name }} /></ModalTrigger> : null}
                {canDelete ? <ConfirmAction action={deleteVehicleRecord} description="Bản ghi nhiên liệu sẽ bị xóa khỏi lịch sử." fields={{ id: item.id, kind: "fuel" }} title="Xóa nhiên liệu?" /> : null}
              </div></td>
            </tr>;
          })}
          {!fuelLogs.length ? <tr><td className="empty-cell" colSpan={7}>Chưa có lịch sử nhiên liệu.</td></tr> : null}
        </tbody></table></div>
        <VehiclePagination page={fuelPage} section="fuel" totalRows={fuelLogs.length} />
      </section> : null}
    </>
  );
}
