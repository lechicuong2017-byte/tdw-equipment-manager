"use client";
import { useActionState, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppModal } from "@/components/app-modal";
import { ActionStateToast, ActionSuccessBoundary } from "@/components/action-toast";
import { phoneStatuses, type PhoneRecord, type PhonePreview } from "@/lib/telecom-phones";
import { savePhones, deletePhone, previewPhones, type PhoneState } from "@/app/(protected)/telecom/phones/actions";

function EditPhone({ row }: { row?: PhoneRecord }) {
  const [state, action, pending] = useActionState(savePhones, {} as PhoneState);
  return <form action={action} className="telecom-edit-form"><ActionStateToast state={state}/>{row && <><input type="hidden" name="id" value={row.id}/><input type="hidden" name="version" value={row.updated_at}/></>}
    <label>Số điện thoại *<input name="phone" defaultValue={row?.phone} required inputMode="tel" maxLength={30}/></label>
    <label>Trạng thái<select name="status" defaultValue={row?.status || "active"}>{Object.entries(phoneStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>Vị trí lắp đặt<input name="location" defaultValue={row?.location} maxLength={300}/></label>
    <label>Mã logger / serial<input name="serial" defaultValue={row?.serial} maxLength={100}/></label>
    <label>Số thay thế (nếu có)<input name="replacement_phone" defaultValue={row?.replacement_phone} inputMode="tel" maxLength={30}/></label>
    <label className="telecom-full-row">Ghi chú<textarea name="note" defaultValue={row?.note} rows={3} maxLength={2000}/></label>
    {state.error && <p role="alert" className="form-error">{state.error}</p>}
    <div className="telecom-form-footer telecom-full-row"><p>Giữ nguyên số cũ; không tự chuyển đổi đầu số.</p><button className="primary-button" disabled={pending}>{pending ? "Đang lưu…" : "Lưu số điện thoại"}</button></div>
  </form>;
}
function RemovePhone({ row }: { row: PhoneRecord }) {
  const [confirm, setConfirm] = useState(false); const [state, action, pending] = useActionState(deletePhone, {} as PhoneState);
  return <div className="telecom-delete"><ActionStateToast state={state}/>{confirm ? <form action={action}><input type="hidden" name="id" value={row.id}/><input type="hidden" name="version" value={row.updated_at}/><p>Xóa số {row.phone} khỏi danh mục? Hóa đơn đã lưu không bị ảnh hưởng.</p><div className="telecom-select-actions"><button type="button" className="secondary-button" onClick={() => setConfirm(false)} disabled={pending}>Hủy</button><button className="danger-button" disabled={pending}>Xác nhận xóa</button></div></form> : <button type="button" className="danger-button" onClick={() => setConfirm(true)}>Xóa số điện thoại</button>}{state.error && <p role="alert">{state.error}</p>}</div>;
}
export function PhoneEditor({ row, manage = true, remove = false }: { row?: PhoneRecord; manage?: boolean; remove?: boolean }) {
  const [open, setOpen] = useState(false); const router = useRouter(); const close = useCallback(() => setOpen(false), []);
  const finish = useCallback(() => { close(); router.refresh(); }, [close, router]);
  return <><button className={row ? "text-button" : "primary-button"} onClick={() => setOpen(true)}>{row ? "Xem / Sửa" : "+ Số điện thoại"}</button><AppModal open={open} onClose={close} title={row ? `Số điện thoại ${row.phone}` : "Thêm số điện thoại"} eyebrow="DANH MỤC VIỄN THÔNG" size="wide"><ActionSuccessBoundary onSuccess={finish}>{manage ? <EditPhone row={row}/> : <p className="telecom-note">{row?.note || "Chưa có ghi chú."}</p>}{remove && row && <RemovePhone row={row}/>}</ActionSuccessBoundary></AppModal></>;
}
function PhoneImportForm() {
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<string[]>([]); const [sheet, setSheet] = useState("");
  const [rows, setRows] = useState<PhonePreview[]>([]); const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const revision = useRef(0); const file = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(savePhones, {} as PhoneState);
  const available = rows.filter((r) => !r.error && !r.saved && !r.duplicate);
  async function read(targetSheet = sheet) {
    const current = ++revision.current; setRows([]); setSelected([]); setError("");
    if (!file.current?.files?.[0]) { setError("Chọn file Excel trước."); return; }
    const data = new FormData(); data.set("file", file.current.files[0]); data.set("sheet", targetSheet); setBusy(true);
    try { const result = await previewPhones(data); if (current !== revision.current) return;
      setError(result.error || ""); if (result.sheets) { setSheets(result.sheets); if (!targetSheet) setSheet(result.sheets[0] || ""); }
      if (result.rows) { setRows(result.rows); setSelected(result.rows.filter((r) => !r.warning && !r.error && !r.saved && !r.duplicate).map((r) => r.row)); }
    } catch { if (current === revision.current) setError("Không đọc được file. Hãy thử lại."); }
    finally { if (current === revision.current) setBusy(false); }
  }
  return <div className="telecom-review"><ActionStateToast state={state}/><label>File Excel (.xlsx, tối đa 3 MB)<span className="app-file-picker"><input ref={file} type="file" aria-label="File danh mục số điện thoại Excel" accept=".xlsx" disabled={pending} onChange={(e) => { revision.current++; setFileName(e.target.files?.[0]?.name || ""); setBusy(false); setSheets([]); setSheet(""); setRows([]); setSelected([]); setError(""); }}/><strong>Chọn file XLSX</strong><em>{fileName || "Chưa chọn file"}</em></span></label>
    <div className="telecom-select-actions"><button type="button" className="secondary-button" disabled={busy || pending} onClick={() => read("")}>Đọc danh sách sheet</button>{sheets.length > 0 && <><label>Sheet cần nhập <select value={sheet} disabled={busy || pending} onChange={(e) => { setSheet(e.target.value); setRows([]); setSelected([]); }}>{sheets.map((s) => <option key={s}>{s}</option>)}</select></label><button type="button" className="secondary-button" disabled={busy || pending} onClick={() => read()}>Xem trước</button></>}</div>
    {busy && <p role="status">Đang đọc và đối chiếu…</p>}{(error || state.error) && <p className="form-error" role="alert">{error || state.error}</p>}
    {!!rows.length && <><div className="telecom-select-actions"><button type="button" className="text-button" disabled={pending} onClick={() => setSelected(available.filter((r) => !r.warning).map((r) => r.row))}>Chọn dòng mới không cảnh báo</button><button type="button" className="text-button" disabled={pending} onClick={() => setSelected([])}>Bỏ chọn</button><span>{selected.length} / {rows.length} dòng được chọn</span></div><p>Dòng cảnh báo cần kiểm tra trước khi tích chọn. Số đã có hoặc trùng trong file sẽ được bỏ qua.</p>
    <div className="table-wrap telecom-preview-table telecom-table"><table><thead><tr><th>Chọn</th><th>Dòng / Số điện thoại</th><th>Vị trí / Logger</th><th>Số thay thế</th><th>Trạng thái / Ghi chú</th><th>Đối chiếu</th></tr></thead><tbody>{rows.map((r) => <tr key={r.row}><td><input type="checkbox" aria-label={`Chọn dòng ${r.row}`} checked={selected.includes(r.row)} disabled={pending || !!r.error || r.saved || r.duplicate} onChange={(e) => setSelected((s) => e.target.checked ? [...s, r.row] : s.filter((n) => n !== r.row))}/></td><td><strong>{r.phone}</strong><small>{sheet} · Dòng {r.row}</small></td><td>{r.location || "—"}<small>{r.serial}</small></td><td>{r.replacement_phone || "—"}</td><td>{phoneStatuses[r.status]}<small>{r.note}</small></td><td>{r.error || (r.saved ? "Đã lưu · bỏ qua" : r.duplicate ? "Trùng trong file · bỏ qua" : r.warning || "Mới · hợp lệ")}</td></tr>)}</tbody></table></div>
    <form action={action} className="telecom-form-footer"><input type="hidden" name="rows" value={JSON.stringify(rows.filter((r) => selected.includes(r.row)))}/><p>Chỉ nhập dòng đã chọn. Dữ liệu hiện có không bị ghi đè.</p><button className="primary-button" disabled={pending || busy || !selected.length}>{pending ? "Đang nhập…" : `Nhập ${selected.length} số điện thoại`}</button></form></>}
  </div>;
}
export function PhoneImport() {
  const [open, setOpen] = useState(false); const router = useRouter(); const close = useCallback(() => setOpen(false), []); const finish = useCallback(() => { close(); router.refresh(); }, [close, router]);
  return <><button className="secondary-button" onClick={() => setOpen(true)}>Nhập Excel</button><AppModal open={open} onClose={close} title="Nhập danh mục số điện thoại" eyebrow="NHẬP EXCEL" size="wide"><ActionSuccessBoundary onSuccess={finish}>{open && <PhoneImportForm/>}</ActionSuccessBoundary></AppModal></>;
}
