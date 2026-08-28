import Link from "next/link";
import { AppIcon } from "@/components/app-icon";
import { hasModule, requireAccess } from "@/lib/auth";

export const metadata = { title: "Chọn phân hệ" };

export default async function ModulesPage() {
  const { access } = await requireAccess();
  const modules = [
    {
      href: "/dashboard",
      icon: "device" as const,
      eyebrow: "TÀI SẢN",
      title: "Quản lý thiết bị",
      description: "Thiết bị, linh kiện, bảo trì, luân chuyển, phần mềm và báo cáo.",
      available: hasModule(access, "equipment"),
      tone: "blue",
    },
    {
      href: "/vehicles",
      icon: "vehicle" as const,
      eyebrow: "PHƯƠNG TIỆN",
      title: "Quản lý xe",
      description: "Hồ sơ xe, đăng kiểm, bảo dưỡng sửa chữa, nhiên liệu và nhắc hạn.",
      available: hasModule(access, "vehicles"),
      tone: "green",
    },
    {
      href: "/supplies",
      icon: "supplies" as const,
      eyebrow: "HÀNH CHÍNH",
      title: "Văn phòng phẩm & vệ sinh",
      description: "Danh mục hàng hóa, phiếu yêu cầu, mua sắm theo kỳ và báo cáo chi phí.",
      available: hasModule(access, "supplies"),
      tone: "amber",
    },
  ];

  return (
    <section className="module-picker-page">
      <div className="module-picker-heading">
        <p className="eyebrow">TDW MANAGEMENT</p>
        <h1>Chọn phân hệ làm việc</h1>
        <p className="muted">Chỉ các phân hệ bạn được cấp quyền mới xuất hiện tại đây.</p>
      </div>
      <div className="module-picker-grid">
        {modules.map((module) => module.available ? (
          <Link className={`module-picker-card module-picker-${module.tone}`} href={module.href} key={module.href}>
            <span className="module-picker-icon"><AppIcon name={module.icon} size={34} /></span>
            <p className="eyebrow">{module.eyebrow}</p>
            <h2>{module.title}</h2>
            <p>{module.description}</p>
            <strong>Mở phân hệ <span aria-hidden="true">→</span></strong>
          </Link>
        ) : null)}
      </div>
      <div className="module-system-panel module-account-panel">
        <div className="module-system-copy">
          <span className="module-picker-icon"><AppIcon name="settings" size={28} /></span>
          <div>
            <p className="eyebrow">TÀI KHOẢN CỦA TÔI</p>
            <h2>Cài đặt & mật khẩu</h2>
            <p>Tự đổi mật khẩu hoặc gửi email đặt lại mật khẩu cho tài khoản đang đăng nhập.</p>
          </div>
        </div>
        <Link className="secondary-button" href="/account">Mở cài đặt →</Link>
      </div>
      {access.roles.includes("admin") ? (
        <div className="module-system-panel">
          <div className="module-system-copy">
            <span className="module-picker-icon"><AppIcon name="users" size={28} /></span>
            <div>
              <p className="eyebrow">QUẢN TRỊ HỆ THỐNG</p>
              <h2>Người dùng và quyền phân hệ</h2>
              <p>Quản lý tài khoản, vai trò, MFA và phạm vi dữ liệu cho từng phân hệ.</p>
            </div>
          </div>
          <Link className="secondary-button" href="/admin/users">Mở quản trị →</Link>
        </div>
      ) : null}
    </section>
  );
}
