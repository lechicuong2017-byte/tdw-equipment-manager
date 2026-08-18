import Link from "next/link";
import { ConfirmAction } from "@/components/app-modal";
import { MaintenanceForms } from "@/components/maintenance-forms";
import { MaintenanceLogEditor } from "@/components/maintenance-log-editor";
import { MaintenanceMediaUpload } from "@/components/maintenance-media-upload";
import { MaintenancePlanEditor } from "@/components/maintenance-plan-editor";
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
  const [{ data: assets }, { data: plans }, { data: logs }, { data: settings }] = await Promise.all([
    supabase
      .from("assets")
      .select("id, asset_code, asset_name, asset_group, asset_group_label, asset_type, department_legacy_name, departments(name)")
      .is("deleted_at", null)
      .order("asset_code")
      .limit(500),
    supabase
      .from("maintenance_plans")
      .select("id, batch_id, scope_type, scope_value, asset_id, title, frequency, next_due_date, note, active, repeat_enabled, assets(id, asset_code, asset_name)")
      .order("active", { ascending: false })
      .order("next_due_date")
      .limit(500),
    supabase
      .from("maintenance_logs")
      .select("id, asset_id, plan_id, maintenance_date, action_type, description, cost, vendor, warranty_months, performed_by, note, assets(id, asset_code, asset_name)")
      .order("maintenance_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("settings")
      .select("setting_type,setting_value,display_name")
      .in("setting_type", ["asset_group", "asset_type", "maintenance_type"])
      .eq("active", true)
      .order("setting_type")
      .order("sort_order"),
  ]);

  const logIds = (logs ?? []).map((log) => log.id);
  const { data: maintenanceMedia } = logIds.length
    ? await supabase
        .from("media_files")
        .select("id,owner_id,object_path,thumbnail_path,file_name")
        .eq("owner_type", "MAINTENANCE")
        .in("owner_id", logIds)
        .order("sort_order")
        .order("created_at")
    : {
        data: [] as {
          file_name: string;
          id: string;
          object_path: string;
          owner_id: string;
          thumbnail_path: string | null;
        }[],
      };

  const maintenanceMediaPaths = (maintenanceMedia ?? []).map(
    (item) => item.thumbnail_path || item.object_path,
  );
  const { data: maintenanceMediaUrls } = maintenanceMediaPaths.length
    ? await supabase.storage
        .from("asset-media")
        .createSignedUrls(maintenanceMediaPaths, 300)
    : { data: [] };
  const maintenanceMediaUrlByPath = new Map(
    (maintenanceMediaUrls ?? []).map((item) => [item.path, item.signedUrl]),
  );

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  const canManage = can(access, "maintenance.manage");
  const canDelete = can(access, "maintenance.delete");
  const assetOptions = assets ?? [];
  const settingRows = settings ?? [];
  const assetGroups = settingRows
    .filter((item) => item.setting_type === "asset_group")
    .map((item) => ({ value: item.setting_value, label: item.display_name }));
  const assetTypes = settingRows
    .filter((item) => item.setting_type === "asset_type")
    .map((item) => ({ value: item.setting_value, label: item.display_name }));
  const maintenanceTypes = settingRows
    .filter((item) => item.setting_type === "maintenance_type");
  const assetOptionById = new Map(assetOptions.map((asset) => [asset.id, asset]));
  const planOptions = (plans ?? [])
    .filter((plan) => plan.active)
    .map((plan) => {
      const asset = assetOptionById.get(plan.asset_id);
      return {
        id: plan.id,
        batch_id: plan.batch_id,
        asset_id: plan.asset_id,
        asset_group: asset?.asset_group ?? "",
        asset_group_label: asset?.asset_group_label ?? "",
        title: plan.title,
        frequency: plan.frequency,
        scope_type: plan.scope_type,
        scope_value: plan.scope_value,
        next_due_date: plan.next_due_date,
      };
    });
  const editPlanOptions = (plans ?? []).map((plan) => ({
    id: plan.id,
    asset_id: plan.asset_id,
    title: plan.title,
  }));
  const maintenanceTypeLabels = new Map(
    maintenanceTypes.map((item) => [item.setting_value, item.display_name]),
  );
  const groupLabels = new Map(assetGroups.map((item) => [item.value, item.label]));
  const typeLabels = new Map(assetTypes.map((item) => [item.value, item.label]));
  const batchSizes = new Map<string, number>();
  (plans ?? []).forEach((plan) => {
    batchSizes.set(plan.batch_id, (batchSizes.get(plan.batch_id) ?? 0) + 1);
  });
  const maintenanceMediaByLog = new Map<
    string,
    { file_name: string; id: string; signed_url: string | null }[]
  >();
  (maintenanceMedia ?? []).forEach((item) => {
    const current = maintenanceMediaByLog.get(item.owner_id) ?? [];
    const path = item.thumbnail_path || item.object_path;
    current.push({
      file_name: item.file_name,
      id: item.id,
      signed_url: maintenanceMediaUrlByPath.get(path) ?? null,
    });
    maintenanceMediaByLog.set(item.owner_id, current);
  });

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
        <MaintenanceForms
          actionTypes={(maintenanceTypes ?? []).map((item) => ({
            value: item.setting_value,
            label: item.display_name,
          }))}
          assetGroups={assetGroups}
          assets={assetOptions}
          assetTypes={assetTypes}
          plans={planOptions}
          today={today}
        />
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
                  <th>Chu kỳ / phạm vi</th>
                  <th>Hạn tiếp theo</th>
                  <th>Trạng thái</th>
                  {(canManage || canDelete) ? <th aria-label="Thao tác" /> : null}
                </tr>
              </thead>
              <tbody>
                {(plans ?? []).map((plan) => {
                  const asset = getRelatedAsset(plan.assets);
                  const isOverdue = plan.active && plan.next_due_date < today;
                  const batchSize = batchSizes.get(plan.batch_id) ?? 1;
                  const scopeLabel = plan.scope_type === "GROUP"
                    ? `Nhóm: ${groupLabels.get(plan.scope_value) ?? plan.scope_value}`
                    : plan.scope_type === "TYPE"
                      ? `Loại: ${typeLabels.get(plan.scope_value) ?? plan.scope_value}`
                      : "Một thiết bị";
                  return (
                    <tr key={plan.id}>
                      <td>
                        <Link className="asset-name" href={`/assets/${plan.asset_id}`}>
                          <strong>{plan.title}</strong>
                          <small>{asset?.asset_code} · {asset?.asset_name}</small>
                          <small>{scopeLabel}{batchSize > 1 ? ` · ${batchSize} thiết bị` : ""}</small>
                        </Link>
                      </td>
                      <td>
                        {frequencyLabels[plan.frequency] ?? plan.frequency}
                        <small className="table-note">
                          {plan.repeat_enabled ? "Lặp lại" : "Một lần"}
                        </small>
                      </td>
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
                              <MaintenancePlanEditor
                                batchSize={batchSize}
                                plan={{
                                  id: plan.id,
                                  title: plan.title,
                                  frequency: plan.frequency,
                                  next_due_date: plan.next_due_date,
                                  note: plan.note,
                                  active: plan.active,
                                  repeat_enabled: plan.repeat_enabled,
                                }}
                                scopeLabel={scopeLabel}
                              />
                            ) : null}
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
                              <ConfirmAction
                                action={deleteMaintenanceRecord}
                                description={`Kế hoạch “${plan.title}” sẽ bị xóa. Các nhật ký đã ghi vẫn được giữ lại nhưng không còn gắn với kế hoạch này.`}
                                fields={{ id: plan.id, kind: "plan" }}
                                title="Xóa kế hoạch bảo trì?"
                              />
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
                  <th>Hình ảnh</th>
                  {(canManage || canDelete) ? <th aria-label="Thao tác" /> : null}
                </tr>
              </thead>
              <tbody>
                {(logs ?? []).map((log) => {
                  const asset = getRelatedAsset(log.assets);
                  return (
                    <tr key={log.id}>
                      <td>
                        <Link className="asset-name" href={`/maintenance/${log.id}`}>
                          <strong>{formatDate(log.maintenance_date)}</strong>
                          <small>{asset?.asset_code} · {asset?.asset_name}</small>
                        </Link>
                      </td>
                      <td>
                        <strong className="table-secondary">
                          {maintenanceTypeLabels.get(log.action_type) ?? (log.action_type || "Bảo trì")}
                        </strong>
                        <small className="table-note">{log.description}</small>
                      </td>
                      <td>{log.performed_by || log.vendor || "—"}</td>
                      <td className="align-right">{formatMoney(log.cost)}</td>
                      <td>
                        <div className="maintenance-media-cell">
                          <span className="table-note">
                            {maintenanceMediaByLog.get(log.id)?.length ?? 0} ảnh bảo trì
                          </span>
                          {canManage ? (
                            <MaintenanceMediaUpload
                              maintenanceLogId={log.id}
                              media={maintenanceMediaByLog.get(log.id) ?? []}
                            />
                          ) : null}
                        </div>
                      </td>
                      {(canManage || canDelete) ? (
                        <td>
                          <div className="row-actions">
                            {canManage ? (
                              <MaintenanceLogEditor
                                actionTypes={maintenanceTypes.map((item) => ({
                                  value: item.setting_value,
                                  label: item.display_name,
                                }))}
                                assetLabel={`${asset?.asset_code ?? ""} · ${asset?.asset_name ?? "Thiết bị"}`}
                                log={{
                                  id: log.id,
                                  asset_id: log.asset_id,
                                  plan_id: log.plan_id,
                                  maintenance_date: log.maintenance_date,
                                  action_type: log.action_type,
                                  description: log.description,
                                  cost: log.cost,
                                  vendor: log.vendor,
                                  warranty_months: log.warranty_months,
                                  performed_by: log.performed_by,
                                  note: log.note,
                                }}
                                plans={editPlanOptions}
                              />
                            ) : null}
                            {canDelete ? (
                              <ConfirmAction
                                action={deleteMaintenanceRecord}
                                description={`Nhật ký bảo trì ngày ${formatDate(log.maintenance_date)} sẽ bị xóa khỏi lịch sử thiết bị.`}
                                fields={{ id: log.id, kind: "log" }}
                                title="Xóa nhật ký bảo trì?"
                              />
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
                {!logs?.length ? (
                  <tr>
                    <td className="empty-cell" colSpan={canManage || canDelete ? 6 : 5}>
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
