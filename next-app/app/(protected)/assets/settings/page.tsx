import Link from "next/link";
import { redirect } from "next/navigation";
import { AppIcon, type AppIconName } from "@/components/app-icon";
import { ConfirmAction, ModalPage, ModalTrigger } from "@/components/app-modal";
import { DepartmentEditor } from "@/components/department-editor";
import { PageHeader } from "@/components/page-header";
import { SettingEditor } from "@/components/setting-editor";
import { requireAccess } from "@/lib/auth";
import { settingTypeDefinitions, type SettingType } from "@/lib/settings";
import type { Department, Setting } from "@/lib/types";
import { deleteDepartment, moveSetting } from "@/app/(protected)/admin/settings/actions";
import { adoptOrphanValue, toggleEquipmentSetting } from "./actions";

export const metadata = { title: "Cấu hình thiết bị" };

type TabKey = SettingType | "asset_kind" | "departments";

type TabDefinition = {
  key: TabKey;
  label: string;
  hint: string;
  icon: AppIconName;
  tone: string;
};

const tabGroups: { title: string; tabs: TabDefinition[] }[] = [
  {
    title: "Danh mục thiết bị",
    tabs: [
      { key: "asset_group", label: "Nhóm thiết bị", hint: "Nhóm lớn để đánh mã và báo cáo", icon: "archive", tone: "blue" },
      { key: "asset_type", label: "Loại thiết bị", hint: "Laptop, Desktop, Camera…", icon: "device", tone: "cyan" },
      { key: "asset_kind", label: "Phân loại", hint: "Thiết bị hoàn chỉnh / linh kiện", icon: "component", tone: "violet" },
      { key: "status", label: "Tình trạng", hint: "Trạng thái sử dụng hiện tại", icon: "health", tone: "green" },
    ],
  },
  {
    title: "Tổ chức",
    tabs: [
      { key: "departments", label: "Phòng ban", hint: "Đơn vị sử dụng thiết bị", icon: "users", tone: "amber" },
    ],
  },
  {
    title: "Nghiệp vụ liên quan",
    tabs: [
      { key: "maintenance_type", label: "Loại bảo trì", hint: "Hình thức khi ghi nhận bảo trì", icon: "maintenance", tone: "rose" },
      { key: "software_name", label: "Tên phần mềm", hint: "Gợi ý khi khai báo bản quyền", icon: "software", tone: "green" },
    ],
  },
];

const allTabs = tabGroups.flatMap((group) => group.tabs);
const equipmentSettingTypes: SettingType[] = ["asset_group", "asset_type", "status", "maintenance_type", "software_name"];

const assetKinds = [
  {
    value: "DEVICE",
    label: "Thiết bị hoàn chỉnh",
    description: "Máy hoặc thiết bị dùng độc lập: laptop, máy in, camera… Có mã tài sản riêng (tiền tố theo nhóm thiết bị).",
    icon: "device" as const,
  },
  {
    value: "COMPONENT",
    label: "Linh kiện bên trong",
    description: "Bộ phận gắn vào một thiết bị cha: RAM, ổ cứng, card… Được theo dõi theo thiết bị chứa nó, mã mặc định tiền tố CMP.",
    icon: "component" as const,
  },
];

type PageProps = {
  searchParams: Promise<{ tab?: string; q?: string; edit?: string; department?: string }>;
};

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
}

function tally(values: (string | null | undefined)[]) {
  const map = new Map<string, number>();
  for (const value of values) {
    const key = value ?? "";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export default async function EquipmentSettingsPage({ searchParams }: PageProps) {
  const { supabase, access } = await requireAccess();
  if (!access.roles.includes("admin")) redirect("/assets");

  const params = await searchParams;
  const tab: TabKey = allTabs.some((item) => item.key === params.tab)
    ? (params.tab as TabKey)
    : "asset_group";
  const search = String(params.q ?? "").slice(0, 80);
  const needle = normalize(search);

  const [settingsResult, departmentsResult, assetsResult, maintenanceResult, softwareResult, scopesResult] = await Promise.all([
    supabase
      .from("settings")
      .select("id,setting_type,setting_value,display_name,sort_order,active")
      .in("setting_type", equipmentSettingTypes)
      .order("active", { ascending: false })
      .order("sort_order")
      .order("display_name"),
    supabase.from("departments").select("id,name,manager_name,location,note").order("name"),
    supabase
      .from("assets")
      .select("asset_group,asset_type,status,asset_kind,department_id")
      .is("deleted_at", null),
    supabase.from("maintenance_logs").select("action_type"),
    supabase.from("software_licenses").select("software_name"),
    supabase.from("data_access_scopes").select("department_id"),
  ]);

  const settings = (settingsResult.data ?? []) as Setting[];
  const departments = (departmentsResult.data ?? []) as Department[];
  const assets = (assetsResult.data ?? []) as {
    asset_group: string;
    asset_type: string;
    status: string;
    asset_kind: string;
    department_id: string | null;
  }[];

  const usage: Record<string, Map<string, number>> = {
    asset_group: tally(assets.map((item) => item.asset_group)),
    asset_type: tally(assets.map((item) => item.asset_type)),
    status: tally(assets.map((item) => item.status)),
    asset_kind: tally(assets.map((item) => item.asset_kind)),
    departments: tally(assets.map((item) => item.department_id)),
    maintenance_type: tally(((maintenanceResult.data ?? []) as { action_type: string }[]).map((item) => item.action_type)),
    software_name: tally(((softwareResult.data ?? []) as { software_name: string }[]).map((item) => item.software_name)),
  };
  const scopeUsage = tally(((scopesResult.data ?? []) as { department_id: string | null }[]).map((item) => item.department_id));

  const usageOf = (setting: Setting) => usage[setting.setting_type]?.get(
    setting.setting_type === "software_name" ? setting.display_name : setting.setting_value,
  ) ?? 0;

  const countFor = (key: TabKey) => {
    if (key === "departments") return departments.length;
    if (key === "asset_kind") return assetKinds.length;
    return settings.filter((item) => item.setting_type === key && item.active).length;
  };

  const current = allTabs.find((item) => item.key === tab) ?? allTabs[0];
  const baseHref = (extra: Record<string, string> = {}) => {
    const query = new URLSearchParams({ tab, ...(search ? { q: search } : {}), ...extra });
    return `/assets/settings?${query.toString()}`;
  };

  const editingSetting = params.edit ? settings.find((item) => item.id === params.edit) : undefined;
  const editingDepartment = params.department ? departments.find((item) => item.id === params.department) : undefined;

  const isSettingTab = tab !== "departments" && tab !== "asset_kind";
  const settingRows = isSettingTab
    ? settings.filter((item) => item.setting_type === tab)
    : [];
  const visibleSettingRows = needle
    ? settingRows.filter((item) => normalize(`${item.display_name} ${item.setting_value}`).includes(needle))
    : settingRows;
  const activeRows = settingRows.filter((item) => item.active);
  const visibleDepartments = needle
    ? departments.filter((item) => normalize(`${item.name} ${item.manager_name} ${item.location} ${item.note}`).includes(needle))
    : departments;

  // Values stored on assets that no catalog entry describes (legacy imports, blanks).
  const orphanValues = (tab === "asset_group" || tab === "asset_type" || tab === "status")
    ? [...(usage[tab]?.entries() ?? [])]
        .filter(([value]) => !settingRows.some((item) => item.setting_value === value))
        .sort((a, b) => b[1] - a[1])
    : [];

  const assetLink = (setting: Setting) => {
    if (setting.setting_type === "asset_type") return `/assets?category=${encodeURIComponent(setting.setting_value)}`;
    if (setting.setting_type === "status") {
      return setting.setting_value === "DA_THANH_LY"
        ? "/assets?scope=liquidated"
        : `/assets?status=${encodeURIComponent(setting.setting_value)}`;
    }
    return null;
  };

  const usageNoun = tab === "maintenance_type" ? "lần bảo trì" : tab === "software_name" ? "bản quyền" : "thiết bị";
  const totalAssets = assets.length;

  return (
    <div className="eqcfg-page">
      <PageHeader
        eyebrow="THIẾT BỊ"
        title="Cấu hình thiết bị"
        description="Quản lý các danh mục dùng khi khai báo, lọc và báo cáo thiết bị. Thay đổi ở đây áp dụng ngay cho toàn bộ phân hệ."
        actions={
          <>
            <Link className="secondary-button" href="/assets">← Danh sách thiết bị</Link>
            <Link className="secondary-button" href="/admin/audit">Nhật ký thay đổi</Link>
          </>
        }
      />

      {editingSetting ? (
        <ModalPage
          closeHref={baseHref()}
          description="Đổi tên sẽ cập nhật mã nội bộ và mọi dữ liệu đang dùng mục này trong cùng một lần lưu."
          eyebrow={settingTypeDefinitions[editingSetting.setting_type as SettingType]?.label.toUpperCase() ?? "DANH MỤC"}
          size="medium"
          title={editingSetting.display_name}
        >
          <SettingEditor key={editingSetting.id} lockType setting={editingSetting} />
        </ModalPage>
      ) : null}
      {!editingSetting && editingDepartment ? (
        <ModalPage
          closeHref={baseHref()}
          description="Cập nhật tên, người phụ trách, vị trí và ghi chú của phòng ban."
          eyebrow="PHÒNG BAN"
          size="medium"
          title={editingDepartment.name}
        >
          <DepartmentEditor key={editingDepartment.id} department={editingDepartment} />
        </ModalPage>
      ) : null}

      <div className="eqcfg-layout">
        <nav aria-label="Danh mục cấu hình" className="eqcfg-nav panel">
          {tabGroups.map((group) => (
            <div className="eqcfg-nav-group" key={group.title}>
              <p className="eqcfg-nav-title">{group.title}</p>
              {group.tabs.map((item) => (
                <Link
                  aria-current={item.key === tab ? "page" : undefined}
                  className={`eqcfg-nav-link tone-${item.tone} ${item.key === tab ? "is-active" : ""}`}
                  href={`/assets/settings?tab=${item.key}`}
                  key={item.key}
                >
                  <span className="eqcfg-nav-icon"><AppIcon name={item.icon} size={18} /></span>
                  <span className="eqcfg-nav-copy">
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </span>
                  <span className="eqcfg-nav-count">{countFor(item.key)}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <section className="eqcfg-main panel">
          <header className={`eqcfg-head tone-${current.tone}`}>
            <span className="eqcfg-head-icon"><AppIcon name={current.icon} size={24} /></span>
            <div className="eqcfg-head-copy">
              <h2>{current.label}</h2>
              <p>
                {tab === "departments"
                  ? "Đơn vị sử dụng thiết bị và phạm vi dữ liệu của người dùng."
                  : tab === "asset_kind"
                    ? "Cách hệ thống phân biệt thiết bị độc lập với linh kiện lắp bên trong."
                    : settingTypeDefinitions[tab].description}
              </p>
            </div>
            <div className="eqcfg-head-stats">
              {isSettingTab ? (
                <>
                  <span><strong>{activeRows.length}</strong> đang dùng</span>
                  <span><strong>{settingRows.length - activeRows.length}</strong> đã ngừng</span>
                </>
              ) : tab === "departments" ? (
                <>
                  <span><strong>{departments.length}</strong> phòng ban</span>
                  <span><strong>{usage.departments.get("") ?? 0}</strong> thiết bị chưa gán</span>
                </>
              ) : (
                <span><strong>{totalAssets}</strong> thiết bị</span>
              )}
            </div>
          </header>

          {tab !== "asset_kind" ? (
            <div className="eqcfg-toolbar">
              <form action="/assets/settings" className="eqcfg-search" role="search">
                <input name="tab" type="hidden" value={tab} />
                <input
                  aria-label={`Tìm trong ${current.label}`}
                  defaultValue={search}
                  name="q"
                  placeholder={`Tìm ${current.label.toLowerCase()}…`}
                  type="search"
                />
                <button className="secondary-button" type="submit">Tìm</button>
                {search ? <Link className="text-button" href={`/assets/settings?tab=${tab}`}>Xóa lọc</Link> : null}
              </form>
              {tab === "departments" ? (
                <ModalTrigger
                  description="Thêm đơn vị sử dụng để phân bổ thiết bị và phạm vi người dùng."
                  eyebrow="PHÒNG BAN"
                  size="medium"
                  title="Thêm phòng ban"
                  triggerLabel="+ Thêm phòng ban"
                >
                  <DepartmentEditor />
                </ModalTrigger>
              ) : (
                <ModalTrigger
                  description="Mã nội bộ được tự sinh từ tên hiển thị."
                  eyebrow={current.label.toUpperCase()}
                  size="medium"
                  title={`Thêm ${current.label.toLowerCase()}`}
                  triggerLabel={`+ Thêm ${current.label.toLowerCase()}`}
                >
                  <SettingEditor defaultType={tab} key={tab} lockType />
                </ModalTrigger>
              )}
            </div>
          ) : null}

          {isSettingTab ? (
            <>
              <div className="eqcfg-list" role="table" aria-label={current.label}>
                <div className="eqcfg-row eqcfg-row-head" role="row">
                  <span role="columnheader">Thứ tự</span>
                  <span role="columnheader">Tên hiển thị</span>
                  <span role="columnheader">Đang dùng</span>
                  <span role="columnheader">Trạng thái</span>
                  <span role="columnheader" className="eqcfg-col-actions">Thao tác</span>
                </div>
                {visibleSettingRows.map((setting) => {
                  const activeIndex = activeRows.findIndex((item) => item.id === setting.id);
                  const used = usageOf(setting);
                  const link = assetLink(setting);
                  return (
                    <div className={`eqcfg-row ${setting.active ? "" : "is-inactive"}`} key={setting.id} role="row">
                      <span className="eqcfg-order" role="cell">
                        {setting.active ? (
                          <>
                            <span className="eqcfg-index">{activeIndex + 1}</span>
                            <form action={moveSetting}>
                              <input name="id" type="hidden" value={setting.id} />
                              <input name="direction" type="hidden" value="up" />
                              <button aria-label={`Đưa ${setting.display_name} lên`} className="order-button" disabled={activeIndex === 0} type="submit">↑</button>
                            </form>
                            <form action={moveSetting}>
                              <input name="id" type="hidden" value={setting.id} />
                              <input name="direction" type="hidden" value="down" />
                              <button aria-label={`Đưa ${setting.display_name} xuống`} className="order-button" disabled={activeIndex === activeRows.length - 1} type="submit">↓</button>
                            </form>
                          </>
                        ) : <span className="eqcfg-index">—</span>}
                      </span>
                      <span className="eqcfg-name" role="cell">
                        <strong>{setting.display_name}</strong>
                        {setting.setting_value.normalize("NFC") !== setting.display_name.normalize("NFC") ? (
                          <code>{setting.setting_value}</code>
                        ) : null}
                      </span>
                      <span className="eqcfg-usage" role="cell">
                        {used > 0 && link ? (
                          <Link href={link}><strong>{used}</strong> {usageNoun}</Link>
                        ) : used > 0 ? (
                          <span><strong>{used}</strong> {usageNoun}</span>
                        ) : (
                          <span className="eqcfg-muted">Chưa dùng</span>
                        )}
                        {tab !== "maintenance_type" && tab !== "software_name" && totalAssets > 0 && used > 0 ? (
                          <span className="eqcfg-bar" aria-hidden="true">
                            <span style={{ width: `${Math.max(4, Math.round((used / totalAssets) * 100))}%` }} />
                          </span>
                        ) : null}
                      </span>
                      <span role="cell">
                        <span className={`status-pill ${setting.active ? "status-pill--active" : "status-pill--inactive"}`}>
                          {setting.active ? "Đang dùng" : "Đã ngừng"}
                        </span>
                      </span>
                      <span className="row-actions eqcfg-col-actions" role="cell">
                        <Link className="text-button" href={baseHref({ edit: setting.id })}>Sửa</Link>
                        {setting.active ? (
                          <ConfirmAction
                            action={toggleEquipmentSetting}
                            confirmLabel="Ngừng dùng"
                            description={used > 0
                              ? `“${setting.display_name}” đang được dùng bởi ${used} ${usageNoun}. Dữ liệu cũ giữ nguyên, nhưng mục này sẽ không còn xuất hiện khi chọn mới.`
                              : `“${setting.display_name}” sẽ không còn xuất hiện trong danh sách chọn. Có thể bật lại bất cứ lúc nào.`}
                            fields={{ id: setting.id, active: "false" }}
                            title="Ngừng dùng mục này?"
                            triggerClassName="text-button text-danger"
                            triggerLabel="Ngừng dùng"
                          />
                        ) : (
                          <ConfirmAction
                            action={toggleEquipmentSetting}
                            confirmLabel="Bật lại"
                            description={`“${setting.display_name}” sẽ xuất hiện trở lại trong danh sách chọn, ở cuối thứ tự hiện tại.`}
                            fields={{ id: setting.id, active: "true" }}
                            title="Bật lại mục này?"
                            triggerClassName="text-button"
                            triggerLabel="Bật lại"
                          />
                        )}
                      </span>
                    </div>
                  );
                })}
                {!visibleSettingRows.length ? (
                  <p className="eqcfg-empty">{search ? `Không tìm thấy mục nào khớp “${search}”.` : "Chưa có mục nào. Bấm “+ Thêm” để tạo mục đầu tiên."}</p>
                ) : null}
              </div>

              {orphanValues.length && !search ? (
                <aside className="eqcfg-orphans">
                  <div>
                    <strong>Giá trị chưa có trong danh mục</strong>
                    <p>Một số thiết bị đang lưu giá trị không khớp mục nào ở trên (thường do dữ liệu nhập cũ). Bấm “+ Thêm” để đưa giá trị vào danh mục — sau đó có thể đổi tên, hệ thống sẽ cập nhật luôn các thiết bị đó.</p>
                  </div>
                  <ul>
                    {orphanValues.map(([value, count]) => (
                      <li key={value || "__blank"}>
                        {value && tab === "asset_type" ? (
                          <Link href={`/assets?category=${encodeURIComponent(value)}`}>{value}</Link>
                        ) : (
                          <span>{value || "(để trống)"}</span>
                        )}
                        <em>{count}</em>
                        {value ? (
                          <form action={adoptOrphanValue}>
                            <input name="setting_type" type="hidden" value={tab} />
                            <input name="value" type="hidden" value={value} />
                            <button className="eqcfg-adopt" title="Thêm giá trị này vào danh mục" type="submit">+ Thêm</button>
                          </form>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </aside>
              ) : null}
            </>
          ) : null}

          {tab === "departments" ? (
            <div className="eqcfg-dept-grid">
              {visibleDepartments.map((department) => {
                const assetCount = usage.departments.get(department.id) ?? 0;
                const scopeCount = scopeUsage.get(department.id) ?? 0;
                return (
                  <article className="eqcfg-dept-card" key={department.id}>
                    <div className="eqcfg-dept-top">
                      <span className="eqcfg-dept-avatar">{department.name.trim().charAt(0).toUpperCase()}</span>
                      <div>
                        <strong>{department.name}</strong>
                        <small>{department.manager_name || "Chưa có người phụ trách"}</small>
                      </div>
                    </div>
                    <dl>
                      <div>
                        <dt>Thiết bị</dt>
                        <dd>{assetCount ? <Link href={`/assets?department=${department.id}`}>{assetCount} thiết bị</Link> : "Chưa có"}</dd>
                      </div>
                      {department.location ? <div><dt>Vị trí</dt><dd>{department.location}</dd></div> : null}
                      {scopeCount ? <div><dt>Người dùng</dt><dd>{scopeCount} phạm vi</dd></div> : null}
                    </dl>
                    {department.note ? <p className="eqcfg-dept-note">{department.note}</p> : null}
                    <div className="row-actions">
                      <Link className="text-button" href={baseHref({ department: department.id })}>Sửa</Link>
                      {assetCount || scopeCount ? (
                        <span className="eqcfg-muted" title="Chuyển hết thiết bị và phạm vi người dùng trước khi xóa">Đang sử dụng</span>
                      ) : (
                        <ConfirmAction
                          action={deleteDepartment}
                          description={`Xóa phòng ban “${department.name}”? Phòng ban này hiện không có thiết bị hay phạm vi người dùng nào.`}
                          fields={{ id: department.id }}
                          title="Xóa phòng ban?"
                          triggerClassName="text-button text-danger"
                          triggerLabel="Xóa"
                        />
                      )}
                    </div>
                  </article>
                );
              })}
              {!visibleDepartments.length ? (
                <p className="eqcfg-empty">{search ? `Không tìm thấy phòng ban khớp “${search}”.` : "Chưa có phòng ban."}</p>
              ) : null}
            </div>
          ) : null}

          {tab === "asset_kind" ? (
            <>
              <div className="eqcfg-kind-grid">
                {assetKinds.map((kind) => {
                  const count = usage.asset_kind.get(kind.value) ?? 0;
                  return (
                    <article className="eqcfg-kind-card" key={kind.value}>
                      <span className="eqcfg-head-icon"><AppIcon name={kind.icon} size={24} /></span>
                      <div>
                        <strong>{kind.label}</strong>
                        <code>{kind.value}</code>
                        <p>{kind.description}</p>
                      </div>
                      <Link className="eqcfg-kind-count" href={`/assets?kind=${kind.value}`}>
                        <strong>{count}</strong>
                        <small>thiết bị · xem danh sách →</small>
                      </Link>
                    </article>
                  );
                })}
              </div>
              <p className="eqcfg-note">
                Phân loại gắn với cách hệ thống đánh mã và liên kết linh kiện với thiết bị cha, nên được giữ cố định để không làm sai dữ liệu.
                Muốn chia nhỏ thêm, hãy dùng <Link href="/assets/settings?tab=asset_group">Nhóm thiết bị</Link> hoặc <Link href="/assets/settings?tab=asset_type">Loại thiết bị</Link>.
              </p>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
