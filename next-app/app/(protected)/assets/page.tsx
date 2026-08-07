import Link from "next/link";
import {
  AutoSubmitSelect,
  InstantFilterForm,
} from "@/components/auto-submit-select";
import { PageHeader } from "@/components/page-header";
import {
  AssetListThumbnail,
  AssetPreviewProvider,
} from "@/components/asset-list-previews";
import { can, requireAccess } from "@/lib/auth";
import { formatMoney, labelStatus, statusTone } from "@/lib/format";
import { z } from "zod";

export const metadata = { title: "Thiết bị" };

const allowedKinds = new Set(["DEVICE", "COMPONENT"]);

type AssetsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    kind?: string;
    category?: string;
    department?: string;
    page?: string;
  }>;
};

export default async function AssetsPage({ searchParams }: AssetsPageProps) {
  const [{ supabase, access }, params] = await Promise.all([
    requireAccess(),
    searchParams,
  ]);
  const search = String(params.q ?? "")
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .slice(0, 80);
  const status = String(params.status ?? "")
    .trim()
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, 120);
  const kind = allowedKinds.has(String(params.kind))
    ? String(params.kind)
    : "";
  const category = String(params.category ?? "")
    .trim()
    .replace(/[^\p{L}\p{N}\s()./+&-]/gu, "")
    .slice(0, 120);
  const rawDepartment = String(params.department ?? "").trim();
  const department = rawDepartment === "UNASSIGNED"
    ? rawDepartment
    : z.uuid().safeParse(rawDepartment).success
      ? rawDepartment
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
  if (kind) query = query.eq("asset_kind", kind);
  if (category) query = query.eq("asset_type", category);
  if (department === "UNASSIGNED") query = query.is("department_id", null);
  else if (department) query = query.eq("department_id", department);

  const [
    { data: configuredSettings },
    { data, count },
    { data: categoryData },
    { data: departments },
  ] = await Promise.all([
    supabase
      .from("settings")
      .select("setting_type,setting_value,display_name")
      .in("setting_type", ["status", "asset_type"])
      .eq("active", true)
      .order("sort_order"),
    query,
    supabase.rpc("get_asset_filter_options"),
    supabase
      .from("departments")
      .select("id,name")
      .order("name"),
  ]);
  const statusSettings = (configuredSettings ?? []).filter(
    (item) => item.setting_type === "status",
  );
  const settingLabels = new Map(
    (configuredSettings ?? []).map((item) => [item.setting_value, item.display_name]),
  );
  const categoryOptions = (categoryData ?? []) as {
    category: string;
    item_count: number;
  }[];
  const assetRows = data ?? [];
  const assetIds = assetRows.map((asset) => asset.id);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  const pageHref = (targetPage: number) => {
    const nextParams = new URLSearchParams();
    if (search) nextParams.set("q", search);
    if (status) nextParams.set("status", status);
    if (kind) nextParams.set("kind", kind);
    if (category) nextParams.set("category", category);
    if (department) nextParams.set("department", department);
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
            <>
              <Link className="secondary-button" href="/assets/new?kind=component">+ Thêm linh kiện</Link>
              <Link className="primary-button" href="/assets/new">+ Thêm thiết bị</Link>
            </>
          ) : null
        }
      />

      <section className="panel">
        <InstantFilterForm className="filter-bar">
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <input defaultValue={search} name="q" placeholder="Tìm mã, tên hoặc serial…" />
          </label>
          <AutoSubmitSelect aria-label="Lọc theo phòng ban" defaultValue={department} name="department">
            <option value="">Tất cả phòng ban</option>
            <option value="UNASSIGNED">Chưa phân phòng</option>
            {(departments ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </AutoSubmitSelect>
          <AutoSubmitSelect aria-label="Lọc theo danh mục" defaultValue={category} name="category">
            <option value="">Tất cả danh mục</option>
            {categoryOptions.map((option) => (
              <option key={option.category} value={option.category}>
                {settingLabels.get(option.category) ?? option.category} ({option.item_count})
              </option>
            ))}
          </AutoSubmitSelect>
          <AutoSubmitSelect aria-label="Lọc theo phân loại" defaultValue={kind} name="kind">
            <option value="">Tất cả phân loại</option>
            <option value="DEVICE">Thiết bị hoàn chỉnh</option>
            <option value="COMPONENT">Linh kiện bên trong</option>
          </AutoSubmitSelect>
          <AutoSubmitSelect aria-label="Lọc theo trạng thái" defaultValue={status} name="status">
            <option value="">Tất cả trạng thái</option>
            {statusSettings.length ? statusSettings.map((item) => (
              <option key={item.setting_value} value={item.setting_value}>{item.display_name}</option>
            )) : (
              <>
                <option value="CON_SU_DUNG">Còn sử dụng</option>
                <option value="MOI_100">Mới 100%</option>
                <option value="CAN_KIEM_TRA">Cần kiểm tra</option>
                <option value="KEM_PHAM_CHAT">Kém phẩm chất</option>
                <option value="KHONG_SU_DUNG">Không sử dụng</option>
                <option value="LUU_KHO_THANH_LY">Lưu kho chờ thanh lý</option>
              </>
            )}
          </AutoSubmitSelect>
          <button className="visually-hidden" type="submit">Tìm kiếm</button>
        </InstantFilterForm>

        <div className="table-summary">
          <span>
            {count ?? 0}{" "}
            {kind === "COMPONENT" ? "linh kiện" : kind === "DEVICE" ? "thiết bị" : "tài sản"}
          </span>
          <small>Trang {Math.min(page, totalPages)} / {totalPages}</small>
        </div>

        <AssetPreviewProvider assetIds={assetIds}>
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
              {assetRows.map((asset) => {
                const department = Array.isArray(asset.departments)
                  ? asset.departments[0]?.name
                  : (asset.departments as { name?: string } | null)?.name;
                const tone = statusTone(asset.status);
                return (
                  <tr className={`asset-row asset-row--${tone}`} key={asset.id}>
                    <td>
                      <div className="asset-table-identity">
                        <AssetListThumbnail assetId={asset.id} assetName={asset.asset_name} />
                        <Link
                          className="asset-name"
                          href={`/assets/${asset.id}?returnTo=${encodeURIComponent(pageHref(page))}`}
                        >
                          <strong>{asset.asset_name}</strong>
                          <small>
                            {asset.asset_code} · {asset.brand} {asset.model}
                            {asset.asset_kind === "COMPONENT" ? " · Linh kiện" : ""}
                          </small>
                        </Link>
                      </div>
                    </td>
                    <td>{settingLabels.get(asset.asset_type) ?? (asset.asset_type || "—")}</td>
                    <td>
                      <strong className="table-secondary">{department || "Chưa phân phòng"}</strong>
                      <small className="table-note">{asset.location || "Chưa có vị trí"}</small>
                    </td>
                    <td><span className={`status-pill status-pill--${tone}`}>{settingLabels.get(asset.status) ?? labelStatus(asset.status)}</span></td>
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
        </AssetPreviewProvider>

        <nav className="pagination" aria-label="Phân trang">
          {page > 1 ? <Link href={pageHref(page - 1)}>← Trang trước</Link> : <span />}
          {page < totalPages ? <Link href={pageHref(page + 1)}>Trang sau →</Link> : <span />}
        </nav>
      </section>
    </>
  );
}
