import Link from "next/link";
import Image from "next/image";
import type { AccessProfile } from "@/lib/types";
import { can } from "@/lib/auth";
import { logout } from "@/app/(protected)/actions";

const navItems = [
  { href: "/dashboard", label: "Tổng quan", icon: "⌂", permission: "overview.view" },
  { href: "/assets", label: "Thiết bị", icon: "▤", permission: "assets.view" },
  { href: "/maintenance", label: "Bảo trì", icon: "◇", permission: "maintenance.view" },
  { href: "/movements", label: "Luân chuyển", icon: "⇄", permission: "movement.view" },
  { href: "/software", label: "Phần mềm", icon: "◫", permission: "software.view" },
  { href: "/reports", label: "Báo cáo", icon: "▥", permission: "reports.view" },
] as const;

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
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          ))}

        {access.roles.includes("admin") ? (
          <>
            <p className="nav-label nav-label-spaced">HỆ THỐNG</p>
            <Link href="/admin/users"><span aria-hidden="true">♙</span>Người dùng</Link>
            <Link href="/admin/settings"><span aria-hidden="true">⚙</span>Cấu hình</Link>
            <Link href="/admin/audit"><span aria-hidden="true">◷</span>Nhật ký</Link>
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
          <button aria-label="Đăng xuất" title="Đăng xuất" type="submit">↗</button>
        </form>
      </div>
    </aside>
  );
}
