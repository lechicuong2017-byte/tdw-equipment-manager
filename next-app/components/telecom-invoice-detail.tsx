"use client";
import { useActionState, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AppModal } from "@/components/app-modal";
import { ActionStateToast, ActionSuccessBoundary } from "@/components/action-toast";
import { updateTelecomInvoice, deleteTelecomInvoice, type TelecomActionState } from "@/app/(protected)/telecom/actions";
import {telecomCategories,telecomCategoryLabel} from "@/lib/telecom-invoices";

export type TelecomInvoiceRecord = {
  id:string;category:string;provider:string;subscriber:string;period_month:string;issued_on:string;
  invoice_series:string;invoice_number:string;contract_number:string;service:string;group_name:string;
  amount_before_tax:number|string;tax_amount:number|string;amount_after_tax:number|string;
  source_file:string;source_page:number;paid_on:string|null;note:string;
};
const date=(s:string)=>new Date(`${s}T00:00:00`).toLocaleDateString("vi-VN");
function Edit({ row }: {row:TelecomInvoiceRecord}) {
  const [state,action,pending]=useActionState(updateTelecomInvoice,{} as TelecomActionState);
  return <form action={action} className="telecom-edit-form"><ActionStateToast state={state}/><input type="hidden" name="id" value={row.id}/>
    <label>Hạng mục<select name="category" defaultValue={row.category}>{telecomCategories.map((c)=><option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
    <label>Nhóm / mục đích sử dụng<input name="group" defaultValue={row.group_name} maxLength={120}/></label>
    <label>Ngày đã thanh toán<input name="paid_on" type="date" defaultValue={row.paid_on||""}/><small>Để trống nếu chưa thanh toán.</small></label>
    <label className="telecom-full-row">Ghi chú<textarea name="note" defaultValue={row.note} rows={3} maxLength={2000}/></label>
    {state.error?<p className="form-error" role="alert">{state.error}</p>:null}
    <div className="telecom-form-footer telecom-full-row"><p>Thông tin thanh toán và nhóm SIM được đưa vào báo cáo.</p><button type="submit" className="primary-button" disabled={pending}>{pending?"Đang lưu…":"Lưu thay đổi"}</button></div>
  </form>;
}
function Delete({id}:{id:string}) {
  const [confirm,setConfirm]=useState(false);
  const [state,action,pending]=useActionState(deleteTelecomInvoice,{} as TelecomActionState);
  return <div className="telecom-delete"><ActionStateToast state={state}/>{!confirm?<button className="danger-button" type="button" onClick={()=>setConfirm(true)}>Xóa hóa đơn</button>:<form action={action}><input type="hidden" name="id" value={id}/><p>Xóa hóa đơn này khỏi danh sách và tổng chi phí?</p><div className="telecom-select-actions"><button type="button" className="secondary-button" onClick={()=>setConfirm(false)} disabled={pending}>Hủy</button><button type="submit" className="danger-button" disabled={pending}>{pending?"Đang xóa…":"Xác nhận xóa"}</button></div></form>}{state.error?<p className="form-error" role="alert">{state.error}</p>:null}</div>;
}
export function TelecomInvoiceDetail({row,manage,remove}:{row:TelecomInvoiceRecord;manage:boolean;remove:boolean}) {
  const [open,setOpen]=useState(false);const router=useRouter();
  const close=useCallback(()=>setOpen(false),[]);const finish=useCallback(()=>{close();router.refresh();},[close,router]);
  const fields=[ ["Thuê bao trên hóa đơn",row.subscriber],["Kỳ cước",`${row.period_month.slice(5,7)}/${row.period_month.slice(0,4)}`],["Nhà cung cấp",row.provider],["Ngày lập",date(row.issued_on)],["Hóa đơn",`${row.invoice_series} / ${row.invoice_number}`],["Hợp đồng",row.contract_number||"—"],["Dịch vụ",row.service],["Nhóm SIM",row.group_name||"—"],["Chưa thuế",Number(row.amount_before_tax).toLocaleString("vi-VN")+" ₫"],["Thuế VAT",Number(row.tax_amount).toLocaleString("vi-VN")+" ₫"],["Thanh toán",Number(row.amount_after_tax).toLocaleString("vi-VN")+" ₫"],["Trạng thái",row.paid_on?`Đã thanh toán ${date(row.paid_on)}`:"Chưa thanh toán"] ];
  return <><button type="button" className="text-button" onClick={()=>setOpen(true)}>Xem{manage?" / Sửa":""}</button><AppModal open={open} onClose={close} title={`Cước thuê bao ${row.subscriber}`} eyebrow="CHI TIẾT HÓA ĐƠN" size="wide">
    <dl className="telecom-detail-grid">{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{label==="Trạng thái"?<span className={`status-pill ${row.paid_on?"status-pill--active":"status-pill--retiring"}`}>{value}</span>:value}</dd></div>)}</dl>
    <p className="telecom-source">{telecomCategoryLabel(row.category)} · Nguồn: {row.source_file} · Trang {row.source_page}</p>
    <ActionSuccessBoundary onSuccess={finish}>{manage?<Edit key={row.id} row={row}/>:<p className="telecom-note">{row.note||"Chưa có ghi chú."}</p>}{remove?<Delete id={row.id}/>:null}</ActionSuccessBoundary>
  </AppModal></>;
}
