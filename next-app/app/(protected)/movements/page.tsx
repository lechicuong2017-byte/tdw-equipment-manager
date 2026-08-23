import Link from "next/link";
import { ModalTrigger } from "@/components/app-modal";
import { InteractiveTableRow } from "@/components/interactive-table-row";
import { MovementForm } from "@/components/movement-form";
import { PageHeader } from "@/components/page-header";
import { can, requireAccess } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Luân chuyển" };

type RelatedAsset =
  | { asset_code?: string; asset_name?: string }
  | { asset_code?: string; asset_name?: string }[]
  | null;

function getRelatedAsset(value: RelatedAsset) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MovementsPage() {
  const { supabase, access } = await requireAccess();
  const [{ data: assets }, { data: movements }] = await Promise.all([
    supabase
      .from("assets")
      .select("id, asset_code, asset_name, assigned_to_name, location")
      .is("deleted_at", null)
      .order("asset_code")
      .limit(500),
    supabase
      .from("inventory_movements")
      .select(
        "id, asset_id, movement_date, from_user_name, to_user_name, from_location, to_location, reason, approved_by_name, note, created_at, assets(asset_code, asset_name)",
      )
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());

  return (
    <>
      <PageHeader
        eyebrow="LUÂN CHUYỂN"
        title="Luân chuyển thiết bị"
        description="Mỗi lần bàn giao được lưu bất biến và cập nhật hồ sơ thiết bị trong cùng một giao dịch."
        actions={can(access, "movement.manage") ? (
          <ModalTrigger
            description="Ghi nhận người sử dụng, vị trí và lý do bàn giao thiết bị."
            eyebrow="LUÂN CHUYỂN"
            size="large"
            title="Thêm lần luân chuyển"
            triggerLabel="+ Thêm luân chuyển"
          >
            <MovementForm assets={assets ?? []} today={today} />
          </ModalTrigger>
        ) : null}
      />

      <section className="panel module-table">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">LỊCH SỬ</p>
            <h2>Các lần luân chuyển gần đây</h2>
          </div>
          <small>{movements?.length ?? 0} bản ghi</small>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày / thiết bị</th>
                <th>Người sử dụng</th>
                <th>Vị trí</th>
                <th>Lý do / phê duyệt</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {(movements ?? []).map((movement) => {
                const asset = getRelatedAsset(movement.assets);
                return (
                  <InteractiveTableRow key={movement.id}>
                    <td>
                      <Link className="asset-name" href={`/assets/${movement.asset_id}`} prefetch={false}>
                        <strong>{formatDate(movement.movement_date)}</strong>
                        <small>{asset?.asset_code} · {asset?.asset_name}</small>
                      </Link>
                    </td>
                    <td>
                      <span className="movement-change">
                        <small>{movement.from_user_name || "Chưa phân công"}</small>
                        <b aria-hidden="true">→</b>
                        <strong>{movement.to_user_name || "Chưa phân công"}</strong>
                      </span>
                    </td>
                    <td>
                      <span className="movement-change">
                        <small>{movement.from_location || "Chưa có vị trí"}</small>
                        <b aria-hidden="true">→</b>
                        <strong>{movement.to_location || "Chưa có vị trí"}</strong>
                      </span>
                    </td>
                    <td>
                      <strong className="table-secondary">{movement.reason || "—"}</strong>
                      <small className="table-note">
                        {movement.approved_by_name
                          ? `Duyệt bởi ${movement.approved_by_name}`
                          : "Chưa ghi người duyệt"}
                      </small>
                    </td>
                    <td>
                      <ModalTrigger
                        description={`${asset?.asset_code ?? ""} · ${asset?.asset_name ?? "Thiết bị"}`}
                        eyebrow="CHI TIẾT LUÂN CHUYỂN"
                        size="medium"
                        title={`Luân chuyển ngày ${formatDate(movement.movement_date)}`}
                        triggerClassName="text-button row-detail-trigger"
                        triggerLabel="Xem"
                      >
                        <dl className="record-detail-grid">
                          <div><dt>Từ người sử dụng</dt><dd>{movement.from_user_name || "Chưa phân công"}</dd></div>
                          <div><dt>Đến người sử dụng</dt><dd>{movement.to_user_name || "Chưa phân công"}</dd></div>
                          <div><dt>Từ vị trí</dt><dd>{movement.from_location || "Chưa có vị trí"}</dd></div>
                          <div><dt>Đến vị trí</dt><dd>{movement.to_location || "Chưa có vị trí"}</dd></div>
                          <div><dt>Người duyệt</dt><dd>{movement.approved_by_name || "—"}</dd></div>
                          <div><dt>Ngày luân chuyển</dt><dd>{formatDate(movement.movement_date)}</dd></div>
                          <div className="record-detail-wide"><dt>Lý do</dt><dd>{movement.reason || "—"}</dd></div>
                          <div className="record-detail-wide"><dt>Ghi chú</dt><dd>{movement.note || "—"}</dd></div>
                        </dl>
                      </ModalTrigger>
                    </td>
                  </InteractiveTableRow>
                );
              })}
              {!movements?.length ? (
                <tr>
                  <td className="empty-cell" colSpan={5}>
                    Chưa có lịch sử luân chuyển.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
