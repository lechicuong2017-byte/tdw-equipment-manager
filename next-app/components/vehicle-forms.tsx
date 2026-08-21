"use client";

import { useActionState, useState } from "react";
import {
  commitVehicleImport,
  previewVehicleImport,
  saveVehicle,
  saveVehicleFuel,
  saveVehicleInspection,
  saveVehicleRepair,
  type VehicleActionState,
  type VehicleImportState,
} from "@/app/(protected)/vehicles/actions";
import { AppModal, ModalTrigger } from "@/components/app-modal";
import { ActionStateToast } from "@/components/action-toast";
import { ExportReportButton } from "@/components/export-assets-button";

const initialState: VehicleActionState = {};
const initialImportState: VehicleImportState = {};

export type VehicleOption = { id: string; vehicle_code: string; vehicle_name: string; license_plate: string };
type DepartmentOption = { id: string; name: string };
type UserOption = { id: string; full_name: string; email: string };

function VehicleSelect({ vehicles }: { vehicles: VehicleOption[] }) {
  return (
    <select name="vehicle_id" required defaultValue="">
      <option disabled value="">Chọn xe</option>
      {vehicles.map((vehicle) => (
        <option key={vehicle.id} value={vehicle.id}>{vehicle.license_plate} · {vehicle.vehicle_name}</option>
      ))}
    </select>
  );
}

function SaveButton({ pending, label }: { pending: boolean; label: string }) {
  return <button className="primary-button" disabled={pending} type="submit">{pending ? "Đang lưu…" : label}</button>;
}

function VehicleForm({ departments, users }: { departments: DepartmentOption[]; users: UserOption[] }) {
  const [state, action, pending] = useActionState(saveVehicle, initialState);
  return (
    <form action={action} className="data-form vehicle-form">
      <ActionStateToast state={state} />
      <div className="form-grid">
        <label>Mã xe *<input name="vehicle_code" maxLength={80} required placeholder="TDW-VEH-001" /></label>
        <label>Tên xe *<input name="vehicle_name" maxLength={200} required placeholder="Ford Ranger" /></label>
        <label>Biển số *<input name="license_plate" maxLength={30} required placeholder="51C-795.69" /></label>
        <label>Thương hiệu<input name="brand" maxLength={100} /></label>
        <label>Model<input name="model" maxLength={120} /></label>
        <label>Năm sản xuất<input name="production_year" type="number" min={1950} max={2200} /></label>
        <label>Định mức lít/100 km<input name="fuel_norm_l_per_100km" type="number" min={0} step="0.01" /></label>
        <label>Tài xế / người sử dụng<input name="assigned_driver" maxLength={160} /></label>
        <label>Phòng ban<select name="department_id" defaultValue=""><option value="">Chưa phân phòng</option>{departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Người phụ trách<select name="responsible_user_id" defaultValue=""><option value="">Chưa gán</option>{users.map((item) => <option value={item.id} key={item.id}>{item.full_name || item.email}</option>)}</select></label>
        <label>Trạng thái<select name="status" defaultValue="ACTIVE"><option value="ACTIVE">Đang sử dụng</option><option value="MAINTENANCE">Đang sửa chữa</option><option value="INACTIVE">Ngừng sử dụng</option><option value="LIQUIDATED">Đã thanh lý</option></select></label>
        <label className="span-3">Ghi chú<textarea name="note" rows={3} maxLength={3000} /></label>
      </div>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="form-actions"><SaveButton label="Thêm xe" pending={pending} /></div>
    </form>
  );
}

function InspectionForm({ vehicles }: { vehicles: VehicleOption[] }) {
  const [state, action, pending] = useActionState(saveVehicleInspection, initialState);
  return (
    <form action={action} className="data-form vehicle-form">
      <ActionStateToast state={state} />
      <div className="form-grid">
        <label className="span-2">Xe *<VehicleSelect vehicles={vehicles} /></label>
        <label>Ngày đăng kiểm *<input name="inspection_date" type="date" required /></label>
        <label>Ngày hết hạn *<input name="expires_on" type="date" required /></label>
        <label>Chi phí<input name="cost" type="number" min={0} defaultValue={0} /></label>
        <label>Nhắc trước (ngày)<input name="reminder_days" type="number" min={1} max={180} defaultValue={30} /></label>
        <label>Số giấy chứng nhận<input name="certificate_number" maxLength={100} /></label>
        <label>Trung tâm đăng kiểm<input name="inspection_center" maxLength={200} /></label>
        <label>Số km<input name="odometer_km" type="number" min={0} /></label>
        <label className="span-3">Ghi chú<textarea name="note" rows={3} maxLength={3000} /></label>
      </div>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="form-actions"><SaveButton label="Lưu đăng kiểm" pending={pending} /></div>
    </form>
  );
}

function RepairForm({ vehicles }: { vehicles: VehicleOption[] }) {
  const [state, action, pending] = useActionState(saveVehicleRepair, initialState);
  return (
    <form action={action} className="data-form vehicle-form">
      <ActionStateToast state={state} />
      <div className="form-grid">
        <label className="span-2">Xe *<VehicleSelect vehicles={vehicles} /></label>
        <label>Ngày thực hiện *<input name="service_date" type="date" required /></label>
        <label>Hình thức<select name="service_type" defaultValue="BAO_DUONG"><option value="BAO_DUONG">Bảo dưỡng</option><option value="SUA_CHUA">Sửa chữa</option><option value="THAY_THE">Thay thế phụ tùng</option></select></label>
        <label className="span-3">Nội dung *<textarea name="description" rows={3} required maxLength={3000} /></label>
        <label>Số km<input name="odometer_km" type="number" min={0} /></label>
        <label>Chi phí gồm VAT<input name="vat_amount" type="number" min={0} defaultValue={0} /></label>
        <label>Đơn vị thực hiện<input name="vendor" maxLength={200} /></label>
        <label>Số hóa đơn<input name="invoice_number" maxLength={100} /></label>
        <label className="span-3">Ghi chú<textarea name="note" rows={3} maxLength={3000} /></label>
      </div>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="form-actions"><SaveButton label="Lưu bảo dưỡng" pending={pending} /></div>
    </form>
  );
}

function FuelForm({ vehicles }: { vehicles: VehicleOption[] }) {
  const [state, action, pending] = useActionState(saveVehicleFuel, initialState);
  return (
    <form action={action} className="data-form vehicle-form">
      <ActionStateToast state={state} />
      <div className="form-grid">
        <label className="span-2">Xe *<VehicleSelect vehicles={vehicles} /></label>
        <label>Ngày thanh toán *<input name="payment_date" type="date" required /></label>
        <label>Số lít *<input name="liters" type="number" min="0.001" step="0.001" required /></label>
        <label>Số km từ<input name="odometer_from" type="number" min={0} /></label>
        <label>Số km đến<input name="odometer_to" type="number" min={0} /></label>
        <label>Số tiền<input name="amount" type="number" min={0} defaultValue={0} /></label>
        <label>Người mua / tài xế<input name="purchaser" maxLength={160} /></label>
        <label className="span-3">Ghi chú<textarea name="note" rows={3} maxLength={3000} /></label>
      </div>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="form-actions"><SaveButton label="Lưu nhiên liệu" pending={pending} /></div>
    </form>
  );
}

function ImportWorkbook() {
  const [open, setOpen] = useState(false);
  const [preview, previewAction, previewing] = useActionState(previewVehicleImport, initialImportState);
  const [commit, commitAction, committing] = useActionState(commitVehicleImport, initialImportState);
  return (
    <>
      <button className="secondary-button" onClick={() => setOpen(true)} type="button">Nhập lịch sử XLSX</button>
      <AppModal open={open} onClose={() => setOpen(false)} eyebrow="NHẬP DỮ LIỆU" title="Bảo dưỡng & nhiên liệu từ XLSX" description="Đọc tất cả sheet đúng mẫu TDW, xem trước và chống nhập trùng." size="wide">
        <ActionStateToast state={commit} />
        <form action={previewAction} className="data-form import-upload-form">
          <label>Chọn file XLSX<input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" name="file" type="file" required /></label>
          <button className="secondary-button" disabled={previewing} type="submit">{previewing ? "Đang phân tích…" : "Đọc và xem trước"}</button>
        </form>
        {preview.error ? <p className="form-error">{preview.error}</p> : null}
        {commit.error ? <p className="form-error">{commit.error}</p> : null}
        {preview.rows?.length ? (
          <form action={commitAction} className="data-form import-preview-form">
            <input name="file_name" type="hidden" value={preview.fileName} />
            <input name="rows" type="hidden" value={JSON.stringify(preview.rows)} />
            <div className="import-preview-summary"><strong>{preview.rows.length} dòng hợp lệ</strong><span>{preview.rows.filter((row) => row.warning).length} dòng cần chú ý</span></div>
            <div className="table-wrap import-preview-table">
              <table><thead><tr><th>Sheet / dòng</th><th>Xe</th><th>Ngày</th><th>Dữ liệu</th><th>Số tiền</th><th>Kiểm tra</th></tr></thead>
                <tbody>{preview.rows.slice(0, 200).map((row) => <tr key={`${row.sheet}-${row.row}`}>
                  <td>{row.sheet}<small>Dòng {row.row}</small></td><td><strong>{row.vehicle_name}</strong><small>{row.license_plate}</small></td><td>{row.date}</td><td>{row.kind === "fuel" ? `${row.liters ?? 0} lít · ${row.odometer_from ?? "—"} → ${row.odometer_to ?? "—"} km` : row.description}</td><td>{new Intl.NumberFormat("vi-VN").format(row.amount)} đ</td><td>{row.warning ? <span className="status-pill status-pill--attention">{row.warning}</span> : <span className="status-pill status-pill--active">Hợp lệ</span>}</td>
                </tr>)}</tbody></table>
            </div>
            {preview.rows.length > 200 ? <p className="form-help">Chỉ hiển thị 200 dòng đầu; toàn bộ {preview.rows.length} dòng sẽ được nhập.</p> : null}
            <div className="form-actions"><button className="primary-button" disabled={committing} type="submit">{committing ? "Đang nhập…" : "Xác nhận nhập dữ liệu"}</button></div>
          </form>
        ) : null}
      </AppModal>
    </>
  );
}

export function VehicleActions({ vehicles, departments, users, canManage, canExport, reportType }: { vehicles: VehicleOption[]; departments: DepartmentOption[]; users: UserOption[]; canManage: boolean; canExport: boolean; reportType: "vehicles" | "vehicle_inspections" | "vehicle_repairs" | "vehicle_fuel" }) {
  return (
    <div className="vehicle-actions">
      {canExport ? <><ExportReportButton reportType={reportType} /><ExportReportButton reportType={reportType} outputFormat="pdf" buttonLabel="Xuất PDF" /></> : null}
      {canManage ? <>
        <ImportWorkbook />
        <ModalTrigger eyebrow="HỒ SƠ XE" title="Thêm xe" description="Khai báo xe để theo dõi đăng kiểm, bảo dưỡng và nhiên liệu." size="large" triggerLabel="+ Thêm xe"><VehicleForm departments={departments} users={users} /></ModalTrigger>
        <ModalTrigger eyebrow="ĐĂNG KIỂM" title="Ghi nhận đăng kiểm" description="Theo dõi hạn và tự động cảnh báo trước 30 ngày." size="large" triggerLabel="+ Đăng kiểm"><InspectionForm vehicles={vehicles} /></ModalTrigger>
        <ModalTrigger eyebrow="BẢO DƯỠNG" title="Ghi nhận bảo dưỡng / sửa chữa" size="large" triggerClassName="secondary-button" triggerLabel="+ Bảo dưỡng"><RepairForm vehicles={vehicles} /></ModalTrigger>
        <ModalTrigger eyebrow="NHIÊN LIỆU" title="Ghi nhận mua nhiên liệu" size="large" triggerClassName="secondary-button" triggerLabel="+ Nhiên liệu"><FuelForm vehicles={vehicles} /></ModalTrigger>
      </> : null}
    </div>
  );
}
