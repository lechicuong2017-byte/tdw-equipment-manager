import { PageHeader } from "@/components/page-header";
import { requireAccess } from "@/lib/auth";
import { systemModuleDefinitions } from "@/lib/system-modules";
import { changeOwnPassword, sendOwnPasswordRecovery } from "./actions";

export const metadata = { title: "Tài khoản & mật khẩu" };

type AccountPageProps = {
  searchParams: Promise<{ ok?: string; error?: string }>;
};

const successMessages: Record<string, string> = {
  "password-changed": "Đã đổi mật khẩu thành công.",
  "recovery-sent": "Đã gửi email đặt lại mật khẩu. Hãy kiểm tra hộp thư và thư rác.",
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const { access } = await requireAccess();
  const params = await searchParams;
  const grantedModules = systemModuleDefinitions.filter(
    (module) => access.roles.includes("admin") || access.modules.includes(module.code),
  );

  return (
    <>
      <PageHeader
        eyebrow="TÀI KHOẢN CÁ NHÂN"
        title="Cài đặt tài khoản & mật khẩu"
        description="Tự quản lý mật khẩu đăng nhập mà không cần quyền quản trị hệ thống."
      />

      {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}
      {params.ok && successMessages[params.ok] ? (
        <p className="form-success" role="status">{successMessages[params.ok]}</p>
      ) : null}

      <section className="account-settings-grid">
        <article className="panel account-profile-card">
          <p className="eyebrow">HỒ SƠ ĐĂNG NHẬP</p>
          <h2>{access.full_name || "Người dùng TDW"}</h2>
          <p className="muted">{access.email}</p>
          <dl className="account-profile-details">
            <div>
              <dt>Vai trò</dt>
              <dd>{access.roles.join(", ") || "viewer"}</dd>
            </div>
            <div>
              <dt>Phân hệ được cấp</dt>
              <dd>{grantedModules.map((module) => module.label).join(" · ") || "Chưa cấp phân hệ"}</dd>
            </div>
          </dl>
        </article>

        <article className="panel account-password-card">
          <p className="eyebrow">ĐỔI MẬT KHẨU</p>
          <h2>Đổi mật khẩu ngay</h2>
          <p className="muted">Nhập mật khẩu hiện tại để xác minh trước khi đặt mật khẩu mới.</p>
          <form action={changeOwnPassword} className="data-form account-password-form">
            <label>
              Mật khẩu hiện tại
              <input
                autoComplete="current-password"
                name="current_password"
                required
                type="password"
              />
            </label>
            <label>
              Mật khẩu mới
              <input
                autoComplete="new-password"
                minLength={12}
                name="new_password"
                placeholder="Tối thiểu 12 ký tự"
                required
                type="password"
              />
            </label>
            <label>
              Nhập lại mật khẩu mới
              <input
                autoComplete="new-password"
                minLength={12}
                name="confirm_password"
                required
                type="password"
              />
            </label>
            <button className="primary-button" type="submit">Đổi mật khẩu</button>
          </form>
          <p className="security-note">
            Mật khẩu được gửi trực tiếp đến Supabase Auth và không được lưu trong dữ liệu nghiệp vụ.
          </p>
        </article>

        <article className="panel account-recovery-card">
          <p className="eyebrow">QUÊN MẬT KHẨU</p>
          <h2>Gửi email đặt lại</h2>
          <p className="muted">
            Hệ thống sẽ gửi liên kết bảo mật tới <strong>{access.email}</strong>.
          </p>
          <form action={sendOwnPasswordRecovery}>
            <button className="secondary-button" type="submit">
              Gửi email đặt lại mật khẩu
            </button>
          </form>
        </article>
      </section>
    </>
  );
}
