import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { can, requireAccess } from "@/lib/auth";
import { formatMoney, labelStatus } from "@/lib/format";

export const metadata = { title: "Thiết bị" };

const allowedStatuses = new Set([
  "CON_SU_DUNG",
  "MOI_100",
  "KEM_PHAM_CHAT",
  "CAN_KIEM_TRA",
  "KHONG_SU_DUNG",
  "LUU_KHO_THANH_LY",
]);

type AssetsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
  }>;
};

export default async function AssetsPage({ searchParams }: AssetsPageProps) {
  const { supabase, access } = await requireAccess();
  const params = await searchParams;
  const search = String(params.q ?? "")
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .slice(0, 80);
  const status = allowedStatuses.has(String(params.status))
    ? String(params.status)
    : "";
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1));
  const pageSize = 20;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("assets")
    .select(
      "id, asset_kind, asset_code, asset_name, asset_type, brand, model, status, location, quantity, total_price, updated_at, departments(name)",
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (search) {
    query = query.or(
      `asset_code.ilike.%${search}%,asset_name.ilike.%${search}%,serial_number.ilike.%${search}%`,
    );
  }
  if (status) query = query.eq("status", status);

  const { data, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  const pageHref = (targetPage: number) => {
    const nextParams = new URLSearchParams();
    if (search) nextParams.set("q", search);
    if (status) nextParams.set("status", status);
    nextParams.set("page", String(targetPage));
    return `/assets?${nextParams.toString()}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="TÀI SẢN"
        title="Thiết bị"
        description="Dữ liệu được lọc và phân trang trực tiếp tại PostgreSQL."
        actions={
          can(access, "assets.manage") ? (
            <Link className="primary-button" href="/assets/new">+ Thêm thiết bị</Link>
          ) : null
        }
      />

      <section className="panel">
        <form className="filter-bar">
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <input defaultValue={search} name="q" placeholder="Tìm mã, tên hoặc serial…" />
          </label>
          <select defaultValue={status} name="status">
            <option value="">Tất cả trạng thái</option>
            <option value="CON_SU_DUNG">Còn sử dụng</option>
            <option value="MOI_100">Mới 100%</option>
            <option value="CAN_KIEM_TRA">Cần kiểm tra</option>
            <option value="KEM_PHAM_CHAT">Kém phẩm chất</option>
            <option value="KHONG_SU_DUNG">Không sử dụng</option>
            <option value="LUU_KHO_THANH_LY">Lưu kho / thanh lý</option>
          </select>
          <button className="secondary-button" type="submit">Lọc dữ liệu</button>
        </form>

        <div className="table-summary">
          <span>{count ?? 0} thiết bị</span>
          <small>Trang {Math.min(page, totalPages)} / {totalPages}</small>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã & thiết bị</th>
                <th>Loại</th>
                <th>Phòng ban / vị trí</th>
                <th>Trạng thái</th>
                <th className="align-right">Giá trị</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((asset) => {
                const department = Array.isArray(asset.departments)
                  ? asset.departments[0]?.name
                  : (asset.departments as { name?: string } | null)?.name;
                return (
                  <tr key={asset.id}>
                    <td>
                      <Link className="asset-name" href={`/assets/${asset.id}`}>
                        <strong>{asset.asset_name}</strong>
                        <small>
                          {asset.asset_code} · {asset.brand} {asset.model}
                          {asset.asset_kind === "COMPONENT" ? " · Linh kiện" : ""}
                        </small>
                      </Link>
                    </td>
                    <td>{asset.asset_type || "—"}</td>
                    <td>
                      <strong className="table-secondary">{department || "Chưa phân phòng"}</strong>
                      <small className="table-note">{asset.location || "Chưa có vị trí"}</small>
                    </td>
                    <td><span className="status-pill">{labelStatus(asset.status)}</span></td>
                    <td className="align-right">{formatMoney(asset.total_price)}</td>
                  </tr>
                );
              })}
              {!data?.length ? (
                <tr><td className="empty-cell" colSpan={5}>Không tìm thấy thiết bị phù hợp.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <nav className="pagination" aria-label="Phân trang">
          {page > 1 ? <Link href={pageHref(page - 1)}>← Trang trước</Link> : <span />}
          {page < totalPages ? <Link href={pageHref(page + 1)}>Trang sau →</Link> : <span />}
        </nav>
      </section>
    </>
  );
}
