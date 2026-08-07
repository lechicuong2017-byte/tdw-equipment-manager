import Link from "next/link";
import {
  installAssetComponent,
  removeAssetComponent,
  replaceAssetComponent,
} from "@/app/(protected)/assets/actions";
import { ModalTrigger } from "@/components/app-modal";
import { formatDate, labelStatus, statusLabels, statusTone } from "@/lib/format";
import type {
  Asset,
  AssetComponentInstallation,
  AssetComponentSummary,
} from "@/lib/types";

const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
});

const componentStatusOptions = Object.entries(statusLabels).filter(
  ([value]) => value !== "MOI_100",
);

const statusMessages: Record<string, string> = {
  error: "Không thể cập nhật linh kiện. Hãy kiểm tra quyền, ngày thực hiện và trạng thái gắn hiện tại.",
};

function ComponentIdentity({ component }: { component: AssetComponentSummary }) {
  return (
    <Link className="component-identity" href={`/assets/${component.id}`}>
      <strong>{component.asset_code}</strong>
      <span>{component.asset_name}</span>
      <small>
        {[component.asset_type, component.brand, component.model]
          .filter(Boolean)
          .join(" · ") || "Chưa có thông tin model"}
      </small>
    </Link>
  );
}

export function AssetComponentManager({
  asset,
  activeComponents,
  availableComponents,
  componentHistory,
  hostComponentHistory,
  canManage,
  status,
}: {
  asset: Asset;
  activeComponents: AssetComponentInstallation[];
  availableComponents: AssetComponentSummary[];
  componentHistory: AssetComponentInstallation[];
  hostComponentHistory: AssetComponentInstallation[];
  canManage: boolean;
  status?: string;
}) {
  if (asset.asset_kind === "COMPONENT") {
    const current = componentHistory.find((item) => !item.removed_at);
    return (
      <section className="panel component-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">LỊCH SỬ LINH KIỆN</p>
            <h2>Thiết bị đang lắp và lịch sử</h2>
          </div>
          <span className="component-kind-badge">Linh kiện</span>
        </div>

        {current?.host ? (
          <div className="component-current-host">
            <span>Đang được lắp trong</span>
            <ComponentIdentity component={current.host} />
            <small>
              Lắp ngày {formatDate(current.installed_at)}
              {current.slot_name ? ` · ${current.slot_name}` : ""}
            </small>
          </div>
        ) : (
          <p className="empty-state">Linh kiện hiện chưa được gắn vào thiết bị nào.</p>
        )}

        <div className="table-wrap component-history-table">
          <table>
            <thead>
              <tr>
                <th>Thiết bị chính</th>
                <th>Ngày lắp</th>
                <th>Ngày tháo</th>
                <th>Vị trí / lý do</th>
              </tr>
            </thead>
            <tbody>
              {componentHistory.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.host ? (
                      <Link href={`/assets/${item.host.id}`}>
                        <strong>{item.host.asset_code}</strong>
                        <small className="table-note">{item.host.asset_name}</small>
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{formatDate(item.installed_at)}</td>
                  <td>{item.removed_at ? formatDate(item.removed_at) : "Đang sử dụng"}</td>
                  <td>
                    <strong className="table-secondary">{item.slot_name || "—"}</strong>
                    <small className="table-note">
                      {item.removal_reason || item.install_note || "Không có ghi chú"}
                    </small>
                  </td>
                </tr>
              ))}
              {!componentHistory.length ? (
                <tr><td className="empty-cell" colSpan={4}>Chưa có lịch sử lắp đặt.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="panel component-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">CẤU HÌNH PHẦN CỨNG</p>
          <h2>Linh kiện đang lắp</h2>
        </div>
        <small>{activeComponents.length} linh kiện</small>
      </div>

      {status && statusMessages[status] ? (
        <p
          className={status === "error" ? "form-error" : "form-success"}
          role="status"
        >
          {statusMessages[status]}
        </p>
      ) : null}

      <div className="component-list">
        {activeComponents.map((installation) => {
          const component = installation.component;
          if (!component) return null;
          return (
            <article className="component-card" key={installation.id}>
              <div className="component-card-main">
                <ComponentIdentity component={component} />
                <div className="component-meta">
                  <span className={`status-pill status-pill--${statusTone(component.status)}`}>{labelStatus(component.status)}</span>
                  <small>
                    Lắp {formatDate(installation.installed_at)}
                    {installation.slot_name ? ` · ${installation.slot_name}` : ""}
                  </small>
                  {component.serial_number ? <small>Serial: {component.serial_number}</small> : null}
                  {component.warranty_end_date ? (
                    <small>Bảo hành đến {formatDate(component.warranty_end_date)}</small>
                  ) : null}
                </div>
              </div>

              {canManage ? (
                <div className="component-card-actions">
                  <ModalTrigger
                    description={`Thay ${component.asset_code} và lưu đầy đủ lịch sử linh kiện cũ/mới.`}
                    eyebrow="LINH KIỆN"
                    size="medium"
                    title="Thay linh kiện"
                    triggerClassName="secondary-button"
                    triggerLabel="Thay linh kiện"
                  >
                    <form action={replaceAssetComponent} className="component-action-form">
                      <input name="host_asset_id" type="hidden" value={asset.id} />
                      <input name="old_component_asset_id" type="hidden" value={component.id} />
                      <input name="installation_id" type="hidden" value={installation.id} />
                      <label>
                        Linh kiện mới
                        <select name="new_component_asset_id" required>
                          <option value="">Chọn linh kiện thay thế</option>
                          {availableComponents.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.asset_code} — {candidate.asset_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Ngày thay
                        <input defaultValue={today} name="changed_at" required type="date" />
                      </label>
                      <label>
                        Vị trí / khe
                        <input defaultValue={installation.slot_name} maxLength={120} name="slot_name" />
                      </label>
                      <label>
                        Trạng thái linh kiện cũ
                        <select defaultValue="LUU_KHO_THANH_LY" name="old_component_status">
                          {componentStatusOptions.map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="span-2">
                        Ghi chú thay thế
                        <input maxLength={1000} name="note" />
                      </label>
                      <button className="primary-button" type="submit">Xác nhận thay</button>
                    </form>
                  </ModalTrigger>

                  <ModalTrigger
                    description={`Tháo ${component.asset_code} khỏi thiết bị và lưu trạng thái sau khi tháo.`}
                    eyebrow="LINH KIỆN"
                    size="medium"
                    title="Tháo linh kiện"
                    triggerClassName="danger-button"
                    triggerLabel="Tháo linh kiện"
                  >
                    <form action={removeAssetComponent} className="component-action-form">
                      <input name="host_asset_id" type="hidden" value={asset.id} />
                      <input name="component_asset_id" type="hidden" value={component.id} />
                      <input name="installation_id" type="hidden" value={installation.id} />
                      <label>
                        Ngày tháo
                        <input defaultValue={today} name="removed_at" required type="date" />
                      </label>
                      <label>
                        Lý do
                        <input maxLength={300} name="removal_reason" required />
                      </label>
                      <label>
                        Trạng thái sau khi tháo
                        <select defaultValue="LUU_KHO_THANH_LY" name="component_status">
                          {componentStatusOptions.map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="span-2">
                        Ghi chú
                        <input maxLength={1000} name="removal_note" />
                      </label>
                      <button className="danger-button" type="submit">Xác nhận tháo</button>
                    </form>
                  </ModalTrigger>
                </div>
              ) : null}
            </article>
          );
        })}
        {!activeComponents.length ? (
          <p className="empty-state">Thiết bị chưa có linh kiện được khai báo.</p>
        ) : null}
      </div>

      {hostComponentHistory.some((item) => item.removed_at) ? (
        <details className="component-host-history">
          <summary>
            Lịch sử thay thế ({hostComponentHistory.filter((item) => item.removed_at).length})
          </summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Linh kiện</th>
                  <th>Ngày lắp</th>
                  <th>Ngày tháo</th>
                  <th>Lý do / ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {hostComponentHistory
                  .filter((item) => item.removed_at)
                  .map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.component ? (
                          <Link href={`/assets/${item.component.id}`}>
                            <strong>{item.component.asset_code}</strong>
                            <small className="table-note">{item.component.asset_name}</small>
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{formatDate(item.installed_at)}</td>
                      <td>{formatDate(item.removed_at)}</td>
                      <td>
                        <strong className="table-secondary">{item.removal_reason || "—"}</strong>
                        <small className="table-note">
                          {item.removal_note || item.install_note || "Không có ghi chú"}
                        </small>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      {canManage ? (
        <div className="component-install-box">
          <div>
            <p className="eyebrow">GẮN LINH KIỆN</p>
            <h3>Thêm vào cấu hình hiện tại</h3>
          </div>
          {availableComponents.length ? (
            <ModalTrigger
              description="Chọn linh kiện đang rời, ngày lắp và vị trí trong thiết bị."
              eyebrow="CẤU HÌNH PHẦN CỨNG"
              size="medium"
              title="Gắn linh kiện"
              triggerLabel="+ Gắn linh kiện"
            >
              <form action={installAssetComponent} className="component-install-form">
                <input name="host_asset_id" type="hidden" value={asset.id} />
                <label className="span-2">
                  Linh kiện
                  <select name="component_asset_id" required>
                    <option value="">Chọn linh kiện đang rời</option>
                    {availableComponents.map((component) => (
                      <option key={component.id} value={component.id}>
                        {component.asset_code} — {component.asset_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ngày lắp
                  <input defaultValue={today} name="installed_at" required type="date" />
                </label>
                <label>
                  Vị trí / khe
                  <input maxLength={120} name="slot_name" placeholder="Ví dụ: RAM slot 1, M.2" />
                </label>
                <label className="span-2">
                  Ghi chú
                  <input maxLength={1000} name="note" />
                </label>
                <button className="primary-button" type="submit">Gắn linh kiện</button>
              </form>
            </ModalTrigger>
          ) : (
            <p className="form-help">
              Chưa có linh kiện rời phù hợp. Hãy <Link href="/assets/new?kind=component">tạo linh kiện mới</Link>,
              chọn phân loại “Linh kiện bên trong” và đặt số lượng bằng 1.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
