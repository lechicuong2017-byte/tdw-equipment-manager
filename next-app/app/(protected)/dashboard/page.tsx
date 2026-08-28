import Link from "next/link";
import { AppIcon } from "@/components/app-icon";
import { PageHeader } from "@/components/page-header";
import { can, requireAccess } from "@/lib/auth";
import {
  formatDate,
  formatMoney,
  formatNumber,
  labelStatus,
  statusTone,
} from "@/lib/format";
import type { Asset, DashboardStats } from "@/lib/types";

export const metadata = { title: "Tổng quan" };

export default async function DashboardPage() {
  const { supabase, access } = await requireAccess();
  const currentYear = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
    }).format(new Date()),
  );
  const [{ data: statsData }, { data: recentAssets }, { data: valuedAssets }] = await Promise.all([
    supabase.rpc("get_dashboard_stats"),
    supabase
      .from("assets")
      .select(
        "id, asset_kind, asset_code, asset_name, status, location, total_price, updated_at",
      )
      .is("deleted_at", null)
      .neq("status", "DA_THANH_LY")
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("assets")
      .select("id, total_price, purchase_year, purchase_date")
      .is("deleted_at", null)
      .neq("status", "DA_THANH_LY"),
  ]);

  const stats = (statsData ?? {
    total_assets: 0,
    liquidated_assets: 0,
    device_assets: 0,
    component_assets: 0,
    installed_components: 0,
    available_components: 0,
    active_assets: 0,
    needs_attention: 0,
    stored_assets: 0,
    total_value: 0,
    by_status: {},
  }) as DashboardStats;

  const assets = (recentAssets ?? []) as Pick<
    Asset,
    "id" | "asset_kind" | "asset_code" | "asset_name" | "status" | "location" | "total_price" | "updated_at"
  >[];
  const currentYearAssets = ((valuedAssets ?? []) as Pick<
    Asset,
    "id" | "total_price" | "purchase_year" | "purchase_date"
  >[]).filter((asset) =>
    asset.purchase_year === currentYear
      || (!asset.purchase_year && asset.purchase_date?.startsWith(`${currentYear}-`)),
  );
  const currentYearAssetValue = currentYearAssets.reduce(
    (sum, asset) => sum + Number(asset.total_price ?? 0),
    0,
  );

  return (
    <>
      <PageHeader
        eyebrow="TỔNG QUAN"
        title={`Chào ${access.full_name || "bạn"}`}
        description="Tình trạng tài sản được tổng hợp trực tiếp từ cơ sở dữ liệu."
        actions={
          can(access, "assets.manage") ? (
            <>
              <Link className="secondary-button" href="/assets/new?kind=component">+ Thêm linh kiện</Link>
              <Link className="primary-button" href="/assets/new">+ Thêm thiết bị</Link>
            </>
          ) : null
        }
      />

      <section className="metric-grid" aria-label="Chỉ số thiết bị">
        <article className="metric-card metric-primary">
          <span className="metric-icon"><AppIcon name="assets" /></span>
          <p>Tổng tài sản</p>
          <strong>{formatNumber(stats.total_assets)}</strong>
          <small>Đang quản lý trong hệ thống</small>
        </article>
        <article className="metric-card metric-tone-green">
          <span className="metric-icon"><AppIcon name="checkCircle" /></span>
          <p>Đang sử dụng</p>
          <strong>{formatNumber(stats.active_assets)}</strong>
          <small>Thiết bị hoạt động</small>
        </article>
        <article className="metric-card metric-tone-amber">
          <span className="metric-icon"><AppIcon name="alertCircle" /></span>
          <p>Cần chú ý</p>
          <strong>{formatNumber(stats.needs_attention)}</strong>
          <small>Cần kiểm tra hoặc xuống cấp</small>
        </article>
        <article className="metric-card metric-tone-violet">
          <span className="metric-icon"><AppIcon name="value" /></span>
          <p>Giá trị mua sắm</p>
          <strong className="metric-money">{formatMoney(currentYearAssetValue)}</strong>
          <small>Năm {currentYear} · {formatNumber(currentYearAssets.length)} tài sản</small>
        </article>
      </section>

      <section className="metric-grid metric-grid-components" aria-label="Chỉ số linh kiện">
        <article className="metric-card metric-tone-blue">
          <span className="metric-icon"><AppIcon name="device" /></span>
          <p>Thiết bị hoàn chỉnh</p>
          <strong>{formatNumber(stats.device_assets)}</strong>
          <small>Máy tính, laptop và thiết bị chính</small>
        </article>
        <article className="metric-card metric-tone-rose">
          <span className="metric-icon"><AppIcon name="component" /></span>
          <p>Tổng linh kiện</p>
          <strong>{formatNumber(stats.component_assets)}</strong>
          <small>RAM, ổ cứng và linh kiện theo dõi riêng</small>
        </article>
        <article className="metric-card metric-tone-cyan">
          <span className="metric-icon"><AppIcon name="installed" /></span>
          <p>Linh kiện đang lắp</p>
          <strong>{formatNumber(stats.installed_components)}</strong>
          <small>Đang gắn với một thiết bị hoàn chỉnh</small>
        </article>
        <article className="metric-card metric-tone-orange">
          <span className="metric-icon"><AppIcon name="archive" /></span>
          <p>Linh kiện đang rời</p>
          <strong>{formatNumber(stats.available_components)}</strong>
          <small>Sẵn sàng để gắn hoặc đang lưu kho</small>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">TRẠNG THÁI</p>
              <h2>Phân bổ thiết bị</h2>
            </div>
          </div>
          <div className="status-breakdown">
            {Object.entries(stats.by_status).length ? (
              Object.entries(stats.by_status)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => (
                  <div className={`status-row status-row--${statusTone(status)}`} key={status}>
                    <div>
                      <span className={`status-dot status-dot--${statusTone(status)}`} />
                      <span>{labelStatus(status)}</span>
                    </div>
                    <strong>{formatNumber(count)}</strong>
                    <span className="status-track">
                      <span
                        style={{
                          width: `${Math.max(5, (count / Math.max(stats.total_assets, 1)) * 100)}%`,
                        }}
                      />
                    </span>
                  </div>
                ))
            ) : (
              <p className="empty-state">Chưa có dữ liệu trạng thái.</p>
            )}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CẬP NHẬT GẦN ĐÂY</p>
              <h2>Tài sản mới thay đổi</h2>
            </div>
            <Link className="text-link" href="/assets">Xem tất cả →</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thiết bị</th>
                  <th>Trạng thái</th>
                  <th>Vị trí</th>
                  <th>Cập nhật</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const tone = statusTone(asset.status);
                  return (
                    <tr className={`asset-row asset-row--${tone}`} key={asset.id}>
                      <td>
                        <Link className="asset-name" href={`/assets/${asset.id}`}>
                          <strong>{asset.asset_name}</strong>
                          <small>
                            {asset.asset_code}
                            {asset.asset_kind === "COMPONENT" ? " · Linh kiện" : ""}
                          </small>
                        </Link>
                      </td>
                      <td><span className={`status-pill status-pill--${tone}`}>{labelStatus(asset.status)}</span></td>
                      <td>{asset.location || "—"}</td>
                      <td>{formatDate(asset.updated_at)}</td>
                    </tr>
                  );
                })}
                {!assets.length ? (
                  <tr><td className="empty-cell" colSpan={4}>Chưa có tài sản.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </>
  );
}
