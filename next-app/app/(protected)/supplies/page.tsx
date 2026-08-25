import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoSubmitSearchInput, AutoSubmitSelect, InstantFilterForm } from "@/components/auto-submit-select";
import { ModalTrigger, ConfirmAction } from "@/components/app-modal";
import { AppIcon } from "@/components/app-icon";
import { InteractiveTableRow } from "@/components/interactive-table-row";
import { PageHeader } from "@/components/page-header";
import {
  SupplierQuoteImportForm, SupplyImportForm, SupplyItemForm, SupplyQuoteForm,
  SupplyInventoryMovementForm, SupplyRequestEditForm, SupplyRequestForm, type SupplyItemOption,
} from "@/components/supply-forms";
import { archiveSupplyItem, deleteSupplyQuote, deleteSupplyRequest } from "./actions";
import { can, requireAccess } from "@/lib/auth";
import { normalizeSearchText } from "@/lib/search";

export const metadata = { title: "Văn phòng phẩm & Dụng cụ vệ sinh" };
type SuppliesPageProps = { searchParams: Promise<{ section?: string; year?: string; quarter?: string; month?: string; category?: string; q?: string; vendor?: string; price_min?: string; price_max?: string }> };
type SupplierSnapshot = { vendorName: string; unitPrice: number; quoteDate: string | null };
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const categoryLabel = (value: string) => value === "OFFICE_SUPPLY" ? "Văn phòng phẩm" : value === "CLEANING_SUPPLY" ? "Dụng cụ vệ sinh" : "VPP & Dụng cụ vệ sinh";
const statusLabel: Record<string, string> = { DRAFT: "Nháp", SUBMITTED: "Đã trình", APPROVED: "Đã duyệt", ORDERED: "Đã đặt mua", CLOSED: "Hoàn tất", REJECTED: "Không duyệt" };
const quoteStatusLabel: Record<string, string> = { RECEIVED: "Đã nhận", REVIEWING: "Đang xem xét", SELECTED: "Đã chọn", REJECTED: "Không chọn", EXPIRED: "Hết hiệu lực" };
const movementLabel: Record<string, string> = { RECEIPT: "Nhập từ báo giá", ISSUE: "Xuất theo phiếu", ADJUSTMENT_IN: "Nhập điều chỉnh", ADJUSTMENT_OUT: "Xuất điều chỉnh", RETURN_IN: "Hoàn kho", RECEIPT_REVERSAL: "Đảo nhập kho" };
const inboundMovements = new Set(["RECEIPT", "ADJUSTMENT_IN", "RETURN_IN"]);
const periodLabel = (row: any) => row.period_type === "MONTH" ? `Tháng ${row.period_month}/${row.period_year}` : row.period_type === "QUARTER" ? `Quý ${row.period_quarter}/${row.period_year}` : `Năm ${row.period_year}`;
const dateLabel = (value?: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN") : "—";
const supplyTone = (category?: string | null) => category === "OFFICE_SUPPLY" ? "office" : category === "CLEANING_SUPPLY" ? "cleaning" : "mixed";

export default async function SuppliesPage({ searchParams }: SuppliesPageProps) {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.view")) redirect("/modules");
  const params = await searchParams;
  const section = ["overview", "catalog", "warehouse", "requests", "quotes", "reports"].includes(params.section ?? "") ? params.section! : "overview";
  const year = Number(params.year) || new Date().getFullYear();
  const quarter = Number(params.quarter) || 0;
  const month = Number(params.month) || 0;
  const category = params.category === "OFFICE_SUPPLY" || params.category === "CLEANING_SUPPLY" ? params.category : "";
  const supplySearch = String(params.q ?? "").trim().slice(0, 120);
  const supplyVendor = String(params.vendor ?? "").trim().slice(0, 160);
  const supplyPriceMin = Math.max(0, Number(params.price_min) || 0);
  const supplyPriceMax = Math.max(0, Number(params.price_max) || 0);
  const [itemsResult, requestsResult, linesResult, departmentsResult, quotesResult, quoteLinesResult, balancesResult, movementsResult] = await Promise.all([
    supabase.from("supply_items").select("id,category,item_code,item_name,unit,description,default_unit_price,active,updated_at").order("category").order("item_name"),
    supabase.from("supply_requests").select("id,request_no,category,period_type,period_year,period_month,period_quarter,requested_on,requesting_department,requester_name,checker_name,approver_name,status,note,source_file,created_at").order("requested_on", { ascending: false }),
    supabase.from("supply_request_lines").select("id,request_id,item_code,item_name,unit,proposed_quantity,stock_quantity,ordered_quantity,requested_departments,approval_note,approved_unit_price,amount,note,sort_order"),
    supabase.from("departments").select("id,name").order("name"),
    supabase.from("supply_quotes").select("id,quote_no,vendor_name,vendor_address,vendor_contact,category,quote_date,valid_until,status,subtotal,tax_rate,tax_amount,total_amount,note,source_file,source_sheet,created_at").order("quote_date", { ascending: false, nullsFirst: false }),
    supabase.from("supply_quote_lines").select("id,quote_id,item_id,item_code,category,item_name,unit,quantity,unit_price,old_unit_price,amount,note,sort_order").order("sort_order"),
    supabase.from("supply_inventory_balances").select("item_id,category,item_code,item_name,unit,active,on_hand_quantity,total_receipt_value,last_movement_at").order("category").order("item_name"),
    supabase.from("supply_inventory_movements").select("id,item_id,movement_type,quantity,unit_price,movement_date,source_type,reference_no,note,created_at,supply_items(item_code,item_name,unit,category)").order("movement_date", { ascending: false }).order("created_at", { ascending: false }).limit(100),
  ]);
  const queryError = itemsResult.error || requestsResult.error || linesResult.error || departmentsResult.error;
  const quoteQueryError = quotesResult.error || quoteLinesResult.error;
  const items = (itemsResult.data ?? []) as SupplyItemOption[];
  const requests = requestsResult.data ?? [];
  const lines = linesResult.data ?? [];
  const quotes = quotesResult.data ?? [];
  const quoteLines = quoteLinesResult.data ?? [];
  const inventoryBalances = balancesResult.data ?? [];
  const inventoryMovements = movementsResult.data ?? [];
  const inventoryError = balancesResult.error || movementsResult.error;
  const linesByRequest = new Map<string, typeof lines>();
  lines.forEach((line) => linesByRequest.set(line.request_id, [...(linesByRequest.get(line.request_id) ?? []), line]));
  const linesByQuote = new Map<string, typeof quoteLines>();
  quoteLines.forEach((line) => linesByQuote.set(line.quote_id, [...(linesByQuote.get(line.quote_id) ?? []), line]));
  const supplierByItem = new Map<string, SupplierSnapshot>();
  quotes.forEach((quote) => {
    (linesByQuote.get(quote.id) ?? []).forEach((line) => {
      const snapshot = { vendorName: quote.vendor_name, unitPrice: Number(line.unit_price || 0), quoteDate: quote.quote_date };
      if (line.item_id && !supplierByItem.has(line.item_id)) supplierByItem.set(line.item_id, snapshot);
      if (line.item_code && !supplierByItem.has(`code:${line.item_code}`)) supplierByItem.set(`code:${line.item_code}`, snapshot);
    });
  });
  const supplierFor = (itemId?: string | null, itemCode?: string | null) =>
    (itemId ? supplierByItem.get(itemId) : undefined) ?? (itemCode ? supplierByItem.get(`code:${itemCode}`) : undefined);
  const vendorOptions = [...new Set(quotes.map((quote) => quote.vendor_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
  const matchesSupplyFilter = (item: { id?: string | null; item_id?: string | null; item_code?: string | null; item_name?: string | null; category?: string | null; unit?: string | null; description?: string | null; default_unit_price?: number | string | null }) => {
    const snapshot = supplierFor(item.id ?? item.item_id, item.item_code);
    const price = snapshot?.unitPrice ?? Number(item.default_unit_price || 0);
    if (category && item.category !== category) return false;
    if (supplyVendor && snapshot?.vendorName !== supplyVendor) return false;
    if (supplyPriceMin && price < supplyPriceMin) return false;
    if (supplyPriceMax && price > supplyPriceMax) return false;
    const query = normalizeSearchText(supplySearch);
    if (!query) return true;
    const haystack = normalizeSearchText([
      item.item_code, item.item_name, categoryLabel(item.category || ""), item.unit, item.description,
      snapshot?.vendorName, price, price.toLocaleString("vi-VN"),
    ].filter(Boolean).join(" "));
    return query.split(" ").every((token) => haystack.includes(token));
  };
  const filteredCatalogItems = items.filter(matchesSupplyFilter);
  const filteredInventoryBalances = inventoryBalances.filter(matchesSupplyFilter);
  const filteredInventoryMovements = inventoryMovements.filter((movement) => {
    const item = Array.isArray(movement.supply_items) ? movement.supply_items[0] : movement.supply_items;
    return matchesSupplyFilter({ ...item, item_id: movement.item_id, default_unit_price: movement.unit_price });
  });
  const totalSpend = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
  const currentRequests = requests.filter((request) => request.period_year === new Date().getFullYear() && (request.period_type !== "QUARTER" || request.period_quarter === currentQuarter));
  const filteredRequests = requests.filter((request) => request.period_year === year && (!quarter || request.period_quarter === quarter) && (!month || request.period_month === month) && (!category || request.category === category));
  const filteredIds = new Set(filteredRequests.map((request) => request.id));
  const filteredLines = lines.filter((line) => filteredIds.has(line.request_id));
  const filteredTotal = filteredLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const tabs = [
    ["overview", "Tổng quan", "dashboard"], ["catalog", "Danh mục hàng", "supplies"],
    ["warehouse", "Kho hàng", "archive"], ["requests", "Phiếu yêu cầu", "assets"],
    ["quotes", "Báo giá NCC", "value"], ["reports", "Báo cáo", "reports"],
  ] as const;
  const sectionMetadata = {
    overview: ["Tổng quan mua sắm", "Số liệu, báo giá và phiếu cần theo dõi", "dashboard", "overview"],
    catalog: ["Danh mục hàng hóa", "Tên hàng, đơn vị và giá tham khảo dùng chung", "supplies", "catalog"],
    warehouse: ["Kho hàng", "Tồn kho và lịch sử nhập xuất theo từng mặt hàng", "archive", "warehouse"],
    requests: ["Phiếu yêu cầu", "Nhu cầu mua theo tháng, quý hoặc năm", "assets", "requests"],
    quotes: ["Báo giá nhà cung cấp", "So sánh báo giá, VAT và tổng chi phí", "value", "quotes"],
    reports: ["Báo cáo mua sắm", "Lọc và xuất dữ liệu theo kỳ", "reports", "reports"],
  } as const;
  const meta = sectionMetadata[section as keyof typeof sectionMetadata] ?? sectionMetadata.overview;

  return <>
    <PageHeader eyebrow="HÀNH CHÍNH" title="Văn phòng phẩm & Dụng cụ vệ sinh" description="Quản lý danh mục, phiếu đề nghị, báo giá nhà cung cấp và chi phí mua sắm." actions={can(access, "supplies.manage") ? <div className="header-actions"><ModalTrigger description="Tạo danh mục dùng chung cho các kỳ mua." eyebrow="DANH MỤC" size="large" title="Thêm hàng hóa" triggerLabel="+ Hàng hóa"><SupplyItemForm /></ModalTrigger><ModalTrigger description="Tạo phiếu thủ công với dòng hàng đầu tiên." eyebrow="PHIẾU YÊU CẦU" size="wide" title="Phiếu mua sắm mới" triggerClassName="secondary-button" triggerLabel="+ Phiếu yêu cầu"><SupplyRequestForm departments={departmentsResult.data ?? []} items={items} /></ModalTrigger></div> : null} />
    {queryError ? <p className="form-error">Chưa thể tải dữ liệu phân hệ. Hãy áp dụng migration Supabase rồi tải lại.</p> : null}
    <nav className="vehicle-tabs supply-tabs" aria-label="Phân hệ mua sắm">{tabs.map(([key, label, icon]) => <Link className={section === key ? "active" : ""} href={key === "overview" ? "/supplies" : `/supplies?section=${key}`} key={key}><span className="vehicle-tab-icon"><AppIcon name={icon} size={19} /></span>{label}</Link>)}</nav>
    <section className={`supply-command-bar supply-command-bar--${meta[3]}`}>
      <div className="supply-command-copy"><span><AppIcon name={meta[2]} size={22} /></span><div><small>KHU VỰC ĐANG LÀM VIỆC</small><strong>{meta[0]}</strong><p>{meta[1]}</p></div></div>
      {section === "catalog" && can(access, "supplies.import") ? <div className="vehicle-actions supply-import-actions"><div className="vehicle-action-group"><small>NHẬP TỪ EXCEL</small><div><ModalTrigger description="Đọc phiếu tổng hợp TDW, tự tạo các hàng hóa chưa có và lưu lịch sử mua sắm." eyebrow="NHẬP DANH MỤC" size="medium" title="Nhập danh mục từ XLSX" triggerClassName="secondary-button" triggerLabel="Nhập danh mục XLSX"><SupplyImportForm /></ModalTrigger><ModalTrigger description="Đọc báo giá, kiểm tra trùng và duyệt từng dòng trước khi lưu." eyebrow="BÁO GIÁ" size="wide" title="Xem trước báo giá XLSX" triggerLabel="Nhập báo giá XLSX"><SupplierQuoteImportForm /></ModalTrigger></div></div></div> : null}
      {section === "quotes" && can(access, "supplies.import") ? <div className="vehicle-actions"><div className="vehicle-action-group vehicle-action-group--primary"><small>NHẬP DỮ LIỆU</small><div><ModalTrigger description="Đọc báo giá, kiểm tra trùng và duyệt từng dòng trước khi lưu." eyebrow="BÁO GIÁ" size="wide" title="Xem trước báo giá XLSX" triggerLabel="Nhập báo giá XLSX"><SupplierQuoteImportForm /></ModalTrigger></div></div></div> : null}
      {section === "warehouse" && can(access, "supplies.manage") ? <div className="vehicle-actions"><div className="vehicle-action-group vehicle-action-group--primary"><small>GIAO DỊCH KHO</small><div><ModalTrigger description="Ghi nhận tồn đầu kỳ, nhập bổ sung hoặc xuất điều chỉnh có kiểm tra tồn kho." eyebrow="KHO HÀNG" size="large" title="Nhập / xuất kho" triggerLabel="+ Nhập / xuất kho"><SupplyInventoryMovementForm items={items} /></ModalTrigger></div></div></div> : null}
    </section>

    {section === "overview" ? <>
      <section className="metric-grid supply-metric-grid">
        <article className="metric-card supply-metric supply-metric--blue"><span><AppIcon name="supplies" /></span><small>Mặt hàng đang dùng</small><strong>{items.filter((item) => item.active).length}</strong><p>{items.filter((item) => item.category === "OFFICE_SUPPLY").length} VPP · {items.filter((item) => item.category === "CLEANING_SUPPLY").length} vệ sinh</p></article>
        <article className="metric-card supply-metric supply-metric--amber"><span><AppIcon name="assets" /></span><small>Phiếu kỳ hiện tại</small><strong>{currentRequests.length}</strong><p>Quý {currentQuarter}/{new Date().getFullYear()}</p></article>
        <article className="metric-card supply-metric supply-metric--violet"><span><AppIcon name="value" /></span><small>Báo giá nhà cung cấp</small><strong>{quotes.length}</strong><p>{quoteLines.length} dòng hàng đã nhận</p></article>
        <article className="metric-card supply-metric supply-metric--green"><span><AppIcon name="reports" /></span><small>Tổng chi phí ghi nhận</small><strong>{money.format(totalSpend)}</strong><p>{lines.length} dòng mua sắm</p></article>
      </section>
      <section className="supply-overview-grid"><article className="panel supply-panel supply-panel--requests"><div className="panel-heading"><div><p className="eyebrow">PHIẾU GẦN ĐÂY</p><h2>Nhu cầu mua sắm</h2></div>{can(access, "supplies.import") ? <ModalTrigger description="Nhận diện trực tiếp hai mẫu phiếu tổng hợp TDW." eyebrow="NHẬP DỮ LIỆU" size="medium" title="Nhập phiếu từ XLSX" triggerClassName="secondary-button" triggerLabel="Nhập phiếu XLSX"><SupplyImportForm /></ModalTrigger> : null}</div><SupplyRequestTable access={access} requests={requests.slice(0, 6)} linesByRequest={linesByRequest} /></article><article className="panel supply-panel supply-panel--quotes"><div className="panel-heading"><div><p className="eyebrow">BÁO GIÁ MỚI</p><h2>Nhà cung cấp</h2></div>{can(access, "supplies.import") ? <ModalTrigger description="Đọc báo giá Lan Anh, Hưng Thịnh và các mẫu có cột tương đương." eyebrow="BÁO GIÁ" size="large" title="Nhập báo giá XLSX" triggerClassName="secondary-button" triggerLabel="+ Báo giá"><SupplierQuoteImportForm /></ModalTrigger> : null}</div>{quoteQueryError ? <p className="form-error">Chưa áp dụng cấu trúc báo giá mới trên Supabase.</p> : <SupplyQuoteCards quotes={quotes.slice(0, 5)} />}</article></section>
    </> : null}

    {section === "catalog" ? <CatalogSection access={access} category={category} items={filteredCatalogItems} priceMax={supplyPriceMax} priceMin={supplyPriceMin} q={supplySearch} supplierFor={supplierFor} total={items.length} vendor={supplyVendor} vendorOptions={vendorOptions} /> : null}
    {section === "warehouse" ? <WarehouseSection balances={filteredInventoryBalances} category={category} error={inventoryError} movements={filteredInventoryMovements} priceMax={supplyPriceMax} priceMin={supplyPriceMin} q={supplySearch} supplierFor={supplierFor} total={inventoryBalances.length} vendor={supplyVendor} vendorOptions={vendorOptions} /> : null}
    {section === "requests" ? <section className="panel supply-panel supply-panel--requests"><div className="panel-heading"><div><p className="eyebrow">PHIẾU YÊU CẦU</p><h2>Mua sắm theo kỳ</h2></div>{can(access, "supplies.import") ? <ModalTrigger description="Nhập phiếu VPP hoặc dụng cụ vệ sinh theo hai file tổng hợp TDW." eyebrow="NHẬP DỮ LIỆU" size="medium" title="Nhập lịch sử XLSX" triggerClassName="secondary-button" triggerLabel="Nhập XLSX"><SupplyImportForm /></ModalTrigger> : null}</div><SupplyRequestTable access={access} requests={requests} linesByRequest={linesByRequest} /></section> : null}
    {section === "quotes" ? <section className="panel supply-panel supply-panel--quotes"><div className="panel-heading"><div><p className="eyebrow">BÁO GIÁ NHÀ CUNG CẤP</p><h2>Danh sách báo giá đã nhận</h2></div><span>{quotes.length} báo giá</span></div>{quoteQueryError ? <p className="form-error">Chưa thể tải báo giá. Hãy áp dụng migration Supabase mới.</p> : <SupplyQuoteTable access={access} linesByQuote={linesByQuote} quotes={quotes} />}</section> : null}
    {section === "reports" ? <ReportsSection category={category} filteredLines={filteredLines} filteredRequests={filteredRequests} filteredTotal={filteredTotal} month={month} quarter={quarter} year={year} /> : null}
  </>;
}

type SupplyFilterProps = {
  q: string;
  category: string;
  vendor: string;
  priceMin: number;
  priceMax: number;
  vendorOptions: string[];
};

function SupplySearchFilters({ section, q, category, vendor, priceMin, priceMax, vendorOptions }: SupplyFilterProps & { section: "catalog" | "warehouse" }) {
  const hasFilters = Boolean(q || category || vendor || priceMin || priceMax);
  return <InstantFilterForm className="filter-bar supply-search-filters">
    <input name="section" type="hidden" value={section} />
    <label className="search-field supply-search-field">
      <span aria-hidden="true">⌕</span>
      <AutoSubmitSearchInput defaultValue={q} name="q" placeholder="Tìm tên, loại, giá hoặc nhà cung cấp…" />
    </label>
    <AutoSubmitSelect aria-label="Lọc theo chủng loại" defaultValue={category} name="category">
      <option value="">Tất cả chủng loại</option>
      <option value="OFFICE_SUPPLY">Văn phòng phẩm</option>
      <option value="CLEANING_SUPPLY">Dụng cụ vệ sinh</option>
    </AutoSubmitSelect>
    <AutoSubmitSelect aria-label="Lọc theo nhà cung cấp" defaultValue={vendor} name="vendor">
      <option value="">Tất cả nhà cung cấp</option>
      {vendorOptions.map((option) => <option key={option} value={option}>{option}</option>)}
    </AutoSubmitSelect>
    <label className="supply-price-filter"><span>Giá từ</span><AutoSubmitSearchInput defaultValue={priceMin || ""} min={0} name="price_min" placeholder="0 ₫" step="1000" type="number" /></label>
    <label className="supply-price-filter"><span>Đến</span><AutoSubmitSearchInput defaultValue={priceMax || ""} min={0} name="price_max" placeholder="Không giới hạn" step="1000" type="number" /></label>
    {hasFilters ? <Link className="supply-clear-filter" href={`/supplies?section=${section}`}>Xóa bộ lọc</Link> : null}
  </InstantFilterForm>;
}

function CatalogSection({ items, access, total, supplierFor, ...filters }: { items: SupplyItemOption[]; access: any; total: number; supplierFor: (itemId?: string | null, itemCode?: string | null) => SupplierSnapshot | undefined } & SupplyFilterProps) {
  return <section className="panel supply-panel supply-panel--catalog">
    <div className="panel-heading"><div><p className="eyebrow">DANH MỤC</p><h2>Hàng hóa đang quản lý</h2></div><span>{items.length === total ? `${total} mặt hàng` : `${items.length}/${total} mặt hàng`}</span></div>
    <SupplySearchFilters section="catalog" {...filters} />
    <div className="table-wrap">
      <table className="supply-data-table supply-catalog-table">
        <thead><tr><th>Tên hàng</th><th>Loại</th><th>Đơn vị</th><th>Nhà cung cấp / giá</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>
          {items.map((item) => { const supplier = supplierFor(item.id, item.item_code); return <InteractiveTableRow className={`supply-row supply-row--${supplyTone(item.category)}${item.active ? "" : " supply-row--inactive"}`} key={item.id}>
            <td><SupplyRowIdentity icon="supplies" meta={`${item.item_code || "Chưa đặt mã"} · ${item.description || "Chưa có mô tả"}`} title={item.item_name} /></td>
            <td><span className={`supply-category-pill ${supplyTone(item.category)}`}>{categoryLabel(item.category)}</span></td>
            <td><strong className="table-secondary">{item.unit}</strong></td>
            <td><strong className="table-secondary">{supplier?.vendorName || "Chưa có báo giá"}</strong><small className="table-note">{money.format(supplier?.unitPrice ?? Number(item.default_unit_price || 0))}{supplier?.quoteDate ? ` · ${dateLabel(supplier.quoteDate)}` : " · giá tham khảo"}</small></td>
            <td><span className={`status-pill ${item.active ? "status-ok" : "status-muted"}`}>{item.active ? "Đang dùng" : "Ngừng dùng"}</span></td>
            <td className="supply-actions-column"><div className="table-actions row-actions"><ModalTrigger description="Thông tin dùng chung trong phiếu yêu cầu và báo giá." eyebrow="CHI TIẾT HÀNG HÓA" size="medium" title={item.item_name} triggerClassName="text-button row-detail-trigger" triggerLabel="Xem"><SupplyItemDetail item={item} /></ModalTrigger>{can(access, "supplies.manage") ? <ModalTrigger description="Cập nhật tên, đơn vị, loại và đơn giá mặc định." eyebrow="DANH MỤC" size="large" title={`Sửa ${item.item_name}`} triggerClassName="text-button" triggerLabel="Sửa"><SupplyItemForm initial={item} /></ModalTrigger> : null}{can(access, "supplies.delete") && item.active ? <ConfirmAction action={archiveSupplyItem} description={`Xóa “${item.item_name}” khỏi danh mục đang dùng? Dữ liệu phiếu cũ vẫn được giữ nguyên.`} fields={{ id: item.id }} title="Xóa hàng hóa?" triggerLabel="Xóa" /> : null}</div></td>
          </InteractiveTableRow>; })}
          {!items.length ? <tr><td className="empty-state" colSpan={6}>Không tìm thấy hàng hóa phù hợp với bộ lọc.</td></tr> : null}
        </tbody>
      </table>
    </div>
  </section>;
}

function WarehouseSection({ balances, movements, error, total, supplierFor, ...filters }: { balances: Array<any>; movements: Array<any>; error: any; total: number; supplierFor: (itemId?: string | null, itemCode?: string | null) => SupplierSnapshot | undefined } & SupplyFilterProps) {
  const stocked = balances.filter((row) => Number(row.on_hand_quantity) > 0);
  const lowStock = stocked.filter((row) => Number(row.on_hand_quantity) <= 5);
  const totalReceiptValue = balances.reduce((sum, row) => sum + Number(row.total_receipt_value || 0), 0);
  if (error) return <section className="panel supply-panel supply-panel--warehouse"><p className="form-error">Chưa thể tải kho hàng. Hãy áp dụng migration kho trên Supabase rồi tải lại.</p></section>;
  return <>
    <section className="metric-grid supply-metric-grid supply-warehouse-metrics">
      <article className="metric-card supply-metric supply-metric--blue"><span><AppIcon name="archive" /></span><small>Mặt hàng có tồn</small><strong>{stocked.length}</strong><p>{balances.length} mặt hàng đang theo dõi</p></article>
      <article className="metric-card supply-metric supply-metric--amber"><span><AppIcon name="health" /></span><small>Sắp hết hàng</small><strong>{lowStock.length}</strong><p>Tồn từ 5 đơn vị trở xuống</p></article>
      <article className="metric-card supply-metric supply-metric--violet"><span><AppIcon name="movement" /></span><small>Giao dịch gần đây</small><strong>{movements.length}</strong><p>Nhập, xuất và điều chỉnh</p></article>
      <article className="metric-card supply-metric supply-metric--green"><span><AppIcon name="value" /></span><small>Giá trị nhập ghi nhận</small><strong>{money.format(totalReceiptValue)}</strong><p>Theo đơn giá tại thời điểm nhập</p></article>
    </section>
    <section className="panel supply-panel supply-panel--warehouse">
      <div className="panel-heading"><div><p className="eyebrow">TỒN KHO</p><h2>Số dư theo hàng hóa</h2></div><span>{balances.length === total ? `${stocked.length} mặt hàng còn tồn` : `${balances.length}/${total} mặt hàng phù hợp`}</span></div>
      <SupplySearchFilters section="warehouse" {...filters} />
      <div className="table-wrap"><table className="supply-data-table supply-warehouse-table"><thead><tr><th>Hàng hóa</th><th>Loại</th><th>Nhà cung cấp / giá</th><th>Đơn vị</th><th>Tồn hiện tại</th><th>Lần cập nhật cuối</th></tr></thead><tbody>{balances.map((row) => { const supplier = supplierFor(row.item_id, row.item_code); return <InteractiveTableRow className={`supply-row supply-row--${supplyTone(row.category)}${Number(row.on_hand_quantity) <= 0 ? " supply-row--inactive" : ""}`} key={row.item_id}><td><SupplyRowIdentity icon="archive" meta={row.item_code || "Chưa có mã"} title={row.item_name} /></td><td><span className={`supply-category-pill ${supplyTone(row.category)}`}>{categoryLabel(row.category)}</span></td><td><strong className="table-secondary">{supplier?.vendorName || "Chưa có báo giá"}</strong><small className="table-note">{supplier ? money.format(supplier.unitPrice) : "Chưa có đơn giá"}</small></td><td><strong className="table-secondary">{row.unit}</strong></td><td><span className={`supply-stock-pill ${Number(row.on_hand_quantity) <= 0 ? "empty" : Number(row.on_hand_quantity) <= 5 ? "low" : "ok"}`}>{Number(row.on_hand_quantity).toLocaleString("vi-VN")} {row.unit}</span></td><td>{row.last_movement_at ? new Date(row.last_movement_at).toLocaleString("vi-VN") : "Chưa phát sinh"}</td></InteractiveTableRow>; })}{!balances.length ? <tr><td className="empty-state" colSpan={6}>Không tìm thấy tồn kho phù hợp với bộ lọc.</td></tr> : null}</tbody></table></div>
    </section>
    <section className="panel supply-panel supply-panel--movements">
      <div className="panel-heading"><div><p className="eyebrow">THẺ KHO</p><h2>Lịch sử nhập xuất</h2></div><span>{movements.length} giao dịch gần nhất</span></div>
      <div className="table-wrap"><table className="supply-data-table supply-movement-table"><thead><tr><th>Ngày / hàng hóa</th><th>Hình thức</th><th>Số lượng</th><th>Đơn giá</th><th>Chứng từ / ghi chú</th></tr></thead><tbody>{movements.map((movement) => { const item = Array.isArray(movement.supply_items) ? movement.supply_items[0] : movement.supply_items; const inbound = inboundMovements.has(movement.movement_type); return <InteractiveTableRow className={`supply-row supply-row--movement ${inbound ? "movement-in" : "movement-out"}`} key={movement.id}><td><SupplyRowIdentity icon="movement" meta={`${item?.item_code || "Chưa có mã"} · ${item?.unit || "đơn vị"}`} title={item?.item_name || "Hàng hóa"} /></td><td><span className={`supply-movement-pill ${inbound ? "in" : "out"}`}>{movementLabel[movement.movement_type] ?? movement.movement_type}</span></td><td><strong className={inbound ? "supply-quantity-in" : "supply-quantity-out"}>{inbound ? "+" : "−"}{Number(movement.quantity).toLocaleString("vi-VN")}</strong><small className="table-note">{dateLabel(movement.movement_date)}</small></td><td className="supply-money-cell">{money.format(Number(movement.unit_price || 0))}</td><td><strong className="table-secondary">{movement.reference_no || "Không có số chứng từ"}</strong><small className="table-note">{movement.note || "Không có ghi chú"}</small></td></InteractiveTableRow>; })}{!movements.length ? <tr><td className="empty-state" colSpan={5}>Chưa có giao dịch nhập xuất kho.</td></tr> : null}</tbody></table></div>
    </section>
  </>;
}

function ReportsSection({ category, filteredLines, filteredRequests, filteredTotal, month, quarter, year }: any) {
  return <><section className="report-filter-panel supply-report-filter"><div><p className="eyebrow">BỘ LỌC BÁO CÁO</p><h2>Chi phí mua sắm</h2><p>{filteredRequests.length} phiếu · {filteredLines.length} dòng · {money.format(filteredTotal)}</p></div><form className="report-filter-grid"><input name="section" type="hidden" value="reports" /><label>Năm<input defaultValue={year} min={2000} max={2200} name="year" type="number" /></label><label>Quý<select defaultValue={quarter} name="quarter"><option value="0">Tất cả quý</option>{[1,2,3,4].map((value) => <option key={value} value={value}>Quý {value}</option>)}</select></label><label>Tháng<select defaultValue={month} name="month"><option value="0">Tất cả tháng</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>Tháng {index + 1}</option>)}</select></label><label>Loại<select defaultValue={category} name="category"><option value="">Tất cả loại</option><option value="OFFICE_SUPPLY">Văn phòng phẩm</option><option value="CLEANING_SUPPLY">Dụng cụ vệ sinh</option></select></label><button className="primary-button" type="submit">Áp dụng</button></form></section><section className="panel supply-panel supply-panel--reports"><div className="panel-heading"><div><p className="eyebrow">CHI TIẾT</p><h2>Dòng hàng theo bộ lọc</h2></div><Link className="secondary-button" href={`/api/supplies/reports?format=xlsx&year=${year}&quarter=${quarter}&month=${month}&category=${category}`}>Xuất XLSX</Link></div><div className="table-wrap"><table className="supply-data-table supply-report-table"><thead><tr><th>Phiếu / kỳ</th><th>Hàng hóa</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th><th>Phê duyệt</th></tr></thead><tbody>{filteredLines.map((line: any) => { const request = filteredRequests.find((item: any) => item.id === line.request_id); return <tr className={`supply-row supply-row--${supplyTone(request?.category)}`} key={line.id}><td><SupplyRowIdentity icon="reports" meta={request ? `${categoryLabel(request.category)} · ${periodLabel(request)}` : "Chưa xác định kỳ"} title={request?.request_no || "Phiếu mua sắm"} /></td><td><strong className="table-secondary">{line.item_name}</strong><small className="table-note">{line.unit} · {line.requested_departments}</small></td><td>{Number(line.ordered_quantity).toLocaleString("vi-VN")}</td><td className="supply-money-cell">{money.format(Number(line.approved_unit_price))}</td><td className="supply-money-cell supply-money-cell--strong">{money.format(Number(line.amount))}</td><td>{line.approval_note || "—"}</td></tr>; })}{!filteredLines.length ? <tr><td className="empty-state" colSpan={6}>Không có dòng hàng phù hợp với bộ lọc.</td></tr> : null}</tbody></table></div></section></>;
}

function SupplyRowIdentity({ icon, meta, title }: { icon: "archive" | "assets" | "movement" | "reports" | "supplies" | "value"; meta: string; title: string }) {
  return <div className="supply-row-identity"><span className="supply-row-icon"><AppIcon name={icon} size={19} /></span><span className="supply-row-copy"><strong className="interactive-row-title">{title}</strong><small>{meta}</small></span></div>;
}

function SupplyItemDetail({ item }: { item: SupplyItemOption }) {
  return <div className="supply-detail-grid"><div><small>Loại hàng</small><strong>{categoryLabel(item.category)}</strong></div><div><small>Mã hàng</small><strong>{item.item_code || "Chưa đặt mã"}</strong></div><div><small>Đơn vị</small><strong>{item.unit}</strong></div><div><small>Đơn giá tham khảo</small><strong>{money.format(Number(item.default_unit_price || 0))}</strong></div><div className="span-2"><small>Mô tả</small><strong>{item.description || "Chưa có mô tả"}</strong></div></div>;
}

function SupplyRequestTable({ requests, linesByRequest, access }: { requests: Array<any>; linesByRequest: Map<string, Array<any>>; access: any }) {
  return <div className="table-wrap"><table className="supply-data-table supply-request-table"><thead><tr><th>Số phiếu</th><th>Loại / kỳ</th><th>Người đề nghị</th><th>Tiến độ</th><th>Dòng hàng</th><th>Tổng tiền</th><th>Thao tác</th></tr></thead><tbody>{requests.map((request) => { const rows = linesByRequest.get(request.id) ?? []; const total = rows.reduce((sum, line) => sum + Number(line.amount || 0), 0); return <InteractiveTableRow className="supply-row supply-row--request" key={request.id}><td><SupplyRowIdentity icon="assets" meta={dateLabel(request.requested_on)} title={request.request_no} /></td><td><strong className="table-secondary">{categoryLabel(request.category)}</strong><small className="table-note">{periodLabel(request)}</small></td><td><strong className="table-secondary">{request.requester_name || "—"}</strong><small className="table-note">{request.requesting_department || "Chưa ghi phòng ban"}</small></td><td><span className={`status-pill ${request.status === "REJECTED" ? "status-danger" : request.status === "CLOSED" || request.status === "ORDERED" ? "status-ok" : ""}`}>{statusLabel[request.status] ?? request.status}</span></td><td><strong className="table-secondary">{rows.length} mặt hàng</strong><small className="table-note">{rows.slice(0, 2).map((line) => line.item_name).join(" · ") || "Chưa có dòng hàng"}</small></td><td className="supply-money-cell supply-money-cell--strong">{money.format(total)}<small className="table-note">{request.source_file ? `Nhập từ ${request.source_file}` : "Tạo thủ công"}</small></td><td className="supply-actions-column"><div className="table-actions row-actions"><ModalTrigger description={`${categoryLabel(request.category)} · ${periodLabel(request)}`} eyebrow="CHI TIẾT PHIẾU" size="wide" title={`Phiếu ${request.request_no}`} triggerClassName="text-button row-detail-trigger" triggerLabel="Xem"><SupplyRequestDetail request={request} rows={rows} total={total} /></ModalTrigger>{can(access, "supplies.manage") ? <ModalTrigger description="Cập nhật người xử lý, trạng thái và ghi chú của phiếu." eyebrow="PHIẾU YÊU CẦU" size="large" title={`Sửa phiếu ${request.request_no}`} triggerClassName="text-button" triggerLabel="Sửa"><SupplyRequestEditForm initial={request} /></ModalTrigger> : null}{can(access, "supplies.delete") ? <ConfirmAction action={deleteSupplyRequest} description={`Xóa phiếu “${request.request_no}”? Các dòng hàng của phiếu sẽ không còn hiển thị.`} fields={{ id: request.id }} title="Xóa phiếu yêu cầu?" triggerLabel="Xóa" /> : null}</div></td></InteractiveTableRow>; })}{!requests.length ? <tr><td colSpan={7} className="empty-state">Chưa có phiếu yêu cầu.</td></tr> : null}</tbody></table></div>;
}

function SupplyRequestDetail({ request, rows, total }: { request: any; rows: Array<any>; total: number }) {
  return <div className="supply-detail-stack"><div className="supply-detail-grid"><div><small>Ngày đề nghị</small><strong>{dateLabel(request.requested_on)}</strong></div><div><small>Trạng thái</small><strong>{statusLabel[request.status] ?? request.status}</strong></div><div><small>Người đề nghị</small><strong>{request.requester_name || "—"}</strong></div><div><small>Người duyệt</small><strong>{request.approver_name || "—"}</strong></div><div><small>Số mặt hàng</small><strong>{rows.length}</strong></div><div><small>Tổng tiền</small><strong>{money.format(total)}</strong></div></div><div className="supply-detail-lines">{rows.map((line) => <article key={line.id}><div><strong>{line.item_name}</strong><small>{line.item_code || "Chưa có mã"} · {Number(line.ordered_quantity).toLocaleString("vi-VN")} {line.unit} · {money.format(Number(line.approved_unit_price))}</small></div><strong>{money.format(Number(line.amount))}</strong></article>)}</div></div>;
}

function SupplyQuoteCards({ quotes }: { quotes: Array<any> }) {
  if (!quotes.length) return <p className="empty-state">Chưa có báo giá nhà cung cấp.</p>;
  return <div className="supply-quote-cards">{quotes.map((quote) => <article key={quote.id}><span className={`supply-category-dot ${quote.category === "OFFICE_SUPPLY" ? "office" : "cleaning"}`} /><div><strong>{quote.vendor_name}</strong><small>{dateLabel(quote.quote_date)} · {categoryLabel(quote.category)}</small></div><b>{money.format(Number(quote.total_amount || 0))}</b></article>)}</div>;
}

function SupplyQuoteTable({ quotes, linesByQuote, access }: { quotes: Array<any>; linesByQuote: Map<string, Array<any>>; access: any }) {
  return <div className="table-wrap"><table className="supply-data-table supply-quote-table"><thead><tr><th>Nhà cung cấp</th><th>Ngày / loại hàng</th><th>Dòng hàng</th><th>VAT</th><th>Tổng tiền</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{quotes.map((quote) => { const rows = linesByQuote.get(quote.id) ?? []; return <InteractiveTableRow className={`supply-row supply-row--${supplyTone(quote.category)}`} key={quote.id}><td><SupplyRowIdentity icon="value" meta={quote.quote_no || quote.source_file || "Báo giá"} title={quote.vendor_name} /></td><td><strong className="table-secondary">{dateLabel(quote.quote_date)}</strong><small className="table-note">{categoryLabel(quote.category)}</small></td><td><strong className="table-secondary">{rows.length} mặt hàng</strong><small className="table-note">{rows.slice(0, 2).map((line) => line.item_name).join(" · ") || "Chưa có dòng hàng"}</small></td><td><strong className="table-secondary">{Number(quote.tax_rate || 0).toLocaleString("vi-VN")}%</strong><small className="table-note">{money.format(Number(quote.tax_amount || 0))}</small></td><td className="supply-money-cell supply-money-cell--strong">{money.format(Number(quote.total_amount || 0))}<small className="table-note">Trước thuế {money.format(Number(quote.subtotal || 0))}</small></td><td><span className={`status-pill ${quote.status === "SELECTED" ? "status-ok" : quote.status === "REJECTED" || quote.status === "EXPIRED" ? "status-danger" : ""}`}>{quoteStatusLabel[quote.status] ?? quote.status}</span></td><td className="supply-actions-column"><div className="table-actions row-actions"><ModalTrigger description={`${categoryLabel(quote.category)} · ${dateLabel(quote.quote_date)}`} eyebrow="CHI TIẾT BÁO GIÁ" size="wide" title={quote.vendor_name} triggerClassName="text-button row-detail-trigger" triggerLabel="Xem"><SupplyQuoteDetail quote={quote} rows={rows} /></ModalTrigger>{can(access, "supplies.manage") ? <ModalTrigger description="Cập nhật thông tin nhà cung cấp, ngày và trạng thái lựa chọn." eyebrow="BÁO GIÁ" size="large" title={`Sửa ${quote.vendor_name}`} triggerClassName="text-button" triggerLabel="Sửa"><SupplyQuoteForm initial={quote} /></ModalTrigger> : null}{can(access, "supplies.delete") ? <ConfirmAction action={deleteSupplyQuote} description={`Xóa báo giá của “${quote.vendor_name}”? Dữ liệu được ẩn và vẫn giữ trong nhật ký kiểm toán.`} fields={{ id: quote.id }} title="Xóa báo giá?" triggerLabel="Xóa" /> : null}</div></td></InteractiveTableRow>; })}{!quotes.length ? <tr><td colSpan={7} className="empty-state">Chưa có báo giá nhà cung cấp.</td></tr> : null}</tbody></table></div>;
}

function SupplyQuoteDetail({ quote, rows }: { quote: any; rows: Array<any> }) {
  return <div className="supply-detail-stack"><div className="supply-detail-grid"><div><small>Ngày báo giá</small><strong>{dateLabel(quote.quote_date)}</strong></div><div><small>Loại hàng</small><strong>{categoryLabel(quote.category)}</strong></div><div><small>Trạng thái</small><strong>{quoteStatusLabel[quote.status] ?? quote.status}</strong></div><div><small>VAT</small><strong>{Number(quote.tax_rate || 0).toLocaleString("vi-VN")}% · {money.format(Number(quote.tax_amount || 0))}</strong></div><div><small>Trước thuế</small><strong>{money.format(Number(quote.subtotal || 0))}</strong></div><div><small>Tổng thanh toán</small><strong>{money.format(Number(quote.total_amount || 0))}</strong></div><div className="span-2"><small>Địa chỉ / liên hệ</small><strong>{[quote.vendor_address, quote.vendor_contact].filter(Boolean).join(" · ") || "—"}</strong></div></div><div className="supply-detail-lines">{rows.map((line) => <article key={line.id}><div><strong>{line.item_name}</strong><small>{line.item_code || "Chưa có mã"} · {categoryLabel(line.category || quote.category)} · {Number(line.quantity).toLocaleString("vi-VN")} {line.unit} · {money.format(Number(line.unit_price))}{line.note ? ` · ${line.note}` : ""}</small></div><strong>{money.format(Number(line.amount))}</strong></article>)}</div></div>;
}
