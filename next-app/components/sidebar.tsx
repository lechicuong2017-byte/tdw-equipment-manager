import Link from "next/link";
import Image from "next/image";
import type { AccessProfile } from "@/lib/types";
import { can } from "@/lib/auth";
import { logout } from "@/app/(protected)/actions";
import { AppIcon, type AppIconName } from "@/components/app-icon";

const navItems: ReadonlyArray<{
  href: string;
  icon: AppIconName;
  label: string;
  permission: string;
  tone: string;
}> = [
  { href: "/dashboard", label: "Tổng quan", icon: "dashboard", permission: "overview.view", tone: "cyan" },
  { href: "/assets", label: "Thiết bị", icon: "assets", permission: "assets.view", tone: "blue" },
  { href: "/maintenance", label: "Bảo trì", icon: "maintenance", permission: "maintenance.view", tone: "amber" },
  { href: "/movements", label: "Luân chuyển", icon: "movement", permission: "movement.view", tone: "violet" },
  { href: "/software", label: "Phần mềm", icon: "software", permission: "software.view", tone: "green" },
  { href: "/reports", label: "Báo cáo", icon: "reports", permission: "reports.view", tone: "rose" },
];

export function Sidebar({ access }: { access: AccessProfile }) {
  const initials = (access.full_name || access.email)
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((item) => item[0]?.toUpperCase())
    .join("");

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Image
          alt="TDW — Better Service For Life"
          className="sidebar-logo"
          height={46}
          priority
          src="/tdw-logo.webp"
          width={126}
        />
        <small>Equipment Manager</small>
      </div>

      <nav aria-label="Điều hướng chính">
        <p className="nav-label">QUẢN LÝ</p>
        {navItems
          .filter((item) => can(access, item.permission))
          .map((item) => (
            <Link href={item.href} key={item.href}>
              <span className={`nav-icon nav-icon-${item.tone}`}><AppIcon name={item.icon} /></span>
              {item.label}
            </Link>
          ))}

        {access.roles.includes("admin") ? (
          <>
            <p className="nav-label nav-label-spaced">HỆ THỐNG</p>
            <Link href="/admin/users"><span className="nav-icon nav-icon-cyan"><AppIcon name="users" /></span>Người dùng</Link>
            <Link href="/admin/settings"><span className="nav-icon nav-icon-amber"><AppIcon name="settings" /></span>Cấu hình</Link>
            <Link href="/admin/audit"><span className="nav-icon nav-icon-violet"><AppIcon name="timeline" /></span>Nhật ký</Link>
            <Link href="/admin/health"><span className="nav-icon nav-icon-green"><AppIcon name="health" /></span>Trạng thái</Link>
          </>
        ) : null}
      </nav>

      <div className="sidebar-user">
        <span className="avatar">{initials || "TD"}</span>
        <div>
          <strong>{access.full_name || "Người dùng TDW"}</strong>
          <small>{access.roles.join(", ") || "viewer"}</small>
        </div>
        <form action={logout}>
          <button aria-label="Đăng xuất" title="Đăng xuất" type="submit"><AppIcon name="logout" size={18} /></button>
        </form>
      </div>
    </aside>
  );
}
