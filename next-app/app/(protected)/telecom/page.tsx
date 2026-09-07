import Link from "next/link";
import { can, requireModuleAccess } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { TelecomImport } from "@/components/telecom-import";
import { TelecomInvoiceDetail, type TelecomInvoiceRecord } from "@/components/telecom-invoice-detail";
import { telecomCategories, telecomCategoryLabel, telecomFilterSchema, telecomPeriod } from "@/lib/telecom-invoices";

export const metadata={title:"Chi phí viễn thông"};
type Summary={period_month:string;category:string;invoice_count:number;sim_count:number;before_tax:number;vat:number;total:number;unpaid:number};
const money=(v:number|string)=>`${Number(v).toLocaleString("vi-VN")} ₫`;
export default async function TelecomPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const {access,supabase}=await requireModuleAccess("telecom");
  if(!can(access,"telecom.view"))return <p className="form-error">Bạn chưa có quyền xem chi phí viễn thông.</p>;
  const raw=await searchParams;
  const currentYear=Number(new Intl.DateTimeFormat("en",{year:"numeric",timeZone:"Asia/Ho_Chi_Minh"}).format(new Date()));
  const filter=telecomFilterSchema.safeParse({year:raw.year||currentYear,month:raw.month||undefined,page:raw.page||1,category:raw.category||undefined});
  if(!filter.success)return <><PageHeader title="Bộ lọc không hợp lệ"/><Link href="/telecom">Về chi phí viễn thông</Link></>;
  const {year,month,page,category}=filter.data;const {start,end}=telecomPeriod(year,month);
  let detailQuery=supabase.from("telecom_invoices").select("id,category,provider,subscriber,period_month,issued_on,invoice_series,invoice_number,contract_number,service,group_name,amount_before_tax,tax_amount,amount_after_tax,source_file,source_page,paid_on,note",{count:"exact"})
    .is("deleted_at",null).gte("period_month",start).lt("period_month",end);
  if(category)detailQuery=detailQuery.eq("category",category);
  const [summaryResult,detailResult]=await Promise.all([
    supabase.rpc("telecom_cost_summary",{target_year:year}),
    detailQuery.order("period_month",{ascending:false}).order("subscriber").order("id").range((page-1)*50,page*50-1),
  ]);
  const summary=(summaryResult.data||[]) as Summary[];
  const periodSummary=summary.filter((s)=>!month||Number(s.period_month.slice(5,7))===month);
  const selected=periodSummary.filter((s)=>!category||s.category===category);
  const total=selected.reduce((s,r)=>s+Number(r.total),0);const unpaid=selected.reduce((s,r)=>s+Number(r.unpaid),0);
  const rows=(detailResult.data||[]) as TelecomInvoiceRecord[];const count=detailResult.count||0;const pages=Math.max(1,Math.ceil(count/50));
  const query=`year=${year}${month?`&month=${month}`:""}${category?`&category=${category}`:""}`;
  const href=(p:number)=>`/telecom?${query}&page=${p}#telecom-invoices`;
  const exportHref=`/api/telecom/report?${query}`;
  return <div className="telecom-workspace">
    <PageHeader eyebrow="DỊCH VỤ" title="Chi phí viễn thông" description="Tuyến ống & ICCPs, điện thoại bàn và điện thoại TGĐ. Theo dõi thanh toán và báo cáo theo kỳ cước." actions={can(access,"telecom.import")?<TelecomImport key={category||"all"} defaultCategory={category}/>:undefined}/>
    <nav className="telecom-nav" aria-label="Mục viễn thông"><Link href="/modules">← Đổi phân hệ</Link><a href="#telecom-reports">Tổng hợp & báo cáo</a><a href="#telecom-invoices">Hóa đơn dịch vụ</a><Link href="/account">Tài khoản</Link></nav>
    <section className="panel telecom-filter" id="telecom-reports"><form key={query}><label>Năm<input name="year" type="number" min={2000} max={2100} defaultValue={year} required/></label><label>Kỳ cước<select name="month" defaultValue={month||""}><option value="">Cả năm</option>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>Tháng {i+1}</option>)}</select></label><label>Hạng mục<select name="category" defaultValue={category||""}><option value="">Tất cả hạng mục</option>{telecomCategories.map((c)=><option key={c.code} value={c.code}>{c.label}</option>)}</select></label><button className="secondary-button" type="submit">Xem chi phí</button></form>{can(access,"reports.telecom.export")?<a className="primary-button" href={exportHref}>Xuất Excel {month?`${month}/`:"năm "}{year}</a>:null}</section>
    {summaryResult.error||detailResult.error?<p className="form-error" role="alert">Chưa tải được chi phí viễn thông. Vui lòng tải lại trang.</p>:<>
    <div className="telecom-metrics"><article><small>TỔNG THANH TOÁN · {month?`${month}/`:"NĂM "}{year}</small><strong>{money(total)}</strong><span>Đã bao gồm VAT</span></article><article><small>CHƯA THANH TOÁN</small><strong>{money(unpaid)}</strong><span>Theo ngày thanh toán đã ghi nhận</span></article><article><small>HÓA ĐƠN TRONG KỲ</small><strong>{count}</strong><span>Thống kê theo kỳ cước trên hóa đơn</span></article></div>
    <div className="telecom-categories" aria-label="Ba hạng mục viễn thông">{telecomCategories.map((c)=><Link key={c.code} className={category===c.code?"is-active":""} href={`/telecom?year=${year}${month?`&month=${month}`:""}&category=${c.code}`} aria-current={category===c.code?"page":undefined}><span>{c.label}</span><strong>{money(periodSummary.filter((r)=>r.category===c.code).reduce((s,r)=>s+Number(r.total),0))}</strong><small>Xem hóa đơn →</small></Link>)}</div>
    <section className="panel"><div className="telecom-heading"><div><p className="eyebrow">TỔNG HỢP {month?`${month}/`:"NĂM "}{year}</p><h2>Chi phí theo tháng và hạng mục</h2></div><p>Nhấp vào tháng để xem chi tiết.</p></div><div className="table-wrap telecom-table"><table><thead><tr><th>Kỳ cước / hạng mục</th><th>Hóa đơn</th><th>Thuê bao</th><th>Chưa thuế</th><th>VAT</th><th>Tổng thanh toán</th><th>Chưa thanh toán</th></tr></thead><tbody>{selected.map((s)=><tr key={`${s.period_month}-${s.category}`}><td><Link className="text-button" href={`/telecom?year=${year}&month=${Number(s.period_month.slice(5,7))}&category=${s.category}#telecom-invoices`}>Tháng {s.period_month.slice(5,7)}/{year}</Link><small>{telecomCategoryLabel(s.category)}</small></td><td>{s.invoice_count}</td><td>{s.sim_count}</td><td className="telecom-money">{money(s.before_tax)}</td><td className="telecom-money">{money(s.vat)}</td><td className="telecom-money"><strong>{money(s.total)}</strong></td><td className="telecom-money">{money(s.unpaid)}</td></tr>)}{!selected.length?<tr><td colSpan={7}>Chưa có hóa đơn phù hợp bộ lọc.</td></tr>:null}</tbody></table></div></section>
    <section className="panel" id="telecom-invoices"><div className="telecom-heading"><div><p className="eyebrow">HÓA ĐƠN DỊCH VỤ</p><h2>{category?telecomCategoryLabel(category):"Tất cả hạng mục"} · {month?`${month}/${year}`:year}</h2></div><span>{count} hóa đơn</span></div><div className="table-wrap telecom-table"><table><thead><tr><th>Thuê bao / hạng mục</th><th>Kỳ cước</th><th>Hóa đơn</th><th>Thanh toán</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{rows.map((r)=><tr key={r.id}><td><strong>{r.subscriber}</strong><small>{telecomCategoryLabel(r.category)}</small>{r.group_name?<small>{r.group_name}</small>:null}</td><td>{r.period_month.slice(5,7)}/{r.period_month.slice(0,4)}</td><td>{r.invoice_series} / {r.invoice_number}<small>Lập ngày {new Date(`${r.issued_on}T00:00:00`).toLocaleDateString("vi-VN")}</small></td><td className="telecom-money"><strong>{money(r.amount_after_tax)}</strong></td><td><span className={`status-pill ${r.paid_on?"status-pill--active":"status-pill--retiring"}`}>{r.paid_on?"Đã thanh toán":"Chưa thanh toán"}</span></td><td><TelecomInvoiceDetail row={r} manage={can(access,"telecom.manage")} remove={can(access,"telecom.delete")}/></td></tr>)}{!rows.length?<tr><td colSpan={6}>Chưa có hóa đơn phù hợp bộ lọc.</td></tr>:null}</tbody></table></div>
    {pages>1?<div className="telecom-pagination">{page>1?<Link href={href(page-1)}>← Trang trước</Link>:<span/>}<span>Trang {page}/{pages}</span>{page<pages?<Link href={href(page+1)}>Trang sau →</Link>:<span/>}</div>:null}</section></>}
  </div>;
}
