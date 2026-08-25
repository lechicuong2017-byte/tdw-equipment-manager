"use client";

import { useActionState } from "react";
import { ActionStateToast } from "@/components/action-toast";
import {
  importSupplierQuoteWorkbook,
  importSupplyWorkbook,
  saveSupplyQuote,
  saveSupplyItem,
  saveSupplyRequest,
  saveSupplyRequestMetadata,
  type SupplyActionState,
} from "@/app/(protected)/supplies/actions";

const initialState: SupplyActionState = {};

export type SupplyItemOption = {
  id: string;
  category: "OFFICE_SUPPLY" | "CLEANING_SUPPLY";
  item_code?: string | null;
  item_name: string;
  unit: string;
  description?: string | null;
  default_unit_price?: number | string | null;
  active?: boolean | null;
};

export function SupplyItemForm({ initial }: { initial?: SupplyItemOption }) {
  const [state, action, pending] = useActionState(saveSupplyItem, initialState);
  return (
    <form action={action} className="data-form">
      <ActionStateToast state={state} />
      {initial ? <input name="id" type="hidden" value={initial.id} /> : null}
      <div className="form-grid">
        <label>Loại hàng *<select defaultValue={initial?.category ?? "OFFICE_SUPPLY"} name="category"><option value="OFFICE_SUPPLY">Văn phòng phẩm</option><option value="CLEANING_SUPPLY">Dụng cụ vệ sinh</option></select></label>
        <label>Mã hàng<input defaultValue={initial?.item_code ?? ""} maxLength={80} name="item_code" placeholder="Tự chọn nếu cần" /></label>
        <label className="span-2">Tên hàng *<input defaultValue={initial?.item_name ?? ""} maxLength={300} name="item_name" required /></label>
        <label>Đơn vị *<input defaultValue={initial?.unit ?? ""} maxLength={80} name="unit" required placeholder="Hộp, ram, cây…" /></label>
        <label>Đơn giá mặc định<input defaultValue={initial?.default_unit_price ?? 0} min={0} name="default_unit_price" type="number" /></label>
        <label className="span-3">Mô tả<textarea defaultValue={initial?.description ?? ""} maxLength={2000} name="description" rows={3} /></label>
        <label className="checkbox-inline"><input defaultChecked={initial?.active ?? true} name="active" type="checkbox" />Đang sử dụng</label>
      </div>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="form-actions"><button className="primary-button" disabled={pending} type="submit">{pending ? "Đang lưu…" : initial ? "Lưu thay đổi" : "Thêm hàng hóa"}</button></div>
    </form>
  );
}

export function SupplyImportForm() {
  const [state, action, pending] = useActionState(importSupplyWorkbook, initialState);
  return (
    <form action={action} className="data-form">
      <ActionStateToast state={state} />
      <label>File phiếu tổng hợp XLSX *<input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" name="workbook" required type="file" /></label>
      <div className="import-hint"><strong>Tự nhận diện hai mẫu TDW</strong><p>Hệ thống đọc loại hàng, quý/năm, người đề nghị, phê duyệt, số lượng, đơn giá và ghi chú; file đã nhập sẽ không tạo trùng.</p></div>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="form-actions"><button className="primary-button" disabled={pending} type="submit">{pending ? "Đang đọc file…" : "Nhập phiếu XLSX"}</button></div>
    </form>
  );
}

export type SupplyQuoteOption = {
  id: string;
  quote_no?: string | null;
  vendor_name: string;
  vendor_address?: string | null;
  vendor_contact?: string | null;
  category: "OFFICE_SUPPLY" | "CLEANING_SUPPLY";
  quote_date?: string | null;
  valid_until?: string | null;
  status: "RECEIVED" | "REVIEWING" | "SELECTED" | "REJECTED" | "EXPIRED";
  note?: string | null;
};

export function SupplierQuoteImportForm() {
  const [state, action, pending] = useActionState(importSupplierQuoteWorkbook, initialState);
  return (
    <form action={action} className="data-form">
      <ActionStateToast state={state} />
      <div className="form-grid">
        <label>Loại hàng *<select defaultValue="OFFICE_SUPPLY" name="category"><option value="OFFICE_SUPPLY">Văn phòng phẩm</option><option value="CLEANING_SUPPLY">Dụng cụ vệ sinh</option></select></label>
        <label className="span-2">File báo giá nhà cung cấp *<input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" name="workbook" required type="file" /></label>
      </div>
      <div className="import-hint supply-import-hint"><strong>Tự nhận diện nhiều mẫu báo giá</strong><p>Hệ thống tìm đúng sheet báo giá, đọc nhà cung cấp, ngày báo giá, tên hàng, đơn vị, số lượng, đơn giá, VAT và tổng tiền. Tên file được chuẩn hóa và file trùng sẽ không nhập lại.</p></div>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="form-actions"><button className="primary-button" disabled={pending} type="submit">{pending ? "Đang phân tích…" : "Nhập báo giá XLSX"}</button></div>
    </form>
  );
}

export function SupplyQuoteForm({ initial }: { initial: SupplyQuoteOption }) {
  const [state, action, pending] = useActionState(saveSupplyQuote, initialState);
  return (
    <form action={action} className="data-form">
      <ActionStateToast state={state} />
      <input name="id" type="hidden" value={initial.id} />
      <div className="form-grid">
        <label className="span-2">Nhà cung cấp *<input defaultValue={initial.vendor_name} maxLength={300} name="vendor_name" required /></label>
        <label>Số báo giá<input defaultValue={initial.quote_no ?? ""} maxLength={100} name="quote_no" /></label>
        <label>Loại hàng<select defaultValue={initial.category} name="category"><option value="OFFICE_SUPPLY">Văn phòng phẩm</option><option value="CLEANING_SUPPLY">Dụng cụ vệ sinh</option></select></label>
        <label>Ngày báo giá<input defaultValue={initial.quote_date ?? ""} name="quote_date" type="date" /></label>
        <label>Hiệu lực đến<input defaultValue={initial.valid_until ?? ""} name="valid_until" type="date" /></label>
        <label>Trạng thái<select defaultValue={initial.status} name="status"><option value="RECEIVED">Đã nhận</option><option value="REVIEWING">Đang xem xét</option><option value="SELECTED">Đã chọn</option><option value="REJECTED">Không chọn</option><option value="EXPIRED">Hết hiệu lực</option></select></label>
        <label className="span-2">Địa chỉ<textarea defaultValue={initial.vendor_address ?? ""} maxLength={1000} name="vendor_address" rows={2} /></label>
        <label>Liên hệ<textarea defaultValue={initial.vendor_contact ?? ""} maxLength={1000} name="vendor_contact" rows={2} /></label>
        <label className="span-3">Ghi chú<textarea defaultValue={initial.note ?? ""} maxLength={3000} name="note" rows={3} /></label>
      </div>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="form-actions"><button className="primary-button" disabled={pending} type="submit">{pending ? "Đang lưu…" : "Lưu báo giá"}</button></div>
    </form>
  );
}

export type SupplyRequestMetadata = {
  id: string;
  request_no: string;
  requested_on: string;
  requester_name?: string | null;
  checker_name?: string | null;
  approver_name?: string | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "ORDERED" | "CLOSED" | "REJECTED";
  note?: string | null;
};

export function SupplyRequestEditForm({ initial }: { initial: SupplyRequestMetadata }) {
  const [state, action, pending] = useActionState(saveSupplyRequestMetadata, initialState);
  return (
    <form action={action} className="data-form">
      <ActionStateToast state={state} />
      <input name="id" type="hidden" value={initial.id} />
      <div className="form-grid">
        <label>Số phiếu *<input defaultValue={initial.request_no} maxLength={80} name="request_no" required /></label>
        <label>Ngày đề nghị *<input defaultValue={initial.requested_on} name="requested_on" required type="date" /></label>
        <label>Trạng thái<select defaultValue={initial.status} name="status"><option value="DRAFT">Nháp</option><option value="SUBMITTED">Đã trình</option><option value="APPROVED">Đã duyệt</option><option value="ORDERED">Đã đặt mua</option><option value="CLOSED">Hoàn tất</option><option value="REJECTED">Không duyệt</option></select></label>
        <label>Người đề nghị<input defaultValue={initial.requester_name ?? ""} maxLength={160} name="requester_name" /></label>
        <label>Người kiểm tra<input defaultValue={initial.checker_name ?? ""} maxLength={160} name="checker_name" /></label>
        <label>Người duyệt<input defaultValue={initial.approver_name ?? ""} maxLength={160} name="approver_name" /></label>
        <label className="span-3">Ghi chú<textarea defaultValue={initial.note ?? ""} maxLength={3000} name="note" rows={3} /></label>
      </div>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="form-actions"><button className="primary-button" disabled={pending} type="submit">{pending ? "Đang lưu…" : "Lưu phiếu"}</button></div>
    </form>
  );
}

export function SupplyRequestForm({ departments, items }: { departments: Array<{ id: string; name: string }>; items: SupplyItemOption[] }) {
  const [state, action, pending] = useActionState(saveSupplyRequest, initialState);
  const currentYear = new Date().getFullYear();
  return (
    <form action={action} className="data-form">
      <ActionStateToast state={state} />
      <div className="form-grid">
        <label>Số phiếu *<input defaultValue={`01/${currentYear}`} maxLength={80} name="request_no" required /></label>
        <label>Loại hàng *<select name="category"><option value="OFFICE_SUPPLY">Văn phòng phẩm</option><option value="CLEANING_SUPPLY">Dụng cụ vệ sinh</option></select></label>
        <label>Chu kỳ mua *<select defaultValue="QUARTER" name="period_type"><option value="MONTH">Theo tháng</option><option value="QUARTER">Theo quý</option><option value="YEAR">Theo năm</option></select></label>
        <label>Năm *<input defaultValue={currentYear} min={2000} max={2200} name="period_year" required type="number" /></label>
        <label>Tháng<select defaultValue="" name="period_month"><option value="">Không áp dụng</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>Tháng {index + 1}</option>)}</select></label>
        <label>Quý<select defaultValue={Math.ceil((new Date().getMonth() + 1) / 3)} name="period_quarter"><option value="">Không áp dụng</option>{[1, 2, 3, 4].map((quarter) => <option key={quarter} value={quarter}>Quý {quarter}</option>)}</select></label>
        <label>Ngày đề nghị *<input defaultValue={new Date().toISOString().slice(0, 10)} name="requested_on" required type="date" /></label>
        <label>Ngày cần cấp<input name="required_on" type="date" /></label>
        <label>Phòng ban<select defaultValue="" name="department_id"><option value="">Chưa gắn phòng ban</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Bộ phận yêu cầu<input defaultValue="P. Hành chính-Nhân sự" maxLength={300} name="requesting_department" /></label>
        <label>Người đề nghị<input maxLength={160} name="requester_name" /></label>
        <label>Người kiểm tra<input maxLength={160} name="checker_name" /></label>
        <label>Người duyệt<input maxLength={160} name="approver_name" /></label>
        <label>Trạng thái<select defaultValue="DRAFT" name="status"><option value="DRAFT">Nháp</option><option value="SUBMITTED">Đã trình</option><option value="APPROVED">Đã duyệt</option><option value="ORDERED">Đã đặt mua</option><option value="CLOSED">Hoàn tất</option><option value="REJECTED">Không duyệt</option></select></label>
        <label className="span-3">Ghi chú phiếu<textarea maxLength={3000} name="note" rows={2} /></label>
      </div>
      <fieldset className="form-fieldset">
        <legend>Dòng hàng đầu tiên</legend>
        <div className="form-grid">
          <label className="span-2">Hàng hóa *<select name="item_id" required><option value="">Chọn hàng hóa</option>{items.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.category === "OFFICE_SUPPLY" ? "VPP" : "Vệ sinh"} · {item.item_name} · {item.unit}</option>)}</select></label>
          <label>Số lượng đề xuất<input defaultValue={1} min={0} name="proposed_quantity" step="0.001" type="number" /></label>
          <label>Số lượng tồn<input defaultValue={0} min={0} name="stock_quantity" step="0.001" type="number" /></label>
          <label>Số lượng đặt mua<input defaultValue={1} min={0} name="ordered_quantity" step="0.001" type="number" /></label>
          <label>Đơn giá được duyệt<input defaultValue={0} min={0} name="approved_unit_price" type="number" /></label>
          <label>Bộ phận đề nghị<input maxLength={1000} name="requested_departments" /></label>
          <label>Phê duyệt<input defaultValue="Duyệt mua" maxLength={1000} name="approval_note" /></label>
          <label className="span-3">Ghi chú dòng hàng<textarea maxLength={2000} name="line_note" rows={2} /></label>
        </div>
      </fieldset>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="form-actions"><button className="primary-button" disabled={pending || !items.length} type="submit">{pending ? "Đang tạo…" : "Tạo phiếu yêu cầu"}</button></div>
    </form>
  );
}
