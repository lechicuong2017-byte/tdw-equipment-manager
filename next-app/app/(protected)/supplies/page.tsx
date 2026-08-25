import Link from "next/link";
import { redirect } from "next/navigation";
import { ModalTrigger, ConfirmAction } from "@/components/app-modal";
import { AppIcon } from "@/components/app-icon";
import { InteractiveTableRow } from "@/components/interactive-table-row";
import { PageHeader } from "@/components/page-header";
import { SupplyImportForm, SupplyItemForm, SupplyRequestForm, type SupplyItemOption } from "@/components/supply-forms";
import { archiveSupplyItem } from "./actions";
import { can, requireAccess } from "@/lib/auth";

export const metadata = { title: "Văn phòng phẩm & Dụng cụ vệ sinh" };

type SuppliesPageProps = { searchParams: Promise<{ section?: string; year?: string; quarter?: string; month?: string; category?: string }> };

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const categoryLabel = (value: string) => value === "OFFICE_SUPPLY" ? "Văn phòng phẩm" : "Dụng cụ vệ sinh";
const statusLabel: Record<string, string> = { DRAFT: "Nháp", SUBMITTED: "Đã trình", APPROVED: "Đã duyệt", ORDERED: "Đã đặt mua", CLOSED: "Hoàn tất", REJECTED: "Không duyệt" };
const periodLabel = (row: { period_type: string; period_year: number; period_month: number | null; period_quarter: number | null }) => row.period_type === "MONTH" ? `Tháng ${row.period_month}/${row.period_year}` : row.period_type === "QUARTER" ? `Quý ${row.period_quarter}/${row.period_year}` : `Năm ${row.period_year}`;

export default async function SuppliesPage({ searchParams }: SuppliesPageProps) {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.view")) redirect("/modules");
  const params = await searchParams;
  const section = ["overview", "catalog", "requests", "reports"].includes(params.section ?? "") ? params.section! : "overview";
  const year = Number(params.year) || new Date().getFullYear();
  const quarter = Number(params.quarter) || 0;
  const month = Number(params.month) || 0;
  const category = params.category === "OFFICE_SUPPLY" || params.category === "CLEANING_SUPPLY" ? params.category : "";

  const [itemsResult, requestsResult, linesResult, departmentsResult] = await Promise.all([
    supabase.from("supply_items").select("id,category,item_code,item_name,unit,description,default_unit_price,active,updated_at").order("category").order("item_name"),
    supabase.from("supply_requests").select("id,request_no,category,period_type,period_year,period_month,period_quarter,requested_on,requesting_department,requester_name,checker_name,approver_name,status,note,source_file,created_at").order("requested_on", { ascending: false }),
    supabase.from("supply_request_lines").select("id,request_id,item_name,unit,proposed_quantity,stock_quantity,ordered_quantity,requested_departments,approval_note,approved_unit_price,amount,note,sort_order"),
    supabase.from("departments").select("id,name").order("name"),
  ]);
  const queryError = itemsResult.error || requestsResult.error || linesResult.error || departmentsResult.error;
  const items = (itemsResult.data ?? []) as SupplyItemOption[];
  const requests = requestsResult.data ?? [];
  const lines = linesResult.data ?? [];
  const linesByRequest = new Map<string, typeof lines>();
  lines.forEach((line) => linesByRequest.set(line.request_id, [...(linesByRequest.get(line.request_id) ?? []), line]));
  const totalSpend = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
  const currentRequests = requests.filter((request) => request.period_year === new Date().getFullYear() && (request.period_type !== "QUARTER" || request.period_quarter === currentQuarter));
  const filteredRequests = requests.filter((request) => request.period_year === year && (!quarter || request.period_quarter === quarter) && (!month || request.period_month === month) && (!category || request.category === category));
  const filteredIds = new Set(filteredRequests.map((request) => request.id));
  const filteredLines = lines.filter((line) => filteredIds.has(line.request_id));
  const filteredTotal = filteredLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);

  const tabs = [
    ["overview", "Tổng quan", "dashboard"], ["catalog", "Danh mục hàng", "supplies"],
    ["requests", "Phiếu yêu cầu", "assets"], ["reports", "Báo cáo", "reports"],
  ] as const;

  return (
    <>
      <PageHeader eyebrow="HÀNH CHÍNH" title="Văn phòng phẩm & Dụng cụ vệ sinh" description="Quản lý danh mục, phiếu đề nghị mua và chi phí theo tháng, quý hoặc năm." actions={can(access, "supplies.manage") ? <div className="header-actions"><ModalTrigger description="Tạo danh mục dùng chung cho các kỳ mua." eyebrow="DANH MỤC" size="large" title="Thêm hàng hóa" triggerLabel="+ Hàng hóa"><SupplyItemForm /></ModalTrigger><ModalTrigger description="Tạo phiếu thủ công với dòng hàng đầu tiên." eyebrow="PHIẾU YÊU CẦU" size="wide" title="Phiếu mua sắm mới" triggerClassName="secondary-button" triggerLabel="+ Phiếu yêu cầu"><SupplyRequestForm departments={departmentsResult.data ?? []} items={items} /></ModalTrigger></div> : null} />
      {queryError ? <p className="form-error">Chưa thể tải dữ liệu phân hệ. Hãy áp dụng migration Supabase mới rồi tải lại.</p> : null}
      <nav className="vehicle-section-tabs supply-section-tabs" aria-label="Phân hệ mua sắm">{tabs.map(([key, label, icon]) => <Link className={section === key ? "active" : ""} href={key === "overview" ? "/supplies" : `/supplies?section=${key}`} key={key}><AppIcon name={icon} size={19} />{label}</Link>)}</nav>

      {section === "overview" ? <>
        <section className="metric-grid supply-metric-grid">
          <article className="metric-card metric-card-device"><span><AppIcon name="supplies" /></span><small>Mặt hàng đang dùng</small><strong>{items.filter((item) => item.active).length}</strong><p>{items.filter((item) => item.category === "OFFICE_SUPPLY").length} VPP · {items.filter((item) => item.category === "CLEANING_SUPPLY").length} vệ sinh</p></article>
          <article className="metric-card metric-card-component"><span><AppIcon name="assets" /></span><small>Phiếu kỳ hiện tại</small><strong>{currentRequests.length}</strong><p>Quý {currentQuarter}/{new Date().getFullYear()}</p></article>
          <article className="metric-card metric-card-installed"><span><AppIcon name="value" /></span><small>Tổng chi phí đã ghi nhận</small><strong>{money.format(totalSpend)}</strong><p>{lines.length} dòng mua sắm</p></article>
          <article className="metric-card metric-card-available"><span><AppIcon name="reports" /></span><small>Chu kỳ mặc định</small><strong>Theo quý</strong><p>Có thể lập phiếu theo tháng hoặc năm</p></article>
        </section>
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">MỚI NHẤT</p><h2>Phiếu yêu cầu gần đây</h2></div>{can(access, "supplies.import") ? <ModalTrigger description="Nhận diện trực tiếp hai mẫu phiếu tổng hợp TDW." eyebrow="NHẬP DỮ LIỆU" size="medium" title="Nhập phiếu từ XLSX" triggerClassName="secondary-button" triggerLabel="Nhập XLSX"><SupplyImportForm /></ModalTrigger> : null}</div><SupplyRequestTable requests={requests.slice(0, 8)} linesByRequest={linesByRequest} /></section>
      </> : null}

      {section === "catalog" ? <section className="panel"><div className="panel-heading"><div><p className="eyebrow">DANH MỤC</p><h2>Hàng hóa đang quản lý</h2></div><span>{items.length} mặt hàng</span></div><div className="table-wrap"><table><thead><tr><th>Tên hàng</th><th>Loại</th><th>Đơn vị</th><th>Đơn giá</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{items.map((item) => <InteractiveTableRow key={item.id}><td><strong className="interactive-row-title">{item.item_name}</strong><small>{item.item_code || "Chưa đặt mã"} · {item.description || "Chưa có mô tả"}</small></td><td>{categoryLabel(item.category)}</td><td>{item.unit}</td><td>{money.format(Number(item.default_unit_price || 0))}</td><td><span className={`status-pill ${item.active ? "status-ok" : "status-muted"}`}>{item.active ? "Đang dùng" : "Ngừng dùng"}</span></td><td><div className="table-actions">{can(access, "supplies.manage") ? <ModalTrigger description="Cập nhật tên, đơn vị, loại và đơn giá mặc định." eyebrow="DANH MỤC" size="large" title={`Sửa ${item.item_name}`} triggerClassName="text-button row-detail-trigger" triggerLabel="Sửa"><SupplyItemForm initial={item} /></ModalTrigger> : null}{can(access, "supplies.delete") && item.active ? <ConfirmAction action={archiveSupplyItem} description={`Ngừng sử dụng “${item.item_name}”? Dữ liệu các phiếu cũ vẫn được giữ nguyên.`} fields={{ id: item.id }} title="Ngừng dùng hàng hóa?" triggerLabel="Ngừng dùng" /> : null}</div></td></InteractiveTableRow>)}</tbody></table></div></section> : null}

      {section === "requests" ? <section className="panel"><div className="panel-heading"><div><p className="eyebrow">PHIẾU YÊU CẦU</p><h2>Mua sắm theo kỳ</h2></div><div className="header-actions">{can(access, "supplies.import") ? <ModalTrigger description="Nhập phiếu VPP hoặc dụng cụ vệ sinh theo hai file mẫu." eyebrow="NHẬP DỮ LIỆU" size="medium" title="Nhập lịch sử XLSX" triggerClassName="secondary-button" triggerLabel="Nhập XLSX"><SupplyImportForm /></ModalTrigger> : null}</div></div><SupplyRequestTable requests={requests} linesByRequest={linesByRequest} /></section> : null}

      {section === "reports" ? <><section className="report-filter-panel"><div><p className="eyebrow">BỘ LỌC BÁO CÁO</p><h2>Chi phí mua sắm</h2><p>{filteredRequests.length} phiếu · {filteredLines.length} dòng · {money.format(filteredTotal)}</p></div><form className="report-filter-grid"><input name="section" type="hidden" value="reports" /><label>Năm<input defaultValue={year} min={2000} max={2200} name="year" type="number" /></label><label>Quý<select defaultValue={quarter} name="quarter"><option value="0">Tất cả quý</option>{[1,2,3,4].map((value) => <option key={value} value={value}>Quý {value}</option>)}</select></label><label>Tháng<select defaultValue={month} name="month"><option value="0">Tất cả tháng</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>Tháng {index + 1}</option>)}</select></label><label>Loại<select defaultValue={category} name="category"><option value="">Tất cả loại</option><option value="OFFICE_SUPPLY">Văn phòng phẩm</option><option value="CLEANING_SUPPLY">Dụng cụ vệ sinh</option></select></label><button className="primary-button" type="submit">Áp dụng</button></form></section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">CHI TIẾT</p><h2>Dòng hàng theo bộ lọc</h2></div><Link className="secondary-button" href={`/api/supplies/reports?format=xlsx&year=${year}&quarter=${quarter}&month=${month}&category=${category}`}>Xuất XLSX</Link></div><div className="table-wrap"><table><thead><tr><th>Phiếu / kỳ</th><th>Hàng hóa</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th><th>Phê duyệt</th></tr></thead><tbody>{filteredLines.map((line) => { const request = filteredRequests.find((item) => item.id === line.request_id); return <tr key={line.id}><td><strong>{request?.request_no}</strong><small>{request ? `${categoryLabel(request.category)} · ${periodLabel(request)}` : ""}</small></td><td><strong>{line.item_name}</strong><small>{line.unit} · {line.requested_departments}</small></td><td>{Number(line.ordered_quantity).toLocaleString("vi-VN")}</td><td>{money.format(Number(line.approved_unit_price))}</td><td><strong>{money.format(Number(line.amount))}</strong></td><td>{line.approval_note || "—"}</td></tr>; })}</tbody></table></div></section></> : null}
    </>
  );
}

function SupplyRequestTable({ requests, linesByRequest }: { requests: Array<any>; linesByRequest: Map<string, Array<any>> }) {
  return <div className="table-wrap"><table><thead><tr><th>Số phiếu</th><th>Loại / kỳ</th><th>Người đề nghị</th><th>Tiến độ</th><th>Dòng hàng</th><th>Tổng tiền</th></tr></thead><tbody>{requests.map((request) => { const rows = linesByRequest.get(request.id) ?? []; const total = rows.reduce((sum, line) => sum + Number(line.amount || 0), 0); return <tr key={request.id}><td><strong>{request.request_no}</strong><small>{new Date(`${request.requested_on}T00:00:00`).toLocaleDateString("vi-VN")}</small></td><td><strong>{categoryLabel(request.category)}</strong><small>{periodLabel(request)}</small></td><td>{request.requester_name || "—"}<small>{request.requesting_department}</small></td><td><span className={`status-pill ${request.status === "REJECTED" ? "status-danger" : request.status === "CLOSED" || request.status === "ORDERED" ? "status-ok" : ""}`}>{statusLabel[request.status] ?? request.status}</span></td><td>{rows.length} mặt hàng<small>{rows.slice(0, 2).map((line) => line.item_name).join(" · ")}</small></td><td><strong>{money.format(total)}</strong><small>{request.source_file ? `Nhập từ ${request.source_file}` : "Tạo thủ công"}</small></td></tr>; })}{!requests.length ? <tr><td colSpan={6} className="empty-state">Chưa có phiếu yêu cầu.</td></tr> : null}</tbody></table></div>;
}
