"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppModal } from "@/components/app-modal";
import { ActionStateToast, ActionSuccessBoundary } from "@/components/action-toast";
import { parseTelecomInvoice, telecomPageText, telecomCategories,telecomCategoryLabel,type TelecomCategory, type TelecomPreviewRow } from "@/lib/telecom-invoices";
import { importTelecomInvoices, previewTelecomInvoices, type TelecomActionState } from "@/app/(protected)/telecom/actions";

const money = (v: number) => `${v.toLocaleString("vi-VN")} ₫`;
const periodLabel = (s: string) => `${s.slice(5,7)}/${s.slice(0,4)}`;
const statusLabels = { new: "Mới", saved: "Đã lưu · bỏ qua", duplicate: "Trùng trong PDF", conflict: "Khác dữ liệu · cần kiểm tra" };

function Review({ rows, source, group,category }: { rows: TelecomPreviewRow[]; source: string; group: string;category:TelecomCategory }) {
  const importable = rows.filter((r) => r.status === "new");
  const [selected, setSelected] = useState(new Set(importable.map((r) => r.key)));
  const chosen = importable.filter((r) => selected.has(r.key));
  const [state, action, pending] = useActionState(importTelecomInvoices, {} as TelecomActionState);
  return <form action={action} className="telecom-review" data-unsaved-changes="true">
    <ActionStateToast state={state} />
    <input type="hidden" name="source" value={source}/><input type="hidden" name="group" value={group}/>
    <input type="hidden" name="category" value={category}/><p className="telecom-source">Hạng mục: <strong>{telecomCategoryLabel(category)}</strong></p>
    <input type="hidden" name="rows" value={JSON.stringify(chosen)}/>
    <div className="telecom-review-summary"><div><small>ĐANG CHỌN</small><strong>{chosen.length} hóa đơn · {money(chosen.reduce((sum,r) => sum+r.amount_after_tax,0))}</strong></div><span>Kỳ cước: {[...new Set(chosen.map((r) => periodLabel(r.period_month)))].join(", ") || "—"}</span></div>
    <div className="telecom-select-actions"><button type="button" className="text-button" disabled={pending} onClick={() => setSelected(new Set(importable.map((r) => r.key)))}>Chọn tất cả hóa đơn mới</button><button type="button" className="text-button" disabled={pending} onClick={() => setSelected(new Set())}>Bỏ chọn</button></div>
    <div className="table-wrap telecom-preview-table"><table><thead><tr><th>Chọn</th><th>Thuê bao / trang</th><th>Kỳ cước</th><th>Hóa đơn / ngày lập</th><th>Chưa thuế</th><th>VAT</th><th>Thanh toán</th><th>Đối chiếu</th></tr></thead><tbody>{rows.map((r) => <tr key={`${r.page}|${r.key}`}>
      <td><input type="checkbox" aria-label={`Chọn hóa đơn trang ${r.page}`} disabled={pending || r.status!=="new"} checked={r.status==="new" && selected.has(r.key)} onChange={() => setSelected((old) => {const next=new Set(old); if(next.has(r.key))next.delete(r.key);else next.add(r.key);return next;})}/></td>
      <td><strong>{r.subscriber}</strong><small>Trang {r.page} · {r.provider}</small></td><td>{periodLabel(r.period_month)}</td><td>{r.invoice_series} / {r.invoice_number}<small>{new Date(`${r.issued_on}T00:00:00`).toLocaleDateString("vi-VN")}</small></td>
      <td className="telecom-money">{money(r.amount_before_tax)}</td><td className="telecom-money">{money(r.tax_amount)}</td><td className="telecom-money"><strong>{money(r.amount_after_tax)}</strong></td><td><span className={`status-pill ${r.status==="new"?"status-pill--active":"status-muted"}`}>{statusLabels[r.status]}</span></td>
    </tr>)}</tbody></table></div>
    {state.error ? <p className="form-error" role="alert">{state.error}</p>:null}
    <div className="telecom-form-footer"><p>Chỉ các hóa đơn đã chọn được lưu. Chi phí được tổng hợp theo kỳ cước trên hóa đơn.</p><button type="submit" className="primary-button" disabled={pending || !chosen.length}>{pending?"Đang lưu…":`Nhập ${chosen.length} hóa đơn`}</button></div>
  </form>;
}

export function TelecomImport({defaultCategory="pipeline"}:{defaultCategory?:TelecomCategory}) {
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [file,setFile]=useState<File|null>(null);
  const [group,setGroup]=useState("");
  const [category,setCategory]=useState<TelecomCategory>(defaultCategory);
  const [rows,setRows]=useState<TelecomPreviewRow[]>([]);
  const [error,setError]=useState("");
  const [progress,setProgress]=useState("");
  const revision=useRef(0);
  const close=useCallback(()=>{ revision.current++;setOpen(false);setFile(null);setRows([]);setGroup("");setError("");setProgress(""); },[]);
  const finish=useCallback(()=>{close();router.refresh();},[close,router]);
  async function preview() {
    if(!file){setError("Hãy chọn file PDF hóa đơn.");return;}
    if(!file.name.toLowerCase().endsWith(".pdf") || file.size>20*1024*1024){setError("Chọn PDF không quá 20 MB.");return;}
    const request=++revision.current;
    setRows([]);setError("");setProgress("Đang mở PDF…");
    let document: Awaited<ReturnType<typeof import("pdfjs-dist/legacy/build/pdf.mjs").getDocument>["promise"]> | undefined;
    try {
      const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs",import.meta.url).toString();
      document=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false}).promise;
      if(document.numPages<1 || document.numPages>200)throw new Error("Mỗi PDF cần có từ 1 đến 200 trang.");
      const parsed=[];
      for(let pageNo=1;pageNo<=document.numPages;pageNo++) {
        if(request!==revision.current)return;
        setProgress(`Đang đọc trang ${pageNo}/${document.numPages}…`);
        const page=await document.getPage(pageNo);const content=await page.getTextContent();
        const text=telecomPageText(content.items.filter((item)=>"str" in item));
        parsed.push(parseTelecomInvoice(text,pageNo));page.cleanup();
      }
      if(request!==revision.current)return;
      setProgress("Đang đối chiếu hóa đơn đã lưu…");
      const result=await previewTelecomInvoices(parsed);
      if(request!==revision.current)return;
      if(result.error)throw new Error(result.error);
      setRows(result.rows||[]);
    } catch(e) {if(request===revision.current)setError(e instanceof Error?e.message:"Không thể đọc hóa đơn. Hãy kiểm tra PDF.");}
    finally {await document?.destroy();if(request===revision.current)setProgress("");}
  }
  return <><button type="button" className="primary-button" onClick={()=>setOpen(true)}>+ Nhập hóa đơn PDF</button>
    <AppModal open={open} onClose={close} title="Nhập hóa đơn viễn thông" eyebrow="CHI PHÍ VIỄN THÔNG" description="Đọc hóa đơn, đối chiếu thuê bao và chọn các dòng cần nhập. Thống kê theo kỳ cước, có thể khác tháng lập hóa đơn." size="wide">
      <div className="telecom-upload">
        <label>File hóa đơn PDF · tối đa 20 MB<span className="app-file-picker"><input type="file" aria-label="File hóa đơn viễn thông PDF" accept="application/pdf,.pdf" disabled={!!progress} onChange={(e)=>{revision.current++;setRows([]);setError("");setFile(e.target.files?.[0]||null);}}/><strong>Chọn PDF</strong><em>{file?.name||"Chưa chọn file"}</em></span></label>
        <div className="telecom-upload-options"><label>Hạng mục<select value={category} onChange={(e)=>setCategory(e.target.value as TelecomCategory)} disabled={!!progress}>{telecomCategories.map((c)=><option key={c.code} value={c.code}>{c.label}</option>)}</select></label><label>Nhóm / mục đích sử dụng<input placeholder="Ví dụ: Tuyến ống khu vực 1" maxLength={120} value={group} onChange={(e)=>setGroup(e.target.value)} disabled={!!progress}/></label></div>
        <button type="button" className="secondary-button" disabled={!!progress || !file} onClick={preview}>{progress||"Đọc và xem trước"}</button>
      </div>
      {error?<p className="form-error" role="alert">{error}</p>:null}
      {rows.length?<ActionSuccessBoundary onSuccess={finish}><Review rows={rows} source={file?.name||"Hoa don.pdf"} group={group} category={category}/></ActionSuccessBoundary>:null}
    </AppModal>
  </>;
}
