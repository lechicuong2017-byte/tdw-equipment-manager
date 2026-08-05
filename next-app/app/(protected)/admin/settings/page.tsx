import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmAction, ModalPage, ModalTrigger } from "@/components/app-modal";
import { DepartmentEditor } from "@/components/department-editor";
import { PageHeader } from "@/components/page-header";
import { SettingEditor } from "@/components/setting-editor";
import { requireAccess } from "@/lib/auth";
import { settingTypeDefinitions, settingTypes } from "@/lib/settings";
import type { Department, Setting } from "@/lib/types";
import { deleteDepartment, moveSetting, toggleSetting } from "./actions";

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
            <ModalTrigger
              description="Thêm lựa chọn dùng chung và tự sinh mã nội bộ từ tên hiển thị."
              eyebrow="DANH MỤC"
              size="medium"
              title="Thêm cấu hình"
              triggerLabel="+ Cấu hình"
            >
              <SettingEditor />
            </ModalTrigger>
            <ModalTrigger
              description="Thêm đơn vị sử dụng để phân bổ thiết bị và phạm vi người dùng."
              eyebrow="PHÒNG BAN"
              size="medium"
              title="Thêm phòng ban"
              triggerClassName="secondary-button"
              triggerLabel="+ Phòng ban"
            >
              <DepartmentEditor />
            </ModalTrigger>
            <Link className="secondary-button" href="/admin/audit">Nhật ký</Link>
            <Link className="secondary-button" href="/admin/health">Kiểm tra hệ thống</Link>
          </>
        }
      />

      {editingSetting ? (
        <ModalPage
          closeHref="/admin/settings"
          description="Đổi tên sẽ cập nhật mã nội bộ và các dữ liệu đang liên kết trong cùng giao dịch."
          eyebrow="SỬA DANH MỤC"
          size="medium"
          title={editingSetting.display_name}
        >
          <SettingEditor key={editingSetting.id} setting={editingSetting} />
        </ModalPage>
      ) : null}
      {!editingSetting && editingDepartment ? (
        <ModalPage
          closeHref="/admin/settings"
          description="Cập nhật tên, người phụ trách, vị trí và ghi chú của phòng ban."
          eyebrow="SỬA PHÒNG BAN"
          size="medium"
          title={editingDepartment.name}
        >
          <DepartmentEditor key={editingDepartment.id} department={editingDepartment} />
        </ModalPage>
      ) : null}

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
                  <td>
                    <div className="row-actions">
                      <Link className="text-button" href={`/admin/settings?department=${department.id}`}>Sửa</Link>
                      <ConfirmAction
                        action={deleteDepartment}
                        description={`Phòng ban “${department.name}” chỉ được xóa khi chưa có thiết bị hoặc phạm vi người dùng liên kết.`}
                        fields={{ id: department.id }}
                        title="Xóa phòng ban?"
                        triggerClassName="text-button text-danger"
                        triggerLabel="Xóa"
                      />
                    </div>
                  </td>
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
