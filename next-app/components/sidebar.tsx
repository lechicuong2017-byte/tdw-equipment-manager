"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { AccessProfile } from "@/lib/types";
import { logout } from "@/app/(protected)/actions";
import { AppIcon, type AppIconName } from "@/components/app-icon";

function can(access: AccessProfile, permission: string) {
  return access.roles.includes("admin") || access.permissions.includes(permission);
}

const equipmentNavItems: ReadonlyArray<{
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

const vehicleNavItems: ReadonlyArray<{
  href: string;
  icon: AppIconName;
  label: string;
  permission: string;
  tone: string;
}> = [
  { href: "/vehicles", label: "Tổng quan xe", icon: "vehicle", permission: "vehicles.view", tone: "cyan" },
  { href: "/vehicles?section=inspections", label: "Đăng kiểm", icon: "inspection", permission: "vehicles.view", tone: "amber" },
  { href: "/vehicles?section=insurance", label: "Bảo hiểm", icon: "insurance", permission: "vehicles.view", tone: "blue" },
  { href: "/vehicles?section=repairs", label: "Bảo dưỡng", icon: "maintenance", permission: "vehicles.view", tone: "violet" },
  { href: "/vehicles?section=fuel", label: "Nhiên liệu", icon: "fuel", permission: "vehicles.view", tone: "green" },
  { href: "/vehicles?section=settings", label: "Cấu hình", icon: "settings", permission: "vehicles.view", tone: "amber" },
  { href: "/vehicles/reports", label: "Báo cáo xe", icon: "reports", permission: "reports.vehicles.export", tone: "rose" },
];

const supplyNavItems: ReadonlyArray<{
  href: string;
  icon: AppIconName;
  label: string;
  permission: string;
  tone: string;
}> = [
  { href: "/supplies", label: "Tổng quan", icon: "dashboard", permission: "supplies.view", tone: "cyan" },
  { href: "/supplies?section=catalog", label: "Danh mục hàng", icon: "supplies", permission: "supplies.view", tone: "blue" },
  { href: "/supplies?section=warehouse", label: "Kho hàng", icon: "archive", permission: "supplies.view", tone: "green" },
  { href: "/supplies?section=requests", label: "Phiếu yêu cầu", icon: "assets", permission: "supplies.view", tone: "amber" },
  { href: "/supplies?section=quotes", label: "Báo giá NCC", icon: "value", permission: "supplies.view", tone: "violet" },
  { href: "/supplies?section=reports", label: "Báo cáo mua sắm", icon: "reports", permission: "reports.supplies.export", tone: "rose" },
];

export function Sidebar({ access }: { access: AccessProfile }) {
  const pathname = usePathname();
  const isAdminArea = pathname.startsWith("/admin");
  const isAccountArea = pathname.startsWith("/account");
  const isVehicleModule = pathname.startsWith("/vehicles");
  const isSupplyModule = pathname.startsWith("/supplies");
  const navItems = isVehicleModule ? vehicleNavItems : isSupplyModule ? supplyNavItems : equipmentNavItems;
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
        <small>{isAdminArea ? "System Administration" : isAccountArea ? "Account Settings" : isVehicleModule ? "Vehicle Manager" : isSupplyModule ? "Supply Manager" : "Equipment Manager"}</small>
      </div>

      <nav aria-label="Điều hướng chính">
        <Link className="module-switch-link" href="/modules">
          <span className="nav-icon nav-icon-rose"><AppIcon name="dashboard" /></span>
          Đổi phân hệ
        </Link>
        {!isAdminArea && !isAccountArea ? (
          <>
            <p className="nav-label">QUẢN LÝ</p>
            {navItems
              .filter((item) => can(access, item.permission))
              .map((item) => (
                <Link href={item.href} key={item.href}>
                  <span className={`nav-icon nav-icon-${item.tone}`}><AppIcon name={item.icon} /></span>
                  {item.label}
                </Link>
              ))}
          </>
        ) : null}

        {isAccountArea ? (
          <>
            <p className="nav-label">TÀI KHOẢN</p>
            <Link href="/account"><span className="nav-icon nav-icon-cyan"><AppIcon name="settings" /></span>Tài khoản & mật khẩu</Link>
          </>
        ) : null}

        {isAdminArea && access.roles.includes("admin") ? (
          <>
            <p className="nav-label">HỆ THỐNG</p>
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
        <Link
          aria-label="Cài đặt tài khoản"
          className="sidebar-account-button"
          href="/account"
          title="Cài đặt tài khoản"
        >
          <AppIcon name="settings" size={18} />
        </Link>
        <form action={logout}>
          <button aria-label="Đăng xuất" title="Đăng xuất" type="submit"><AppIcon name="logout" size={18} /></button>
        </form>
      </div>
    </aside>
  );
}
