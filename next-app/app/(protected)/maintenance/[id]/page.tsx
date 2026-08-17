import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MaintenanceMediaUpload } from "@/components/maintenance-media-upload";
import { PageHeader } from "@/components/page-header";
import { can, requireAccess } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Chi tiết bảo trì" };

type RelatedRecord =
  | Record<string, string | null>
  | Record<string, string | null>[]
  | null;

function relatedRecord(value: RelatedRecord) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MaintenanceLogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, access } = await requireAccess();
  const [{ data: log }, { data: settings }, { data: media }] = await Promise.all([
    supabase
      .from("maintenance_logs")
      .select(
        "id,asset_id,plan_id,maintenance_date,action_type,description,cost,vendor,warranty_months,performed_by,note,created_at,updated_at,assets(id,asset_code,asset_name,asset_type,brand,model),maintenance_plans(id,title,frequency)",
      )
      .eq("id", id)
      .single(),
    supabase
      .from("settings")
      .select("setting_value,display_name")
      .eq("setting_type", "maintenance_type")
      .eq("active", true),
    supabase
      .from("media_files")
      .select("id,owner_id,object_path,thumbnail_path,file_name")
      .eq("owner_type", "MAINTENANCE")
      .eq("owner_id", id)
      .order("sort_order")
      .order("created_at"),
  ]);

  if (!log) notFound();

  const asset = relatedRecord(log.assets as RelatedRecord);
  const plan = relatedRecord(log.maintenance_plans as RelatedRecord);
  const typeLabels = new Map(
    (settings ?? []).map((item) => [item.setting_value, item.display_name]),
  );
  const mediaPaths = (media ?? []).flatMap((item) => [
    item.thumbnail_path || item.object_path,
    item.object_path,
  ]);
  const { data: signedUrls } = mediaPaths.length
    ? await supabase.storage.from("asset-media").createSignedUrls(mediaPaths, 300)
    : { data: [] };
  const signedUrlByPath = new Map(
    (signedUrls ?? []).map((item) => [item.path, item.signedUrl]),
  );
  const signedMedia = (media ?? []).map((item) => ({
    file_name: item.file_name,
    id: item.id,
    signed_url: signedUrlByPath.get(item.thumbnail_path || item.object_path) ?? null,
    original_url: signedUrlByPath.get(item.object_path) ?? null,
  }));
  const maintenanceType = typeLabels.get(log.action_type)
    ?? log.action_type
    ?? "Bảo trì";

  return (
    <>
      <PageHeader
        eyebrow="NHẬT KÝ BẢO TRÌ"
        title={`${maintenanceType} · ${formatDate(log.maintenance_date)}`}
        description={`${asset?.asset_code ?? ""} · ${asset?.asset_name ?? "Thiết bị"}`}
        actions={
          <>
            <Link className="secondary-button" href="/maintenance">Danh sách bảo trì</Link>
            {asset?.id ? (
              <Link className="secondary-button" href={`/assets/${asset.id}`}>
                Hồ sơ thiết bị
              </Link>
            ) : null}
          </>
        }
      />

      <section className="maintenance-detail-grid">
        <article className="panel maintenance-detail-summary">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">THÔNG TIN</p>
              <h2>Ghi nhận bảo trì</h2>
            </div>
            <span className="status-pill">{maintenanceType}</span>
          </div>
          <dl className="detail-list">
            <div><dt>Ngày bảo trì</dt><dd>{formatDate(log.maintenance_date)}</dd></div>
            <div><dt>Thiết bị</dt><dd>{asset?.asset_code ?? "—"} · {asset?.asset_name ?? "—"}</dd></div>
            <div><dt>Loại thiết bị</dt><dd>{asset?.asset_type || "—"}</dd></div>
            <div><dt>Kế hoạch liên quan</dt><dd>{plan?.title || "Không gắn kế hoạch"}</dd></div>
            <div><dt>Đơn vị thực hiện</dt><dd>{log.vendor || "—"}</dd></div>
            <div><dt>Người thực hiện</dt><dd>{log.performed_by || "—"}</dd></div>
            <div><dt>Chi phí</dt><dd>{formatMoney(log.cost)}</dd></div>
            <div><dt>Bảo hành thêm</dt><dd>{log.warranty_months ? `${log.warranty_months} tháng` : "Không có"}</dd></div>
          </dl>
          <div className="maintenance-detail-copy">
            <strong>Nội dung thực hiện</strong>
            <p>{log.description}</p>
          </div>
          {log.note ? (
            <div className="maintenance-detail-copy">
              <strong>Ghi chú</strong>
              <p>{log.note}</p>
            </div>
          ) : null}
        </article>

        <article className="panel maintenance-detail-media">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">HÌNH ẢNH</p>
              <h2>Ảnh bảo trì</h2>
            </div>
            <small>{signedMedia.length} ảnh</small>
          </div>
          {signedMedia.length ? (
            <div className="maintenance-detail-media-grid">
              {signedMedia.map((item) => (
                <a
                  href={item.original_url ?? item.signed_url ?? undefined}
                  key={item.id}
                  rel="noreferrer"
                  target="_blank"
                  title={`Mở ảnh ${item.file_name}`}
                >
                  {item.signed_url ? (
                    <Image
                      alt={item.file_name || "Ảnh bảo trì"}
                      height={240}
                      src={item.signed_url}
                      unoptimized
                      width={320}
                    />
                  ) : (
                    <span className="media-unavailable">Không thể tải ảnh</span>
                  )}
                  <small>{item.file_name}</small>
                </a>
              ))}
            </div>
          ) : (
            <p className="maintenance-media-empty">Lần bảo trì này chưa có hình ảnh.</p>
          )}
          {can(access, "maintenance.manage") ? (
            <MaintenanceMediaUpload maintenanceLogId={log.id} media={signedMedia} />
          ) : null}
        </article>
      </section>
    </>
  );
}
