import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetComponentManager } from "@/components/asset-component-manager";
import { AssetQrCard } from "@/components/asset-qr-card";
import { MediaUpload } from "@/components/media-upload";
import { PageHeader } from "@/components/page-header";
import { archiveAsset, deleteAssetMedia } from "../actions";
import { can, requireAccess } from "@/lib/auth";
import {
  formatDate,
  formatMoney,
  labelStatus,
} from "@/lib/format";
import type {
  Asset,
  AssetComponentInstallation,
  AssetComponentSummary,
  MediaFile,
} from "@/lib/types";

export const metadata = { title: "Hồ sơ thiết bị" };

type AssetDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ component_status?: string }>;
};

function relatedSummary(
  value: AssetComponentSummary | AssetComponentSummary[] | null | undefined,
) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AssetDetailPage({ params, searchParams }: AssetDetailProps) {
  const { id } = await params;
  const componentStatus = String((await searchParams).component_status ?? "");
  const { supabase, access } = await requireAccess();
  const [{ data: assetData }, { data: mediaData }] = await Promise.all([
    supabase
      .from("assets")
      .select("*, departments(name)")
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("media_files")
      .select("id, object_path, thumbnail_path, file_name, mime_type, byte_size, sort_order, created_at")
      .eq("asset_id", id)
      .eq("owner_type", "ASSET")
      .order("sort_order")
      .order("created_at"),
  ]);

  if (!assetData) notFound();

  const asset = assetData as Asset & {
    departments?: { name?: string } | { name?: string }[] | null;
  };
  const media = (mediaData ?? []) as MediaFile[];
  const signedMedia = await Promise.all(
    media.map(async (item) => {
      const { data } = await supabase.storage
        .from("asset-media")
        .createSignedUrl(item.object_path, 300);
      return { ...item, signed_url: data?.signedUrl };
    }),
  );
  const department = Array.isArray(asset.departments)
    ? asset.departments[0]?.name
    : asset.departments?.name;
  const canManageComponents = can(access, "assets.manage");
  const componentFields =
    "id,asset_code,asset_name,asset_type,brand,model,serial_number,status,warranty_end_date";
  const [activeResult, historyResult, candidatesResult, installedResult] =
    await Promise.all([
      asset.asset_kind === "DEVICE"
        ? supabase
            .from("asset_component_installations")
            .select(
              `id,host_asset_id,component_asset_id,installed_at,removed_at,slot_name,install_note,removal_reason,removal_note,component:assets!asset_component_installations_component_asset_id_fkey(${componentFields})`,
            )
            .eq("host_asset_id", asset.id)
            .order("installed_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      asset.asset_kind === "COMPONENT"
        ? supabase
            .from("asset_component_installations")
            .select(
              `id,host_asset_id,component_asset_id,installed_at,removed_at,slot_name,install_note,removal_reason,removal_note,host:assets!asset_component_installations_host_asset_id_fkey(${componentFields})`,
            )
            .eq("component_asset_id", asset.id)
            .order("installed_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      asset.asset_kind === "DEVICE" && canManageComponents
        ? supabase
            .from("assets")
            .select(componentFields)
            .eq("asset_kind", "COMPONENT")
            .eq("quantity", 1)
            .is("deleted_at", null)
            .order("asset_code")
            .limit(2000)
        : Promise.resolve({ data: [] }),
      asset.asset_kind === "DEVICE" && canManageComponents
        ? supabase
            .from("asset_component_installations")
            .select("component_asset_id")
            .is("removed_at", null)
            .limit(2000)
        : Promise.resolve({ data: [] }),
    ]);
  const hostComponentHistory = (activeResult.data ?? []).map((item) => ({
    ...item,
    component: relatedSummary(item.component as never) ?? null,
  })) as AssetComponentInstallation[];
  const activeComponents = hostComponentHistory.filter((item) => !item.removed_at);
  const componentHistory = (historyResult.data ?? []).map((item) => ({
    ...item,
    host: relatedSummary(item.host as never) ?? null,
  })) as AssetComponentInstallation[];
  const installedComponentIds = new Set(
    (installedResult.data ?? []).map((item) => item.component_asset_id),
  );
  const availableComponents = (candidatesResult.data ?? []).filter(
    (item) => !installedComponentIds.has(item.id),
  ) as AssetComponentSummary[];

  return (
    <>
      <PageHeader
        eyebrow={asset.asset_code}
        title={asset.asset_name}
        description={`${asset.brand || "Chưa rõ hãng"} ${asset.model || ""}`.trim()}
        actions={
          <>
            {can(access, "assets.manage") ? (
              <Link className="secondary-button" href={`/assets/${asset.id}/edit`}>Chỉnh sửa</Link>
            ) : null}
            <Link className="secondary-button" href="/assets">Danh sách</Link>
          </>
        }
      />

      <section className="profile-grid">
        <article className="panel profile-summary">
          <div className="profile-status">
            <span className="status-pill">{labelStatus(asset.status)}</span>
            <small>Cập nhật {formatDate(asset.updated_at)}</small>
          </div>
          <dl className="detail-list">
            <div><dt>Phân loại</dt><dd>{asset.asset_kind === "COMPONENT" ? "Linh kiện" : "Thiết bị hoàn chỉnh"}</dd></div>
            <div><dt>Loại thiết bị</dt><dd>{asset.asset_type || "—"}</dd></div>
            <div><dt>Serial</dt><dd>{asset.serial_number || "—"}</dd></div>
            <div><dt>Phòng ban</dt><dd>{department || asset.department_legacy_name || "—"}</dd></div>
            <div><dt>Vị trí</dt><dd>{asset.location || "—"}</dd></div>
            <div><dt>Người sử dụng</dt><dd>{asset.assigned_to_name || "—"}</dd></div>
            <div><dt>Ngày mua</dt><dd>{formatDate(asset.purchase_date)}</dd></div>
            <div><dt>Bảo hành đến</dt><dd>{formatDate(asset.warranty_end_date)}</dd></div>
            <div><dt>Giá trị</dt><dd>{formatMoney(asset.total_price)}</dd></div>
          </dl>
          {asset.note ? <p className="profile-note">{asset.note}</p> : null}
          <AssetQrCard asset={{
            id: asset.id,
            asset_code: asset.asset_code,
            asset_name: asset.asset_name,
            asset_group: asset.asset_group,
            asset_group_label: asset.asset_group_label,
            purchase_year: asset.purchase_year,
            last_maintenance_date: asset.last_maintenance_date,
            warranty_end_date: asset.warranty_end_date,
          }} />
          {can(access, "assets.delete") ? (
            <form action={archiveAsset} className="danger-zone">
              <input name="id" type="hidden" value={asset.id} />
              <button className="danger-button" type="submit">Đưa vào lưu trữ</button>
            </form>
          ) : null}
        </article>

        <article className="panel media-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">HÌNH ẢNH</p>
              <h2>Ảnh thiết bị</h2>
            </div>
            <small>{signedMedia.length} ảnh</small>
          </div>
          <div className="media-grid">
            {signedMedia.map((item) => (
              <figure key={item.id}>
                {item.signed_url ? (
                  <Image
                    alt={item.file_name || asset.asset_name}
                    height={360}
                    loading="lazy"
                    src={item.signed_url}
                    unoptimized
                    width={480}
                  />
                ) : (
                  <div className="media-unavailable">Không thể tải ảnh</div>
                )}
                <figcaption>
                  <span>{item.file_name}</span>
                  {can(access, "assets.manage") ? (
                    <form action={deleteAssetMedia}>
                      <input name="id" type="hidden" value={item.id} />
                      <input name="asset_id" type="hidden" value={asset.id} />
                      <button aria-label={`Xóa ${item.file_name}`} type="submit">×</button>
                    </form>
                  ) : null}
                </figcaption>
              </figure>
            ))}
            {!signedMedia.length ? (
              <p className="empty-state">Chưa có hình ảnh cho thiết bị này.</p>
            ) : null}
          </div>
          {can(access, "assets.manage") ? <MediaUpload assetId={asset.id} /> : null}
        </article>
      </section>

      <AssetComponentManager
        activeComponents={activeComponents}
        asset={asset}
        availableComponents={availableComponents}
        canManage={canManageComponents}
        componentHistory={componentHistory}
        hostComponentHistory={hostComponentHistory}
        status={componentStatus}
      />
    </>
  );
}
