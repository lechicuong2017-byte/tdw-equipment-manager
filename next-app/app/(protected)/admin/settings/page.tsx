import Link from "next/link";
import { redirect } from "next/navigation";
import { DepartmentEditor } from "@/components/department-editor";
import { PageHeader } from "@/components/page-header";
import { SettingEditor } from "@/components/setting-editor";
import { requireAccess } from "@/lib/auth";
import { settingTypeDefinitions, settingTypes } from "@/lib/settings";
import type { Department, Setting } from "@/lib/types";
import { moveSetting, toggleSetting } from "./actions";

export const metadata = { title: "Cấu hình" };

type SettingsPageProps = {
  searchParams: Promise<{ setting?: string; department?: string }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const { supabase, access } = await requireAccess();
  if (!access.roles.includes("admin")) redirect("/dashboard");

  const params = await searchParams;
  const [{ data: settings }, { data: departments }] = await Promise.all([
    supabase
      .from("settings")
      .select("id,setting_type,setting_value,display_name,sort_order,active")
      .in("setting_type", settingTypes)
      .order("setting_type")
      .order("active", { ascending: false })
      .order("sort_order")
      .order("display_name"),
    supabase
      .from("departments")
      .select("id,name,manager_name,location,note")
      .order("name"),
  ]);

  const settingRows = (settings ?? []) as Setting[];
  const departmentRows = (departments ?? []) as Department[];
  const editingSetting = settingRows.find((item) => item.id === params.setting);
  const editingDepartment = departmentRows.find((item) => item.id === params.department);

  return (
    <>
      <PageHeader
        eyebrow="HỆ THỐNG"
        title="Cấu hình danh mục"
        description="Quản lý tập trung các lựa chọn dùng trong thiết bị, bảo trì, phần mềm và phân quyền theo phòng ban."
        actions={
          <>
            <Link className="secondary-button" href="/admin/audit">Nhật ký</Link>
            <Link className="secondary-button" href="/admin/health">Kiểm tra hệ thống</Link>
          </>
        }
      />

      <section className="settings-workspace">
        <SettingEditor key={editingSetting?.id ?? "new-setting"} setting={editingSetting} />
        <DepartmentEditor key={editingDepartment?.id ?? "new-department"} department={editingDepartment} />
      </section>

      <section className="settings-catalog-grid">
        {settingTypes.map((type) => {
          const rows = settingRows.filter((item) => item.setting_type === type);
          const activeRows = rows.filter((item) => item.active);
          return (
            <article className="panel setting-group-card" key={type}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">DANH MỤC</p>
                  <h2>{settingTypeDefinitions[type].label}</h2>
                  <small>{settingTypeDefinitions[type].description}</small>
                </div>
                <span className="status-pill">{activeRows.length} đang dùng</span>
              </div>
              <div className="setting-list">
                {rows.map((setting, index) => {
                  const activeIndex = activeRows.findIndex((item) => item.id === setting.id);
                  return (
                    <div className={`setting-item ${setting.active ? "" : "setting-item-inactive"}`} key={setting.id}>
                      <div className="setting-item-copy">
                        <strong>{setting.display_name}</strong>
                        <small>{setting.setting_value}</small>
                      </div>
                      <div className="row-actions">
                        {setting.active ? (
                          <>
                            <form action={moveSetting}>
                              <input name="id" type="hidden" value={setting.id} />
                              <input name="direction" type="hidden" value="up" />
                              <button
                                aria-label={`Đưa ${setting.display_name} lên`}
                                className="order-button"
                                disabled={activeIndex === 0}
                                type="submit"
                              >↑</button>
                            </form>
                            <form action={moveSetting}>
                              <input name="id" type="hidden" value={setting.id} />
                              <input name="direction" type="hidden" value="down" />
                              <button
                                aria-label={`Đưa ${setting.display_name} xuống`}
                                className="order-button"
                                disabled={activeIndex === activeRows.length - 1}
                                type="submit"
                              >↓</button>
                            </form>
                          </>
                        ) : null}
                        <Link className="text-button" href={`/admin/settings?setting=${setting.id}`}>Sửa</Link>
                        <form action={toggleSetting}>
                          <input name="id" type="hidden" value={setting.id} />
                          <input name="active" type="hidden" value={String(!setting.active)} />
                          <button className={`text-button ${setting.active ? "text-danger" : ""}`} type="submit">
                            {setting.active ? "Ngừng dùng" : "Bật lại"}
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })}
                {!rows.length ? <p className="empty-setting">Chưa có cấu hình.</p> : null}
              </div>
            </article>
          );
        })}
      </section>

      <section className="panel module-table">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">PHÒNG BAN</p>
            <h2>Đơn vị sử dụng thiết bị</h2>
          </div>
          <small>{departmentRows.length} phòng ban</small>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tên phòng ban</th>
                <th>Người phụ trách</th>
                <th>Vị trí</th>
                <th>Ghi chú</th>
                <th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {departmentRows.map((department) => (
                <tr key={department.id}>
                  <td><strong>{department.name}</strong></td>
                  <td>{department.manager_name || "—"}</td>
                  <td>{department.location || "—"}</td>
                  <td className="table-secondary">{department.note || "—"}</td>
                  <td><Link className="text-button" href={`/admin/settings?department=${department.id}`}>Sửa</Link></td>
                </tr>
              ))}
              {!departmentRows.length ? (
                <tr><td className="empty-cell" colSpan={5}>Chưa có phòng ban.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
