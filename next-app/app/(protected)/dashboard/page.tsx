import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { can, requireAccess } from "@/lib/auth";
import {
  formatDate,
  formatMoney,
  formatNumber,
  labelStatus,
} from "@/lib/format";
import type { Asset, DashboardStats } from "@/lib/types";

export const metadata = { title: "Tổng quan" };

export default async function DashboardPage() {
  const { supabase, access } = await requireAccess();
  const [{ data: statsData }, { data: recentAssets }] = await Promise.all([
    supabase.rpc("get_dashboard_stats"),
    supabase
      .from("assets")
      .select(
        "id, asset_code, asset_name, status, location, total_price, updated_at",
      )
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(6),
  ]);

  const stats = (statsData ?? {
    total_assets: 0,
    active_assets: 0,
    needs_attention: 0,
    stored_assets: 0,
    total_value: 0,
    by_status: {},
  }) as DashboardStats;

  const assets = (recentAssets ?? []) as Pick<
    Asset,
    "id" | "asset_code" | "asset_name" | "status" | "location" | "total_price" | "updated_at"
  >[];

  return (
    <>
      <PageHeader
        eyebrow="TỔNG QUAN"
        title={`Chào ${access.full_name || "bạn"}`}
        description="Tình trạng tài sản được tổng hợp trực tiếp từ cơ sở dữ liệu."
        actions={
          can(access, "assets.manage") ? (
            <Link className="primary-button" href="/assets/new">+ Thêm thiết bị</Link>
          ) : null
        }
      />

      <section className="metric-grid" aria-label="Chỉ số thiết bị">
        <article className="metric-card metric-primary">
          <span className="metric-icon" aria-hidden="true">▤</span>
          <p>Tổng thiết bị</p>
          <strong>{formatNumber(stats.total_assets)}</strong>
          <small>Đang quản lý trong hệ thống</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-green" aria-hidden="true">✓</span>
          <p>Đang sử dụng</p>
          <strong>{formatNumber(stats.active_assets)}</strong>
          <small>Thiết bị hoạt động</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-amber" aria-hidden="true">!</span>
          <p>Cần chú ý</p>
          <strong>{formatNumber(stats.needs_attention)}</strong>
          <small>Cần kiểm tra hoặc xuống cấp</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-slate" aria-hidden="true">◇</span>
          <p>Tổng giá trị</p>
          <strong className="metric-money">{formatMoney(stats.total_value)}</strong>
          <small>Theo dữ liệu đã nhập</small>
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
                  <div className="status-row" key={status}>
                    <div>
                      <span className={`status-dot status-${status.toLowerCase()}`} />
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
              <h2>Thiết bị mới thay đổi</h2>
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
                {assets.map((asset) => (
                  <tr key={asset.id}>
                    <td>
                      <Link className="asset-name" href={`/assets/${asset.id}`}>
                        <strong>{asset.asset_name}</strong>
                        <small>{asset.asset_code}</small>
                      </Link>
                    </td>
                    <td><span className="status-pill">{labelStatus(asset.status)}</span></td>
                    <td>{asset.location || "—"}</td>
                    <td>{formatDate(asset.updated_at)}</td>
                  </tr>
                ))}
                {!assets.length ? (
                  <tr><td className="empty-cell" colSpan={4}>Chưa có thiết bị.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </>
  );
}
