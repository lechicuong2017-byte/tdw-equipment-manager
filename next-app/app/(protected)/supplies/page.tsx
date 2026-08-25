import Link from "next/link";
import { redirect } from "next/navigation";
import { ModalTrigger, ConfirmAction } from "@/components/app-modal";
import { AppIcon } from "@/components/app-icon";
import { InteractiveTableRow } from "@/components/interactive-table-row";
import { PageHeader } from "@/components/page-header";
import {
  SupplierQuoteImportForm, SupplyImportForm, SupplyItemForm, SupplyQuoteForm,
  SupplyRequestEditForm, SupplyRequestForm, type SupplyItemOption,
} from "@/components/supply-forms";
import { archiveSupplyItem, deleteSupplyQuote, deleteSupplyRequest } from "./actions";
import { can, requireAccess } from "@/lib/auth";

export const metadata = { title: "Văn phòng phẩm & Dụng cụ vệ sinh" };
type SuppliesPageProps = { searchParams: Promise<{ section?: string; year?: string; quarter?: string; month?: string; category?: string }> };
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const categoryLabel = (value: string) => value === "OFFICE_SUPPLY" ? "Văn phòng phẩm" : "Dụng cụ vệ sinh";
const statusLabel: Record<string, string> = { DRAFT: "Nháp", SUBMITTED: "Đã trình", APPROVED: "Đã duyệt", ORDERED: "Đã đặt mua", CLOSED: "Hoàn tất", REJECTED: "Không duyệt" };
const quoteStatusLabel: Record<string, string> = { RECEIVED: "Đã nhận", REVIEWING: "Đang xem xét", SELECTED: "Đã chọn", REJECTED: "Không chọn", EXPIRED: "Hết hiệu lực" };
const periodLabel = (row: any) => row.period_type === "MONTH" ? `Tháng ${row.period_month}/${row.period_year}` : row.period_type === "QUARTER" ? `Quý ${row.period_quarter}/${row.period_year}` : `Năm ${row.period_year}`;
const dateLabel = (value?: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN") : "—";

export default async function SuppliesPage({ searchParams }: SuppliesPageProps) {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.view")) redirect("/modules");
  const params = await searchParams;
  const section = ["overview", "catalog", "requests", "quotes", "reports"].includes(params.section ?? "") ? params.section! : "overview";
  const year = Number(params.year) || new Date().getFullYear();
  const quarter = Number(params.quarter) || 0;
  const month = Number(params.month) || 0;
  const category = params.category === "OFFICE_SUPPLY" || params.category === "CLEANING_SUPPLY" ? params.category : "";
  const [itemsResult, requestsResult, linesResult, departmentsResult, quotesResult, quoteLinesResult] = await Promise.all([
    supabase.from("supply_items").select("id,category,item_code,item_name,unit,description,default_unit_price,active,updated_at").order("category").order("item_name"),
    supabase.from("supply_requests").select("id,request_no,category,period_type,period_year,period_month,period_quarter,requested_on,requesting_department,requester_name,checker_name,approver_name,status,note,source_file,created_at").order("requested_on", { ascending: false }),
    supabase.from("supply_request_lines").select("id,request_id,item_name,unit,proposed_quantity,stock_quantity,ordered_quantity,requested_departments,approval_note,approved_unit_price,amount,note,sort_order"),
    supabase.from("departments").select("id,name").order("name"),
    supabase.from("supply_quotes").select("id,quote_no,vendor_name,vendor_address,vendor_contact,category,quote_date,valid_until,status,subtotal,tax_rate,tax_amount,total_amount,note,source_file,source_sheet,created_at").order("quote_date", { ascending: false, nullsFirst: false }),
    supabase.from("supply_quote_lines").select("id,quote_id,item_name,unit,quantity,unit_price,old_unit_price,amount,note,sort_order").order("sort_order"),
  ]);
  const queryError = itemsResult.error || requestsResult.error || linesResult.error || departmentsResult.error;
  const quoteQueryError = quotesResult.error || quoteLinesResult.error;
  const items = (itemsResult.data ?? []) as SupplyItemOption[];
  const requests = requestsResult.data ?? [];
  const lines = linesResult.data ?? [];
  const quotes = quotesResult.data ?? [];
  const quoteLines = quoteLinesResult.data ?? [];
  const linesByRequest = new Map<string, typeof lines>();
  lines.forEach((line) => linesByRequest.set(line.request_id, [...(linesByRequest.get(line.request_id) ?? []), line]));
  const linesByQuote = new Map<string, typeof quoteLines>();
  quoteLines.forEach((line) => linesByQuote.set(line.quote_id, [...(linesByQuote.get(line.quote_id) ?? []), line]));
  const totalSpend = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
  const currentRequests = requests.filter((request) => request.period_year === new Date().getFullYear() && (request.period_type !== "QUARTER" || request.period_quarter === currentQuarter));
  const filteredRequests = requests.filter((request) => request.period_year === year && (!quarter || request.period_quarter === quarter) && (!month || request.period_month === month) && (!category || request.category === category));
  const filteredIds = new Set(filteredRequests.map((request) => request.id));
  const filteredLines = lines.filter((line) => filteredIds.has(line.request_id));
  const filteredTotal = filteredLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const tabs = [
    ["overview", "Tổng quan", "dashboard"], ["catalog", "Danh mục hàng", "supplies"],
    ["requests", "Phiếu yêu cầu", "assets"], ["quotes", "Báo giá NCC", "value"], ["reports", "Báo cáo", "reports"],
  ] as const;
  const sectionMetadata = {
    overview: ["Tổng quan mua sắm", "Số liệu, báo giá và phiếu cần theo dõi", "dashboard", "overview"],
    catalog: ["Danh mục hàng hóa", "Tên hàng, đơn vị và giá tham khảo dùng chung", "supplies", "catalog"],
    requests: ["Phiếu yêu cầu", "Nhu cầu mua theo tháng, quý hoặc năm", "assets", "requests"],
    quotes: ["Báo giá nhà cung cấp", "So sánh báo giá, VAT và tổng chi phí", "value", "quotes"],
    reports: ["Báo cáo mua sắm", "Lọc và xuất dữ liệu theo kỳ", "reports", "reports"],
  } as const;
  const meta = sectionMetadata[section as keyof typeof sectionMetadata] ?? sectionMetadata.overview;

  return <>
    <PageHeader eyebrow="HÀNH CHÍNH" title="Văn phòng phẩm & Dụng cụ vệ sinh" description="Quản lý danh mục, phiếu đề nghị, báo giá nhà cung cấp và chi phí mua sắm." actions={can(access, "supplies.manage") ? <div className="header-actions"><ModalTrigger description="Tạo danh mục dùng chung cho các kỳ mua." eyebrow="DANH MỤC" size="large" title="Thêm hàng hóa" triggerLabel="+ Hàng hóa"><SupplyItemForm /></ModalTrigger><ModalTrigger description="Tạo phiếu thủ công với dòng hàng đầu tiên." eyebrow="PHIẾU YÊU CẦU" size="wide" title="Phiếu mua sắm mới" triggerClassName="secondary-button" triggerLabel="+ Phiếu yêu cầu"><SupplyRequestForm departments={departmentsResult.data ?? []} items={items} /></ModalTrigger></div> : null} />
    {queryError ? <p className="form-error">Chưa thể tải dữ liệu phân hệ. Hãy áp dụng migration Supabase rồi tải lại.</p> : null}
    <nav className="vehicle-section-tabs supply-section-tabs" aria-label="Phân hệ mua sắm">{tabs.map(([key, label, icon]) => <Link className={section === key ? "active" : ""} href={key === "overview" ? "/supplies" : `/supplies?section=${key}`} key={key}><AppIcon name={icon} size={19} />{label}</Link>)}</nav>
    <section className={`supply-command-bar supply-command-bar--${meta[3]}`}><div className="supply-command-copy"><span><AppIcon name={meta[2]} size={22} /></span><div><small>KHU VỰC ĐANG LÀM VIỆC</small><strong>{meta[0]}</strong><p>{meta[1]}</p></div></div>{section === "quotes" && can(access, "supplies.import") ? <ModalTrigger description="Đọc tự động các mẫu báo giá nhà cung cấp." eyebrow="BÁO GIÁ" size="large" title="Nhập báo giá XLSX" triggerLabel="Nhập báo giá XLSX"><SupplierQuoteImportForm /></ModalTrigger> : null}</section>

    {section === "overview" ? <>
      <section className="metric-grid supply-metric-grid">
        <article className="metric-card supply-metric supply-metric--blue"><span><AppIcon name="supplies" /></span><small>Mặt hàng đang dùng</small><strong>{items.filter((item) => item.active).length}</strong><p>{items.filter((item) => item.category === "OFFICE_SUPPLY").length} VPP · {items.filter((item) => item.category === "CLEANING_SUPPLY").length} vệ sinh</p></article>
        <article className="metric-card supply-metric supply-metric--amber"><span><AppIcon name="assets" /></span><small>Phiếu kỳ hiện tại</small><strong>{currentRequests.length}</strong><p>Quý {currentQuarter}/{new Date().getFullYear()}</p></article>
        <article className="metric-card supply-metric supply-metric--violet"><span><AppIcon name="value" /></span><small>Báo giá nhà cung cấp</small><strong>{quotes.length}</strong><p>{quoteLines.length} dòng hàng đã nhận</p></article>
        <article className="metric-card supply-metric supply-metric--green"><span><AppIcon name="reports" /></span><small>Tổng chi phí ghi nhận</small><strong>{money.format(totalSpend)}</strong><p>{lines.length} dòng mua sắm</p></article>
      </section>
      <section className="supply-overview-grid"><article className="panel supply-panel supply-panel--requests"><div className="panel-heading"><div><p className="eyebrow">PHIẾU GẦN ĐÂY</p><h2>Nhu cầu mua sắm</h2></div>{can(access, "supplies.import") ? <ModalTrigger description="Nhận diện trực tiếp hai mẫu phiếu tổng hợp TDW." eyebrow="NHẬP DỮ LIỆU" size="medium" title="Nhập phiếu từ XLSX" triggerClassName="secondary-button" triggerLabel="Nhập phiếu XLSX"><SupplyImportForm /></ModalTrigger> : null}</div><SupplyRequestTable access={access} requests={requests.slice(0, 6)} linesByRequest={linesByRequest} /></article><article className="panel supply-panel supply-panel--quotes"><div className="panel-heading"><div><p className="eyebrow">BÁO GIÁ MỚI</p><h2>Nhà cung cấp</h2></div>{can(access, "supplies.import") ? <ModalTrigger description="Đọc báo giá Lan Anh, Hưng Thịnh và các mẫu có cột tương đương." eyebrow="BÁO GIÁ" size="large" title="Nhập báo giá XLSX" triggerClassName="secondary-button" triggerLabel="+ Báo giá"><SupplierQuoteImportForm /></ModalTrigger> : null}</div>{quoteQueryError ? <p className="form-error">Chưa áp dụng cấu trúc báo giá mới trên Supabase.</p> : <SupplyQuoteCards quotes={quotes.slice(0, 5)} />}</article></section>
    </> : null}

    {section === "catalog" ? <CatalogSection access={access} items={items} /> : null}
    {section === "requests" ? <section className="panel supply-panel supply-panel--requests"><div className="panel-heading"><div><p className="eyebrow">PHIẾU YÊU CẦU</p><h2>Mua sắm theo kỳ</h2></div>{can(access, "supplies.import") ? <ModalTrigger description="Nhập phiếu VPP hoặc dụng cụ vệ sinh theo hai file tổng hợp TDW." eyebrow="NHẬP DỮ LIỆU" size="medium" title="Nhập lịch sử XLSX" triggerClassName="secondary-button" triggerLabel="Nhập XLSX"><SupplyImportForm /></ModalTrigger> : null}</div><SupplyRequestTable access={access} requests={requests} linesByRequest={linesByRequest} /></section> : null}
    {section === "quotes" ? <section className="panel supply-panel supply-panel--quotes"><div className="panel-heading"><div><p className="eyebrow">BÁO GIÁ NHÀ CUNG CẤP</p><h2>Danh sách báo giá đã nhận</h2></div><span>{quotes.length} báo giá</span></div>{quoteQueryError ? <p className="form-error">Chưa thể tải báo giá. Hãy áp dụng migration Supabase mới.</p> : <SupplyQuoteTable access={access} linesByQuote={linesByQuote} quotes={quotes} />}</section> : null}
    {section === "reports" ? <ReportsSection category={category} filteredLines={filteredLines} filteredRequests={filteredRequests} filteredTotal={filteredTotal} month={month} quarter={quarter} year={year} /> : null}
  </>;
}

function CatalogSection({ items, access }: { items: SupplyItemOption[]; access: any }) {
  return <section className="panel supply-panel supply-panel--catalog"><div className="panel-heading"><div><p className="eyebrow">DANH MỤC</p><h2>Hàng hóa đang quản lý</h2></div><span>{items.length} mặt hàng</span></div><div className="table-wrap"><table><thead><tr><th>Tên hàng</th><th>Loại</th><th>Đơn vị</th><th>Đơn giá</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{items.map((item) => <InteractiveTableRow className={`supply-row supply-row--${item.category === "OFFICE_SUPPLY" ? "office" : "cleaning"}`} key={item.id}><td><strong className="interactive-row-title">{item.item_name}</strong><small>{item.item_code || "Chưa đặt mã"} · {item.description || "Chưa có mô tả"}</small></td><td><span className={`supply-category-pill ${item.category === "OFFICE_SUPPLY" ? "office" : "cleaning"}`}>{categoryLabel(item.category)}</span></td><td>{item.unit}</td><td>{money.format(Number(item.default_unit_price || 0))}</td><td><span className={`status-pill ${item.active ? "status-ok" : "status-muted"}`}>{item.active ? "Đang dùng" : "Ngừng dùng"}</span></td><td><div className="table-actions row-actions"><ModalTrigger description="Thông tin dùng chung trong phiếu yêu cầu và báo giá." eyebrow="CHI TIẾT HÀNG HÓA" size="medium" title={item.item_name} triggerClassName="text-button row-detail-trigger" triggerLabel="Xem"><SupplyItemDetail item={item} /></ModalTrigger>{can(access, "supplies.manage") ? <ModalTrigger description="Cập nhật tên, đơn vị, loại và đơn giá mặc định." eyebrow="DANH MỤC" size="large" title={`Sửa ${item.item_name}`} triggerClassName="text-button" triggerLabel="Sửa"><SupplyItemForm initial={item} /></ModalTrigger> : null}{can(access, "supplies.delete") && item.active ? <ConfirmAction action={archiveSupplyItem} description={`Xóa “${item.item_name}” khỏi danh mục đang dùng? Dữ liệu phiếu cũ vẫn được giữ nguyên.`} fields={{ id: item.id }} title="Xóa hàng hóa?" triggerLabel="Xóa" /> : null}</div></td></InteractiveTableRow>)}</tbody></table></div></section>;
}

function ReportsSection({ category, filteredLines, filteredRequests, filteredTotal, month, quarter, year }: any) {
  return <><section className="report-filter-panel supply-report-filter"><div><p className="eyebrow">BỘ LỌC BÁO CÁO</p><h2>Chi phí mua sắm</h2><p>{filteredRequests.length} phiếu · {filteredLines.length} dòng · {money.format(filteredTotal)}</p></div><form className="report-filter-grid"><input name="section" type="hidden" value="reports" /><label>Năm<input defaultValue={year} min={2000} max={2200} name="year" type="number" /></label><label>Quý<select defaultValue={quarter} name="quarter"><option value="0">Tất cả quý</option>{[1,2,3,4].map((value) => <option key={value} value={value}>Quý {value}</option>)}</select></label><label>Tháng<select defaultValue={month} name="month"><option value="0">Tất cả tháng</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>Tháng {index + 1}</option>)}</select></label><label>Loại<select defaultValue={category} name="category"><option value="">Tất cả loại</option><option value="OFFICE_SUPPLY">Văn phòng phẩm</option><option value="CLEANING_SUPPLY">Dụng cụ vệ sinh</option></select></label><button className="primary-button" type="submit">Áp dụng</button></form></section><section className="panel supply-panel supply-panel--reports"><div className="panel-heading"><div><p className="eyebrow">CHI TIẾT</p><h2>Dòng hàng theo bộ lọc</h2></div><Link className="secondary-button" href={`/api/supplies/reports?format=xlsx&year=${year}&quarter=${quarter}&month=${month}&category=${category}`}>Xuất XLSX</Link></div><div className="table-wrap"><table><thead><tr><th>Phiếu / kỳ</th><th>Hàng hóa</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th><th>Phê duyệt</th></tr></thead><tbody>{filteredLines.map((line: any) => { const request = filteredRequests.find((item: any) => item.id === line.request_id); return <tr key={line.id}><td><strong>{request?.request_no}</strong><small>{request ? `${categoryLabel(request.category)} · ${periodLabel(request)}` : ""}</small></td><td><strong>{line.item_name}</strong><small>{line.unit} · {line.requested_departments}</small></td><td>{Number(line.ordered_quantity).toLocaleString("vi-VN")}</td><td>{money.format(Number(line.approved_unit_price))}</td><td><strong>{money.format(Number(line.amount))}</strong></td><td>{line.approval_note || "—"}</td></tr>; })}</tbody></table></div></section></>;
}

function SupplyItemDetail({ item }: { item: SupplyItemOption }) {
  return <div className="supply-detail-grid"><div><small>Loại hàng</small><strong>{categoryLabel(item.category)}</strong></div><div><small>Mã hàng</small><strong>{item.item_code || "Chưa đặt mã"}</strong></div><div><small>Đơn vị</small><strong>{item.unit}</strong></div><div><small>Đơn giá tham khảo</small><strong>{money.format(Number(item.default_unit_price || 0))}</strong></div><div className="span-2"><small>Mô tả</small><strong>{item.description || "Chưa có mô tả"}</strong></div></div>;
}

function SupplyRequestTable({ requests, linesByRequest, access }: { requests: Array<any>; linesByRequest: Map<string, Array<any>>; access: any }) {
  return <div className="table-wrap"><table><thead><tr><th>Số phiếu</th><th>Loại / kỳ</th><th>Người đề nghị</th><th>Tiến độ</th><th>Dòng hàng</th><th>Tổng tiền</th><th>Thao tác</th></tr></thead><tbody>{requests.map((request) => { const rows = linesByRequest.get(request.id) ?? []; const total = rows.reduce((sum, line) => sum + Number(line.amount || 0), 0); return <InteractiveTableRow className="supply-row supply-row--request" key={request.id}><td><strong className="interactive-row-title">{request.request_no}</strong><small>{dateLabel(request.requested_on)}</small></td><td><strong>{categoryLabel(request.category)}</strong><small>{periodLabel(request)}</small></td><td>{request.requester_name || "—"}<small>{request.requesting_department}</small></td><td><span className={`status-pill ${request.status === "REJECTED" ? "status-danger" : request.status === "CLOSED" || request.status === "ORDERED" ? "status-ok" : ""}`}>{statusLabel[request.status] ?? request.status}</span></td><td>{rows.length} mặt hàng<small>{rows.slice(0, 2).map((line) => line.item_name).join(" · ")}</small></td><td><strong>{money.format(total)}</strong><small>{request.source_file ? `Nhập từ ${request.source_file}` : "Tạo thủ công"}</small></td><td><div className="table-actions row-actions"><ModalTrigger description={`${categoryLabel(request.category)} · ${periodLabel(request)}`} eyebrow="CHI TIẾT PHIẾU" size="wide" title={`Phiếu ${request.request_no}`} triggerClassName="text-button row-detail-trigger" triggerLabel="Xem"><SupplyRequestDetail request={request} rows={rows} total={total} /></ModalTrigger>{can(access, "supplies.manage") ? <ModalTrigger description="Cập nhật người xử lý, trạng thái và ghi chú của phiếu." eyebrow="PHIẾU YÊU CẦU" size="large" title={`Sửa phiếu ${request.request_no}`} triggerClassName="text-button" triggerLabel="Sửa"><SupplyRequestEditForm initial={request} /></ModalTrigger> : null}{can(access, "supplies.delete") ? <ConfirmAction action={deleteSupplyRequest} description={`Xóa phiếu “${request.request_no}”? Các dòng hàng của phiếu sẽ không còn hiển thị.`} fields={{ id: request.id }} title="Xóa phiếu yêu cầu?" triggerLabel="Xóa" /> : null}</div></td></InteractiveTableRow>; })}{!requests.length ? <tr><td colSpan={7} className="empty-state">Chưa có phiếu yêu cầu.</td></tr> : null}</tbody></table></div>;
}

function SupplyRequestDetail({ request, rows, total }: { request: any; rows: Array<any>; total: number }) {
  return <div className="supply-detail-stack"><div className="supply-detail-grid"><div><small>Ngày đề nghị</small><strong>{dateLabel(request.requested_on)}</strong></div><div><small>Trạng thái</small><strong>{statusLabel[request.status] ?? request.status}</strong></div><div><small>Người đề nghị</small><strong>{request.requester_name || "—"}</strong></div><div><small>Người duyệt</small><strong>{request.approver_name || "—"}</strong></div><div><small>Số mặt hàng</small><strong>{rows.length}</strong></div><div><small>Tổng tiền</small><strong>{money.format(total)}</strong></div></div><div className="supply-detail-lines">{rows.map((line) => <article key={line.id}><div><strong>{line.item_name}</strong><small>{Number(line.ordered_quantity).toLocaleString("vi-VN")} {line.unit} · {money.format(Number(line.approved_unit_price))}</small></div><strong>{money.format(Number(line.amount))}</strong></article>)}</div></div>;
}

function SupplyQuoteCards({ quotes }: { quotes: Array<any> }) {
  if (!quotes.length) return <p className="empty-state">Chưa có báo giá nhà cung cấp.</p>;
  return <div className="supply-quote-cards">{quotes.map((quote) => <article key={quote.id}><span className={`supply-category-dot ${quote.category === "OFFICE_SUPPLY" ? "office" : "cleaning"}`} /><div><strong>{quote.vendor_name}</strong><small>{dateLabel(quote.quote_date)} · {categoryLabel(quote.category)}</small></div><b>{money.format(Number(quote.total_amount || 0))}</b></article>)}</div>;
}

function SupplyQuoteTable({ quotes, linesByQuote, access }: { quotes: Array<any>; linesByQuote: Map<string, Array<any>>; access: any }) {
  return <div className="table-wrap"><table><thead><tr><th>Nhà cung cấp</th><th>Ngày / loại hàng</th><th>Dòng hàng</th><th>VAT</th><th>Tổng tiền</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{quotes.map((quote) => { const rows = linesByQuote.get(quote.id) ?? []; return <InteractiveTableRow className={`supply-row supply-row--${quote.category === "OFFICE_SUPPLY" ? "office" : "cleaning"}`} key={quote.id}><td><strong className="interactive-row-title">{quote.vendor_name}</strong><small>{quote.quote_no || quote.source_file || "Báo giá"}</small></td><td>{dateLabel(quote.quote_date)}<small>{categoryLabel(quote.category)}</small></td><td><strong>{rows.length} mặt hàng</strong><small>{rows.slice(0, 2).map((line) => line.item_name).join(" · ")}</small></td><td>{Number(quote.tax_rate || 0).toLocaleString("vi-VN")}%<small>{money.format(Number(quote.tax_amount || 0))}</small></td><td><strong>{money.format(Number(quote.total_amount || 0))}</strong><small>Trước thuế {money.format(Number(quote.subtotal || 0))}</small></td><td><span className={`status-pill ${quote.status === "SELECTED" ? "status-ok" : quote.status === "REJECTED" || quote.status === "EXPIRED" ? "status-danger" : ""}`}>{quoteStatusLabel[quote.status] ?? quote.status}</span></td><td><div className="table-actions row-actions"><ModalTrigger description={`${categoryLabel(quote.category)} · ${dateLabel(quote.quote_date)}`} eyebrow="CHI TIẾT BÁO GIÁ" size="wide" title={quote.vendor_name} triggerClassName="text-button row-detail-trigger" triggerLabel="Xem"><SupplyQuoteDetail quote={quote} rows={rows} /></ModalTrigger>{can(access, "supplies.manage") ? <ModalTrigger description="Cập nhật thông tin nhà cung cấp, ngày và trạng thái lựa chọn." eyebrow="BÁO GIÁ" size="large" title={`Sửa ${quote.vendor_name}`} triggerClassName="text-button" triggerLabel="Sửa"><SupplyQuoteForm initial={quote} /></ModalTrigger> : null}{can(access, "supplies.delete") ? <ConfirmAction action={deleteSupplyQuote} description={`Xóa báo giá của “${quote.vendor_name}”? Dữ liệu được ẩn và vẫn giữ trong nhật ký kiểm toán.`} fields={{ id: quote.id }} title="Xóa báo giá?" triggerLabel="Xóa" /> : null}</div></td></InteractiveTableRow>; })}{!quotes.length ? <tr><td colSpan={7} className="empty-state">Chưa có báo giá nhà cung cấp.</td></tr> : null}</tbody></table></div>;
}

function SupplyQuoteDetail({ quote, rows }: { quote: any; rows: Array<any> }) {
  return <div className="supply-detail-stack"><div className="supply-detail-grid"><div><small>Ngày báo giá</small><strong>{dateLabel(quote.quote_date)}</strong></div><div><small>Loại hàng</small><strong>{categoryLabel(quote.category)}</strong></div><div><small>Trạng thái</small><strong>{quoteStatusLabel[quote.status] ?? quote.status}</strong></div><div><small>VAT</small><strong>{Number(quote.tax_rate || 0).toLocaleString("vi-VN")}% · {money.format(Number(quote.tax_amount || 0))}</strong></div><div><small>Trước thuế</small><strong>{money.format(Number(quote.subtotal || 0))}</strong></div><div><small>Tổng thanh toán</small><strong>{money.format(Number(quote.total_amount || 0))}</strong></div><div className="span-2"><small>Địa chỉ / liên hệ</small><strong>{[quote.vendor_address, quote.vendor_contact].filter(Boolean).join(" · ") || "—"}</strong></div></div><div className="supply-detail-lines">{rows.map((line) => <article key={line.id}><div><strong>{line.item_name}</strong><small>{Number(line.quantity).toLocaleString("vi-VN")} {line.unit} · {money.format(Number(line.unit_price))}{line.note ? ` · ${line.note}` : ""}</small></div><strong>{money.format(Number(line.amount))}</strong></article>)}</div></div>;
}
