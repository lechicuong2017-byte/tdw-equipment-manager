"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppModal } from "@/components/app-modal";
import { ActionStateToast, ActionSuccessBoundary } from "@/components/action-toast";
import { WorkbookFilePicker } from "@/components/workbook-file-picker";
import {
  commitTollMonthlyPdf,
  commitTollQuarterlyWorkbook,
  previewTollMonthlyPdf,
  previewTollQuarterlyWorkbook,
  type TollActionState,
  type TollMonthlyPreviewRow,
  type TollMonthlyPreviewState,
  type TollQuarterlyPreviewRow,
  type TollQuarterlyPreviewState,
} from "@/app/(protected)/vehicles/vehicle-tolls-actions";

const emptyMonthlyPreview: TollMonthlyPreviewState = {};
const emptyQuarterlyPreview: TollQuarterlyPreviewState = {};
const emptyActionState: TollActionState = {};

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(value)} đ`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function MonthlyReview({ preview }: { preview: Required<Pick<TollMonthlyPreviewState, "checksum" | "fileName" | "pageCount" | "periodMonth" | "rows">> }) {
  const importable = preview.rows.filter((row) => row.vehicle_id && !row.already_saved);
  const [selected, setSelected] = useState(() => new Set(importable.map((row) => row.fingerprint)));
  const [state, action, pending] = useActionState(commitTollMonthlyPdf, emptyActionState);
  const selectedRows = useMemo(
    () => preview.rows.filter((row) => selected.has(row.fingerprint)),
    [preview.rows, selected],
  );
  const total = selectedRows.reduce((sum, row) => sum + row.amount_after_tax, 0);
  const toggle = (row: TollMonthlyPreviewRow) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(row.fingerprint)) next.delete(row.fingerprint);
    else next.add(row.fingerprint);
    return next;
  });

  return (
    <form action={action} className="toll-review" data-unsaved-changes="true">
      <ActionStateToast state={state} />
      <input name="checksum" type="hidden" value={preview.checksum} />
      <input name="file_name" type="hidden" value={preview.fileName} />
      <input name="page_count" type="hidden" value={preview.pageCount} />
      <input name="period_month" type="hidden" value={preview.periodMonth} />
      <input name="rows" type="hidden" value={JSON.stringify(selectedRows)} />
      <div className="toll-review-toolbar">
        <div>
          <button className="text-button" onClick={() => setSelected(new Set(importable.map((row) => row.fingerprint)))} type="button">Chọn tất cả dòng mới</button>
          <button className="text-button" onClick={() => setSelected(new Set())} type="button">Bỏ chọn</button>
        </div>
        <strong>{selectedRows.length} lượt · {formatMoney(total)}</strong>
      </div>
      <div className="table-wrap toll-review-table">
        <table>
          <thead><tr><th>Chọn</th><th>Trang</th><th>Xe</th><th>Trạm</th><th>Thời gian qua trạm</th><th>Sau thuế</th><th>Đối chiếu</th></tr></thead>
          <tbody>{preview.rows.map((row) => <tr className={selected.has(row.fingerprint) ? "selected" : ""} key={row.fingerprint}>
            <td><input aria-label={`Chọn giao dịch trang ${row.page}`} checked={selected.has(row.fingerprint)} disabled={!row.vehicle_id || row.already_saved || pending} onChange={() => toggle(row)} type="checkbox" /></td>
            <td>{row.page}</td>
            <td><strong>{row.license_plate}</strong><small>{row.vehicle_name}</small></td>
            <td>{row.toll_station}<small>GD {row.transaction_code || "—"}</small></td>
            <td>{formatDateTime(row.transaction_at)}</td>
            <td className="vehicle-cost-cell">{formatMoney(row.amount_after_tax)}</td>
            <td><span className={`status-pill ${row.already_saved ? "status-muted" : row.vehicle_id ? "status-pill--active" : "status-pill--attention"}`}>{row.already_saved ? "Đã lưu · bỏ qua" : row.vehicle_id ? "Đã khớp xe" : "Cần có hồ sơ xe"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="form-actions">
        <span>Giao dịch mới được cộng vào tổng tháng. Giao dịch đã lưu được bỏ qua.</span>
        <button className="primary-button" disabled={pending || !selectedRows.length} type="submit">{pending ? "Đang lưu…" : `Lưu ${selectedRows.length} lượt`}</button>
      </div>
    </form>
  );
}

function MonthlyPdfImport() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const revision = useRef(0);
  const [preview, previewAction, pending] = useActionState<TollMonthlyPreviewState & { revision?: number }, FormData>(async (state, data) => {
    const requestRevision = revision.current;
    return { ...await previewTollMonthlyPdf(state, data), revision: requestRevision };
  }, emptyMonthlyPreview);
  const [previewReady, setPreviewReady] = useState(false);
  const [fileName, setFileName] = useState("");
  const previous = useRef(preview);
  useEffect(() => {
    if (previous.current === preview) return;
    previous.current = preview;
    setPreviewReady(preview.revision === revision.current);
  }, [preview]);
  const close = useCallback(() => { revision.current += 1; setPreviewReady(false); setFileName(""); setOpen(false); }, []);
  const finish = useCallback(() => { close(); router.refresh(); }, [close, router]);
  const readyPreview = previewReady && preview.fileName && preview.checksum && preview.pageCount && preview.periodMonth && preview.rows?.length
    ? { fileName: preview.fileName, checksum: preview.checksum, pageCount: preview.pageCount, periodMonth: preview.periodMonth, rows: preview.rows }
    : null;

  return <>
    <button className="secondary-button" onClick={() => setOpen(true)} type="button">Nhập vé lẻ PDF</button>
    <AppModal description="Đọc từng hóa đơn, nhận diện xe, trạm, thời gian và số tiền sau thuế; bạn có thể bỏ chọn từng lượt." eyebrow="VETC · VÉ LẺ" onClose={close} open={open} size="wide" title="Nhập chi phí qua trạm theo tháng">
      <form action={previewAction} className="data-form toll-upload-form" onSubmit={() => setPreviewReady(false)}>
        <label className="workbook-file-field"><span>Hóa đơn VETC PDF * (tối đa 4 MB)</span><span className="app-file-picker">
          <input accept="application/pdf,.pdf" aria-label="Hóa đơn VETC PDF" disabled={pending} name="file" onChange={(event) => { revision.current += 1; setPreviewReady(false); setFileName(event.target.files?.[0]?.name || ""); }} required type="file" />
          <strong>Chọn file PDF</strong><em>{fileName || "Chưa chọn file"}</em>
        </span></label>
        <button className="secondary-button" disabled={pending} type="submit">{pending ? "Đang phân tích…" : "Đọc và xem trước"}</button>
      </form>
      {previewReady && preview.error ? <p className="form-error">{preview.error}</p> : null}
      {readyPreview ? <ActionSuccessBoundary onSuccess={finish}><MonthlyReview key={`${readyPreview.checksum}|${readyPreview.rows.length}`} preview={readyPreview} /></ActionSuccessBoundary> : null}
    </AppModal>
  </>;
}

function QuarterlyReview({ preview }: { preview: Required<Pick<TollQuarterlyPreviewState, "fileName" | "rows">> }) {
  const importable = preview.rows.filter((row) => row.vehicle_id && row.comparison_status !== "already_saved");
  const [selected, setSelected] = useState(() => new Set(importable.map((row) => row.fingerprint)));
  const [state, action, pending] = useActionState(commitTollQuarterlyWorkbook, emptyActionState);
  const selectedRows = useMemo(() => preview.rows.filter((row) => selected.has(row.fingerprint)), [preview.rows, selected]);
  const toggle = (row: TollQuarterlyPreviewRow) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(row.fingerprint)) next.delete(row.fingerprint);
    else next.add(row.fingerprint);
    return next;
  });

  return <form action={action} className="toll-review" data-unsaved-changes="true">
    <ActionStateToast state={state} />
    <input name="file_name" type="hidden" value={preview.fileName} />
    <input name="rows" type="hidden" value={JSON.stringify(selectedRows)} />
    <div className="toll-review-toolbar">
      <div>
        <button className="text-button" onClick={() => setSelected(new Set(importable.map((row) => row.fingerprint)))} type="button">Chọn dữ liệu mới</button>
        <button className="text-button" onClick={() => setSelected(new Set())} type="button">Bỏ chọn</button>
      </div>
      <strong>{selectedRows.length} đăng ký được chọn</strong>
    </div>
    <div className="table-wrap toll-review-table">
      <table>
        <thead><tr><th>Chọn</th><th>Sheet / dòng</th><th>Xe</th><th>Trạm đăng ký</th><th>Hiệu lực</th><th>Chi phí</th><th>Đối chiếu</th></tr></thead>
        <tbody>{preview.rows.map((row) => {
          const disabled = row.comparison_status === "already_saved" || !row.vehicle_id;
          return <tr className={selected.has(row.fingerprint) ? "selected" : disabled ? "vehicle-import-row-disabled" : ""} key={`${row.sheet}|${row.row}|${row.fingerprint}`}>
            <td><input aria-label={`Chọn dòng ${row.row} sheet ${row.sheet}`} checked={selected.has(row.fingerprint)} disabled={disabled} onChange={() => toggle(row)} type="checkbox" /></td>
            <td>{row.sheet}<small>Dòng {row.row}</small></td>
            <td><strong>{row.license_plate}</strong><small>{row.vehicle_name}</small></td>
            <td>{row.toll_station}</td>
            <td>{new Date(`${row.starts_on}T00:00:00`).toLocaleDateString("vi-VN")} – {new Date(`${row.expires_on}T00:00:00`).toLocaleDateString("vi-VN")}</td>
            <td className="vehicle-cost-cell">{formatMoney(row.amount)}</td>
            <td><span className={`status-pill ${disabled ? "status-muted" : row.comparison_status === "changed" ? "status-pill--new" : "status-pill--active"}`}>{!row.vehicle_id ? "Cần có hồ sơ xe" : disabled ? "Đã lưu" : row.comparison_status === "changed" ? "Có thay đổi" : "Mới · đã khớp xe"}</span></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {state.error ? <p className="form-error">{state.error}</p> : null}
    <div className="form-actions"><span>Dữ liệu trùng được bỏ qua; dòng cùng nguồn có thay đổi sẽ được cập nhật.</span><button className="primary-button" disabled={pending || !selectedRows.length} type="submit">{pending ? "Đang lưu…" : `Nhập ${selectedRows.length} đăng ký`}</button></div>
  </form>;
}

function QuarterlyWorkbookImport() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const revision = useRef(0);
  const [preview, previewAction, pending] = useActionState<TollQuarterlyPreviewState & { revision?: number }, FormData>(async (state, data) => {
    const requestRevision = revision.current;
    return { ...await previewTollQuarterlyWorkbook(state, data), revision: requestRevision };
  }, emptyQuarterlyPreview);
  const [previewReady, setPreviewReady] = useState(false);
  const previous = useRef(preview);
  useEffect(() => {
    if (previous.current === preview) return;
    previous.current = preview;
    setPreviewReady(preview.revision === revision.current);
  }, [preview]);
  const close = useCallback(() => { revision.current += 1; setPreviewReady(false); setOpen(false); }, []);
  const finish = useCallback(() => { close(); router.refresh(); }, [close, router]);
  const readyPreview = previewReady && preview.fileName && preview.rows?.length ? { fileName: preview.fileName, rows: preview.rows } : null;

  return <>
    <button className="secondary-button" onClick={() => setOpen(true)} type="button">Nhập vé quý XLSX</button>
    <AppModal description="Đọc toàn bộ sheet, đối chiếu xe và chống nhập trùng theo kỳ, trạm và biển số." eyebrow="VETC · VÉ QUÝ" onClose={close} open={open} size="wide" title="Nhập đăng ký vé quý">
      <form action={previewAction} className="data-form toll-upload-form" onSubmit={() => setPreviewReady(false)}>
        <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><WorkbookFilePicker label="File chi phí vé quý XLSX *" name="file" onFileChange={() => { revision.current += 1; setPreviewReady(false); }} /></fieldset>
        <button className="secondary-button" disabled={pending} type="submit">{pending ? "Đang phân tích…" : "Đọc và xem trước"}</button>
      </form>
      {previewReady && preview.error ? <p className="form-error">{preview.error}</p> : null}
      {readyPreview ? <ActionSuccessBoundary onSuccess={finish}><QuarterlyReview key={`${readyPreview.fileName}|${readyPreview.rows.length}|${readyPreview.rows[0]?.fingerprint}`} preview={readyPreview} /></ActionSuccessBoundary> : null}
    </AppModal>
  </>;
}

export function VehicleTollActions() {
  return <div className="vehicle-actions"><div className="vehicle-action-group"><small>NHẬP DỮ LIỆU VETC</small><div><MonthlyPdfImport /><QuarterlyWorkbookImport /></div></div></div>;
}
