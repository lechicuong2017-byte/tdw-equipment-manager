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
type SupplyOverviewStats = {
  current_request_count: number;
  current_year_line_count: number;
  current_year_spend: number;
  quote_count: number;
  quote_line_count: number;
};
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const categoryLabel = (value: string) => value === "OFFICE_SUPPLY" ? "Văn phòng phẩm" : value === "CLEANING_SUPPLY" ? "Dụng cụ vệ sinh" : "VPP & Dụng cụ vệ sinh";
const statusLabel: Record<string, string> = { DRAFT: "Nháp nhập liệu", READY_TO_BUY: "Sẵn sàng mua", ORDERED: "Đã đặt mua", PARTIALLY_RECEIVED: "Nhận một phần", RECEIVED: "Đã nhận đủ", COMPLETED: "Hoàn tất", CANCELLED: "Hủy / chuyển kỳ" };
const quoteStatusLabel: Record<string, string> = { RECEIVED: "Đã nhận", REVIEWING: "Đang xem xét", SELECTED: "Đã chọn", REJECTED: "Không chọn", EXPIRED: "Hết hiệu lực" };
const movementLabel: Record<string, string> = { RECEIPT: "Nhập kho thực tế", ISSUE: "Xuất kho thực tế", ADJUSTMENT_IN: "Nhập điều chỉnh", ADJUSTMENT_OUT: "Xuất điều chỉnh", RETURN_IN: "Hoàn kho", RECEIPT_REVERSAL: "Đảo nhập kho" };
const inboundMovements = new Set(["RECEIPT", "ADJUSTMENT_IN", "RETURN_IN"]);
const periodLabel = (row: any) => row.period_type === "MONTH" ? `Tháng ${row.period_month}/${row.period_year}` : row.period_type === "QUARTER" ? `Quý ${row.period_quarter}/${row.period_year}` : `Năm ${row.period_year}`;
const dateLabel = (value?: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN") : "—";
const supplyTone = (category?: string | null) => category === "OFFICE_SUPPLY" ? "office" : category === "CLEANING_SUPPLY" ? "cleaning" : "mixed";

export default async function SuppliesPage({ searchParams }: SuppliesPageProps) {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.view")) redirect("/modules");
  const params = await searchParams;
  const [currentYearText, currentMonthText] = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
  }).format(new Date()).split("-");
  const currentYear = Number(currentYearText);
  const currentQuarter = Math.ceil(Number(currentMonthText) / 3);
  const section = ["overview", "catalog", "warehouse", "requests", "quotes", "reports"].includes(params.section ?? "") ? params.section! : "overview";
  const year = Number(params.year) || currentYear;
  const quarter = Number(params.quarter) || 0;
  const month = Number(params.month) || 0;
  const category = params.category === "OFFICE_SUPPLY" || params.category === "CLEANING_SUPPLY" ? params.category : "";
  const supplySearch = String(params.q ?? "").trim().slice(0, 120);
  const supplyVendor = String(params.vendor ?? "").trim().slice(0, 160);
  const supplyPriceMin = Math.max(0, Number(params.price_min) || 0);
  const supplyPriceMax = Math.max(0, Number(params.price_max) || 0);
  const needsRequests = ["overview", "requests", "reports"].includes(section);
  const needsQuotes = ["overview", "catalog", "warehouse", "quotes"].includes(section);
  const needsInventory = ["catalog", "warehouse"].includes(section);
  const requestFields = "id,request_no,category,period_type,period_year,period_month,period_quarter,requested_on,requesting_department,requester_name,checker_name,approver_name,status,note,source_file,created_at";
  const requestLineFields = "id,request_id,item_code,item_name,unit,proposed_quantity,stock_quantity,ordered_quantity,requested_departments,approval_note,approved_unit_price,amount,note,sort_order";
  const quoteFields = "id,quote_no,vendor_name,vendor_address,vendor_contact,category,quote_date,valid_until,status,subtotal,tax_rate,tax_amount,total_amount,note,source_file,source_sheet,created_at";
  const [itemsResult, requestsResult, linesResult, departmentsResult, quotesResult, quoteLinesResult, balancesResult, movementsResult, overviewStatsResult] = await Promise.all([
    supabase.from("supply_items").select("id,category,item_code,item_name,unit,description,default_unit_price,active,updated_at").order("category").order("item_name"),
    needsRequests ? (section === "overview"
      ? supabase.from("supply_requests").select(`${requestFields},supply_request_lines(${requestLineFields})`).order("requested_on", { ascending: false }).limit(6)
      : supabase.from("supply_requests").select(requestFields).order("requested_on", { ascending: false }))
      : Promise.resolve({ data: [], error: null }),
    needsRequests && section !== "overview" ? supabase.from("supply_request_lines").select(requestLineFields) : Promise.resolve({ data: [], error: null }),
    supabase.from("departments").select("id,name").order("name"),
    needsQuotes ? (section === "overview"
      ? supabase.from("supply_quotes").select(quoteFields).order("quote_date", { ascending: false, nullsFirst: false }).limit(5)
      : supabase.from("supply_quotes").select(quoteFields).order("quote_date", { ascending: false, nullsFirst: false }))
      : Promise.resolve({ data: [], error: null }),
    needsQuotes && section !== "overview" ? supabase.from("supply_quote_lines").select("id,quote_id,item_id,item_code,category,item_name,unit,quantity,unit_price,old_unit_price,amount,note,sort_order").order("sort_order") : Promise.resolve({ data: [], error: null }),
    needsInventory ? supabase.from("supply_inventory_balances").select("item_id,category,item_code,item_name,unit,active,on_hand_quantity,total_receipt_value,last_movement_at").order("category").order("item_name") : Promise.resolve({ data: [], error: null }),
    needsInventory ? supabase.from("supply_inventory_movements").select("id,item_id,movement_type,quantity,unit_price,movement_date,source_type,reference_no,note,created_at,supply_items(item_code,item_name,unit,category)").order("movement_date", { ascending: false }).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
    section === "overview" ? supabase.rpc("get_supply_overview_stats") : Promise.resolve({ data: null, error: null }),
  ]);
  const queryError = itemsResult.error || requestsResult.error || linesResult.error || departmentsResult.error || overviewStatsResult.error;
  const quoteQueryError = quotesResult.error || quoteLinesResult.error;
  const items = (itemsResult.data ?? []) as SupplyItemOption[];
  const requests = (requestsResult.data ?? []) as Array<any>;
  const lines = section === "overview"
    ? requests.flatMap((request) => Array.isArray(request.supply_request_lines) ? request.supply_request_lines : [])
    : (linesResult.data ?? []);
  const quotes = quotesResult.data ?? [];
  const quoteLines = quoteLinesResult.data ?? [];
  const overviewStats = (overviewStatsResult.data ?? {
    current_request_count: 0,
    current_year_line_count: 0,
    current_year_spend: 0,
    quote_count: 0,
    quote_line_count: 0,
  }) as SupplyOverviewStats;
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
  const currentYearRequests = requests.filter((request) => Number(request.period_year) === currentYear);
  const currentYearRequestIds = new Set(currentYearRequests.map((request) => request.id));
  const currentYearLines = lines.filter((line) => currentYearRequestIds.has(line.request_id));
  const totalSpend = section === "overview"
    ? Number(overviewStats.current_year_spend || 0)
    : currentYearLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const currentRequests = currentYearRequests.filter((request) => request.period_type !== "QUARTER" || request.period_quarter === currentQuarter);
  const currentRequestCount = section === "overview" ? overviewStats.current_request_count : currentRequests.length;
  const currentYearLineCount = section === "overview" ? overviewStats.current_year_line_count : currentYearLines.length;
  const quoteCount = section === "overview" ? overviewStats.quote_count : quotes.length;
  const quoteLineCount = section === "overview" ? overviewStats.quote_line_count : quoteLines.length;
  const filteredRequests = requests.filter((request) => request.period_year === year && (!quarter || request.period_quarter === quarter) && (!month || request.period_month === month) && (!category || request.category === category));
  const filteredIds = new Set(filteredRequests.map((request) => request.id));
  const filteredLines = lines.filter((line) => filteredIds.has(line.request_id));
  const filteredTotal = filteredLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const tabs = [
    ["overview", "Tổng quan", "dashboard"], ["catalog", "Danh mục hàng", "supplies"],
    ["warehouse", "Kho hàng", "archive"], ["requests", "Kế hoạch mua", "assets"],
    ["quotes", "Báo giá NCC", "value"], ["reports", "Báo cáo", "reports"],
  ] as const;
  const sectionMetadata = {
    overview: ["Tổng quan mua sắm", "Số liệu, báo giá và kế hoạch cần theo dõi", "dashboard", "overview"],
    catalog: ["Danh mục hàng hóa", "Tên hàng, đơn vị và giá tham khảo dùng chung", "supplies", "catalog"],
    warehouse: ["Kho hàng", "Tồn kho và lịch sử nhập xuất theo từng mặt hàng", "archive", "warehouse"],
    requests: ["Kế hoạch mua", "Số lượng đã được duyệt trên hồ sơ giấy theo từng kỳ", "assets", "requests"],
    quotes: ["Báo giá nhà cung cấp", "So sánh báo giá, VAT và tổng chi phí", "value", "quotes"],
    reports: ["Báo cáo mua sắm", "Lọc và xuất dữ liệu theo kỳ", "reports", "reports"],
  } as const;
  const meta = sectionMetadata[section as keyof typeof sectionMetadata] ?? sectionMetadata.overview;

  return <>
    <PageHeader eyebrow="HÀNH CHÍNH" title="Văn phòng phẩm & Dụng cụ vệ sinh" description="Quản lý danh mục, kế hoạch mua đã duyệt trên giấy, báo giá nhà cung cấp và kho thực tế." actions={can(access, "supplies.manage") ? <div className="header-actions"><ModalTrigger description="Tạo danh mục dùng chung cho các kỳ mua." eyebrow="DANH MỤC" size="large" title="Thêm hàng hóa" triggerLabel="+ Hàng hóa"><SupplyItemForm /></ModalTrigger><ModalTrigger description="Nhập thủ công số lượng đã được duyệt trên hồ sơ giấy." eyebrow="KẾ HOẠCH MUA" size="wide" title="Kế hoạch mua mới" triggerClassName="secondary-button" triggerLabel="+ Kế hoạch mua"><SupplyRequestForm departments={departmentsResult.data ?? []} items={items} /></ModalTrigger></div> : null} />
    {queryError ? <p className="form-error">Chưa thể tải dữ liệu phân hệ. Hãy áp dụng migration Supabase rồi tải lại.</p> : null}
    <nav className="vehicle-tabs supply-tabs" aria-label="Phân hệ mua sắm">{tabs.map(([key, label, icon]) => <Link className={section === key ? "active" : ""} href={key === "overview" ? "/supplies" : `/supplies?section=${key}`} key={key}><span className="vehicle-tab-icon"><AppIcon name={icon} size={19} /></span>{label}</Link>)}</nav>
    <section className={`supply-command-bar supply-command-bar--${meta[3]}`}>
      <div className="supply-command-copy"><span><AppIcon name={meta[2]} size={22} /></span><div><small>KHU VỰC ĐANG LÀM VIỆC</small><strong>{meta[0]}</strong><p>{meta[1]}</p></div></div>
      {section === "catalog" && can(access, "supplies.import") ? <div className="vehicle-actions supply-import-actions"><div className="vehicle-action-group"><small>NHẬP TỪ EXCEL</small><div><ModalTrigger description="Đọc phiếu tổng hợp TDW, kiểm tra trùng và duyệt từng dòng trước khi lưu." eyebrow="NHẬP DANH MỤC" size="wide" title="Xem trước danh mục XLSX" triggerClassName="secondary-button" triggerLabel="Nhập danh mục XLSX"><SupplyImportForm /></ModalTrigger><ModalTrigger description="Đọc báo giá, kiểm tra trùng và duyệt từng dòng trước khi lưu." eyebrow="BÁO GIÁ" size="wide" title="Xem trước báo giá XLSX" triggerLabel="Nhập báo giá XLSX"><SupplierQuoteImportForm /></ModalTrigger></div></div></div> : null}
      {section === "quotes" && can(access, "supplies.import") ? <div className="vehicle-actions"><div className="vehicle-action-group vehicle-action-group--primary"><small>NHẬP DỮ LIỆU</small><div><ModalTrigger description="Đọc báo giá, kiểm tra trùng và duyệt từng dòng trước khi lưu." eyebrow="BÁO GIÁ" size="wide" title="Xem trước báo giá XLSX" triggerLabel="Nhập báo giá XLSX"><SupplierQuoteImportForm /></ModalTrigger></div></div></div> : null}
      {section === "warehouse" && can(access, "supplies.manage") ? <div className="vehicle-actions"><div className="vehicle-action-group vehicle-action-group--primary"><small>GIAO DỊCH THỰC TẾ</small><div><ModalTrigger description="Nhập hoặc xuất kho thủ công: tồn đầu kỳ, hàng thực nhận, cấp phát, hoàn kho và điều chỉnh có kiểm tra tồn." eyebrow="KHO HÀNG" size="large" title="Nhập / xuất kho thủ công" triggerLabel="+ Nhập / xuất kho"><SupplyInventoryMovementForm items={items} /></ModalTrigger></div></div></div> : null}
    </section>

    {section === "overview" ? <>
      <section className="metric-grid supply-metric-grid">
        <article className="metric-card supply-metric supply-metric--blue"><span><AppIcon name="supplies" /></span><small>Mặt hàng đang dùng</small><strong>{items.filter((item) => item.active).length}</strong><p>{items.filter((item) => item.category === "OFFICE_SUPPLY").length} VPP · {items.filter((item) => item.category === "CLEANING_SUPPLY").length} vệ sinh</p></article>
        <article className="metric-card supply-metric supply-metric--amber"><span><AppIcon name="assets" /></span><small>Kế hoạch kỳ hiện tại</small><strong>{currentRequestCount}</strong><p>Quý {currentQuarter}/{currentYear}</p></article>
        <article className="metric-card supply-metric supply-metric--violet"><span><AppIcon name="value" /></span><small>Báo giá nhà cung cấp</small><strong>{quoteCount}</strong><p>{quoteLineCount} dòng hàng đã nhận</p></article>
        <article className="metric-card supply-metric supply-metric--green"><span><AppIcon name="reports" /></span><small>Tổng chi phí ghi nhận</small><strong>{money.format(totalSpend)}</strong><p>Năm {currentYear} · {currentYearLineCount} dòng mua sắm</p></article>
      </section>
      <section className="supply-overview-grid"><article className="panel supply-panel supply-panel--requests"><div className="panel-heading"><div><p className="eyebrow">KẾ HOẠCH GẦN ĐÂY</p><h2>Số lượng đã duyệt trên giấy</h2></div>{can(access, "supplies.import") ? <ModalTrigger description="Đọc bảng tổng hợp đã được TGĐ duyệt trên giấy, kiểm tra trùng và duyệt từng dòng trước khi lưu. Thao tác này không thay đổi tồn kho." eyebrow="NHẬP DỮ LIỆU" size="wide" title="Xem trước kế hoạch XLSX" triggerClassName="secondary-button" triggerLabel="Nhập kế hoạch XLSX"><SupplyImportForm /></ModalTrigger> : null}</div><SupplyRequestTable access={access} requests={requests.slice(0, 6)} linesByRequest={linesByRequest} /></article><article className="panel supply-panel supply-panel--quotes"><div className="panel-heading"><div><p className="eyebrow">BÁO GIÁ MỚI</p><h2>Nhà cung cấp</h2></div>{can(access, "supplies.import") ? <ModalTrigger description="Đọc báo giá Lan Anh, Hưng Thịnh và các mẫu có cột tương đương." eyebrow="BÁO GIÁ" size="large" title="Nhập báo giá XLSX" triggerClassName="secondary-button" triggerLabel="+ Báo giá"><SupplierQuoteImportForm /></ModalTrigger> : null}</div>{quoteQueryError ? <p className="form-error">Chưa áp dụng cấu trúc báo giá mới trên Supabase.</p> : <SupplyQuoteCards quotes={quotes.slice(0, 5)} />}</article></section>
    </> : null}

    {section === "catalog" ? <CatalogSection access={access} balances={inventoryBalances} category={category} items={filteredCatalogItems} movements={inventoryMovements} priceMax={supplyPriceMax} priceMin={supplyPriceMin} q={supplySearch} supplierFor={supplierFor} total={items.length} vendor={supplyVendor} vendorOptions={vendorOptions} /> : null}
    {section === "warehouse" ? <WarehouseSection access={access} balances={filteredInventoryBalances} category={category} error={inventoryError} items={items} movements={filteredInventoryMovements} priceMax={supplyPriceMax} priceMin={supplyPriceMin} q={supplySearch} supplierFor={supplierFor} total={inventoryBalances.length} vendor={supplyVendor} vendorOptions={vendorOptions} /> : null}
    {section === "requests" ? <section className="panel supply-panel supply-panel--requests"><div className="panel-heading"><div><p className="eyebrow">KẾ HOẠCH MUA</p><h2>Số lượng đã duyệt theo kỳ</h2></div>{can(access, "supplies.import") ? <ModalTrigger description="Đọc bảng tổng hợp VPP hoặc dụng cụ vệ sinh đã được duyệt trên giấy; xem trước và chọn từng dòng trước khi lưu. Không tự nhập kho." eyebrow="NHẬP DỮ LIỆU" size="wide" title="Xem trước kế hoạch XLSX" triggerClassName="secondary-button" triggerLabel="Nhập XLSX"><SupplyImportForm /></ModalTrigger> : null}</div><SupplyRequestTable access={access} requests={requests} linesByRequest={linesByRequest} /></section> : null}
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

function CatalogSection({ items, balances, movements, access, total, supplierFor, ...filters }: { items: SupplyItemOption[]; balances: Array<any>; movements: Array<any>; access: any; total: number; supplierFor: (itemId?: string | null, itemCode?: string | null) => SupplierSnapshot | undefined } & SupplyFilterProps) {
  return <section className="panel supply-panel supply-panel--catalog">
    <div className="panel-heading"><div><p className="eyebrow">DANH MỤC</p><h2>Hàng hóa đang quản lý</h2></div><span>{items.length === total ? `${total} mặt hàng` : `${items.length}/${total} mặt hàng`}</span></div>
    <SupplySearchFilters section="catalog" {...filters} />
    <div className="table-wrap">
      <table className="supply-data-table supply-catalog-table">
        <thead><tr><th>Tên hàng</th><th>Loại</th><th>Đơn vị</th><th>Nhà cung cấp / giá</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>
          {items.map((item) => { const supplier = supplierFor(item.id, item.item_code); const balance = balances.find((row) => row.item_id === item.id); const itemMovements = movements.filter((row) => row.item_id === item.id).slice(0, 8); return <InteractiveTableRow className={`supply-row supply-row--${supplyTone(item.category)}${item.active ? "" : " supply-row--inactive"}`} key={item.id}>
            <td><SupplyRowIdentity icon="supplies" meta={`${item.item_code || "Chưa đặt mã"} · ${item.description || "Chưa có mô tả"}`} title={item.item_name} /></td>
            <td><span className={`supply-category-pill ${supplyTone(item.category)}`}>{categoryLabel(item.category)}</span></td>
            <td><strong className="table-secondary">{item.unit}</strong></td>
            <td><strong className="table-secondary">{supplier?.vendorName || "Chưa có báo giá"}</strong><small className="table-note">{money.format(supplier?.unitPrice ?? Number(item.default_unit_price || 0))}{supplier?.quoteDate ? ` · ${dateLabel(supplier.quoteDate)}` : " · giá tham khảo"}</small></td>
            <td><span className={`status-pill ${item.active ? "status-ok" : "status-muted"}`}>{item.active ? "Đang dùng" : "Ngừng dùng"}</span></td>
            <td className="supply-actions-column"><div className="table-actions row-actions"><ModalTrigger description="Hồ sơ danh mục, nhà cung cấp, tồn kho và giao dịch gần đây." eyebrow="CHI TIẾT HÀNG HÓA" size="wide" title={item.item_name} triggerClassName="text-button row-detail-trigger" triggerLabel="Xem"><SupplyItemDetail balance={balance} item={item} movements={itemMovements} supplier={supplier} /></ModalTrigger>{can(access, "supplies.manage") ? <ModalTrigger description="Cập nhật tên, đơn vị, loại và đơn giá mặc định." eyebrow="DANH MỤC" size="large" title={`Sửa ${item.item_name}`} triggerClassName="text-button" triggerLabel="Sửa"><SupplyItemForm initial={item} /></ModalTrigger> : null}{can(access, "supplies.delete") && item.active ? <ConfirmAction action={archiveSupplyItem} description={`Xóa “${item.item_name}” khỏi danh mục đang dùng? Dữ liệu phiếu cũ vẫn được giữ nguyên.`} fields={{ id: item.id }} title="Xóa hàng hóa?" triggerLabel="Xóa" /> : null}</div></td>
          </InteractiveTableRow>; })}
          {!items.length ? <tr><td className="empty-state" colSpan={6}>Không tìm thấy hàng hóa phù hợp với bộ lọc.</td></tr> : null}
        </tbody>
      </table>
    </div>
  </section>;
}

function WarehouseSection({ balances, movements, error, items, access, total, supplierFor, ...filters }: { balances: Array<any>; movements: Array<any>; error: any; items: SupplyItemOption[]; access: any; total: number; supplierFor: (itemId?: string | null, itemCode?: string | null) => SupplierSnapshot | undefined } & SupplyFilterProps) {
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
      <div className="table-wrap"><table className="supply-data-table supply-warehouse-table"><thead><tr><th>Hàng hóa</th><th>Loại</th><th>Nhà cung cấp / giá</th><th>Đơn vị</th><th>Tồn hiện tại</th><th>Lần cập nhật cuối</th><th>Thao tác</th></tr></thead><tbody>{balances.map((row) => { const supplier = supplierFor(row.item_id, row.item_code); const itemMovements = movements.filter((movement) => movement.item_id === row.item_id); return <InteractiveTableRow className={`supply-row supply-row--${supplyTone(row.category)}${Number(row.on_hand_quantity) <= 0 ? " supply-row--inactive" : ""}`} key={row.item_id}><td><SupplyRowIdentity icon="archive" meta={row.item_code || "Chưa có mã"} title={row.item_name} /></td><td><span className={`supply-category-pill ${supplyTone(row.category)}`}>{categoryLabel(row.category)}</span></td><td><strong className="table-secondary">{supplier?.vendorName || "Chưa có báo giá"}</strong><small className="table-note">{supplier ? money.format(supplier.unitPrice) : "Chưa có đơn giá"}</small></td><td><strong className="table-secondary">{row.unit}</strong></td><td><span className={`supply-stock-pill ${Number(row.on_hand_quantity) <= 0 ? "empty" : Number(row.on_hand_quantity) <= 5 ? "low" : "ok"}`}>{Number(row.on_hand_quantity).toLocaleString("vi-VN")} {row.unit}</span></td><td>{row.last_movement_at ? new Date(row.last_movement_at).toLocaleString("vi-VN") : "Chưa phát sinh"}</td><td className="supply-actions-column"><ModalTrigger description="Xem tồn kho, lịch sử nhập xuất và bổ sung số lượng." eyebrow="CHI TIẾT KHO" size="wide" title={row.item_name} triggerClassName="text-button row-detail-trigger" triggerLabel="Xem"><SupplyWarehouseDetail balance={row} canManage={can(access, "supplies.manage")} items={items} movements={itemMovements} supplier={supplier} /></ModalTrigger></td></InteractiveTableRow>; })}{!balances.length ? <tr><td className="empty-state" colSpan={7}>Không tìm thấy tồn kho phù hợp với bộ lọc.</td></tr> : null}</tbody></table></div>
    </section>
    <section className="panel supply-panel supply-panel--movements">
      <div className="panel-heading"><div><p className="eyebrow">THẺ KHO</p><h2>Lịch sử nhập xuất</h2></div><span>{movements.length} giao dịch gần nhất</span></div>
      <div className="table-wrap"><table className="supply-data-table supply-movement-table"><thead><tr><th>Ngày / hàng hóa</th><th>Hình thức</th><th>Số lượng</th><th>Đơn giá</th><th>Chứng từ / ghi chú</th></tr></thead><tbody>{movements.map((movement) => { const item = Array.isArray(movement.supply_items) ? movement.supply_items[0] : movement.supply_items; const inbound = inboundMovements.has(movement.movement_type); return <InteractiveTableRow className={`supply-row supply-row--movement ${inbound ? "movement-in" : "movement-out"}`} key={movement.id}><td><SupplyRowIdentity icon="movement" meta={`${item?.item_code || "Chưa có mã"} · ${item?.unit || "đơn vị"}`} title={item?.item_name || "Hàng hóa"} /></td><td><span className={`supply-movement-pill ${inbound ? "in" : "out"}`}>{movementLabel[movement.movement_type] ?? movement.movement_type}</span></td><td><strong className={inbound ? "supply-quantity-in" : "supply-quantity-out"}>{inbound ? "+" : "−"}{Number(movement.quantity).toLocaleString("vi-VN")}</strong><small className="table-note">{dateLabel(movement.movement_date)}</small></td><td className="supply-money-cell">{money.format(Number(movement.unit_price || 0))}</td><td><strong className="table-secondary">{movement.reference_no || "Không có số chứng từ"}</strong><small className="table-note">{movement.note || "Không có ghi chú"}</small></td></InteractiveTableRow>; })}{!movements.length ? <tr><td className="empty-state" colSpan={5}>Chưa có giao dịch nhập xuất kho.</td></tr> : null}</tbody></table></div>
    </section>
  </>;
}

function ReportsSection({ category, filteredLines, filteredRequests, filteredTotal, month, quarter, year }: any) {
  return <><section className="report-filter-panel supply-report-filter"><div><p className="eyebrow">BỘ LỌC BÁO CÁO</p><h2>Chi phí mua sắm</h2><p>{filteredRequests.length} kế hoạch · {filteredLines.length} dòng · {money.format(filteredTotal)}</p></div><form className="report-filter-grid"><input name="section" type="hidden" value="reports" /><label>Năm<input defaultValue={year} min={2000} max={2200} name="year" type="number" /></label><label>Quý<select defaultValue={quarter} name="quarter"><option value="0">Tất cả quý</option>{[1,2,3,4].map((value) => <option key={value} value={value}>Quý {value}</option>)}</select></label><label>Tháng<select defaultValue={month} name="month"><option value="0">Tất cả tháng</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>Tháng {index + 1}</option>)}</select></label><label>Loại<select defaultValue={category} name="category"><option value="">Tất cả loại</option><option value="OFFICE_SUPPLY">Văn phòng phẩm</option><option value="CLEANING_SUPPLY">Dụng cụ vệ sinh</option></select></label><button className="primary-button" type="submit">Áp dụng</button></form></section><section className="panel supply-panel supply-panel--reports"><div className="panel-heading"><div><p className="eyebrow">CHI TIẾT</p><h2>Dòng hàng theo bộ lọc</h2></div><Link className="secondary-button" href={`/api/supplies/reports?format=xlsx&year=${year}&quarter=${quarter}&month=${month}&category=${category}`}>Xuất XLSX</Link></div><div className="table-wrap"><table className="supply-data-table supply-report-table"><thead><tr><th>Kế hoạch / kỳ</th><th>Hàng hóa</th><th>SL đã duyệt</th><th>Đơn giá đã duyệt</th><th>Thành tiền</th><th>Ghi chú hồ sơ giấy</th></tr></thead><tbody>{filteredLines.map((line: any) => { const request = filteredRequests.find((item: any) => item.id === line.request_id); return <tr className={`supply-row supply-row--${supplyTone(request?.category)}`} key={line.id}><td><SupplyRowIdentity icon="reports" meta={request ? `${categoryLabel(request.category)} · ${periodLabel(request)}` : "Chưa xác định kỳ"} title={request?.request_no || "Kế hoạch mua"} /></td><td><strong className="table-secondary">{line.item_name}</strong><small className="table-note">{line.unit} · {line.requested_departments}</small></td><td>{Number(line.ordered_quantity).toLocaleString("vi-VN")}</td><td className="supply-money-cell">{money.format(Number(line.approved_unit_price))}</td><td className="supply-money-cell supply-money-cell--strong">{money.format(Number(line.amount))}</td><td>{line.approval_note || "—"}</td></tr>; })}{!filteredLines.length ? <tr><td className="empty-state" colSpan={6}>Không có dòng hàng phù hợp với bộ lọc.</td></tr> : null}</tbody></table></div></section></>;
}

function SupplyRowIdentity({ icon, meta, title }: { icon: "archive" | "assets" | "movement" | "reports" | "supplies" | "value"; meta: string; title: string }) {
  return <div className="supply-row-identity"><span className="supply-row-icon"><AppIcon name={icon} size={19} /></span><span className="supply-row-copy"><strong className="interactive-row-title">{title}</strong><small>{meta}</small></span></div>;
}

function InventoryMovementList({ movements, unit }: { movements: Array<any>; unit: string }) {
  if (!movements.length) return <p className="empty-state supply-detail-empty">Chưa có giao dịch nhập xuất cho mặt hàng này.</p>;
  return <div className="supply-detail-lines">{movements.map((movement) => { const inbound = inboundMovements.has(movement.movement_type); return <article key={movement.id}><div><strong>{movementLabel[movement.movement_type] ?? movement.movement_type}</strong><small>{dateLabel(movement.movement_date)} · {movement.reference_no || "Không có chứng từ"}{movement.note ? ` · ${movement.note}` : ""}</small></div><strong className={inbound ? "supply-quantity-in" : "supply-quantity-out"}>{inbound ? "+" : "−"}{Number(movement.quantity).toLocaleString("vi-VN")} {unit}</strong></article>; })}</div>;
}

function SupplyItemDetail({ item, balance, movements, supplier }: { item: SupplyItemOption; balance?: any; movements: Array<any>; supplier?: SupplierSnapshot }) {
  return <div className="supply-detail-stack"><div className="supply-detail-grid"><div><small>Loại hàng</small><strong>{categoryLabel(item.category)}</strong></div><div><small>Mã hàng</small><strong>{item.item_code || "Chưa đặt mã"}</strong></div><div><small>Đơn vị</small><strong>{item.unit}</strong></div><div><small>Trạng thái</small><strong>{item.active ? "Đang sử dụng" : "Ngừng sử dụng"}</strong></div><div><small>Nhà cung cấp gần nhất</small><strong>{supplier?.vendorName || "Chưa có báo giá"}</strong></div><div><small>Giá tham khảo</small><strong>{money.format(supplier?.unitPrice ?? Number(item.default_unit_price || 0))}</strong></div><div><small>Tồn hiện tại</small><strong>{Number(balance?.on_hand_quantity || 0).toLocaleString("vi-VN")} {item.unit}</strong></div><div><small>Cập nhật kho cuối</small><strong>{balance?.last_movement_at ? new Date(balance.last_movement_at).toLocaleString("vi-VN") : "Chưa phát sinh"}</strong></div><div className="span-2"><small>Mô tả</small><strong>{item.description || "Chưa có mô tả"}</strong></div></div><div><p className="eyebrow">GIAO DỊCH GẦN ĐÂY</p><InventoryMovementList movements={movements} unit={item.unit} /></div></div>;
}

function SupplyWarehouseDetail({ balance, supplier, movements, items, canManage }: { balance: any; supplier?: SupplierSnapshot; movements: Array<any>; items: SupplyItemOption[]; canManage: boolean }) {
  return <div className="supply-detail-stack"><div className="supply-detail-grid"><div><small>Mã hàng</small><strong>{balance.item_code || "Chưa có mã"}</strong></div><div><small>Loại hàng</small><strong>{categoryLabel(balance.category)}</strong></div><div><small>Tồn hiện tại</small><strong>{Number(balance.on_hand_quantity || 0).toLocaleString("vi-VN")} {balance.unit}</strong></div><div><small>Giá trị nhập đã ghi nhận</small><strong>{money.format(Number(balance.total_receipt_value || 0))}</strong></div><div><small>Nhà cung cấp gần nhất</small><strong>{supplier?.vendorName || "Chưa có báo giá"}</strong></div><div><small>Đơn giá gần nhất</small><strong>{supplier ? money.format(supplier.unitPrice) : "Chưa có đơn giá"}</strong></div></div>{canManage ? <section className="supply-stock-entry-panel"><div><p className="eyebrow">BỔ SUNG / ĐIỀU CHỈNH</p><h3>Thêm số lượng hàng hóa</h3><p>Mặt hàng đã được chọn sẵn; nhập số lượng, đơn giá và chứng từ để cập nhật kho.</p></div><SupplyInventoryMovementForm initialDirection="IN" initialItemId={balance.item_id} items={items} lockItem /></section> : null}<div><p className="eyebrow">LỊCH SỬ NHẬP XUẤT</p><InventoryMovementList movements={movements.slice(0, 20)} unit={balance.unit} /></div></div>;
}

function SupplyRequestTable({ requests, linesByRequest, access }: { requests: Array<any>; linesByRequest: Map<string, Array<any>>; access: any }) {
  return <div className="table-wrap"><table className="supply-data-table supply-request-table"><thead><tr><th>Số kế hoạch</th><th>Loại / kỳ</th><th>Người lập</th><th>Tiến độ</th><th>Dòng hàng</th><th>Tổng tiền</th><th>Thao tác</th></tr></thead><tbody>{requests.map((request) => { const rows = linesByRequest.get(request.id) ?? []; const total = rows.reduce((sum, line) => sum + Number(line.amount || 0), 0); return <InteractiveTableRow className="supply-row supply-row--request" key={request.id}><td><SupplyRowIdentity icon="assets" meta={dateLabel(request.requested_on)} title={request.request_no} /></td><td><strong className="table-secondary">{categoryLabel(request.category)}</strong><small className="table-note">{periodLabel(request)}</small></td><td><strong className="table-secondary">{request.requester_name || "—"}</strong><small className="table-note">{request.requesting_department || "Chưa ghi phòng ban"}</small></td><td><span className={`status-pill ${request.status === "CANCELLED" ? "status-danger" : request.status === "RECEIVED" || request.status === "COMPLETED" ? "status-ok" : request.status === "READY_TO_BUY" || request.status === "ORDERED" || request.status === "PARTIALLY_RECEIVED" ? "status-info" : ""}`}>{statusLabel[request.status] ?? request.status}</span></td><td><strong className="table-secondary">{rows.length} mặt hàng</strong><small className="table-note">{rows.slice(0, 2).map((line) => line.item_name).join(" · ") || "Chưa có dòng hàng"}</small></td><td className="supply-money-cell supply-money-cell--strong">{money.format(total)}<small className="table-note">{request.source_file ? `Nhập từ ${request.source_file}` : "Tạo thủ công"}</small></td><td className="supply-actions-column"><div className="table-actions row-actions"><ModalTrigger description={`${categoryLabel(request.category)} · ${periodLabel(request)}`} eyebrow="CHI TIẾT KẾ HOẠCH" size="wide" title={`Kế hoạch ${request.request_no}`} triggerClassName="text-button row-detail-trigger" triggerLabel="Xem"><SupplyRequestDetail request={request} rows={rows} total={total} /></ModalTrigger>{can(access, "supplies.manage") ? <ModalTrigger description="Cập nhật hồ sơ giấy, tiến độ mua và ghi chú." eyebrow="KẾ HOẠCH MUA" size="large" title={`Sửa kế hoạch ${request.request_no}`} triggerClassName="text-button" triggerLabel="Sửa"><SupplyRequestEditForm initial={request} /></ModalTrigger> : null}{can(access, "supplies.delete") ? <ConfirmAction action={deleteSupplyRequest} description={`Xóa kế hoạch “${request.request_no}”? Các dòng hàng của kế hoạch sẽ không còn hiển thị.`} fields={{ id: request.id }} title="Xóa kế hoạch mua?" triggerLabel="Xóa" /> : null}</div></td></InteractiveTableRow>; })}{!requests.length ? <tr><td colSpan={7} className="empty-state">Chưa có kế hoạch mua.</td></tr> : null}</tbody></table></div>;
}

function SupplyRequestDetail({ request, rows, total }: { request: any; rows: Array<any>; total: number }) {
  return <div className="supply-detail-stack"><div className="supply-detail-grid"><div><small>Ngày ghi nhận</small><strong>{dateLabel(request.requested_on)}</strong></div><div><small>Trạng thái mua</small><strong>{statusLabel[request.status] ?? request.status}</strong></div><div><small>Người lập hồ sơ</small><strong>{request.requester_name || "—"}</strong></div><div><small>Người ký trên hồ sơ giấy</small><strong>{request.approver_name || "—"}</strong></div><div><small>Số mặt hàng</small><strong>{rows.length}</strong></div><div><small>Tổng tiền</small><strong>{money.format(total)}</strong></div></div><div className="supply-detail-lines">{rows.map((line) => <article key={line.id}><div><strong>{line.item_name}</strong><small>{line.item_code || "Chưa có mã"} · SL đã duyệt {Number(line.ordered_quantity).toLocaleString("vi-VN")} {line.unit} · {money.format(Number(line.approved_unit_price))}</small></div><strong>{money.format(Number(line.amount))}</strong></article>)}</div></div>;
}

function SupplyQuoteCards({ quotes }: { quotes: Array<any> }) {
  if (!quotes.length) return <p className="empty-state">Chưa có báo giá nhà cung cấp.</p>;
  return <div className="supply-quote-cards">{quotes.map((quote) => <article key={quote.id}><span className={`supply-category-dot ${quote.category === "OFFICE_SUPPLY" ? "office" : "cleaning"}`} /><div><strong>{quote.vendor_name}</strong><small>{dateLabel(quote.quote_date)} · {categoryLabel(quote.category)}</small></div><b>{money.format(Number(quote.total_amount || 0))}</b></article>)}</div>;
}

function SupplyQuoteTable({ quotes, linesByQuote, access }: { quotes: Array<any>; linesByQuote: Map<string, Array<any>>; access: any }) {
  return <div className="table-wrap"><table className="supply-data-table supply-quote-table"><thead><tr><th>Nhà cung cấp</th><th>Ngày / loại hàng</th><th>Dòng hàng</th><th>VAT</th><th>Tổng tiền</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{quotes.map((quote) => { const rows = linesByQuote.get(quote.id) ?? []; return <InteractiveTableRow className={`supply-row supply-row--${supplyTone(quote.category)}`} key={quote.id}><td><SupplyRowIdentity icon="value" meta={quote.quote_no || quote.source_file || "Báo giá"} title={quote.vendor_name} /></td><td><strong className="table-secondary">{dateLabel(quote.quote_date)}</strong><small className="table-note">{categoryLabel(quote.category)}</small></td><td><strong className="table-secondary">{rows.length} mặt hàng</strong><small className="table-note">{rows.slice(0, 2).map((line) => line.item_name).join(" · ") || "Chưa có dòng hàng"}</small></td><td><strong className="table-secondary">{Number(quote.tax_rate || 0).toLocaleString("vi-VN")}%</strong><small className="table-note">{money.format(Number(quote.tax_amount || 0))}</small></td><td className="supply-money-cell supply-money-cell--strong">{money.format(Number(quote.total_amount || 0))}<small className="table-note">Trước thuế {money.format(Number(quote.subtotal || 0))}</small></td><td><span className={`status-pill ${quote.status === "SELECTED" ? "status-ok" : quote.status === "REJECTED" || quote.status === "EXPIRED" ? "status-danger" : ""}`}>{quoteStatusLabel[quote.status] ?? quote.status}</span></td><td className="supply-actions-column"><div className="table-actions row-actions"><ModalTrigger description={`${categoryLabel(quote.category)} · ${dateLabel(quote.quote_date)}`} eyebrow="CHI TIẾT BÁO GIÁ" size="wide" title={quote.vendor_name} triggerClassName="text-button row-detail-trigger" triggerLabel="Xem"><SupplyQuoteDetail quote={quote} rows={rows} /></ModalTrigger>{can(access, "supplies.manage") ? <ModalTrigger description="Cập nhật thông tin nhà cung cấp, ngày và trạng thái lựa chọn." eyebrow="BÁO GIÁ" size="large" title={`Sửa ${quote.vendor_name}`} triggerClassName="text-button" triggerLabel="Sửa"><SupplyQuoteForm initial={quote} /></ModalTrigger> : null}{can(access, "supplies.delete") ? <ConfirmAction action={deleteSupplyQuote} description={`Xóa báo giá của “${quote.vendor_name}”? Dữ liệu được ẩn và vẫn giữ trong nhật ký kiểm toán.`} fields={{ id: quote.id }} title="Xóa báo giá?" triggerLabel="Xóa" /> : null}</div></td></InteractiveTableRow>; })}{!quotes.length ? <tr><td colSpan={7} className="empty-state">Chưa có báo giá nhà cung cấp.</td></tr> : null}</tbody></table></div>;
}

function SupplyQuoteDetail({ quote, rows }: { quote: any; rows: Array<any> }) {
  return <div className="supply-detail-stack"><div className="supply-detail-grid"><div><small>Ngày báo giá</small><strong>{dateLabel(quote.quote_date)}</strong></div><div><small>Loại hàng</small><strong>{categoryLabel(quote.category)}</strong></div><div><small>Trạng thái</small><strong>{quoteStatusLabel[quote.status] ?? quote.status}</strong></div><div><small>VAT</small><strong>{Number(quote.tax_rate || 0).toLocaleString("vi-VN")}% · {money.format(Number(quote.tax_amount || 0))}</strong></div><div><small>Trước thuế</small><strong>{money.format(Number(quote.subtotal || 0))}</strong></div><div><small>Tổng thanh toán</small><strong>{money.format(Number(quote.total_amount || 0))}</strong></div><div className="span-2"><small>Địa chỉ / liên hệ</small><strong>{[quote.vendor_address, quote.vendor_contact].filter(Boolean).join(" · ") || "—"}</strong></div></div><div className="supply-detail-lines">{rows.map((line) => { const currentPrice = Number(line.unit_price || 0); const previousPrice = Number(line.old_unit_price || 0); const change = previousPrice > 0 ? ((currentPrice - previousPrice) / previousPrice) * 100 : null; return <article key={line.id}><div><strong>{line.item_name}</strong><small>{line.item_code || "Chưa có mã"} · {categoryLabel(line.category || quote.category)} · {Number(line.quantity).toLocaleString("vi-VN")} {line.unit} · {money.format(currentPrice)}{previousPrice > 0 ? ` · Kỳ trước ${money.format(previousPrice)} · ${change! > 0 ? "tăng" : change! < 0 ? "giảm" : "không đổi"} ${Math.abs(change!).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%` : " · Chưa có giá kỳ trước"}{line.note ? ` · ${line.note}` : ""}</small></div><strong>{money.format(Number(line.amount))}</strong></article>; })}</div></div>;
}
