import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MediaUpload } from "@/components/media-upload";
import { PageHeader } from "@/components/page-header";
import { archiveAsset, deleteAssetMedia } from "../actions";
import { can, requireAccess } from "@/lib/auth";
import {
  formatDate,
  formatMoney,
  labelStatus,
} from "@/lib/format";
import type { Asset, MediaFile } from "@/lib/types";

export const metadata = { title: "Hồ sơ thiết bị" };

type AssetDetailProps = {
  params: Promise<{ id: string }>;
};

export default async function AssetDetailPage({ params }: AssetDetailProps) {
  const { id } = await params;
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
      .select("id, object_path, file_name, mime_type, byte_size, sort_order, created_at")
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
    </>
  );
}
