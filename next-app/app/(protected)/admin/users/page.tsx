import { redirect } from "next/navigation";
import { ModalTrigger } from "@/components/app-modal";
import { PageHeader } from "@/components/page-header";
import { requireAccess } from "@/lib/auth";
import { inviteUser, updateUserAccess } from "./actions";

export const metadata = { title: "Người dùng" };

type UsersPageProps = {
  searchParams: Promise<{ ok?: string; error?: string }>;
};

const modules = [
  ["assets", "Thiết bị"],
  ["maintenance", "Bảo trì"],
  ["movement", "Luân chuyển"],
  ["software", "Phần mềm"],
] as const;

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const { supabase, access } = await requireAccess();
  if (!access.roles.includes("admin")) redirect("/dashboard");

  const params = await searchParams;
  const [
    { data: profiles },
    { data: roles },
    { data: userRoles },
    { data: scopes },
    { data: departments },
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
    supabase.from("departments").select("id,name").order("name"),
  ]);

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
        title="Người dùng và phạm vi dữ liệu"
        description="Vai trò quyết định thao tác; phạm vi quyết định những bản ghi người dùng được truy cập."
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

      <section className="user-access-grid">
        {(profiles ?? []).map((profile) => {
          const roleCode = roleByUser.get(profile.id) ?? "viewer";
          const userScopes = (scopes ?? []).filter(
            (scope) => scope.user_id === profile.id,
          );
          return (
            <article className="panel" key={profile.id}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{roleCode.toUpperCase()}</p>
                  <h2>{profile.full_name || profile.email}</h2>
                  <small>{profile.email}</small>
                </div>
              </div>
              <ModalTrigger
                description="Điều chỉnh vai trò, MFA và phạm vi dữ liệu theo từng phân hệ."
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

                <div className="scope-grid">
                  {modules.map(([module, label]) => {
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
            </article>
          );
        })}
      </section>
    </>
  );
}
