import { redirect } from "next/navigation";
import { ModalTrigger } from "@/components/app-modal";
import { PageHeader } from "@/components/page-header";
import { requireAccess } from "@/lib/auth";
import { systemModuleDefinitions } from "@/lib/system-modules";
import {
  inviteUser,
  sendPasswordRecovery,
  updateUserAccess,
} from "./actions";

export const metadata = { title: "Người dùng" };

type UsersPageProps = {
  searchParams: Promise<{ ok?: string; error?: string }>;
};

const scopeModules = [
  ["assets", "Thiết bị"],
  ["maintenance", "Bảo trì"],
  ["movement", "Luân chuyển"],
  ["software", "Phần mềm"],
  ["vehicles", "Quản lý xe"],
  ["supplies", "Văn phòng phẩm / Dụng cụ vệ sinh"],
] as const;

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const { supabase, access } = await requireAccess();
  if (!access.roles.includes("admin")) redirect("/dashboard");

  const params = await searchParams;
  const [
    profilesResult,
    rolesResult,
    userRolesResult,
    scopesResult,
    moduleAccessResult,
    departmentsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,email,full_name,active,must_enroll_mfa,created_at")
      .order("created_at"),
    supabase.from("roles").select("id,code,name").order("name"),
    supabase.from("user_roles").select("user_id,role_id"),
    supabase
      .from("data_access_scopes")
      .select("user_id,module,scope_type,department_id"),
    supabase
      .from("user_module_access")
      .select("user_id,module"),
    supabase.from("departments").select("id,name").order("name"),
  ]);

  const queryError = [
    profilesResult.error,
    rolesResult.error,
    userRolesResult.error,
    scopesResult.error,
    moduleAccessResult.error,
    departmentsResult.error,
  ].find(Boolean);
  const profiles = profilesResult.data;
  const roles = rolesResult.data;
  const userRoles = userRolesResult.data;
  const scopes = scopesResult.data;
  const moduleAccess = moduleAccessResult.data;
  const departments = departmentsResult.data;

  const roleCodeById = new Map((roles ?? []).map((role) => [role.id, role.code]));
  const roleByUser = new Map(
    (userRoles ?? []).map((item) => [
      item.user_id,
      roleCodeById.get(item.role_id) ?? "viewer",
    ]),
  );

  return (
    <>
      <PageHeader
        eyebrow="QUẢN TRỊ"
        title="Người dùng và quyền phân hệ"
        description="Phân hệ quyết định khu vực được truy cập; vai trò và phạm vi dữ liệu quyết định thao tác bên trong."
        actions={(
          <ModalTrigger
            description="Gửi thư mời Supabase Auth và yêu cầu người dùng thiết lập tài khoản."
            eyebrow="NGƯỜI DÙNG"
            size="medium"
            title="Mời tài khoản mới"
            triggerLabel="+ Mời tài khoản"
          >
            <form action={inviteUser} className="data-form compact-form">
              <label>
                Họ và tên *
                <input name="full_name" required />
              </label>
              <label>
                Email *
                <input name="email" required type="email" />
              </label>
              <div className="modal-actions">
                <button className="primary-button" type="submit">Gửi lời mời</button>
              </div>
            </form>
          </ModalTrigger>
        )}
      />

      {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}
      {params.ok ? <p className="form-success" role="status">{params.ok}</p> : null}
      {queryError ? (
        <p className="form-error" role="alert">
          Không thể tải đầy đủ dữ liệu người dùng. Vui lòng tải lại trang.
        </p>
      ) : null}

      <section className="user-access-grid">
        {(profiles ?? []).map((profile) => {
          const roleCode = roleByUser.get(profile.id) ?? "viewer";
          const userScopes = (scopes ?? []).filter(
            (scope) => scope.user_id === profile.id,
          );
          const grantedModules = new Set(
            (moduleAccess ?? [])
              .filter((item) => item.user_id === profile.id)
              .map((item) => item.module),
          );
          const isAdmin = roleCode === "admin";
          return (
            <article className="panel" key={profile.id}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{roleCode.toUpperCase()}</p>
                  <h2>{profile.full_name || profile.email}</h2>
                  <small>{profile.email}</small>
                  <p>
                    <span className={`status-pill ${profile.active ? "" : "status-muted"}`}>
                      {profile.active ? "Đang hoạt động" : "Đã vô hiệu hóa"}
                    </span>
                  </p>
                  <div className="module-access-summary" aria-label="Phân hệ được truy cập">
                    {systemModuleDefinitions
                      .filter((module) => isAdmin || grantedModules.has(module.code))
                      .map((module) => (
                        <span key={module.code}>{module.label}</span>
                      ))}
                    {!isAdmin && grantedModules.size === 0 ? <span>Chưa cấp phân hệ</span> : null}
                  </div>
                </div>
              </div>
              <ModalTrigger
                description="Điều chỉnh vai trò, phân hệ được phép truy cập, MFA và phạm vi dữ liệu."
                eyebrow={roleCode.toUpperCase()}
                size="large"
                title={`Sửa quyền ${profile.full_name || profile.email}`}
                triggerClassName="secondary-button"
                triggerLabel="Sửa quyền truy cập"
              >
                <form action={updateUserAccess} className="stack-form">
                <input name="user_id" type="hidden" value={profile.id} />
                <label>
                  <span>Vai trò</span>
                  <select defaultValue={roleCode} name="role_code">
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="user">User</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </label>
                <div className="checkbox-row">
                  <label>
                    <input defaultChecked={profile.active} name="active" type="checkbox" />
                    Hoạt động
                  </label>
                  <label>
                    <input
                      defaultChecked={profile.must_enroll_mfa || roleCode === "admin"}
                      name="must_enroll_mfa"
                      type="checkbox"
                    />
                    Bắt buộc MFA
                  </label>
                </div>

                <fieldset className="module-access-fieldset">
                  <legend>Phân hệ được phép truy cập</legend>
                  <p className="field-help">
                    Tắt một phân hệ sẽ ẩn khỏi màn hình chọn phân hệ và chặn cả truy cập trực tiếp.
                  </p>
                  <div className="module-access-options">
                    {systemModuleDefinitions.map((module) => (
                      <label key={module.code}>
                        <input
                          defaultChecked={isAdmin || grantedModules.has(module.code)}
                          disabled={isAdmin}
                          name={isAdmin ? undefined : "module_access"}
                          type="checkbox"
                          value={module.code}
                        />
                        <span>
                          <strong>{module.label}</strong>
                          <small>{module.description}</small>
                        </span>
                        {isAdmin ? (
                          <input name="module_access" type="hidden" value={module.code} />
                        ) : null}
                      </label>
                    ))}
                  </div>
                  {isAdmin ? <p className="field-help">Tài khoản Admin luôn có quyền truy cập toàn bộ phân hệ.</p> : null}
                </fieldset>

                <div className="scope-grid">
                  <div className="scope-grid-heading">
                    <strong>Phạm vi dữ liệu chi tiết</strong>
                    <span>Áp dụng bên trong các phân hệ đã được cấp ở trên.</span>
                  </div>
                  {scopeModules.map(([module, label]) => {
                    const current = userScopes.find(
                      (scope) => scope.module === module,
                    );
                    return (
                      <div className="scope-row" key={module}>
                        <strong>{label}</strong>
                        <select
                          defaultValue={current?.scope_type ?? "none"}
                          name={`scope_${module}`}
                        >
                          <option value="none">Theo mặc định vai trò</option>
                          <option value="all">Toàn bộ</option>
                          <option value="department">Theo phòng ban</option>
                          <option value="assigned">Được giao phụ trách</option>
                          <option value="owned">Bản ghi đã tạo</option>
                        </select>
                        <select
                          defaultValue={current?.department_id ?? ""}
                          name={`department_${module}`}
                        >
                          <option value="">Chọn phòng ban nếu áp dụng</option>
                          {(departments ?? []).map((department) => (
                            <option key={department.id} value={department.id}>
                              {department.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
                <button className="secondary-button" type="submit">
                  Lưu quyền truy cập
                </button>
                </form>
              </ModalTrigger>
              <form action={sendPasswordRecovery}>
                <input name="email" type="hidden" value={profile.email} />
                <button className="secondary-button" type="submit">
                  Gửi link đặt lại mật khẩu
                </button>
              </form>
            </article>
          );
        })}
      </section>
    </>
  );
}
