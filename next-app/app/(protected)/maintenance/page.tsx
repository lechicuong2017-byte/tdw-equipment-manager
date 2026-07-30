import Link from "next/link";
import { MaintenanceForms } from "@/components/maintenance-forms";
import { MaintenanceReminderButton } from "@/components/maintenance-reminder-button";
import { PageHeader } from "@/components/page-header";
import { can, requireAccess } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import {
  deleteMaintenanceRecord,
  toggleMaintenancePlan,
} from "./actions";

export const metadata = { title: "Bảo trì" };

const frequencyLabels: Record<string, string> = {
  MONTHLY: "Hàng tháng",
  QUARTERLY: "Hàng quý",
  YEARLY: "Hàng năm",
};

type RelatedAsset =
  | { id?: string; asset_code?: string; asset_name?: string }
  | { id?: string; asset_code?: string; asset_name?: string }[]
  | null;

function getRelatedAsset(value: RelatedAsset) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MaintenancePage() {
  const { supabase, access } = await requireAccess();
  const [{ data: assets }, { data: plans }, { data: logs }] = await Promise.all([
    supabase
      .from("assets")
      .select("id, asset_code, asset_name")
      .is("deleted_at", null)
      .order("asset_code")
      .limit(500),
    supabase
      .from("maintenance_plans")
      .select("id, asset_id, title, frequency, next_due_date, note, active, assets(id, asset_code, asset_name)")
      .order("active", { ascending: false })
      .order("next_due_date")
      .limit(100),
    supabase
      .from("maintenance_logs")
      .select("id, asset_id, maintenance_date, action_type, description, cost, vendor, performed_by, assets(id, asset_code, asset_name)")
      .order("maintenance_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  const canManage = can(access, "maintenance.manage");
  const canDelete = can(access, "maintenance.delete");
  const assetOptions = assets ?? [];
  const planOptions = (plans ?? [])
    .filter((plan) => plan.active)
    .map((plan) => ({
      id: plan.id,
      asset_id: plan.asset_id,
      title: `${getRelatedAsset(plan.assets)?.asset_code ?? ""} — ${plan.title}`,
    }));

  return (
    <>
      <PageHeader
        eyebrow="BẢO TRÌ"
        title="Bảo trì thiết bị"
        description="Kế hoạch và lịch sử được đọc trực tiếp từ PostgreSQL, giới hạn theo quyền từng thiết bị."
        actions={
          access.roles.includes("admin") ? <MaintenanceReminderButton /> : null
        }
      />

      {canManage ? (
        <MaintenanceForms assets={assetOptions} plans={planOptions} today={today} />
      ) : null}

      <section className="module-list-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SẮP ĐẾN HẠN</p>
              <h2>Kế hoạch bảo trì</h2>
            </div>
            <small>{plans?.length ?? 0} kế hoạch</small>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thiết bị / kế hoạch</th>
                  <th>Chu kỳ</th>
                  <th>Hạn tiếp theo</th>
                  <th>Trạng thái</th>
                  {(canManage || canDelete) ? <th aria-label="Thao tác" /> : null}
                </tr>
              </thead>
              <tbody>
                {(plans ?? []).map((plan) => {
                  const asset = getRelatedAsset(plan.assets);
                  const isOverdue = plan.active && plan.next_due_date < today;
                  return (
                    <tr key={plan.id}>
                      <td>
                        <Link className="asset-name" href={`/assets/${plan.asset_id}`}>
                          <strong>{plan.title}</strong>
                          <small>{asset?.asset_code} · {asset?.asset_name}</small>
                        </Link>
                      </td>
                      <td>{frequencyLabels[plan.frequency] ?? plan.frequency}</td>
                      <td className={isOverdue ? "text-danger" : ""}>{formatDate(plan.next_due_date)}</td>
                      <td>
                        <span className={`status-pill ${plan.active ? "" : "status-muted"}`}>
                          {plan.active ? (isOverdue ? "Quá hạn" : "Đang theo dõi") : "Tạm dừng"}
                        </span>
                      </td>
                      {(canManage || canDelete) ? (
                        <td>
                          <div className="row-actions">
                            {canManage ? (
                              <form action={toggleMaintenancePlan}>
                                <input name="id" type="hidden" value={plan.id} />
                                <input name="active" type="hidden" value={String(!plan.active)} />
                                <button className="text-button" type="submit">
                                  {plan.active ? "Tạm dừng" : "Bật lại"}
                                </button>
                              </form>
                            ) : null}
                            {canDelete ? (
                              <form action={deleteMaintenanceRecord}>
                                <input name="id" type="hidden" value={plan.id} />
                                <input name="kind" type="hidden" value="plan" />
                                <button className="text-button text-danger" type="submit">Xóa</button>
                              </form>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
                {!plans?.length ? (
                  <tr>
                    <td className="empty-cell" colSpan={canManage || canDelete ? 5 : 4}>
                      Chưa có kế hoạch bảo trì.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">LỊCH SỬ</p>
              <h2>Nhật ký gần đây</h2>
            </div>
            <small>{logs?.length ?? 0} bản ghi</small>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ngày / thiết bị</th>
                  <th>Nội dung</th>
                  <th>Thực hiện</th>
                  <th className="align-right">Chi phí</th>
                  {canDelete ? <th aria-label="Thao tác" /> : null}
                </tr>
              </thead>
              <tbody>
                {(logs ?? []).map((log) => {
                  const asset = getRelatedAsset(log.assets);
                  return (
                    <tr key={log.id}>
                      <td>
                        <Link className="asset-name" href={`/assets/${log.asset_id}`}>
                          <strong>{formatDate(log.maintenance_date)}</strong>
                          <small>{asset?.asset_code} · {asset?.asset_name}</small>
                        </Link>
                      </td>
                      <td>
                        <strong className="table-secondary">{log.action_type || "Bảo trì"}</strong>
                        <small className="table-note">{log.description}</small>
                      </td>
                      <td>{log.performed_by || log.vendor || "—"}</td>
                      <td className="align-right">{formatMoney(log.cost)}</td>
                      {canDelete ? (
                        <td>
                          <form action={deleteMaintenanceRecord}>
                            <input name="id" type="hidden" value={log.id} />
                            <input name="kind" type="hidden" value="log" />
                            <button className="text-button text-danger" type="submit">Xóa</button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
                {!logs?.length ? (
                  <tr>
                    <td className="empty-cell" colSpan={canDelete ? 5 : 4}>
                      Chưa có nhật ký bảo trì.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </>
  );
}
