import Link from "next/link";
import { can, requireModuleAccess } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { PhoneEditor, PhoneImport } from "@/components/telecom-phones";
import { phoneStatuses, type PhoneRecord } from "@/lib/telecom-phones";

export const metadata = { title: "Danh mục số điện thoại" };
export default async function PhonesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { access, supabase } = await requireModuleAccess("telecom");
  if (!can(access, "telecom.view")) return <p>Bạn chưa có quyền xem danh mục.</p>;
  const raw = await searchParams;
  const page = Math.max(1, Math.min(100000, Number(raw.page) || 1));
  const q = (raw.q || "").replace(/[^\p{L}\p{N} +.-]/gu, "").slice(0, 100).trim();
  const status = raw.status && Object.hasOwn(phoneStatuses, raw.status) ? raw.status : "";
  let query = supabase.from("telecom_phones").select("id,phone,location,serial,replacement_phone,status,note,updated_at", { count: "exact" }).is("deleted_at", null);
  if (q) query = query.or(`phone.ilike.%${q}%,location.ilike.%${q}%,serial.ilike.%${q}%`);
  if (status) query = query.eq("status", status);
  const { data, count, error } = await query.order("phone").order("id").range((Math.floor(page) - 1) * 20, Math.floor(page) * 20 - 1);
  const pages = Math.max(1, Math.ceil((count || 0) / 20));
  const href = (p: number) => `/telecom/phones?${new URLSearchParams({ q, status, page: String(p) })}`;
  return <div className="telecom-workspace"><PageHeader eyebrow="DỊCH VỤ VIỄN THÔNG" title="Danh mục số điện thoại" description="Quản lý SIM, vị trí lắp đặt, mã logger và trạng thái sử dụng." actions={can(access, "telecom.manage") ? <div className="telecom-select-actions"><PhoneImport/><PhoneEditor/></div> : undefined}/>
    <nav className="telecom-nav"><Link href="/telecom">← Chi phí viễn thông</Link><Link href="/telecom#telecom-reports">Báo cáo tháng / năm</Link></nav>
    <section className="panel telecom-filter"><form key={`${q}-${status}`}><label>Tìm số, vị trí hoặc logger<input name="q" defaultValue={q} maxLength={100} placeholder="Nhập từ khóa…"/></label><label>Trạng thái<select name="status" defaultValue={status}><option value="">Tất cả</option>{Object.entries(phoneStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className="secondary-button">Tìm kiếm</button><Link href="/telecom/phones">Xóa bộ lọc</Link></form></section>
    <section className="panel"><div className="telecom-heading"><h2>Số điện thoại & vị trí lắp đặt</h2><span>{count || 0} số · 20 dòng/trang</span></div>{error ? <p role="alert" className="form-error">Chưa tải được danh mục. Vui lòng thử lại.</p> : <><div className="table-wrap telecom-table"><table><thead><tr><th>Số điện thoại</th><th>Vị trí lắp đặt</th><th>Logger / Serial</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{((data || []) as PhoneRecord[]).map((row) => <tr key={row.id}><td><strong>{row.phone}</strong>{row.replacement_phone && <small>Số thay thế: {row.replacement_phone}</small>}</td><td>{row.location || "Chưa có vị trí"}</td><td>{row.serial || "—"}</td><td><span className={`status-pill status-pill--${row.status === "active" ? "active" : row.status === "cancelled" ? "retiring" : row.status === "inactive" ? "inactive" : "attention"}`}>{phoneStatuses[row.status]}</span></td><td><PhoneEditor row={row} manage={can(access, "telecom.manage")} remove={can(access, "telecom.delete")}/></td></tr>)}{!data?.length && <tr><td colSpan={5}>Chưa có số điện thoại phù hợp. Có thể thêm mới hoặc nhập Excel.</td></tr>}</tbody></table></div>{pages > 1 && <div className="telecom-pagination">{page > 1 ? <Link href={href(page - 1)}>← Trang trước</Link> : <span/>}<span>Trang {Math.floor(page)}/{pages}</span>{page < pages ? <Link href={href(page + 1)}>Trang sau →</Link> : <span/>}</div>}</>}</section>
  </div>;
}
