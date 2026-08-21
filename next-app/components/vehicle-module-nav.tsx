import Link from "next/link";
import { AppIcon, type AppIconName } from "@/components/app-icon";

type VehicleNavSection = "overview" | "fleet" | "inspections" | "repairs" | "fuel" | "reports";

const items: { key: VehicleNavSection; label: string; icon: AppIconName; href: string }[] = [
  { key: "overview", label: "Tổng quan", icon: "dashboard", href: "/vehicles" },
  { key: "fleet", label: "Hồ sơ xe", icon: "vehicle", href: "/vehicles?section=fleet" },
  { key: "inspections", label: "Đăng kiểm", icon: "inspection", href: "/vehicles?section=inspections" },
  { key: "repairs", label: "Bảo dưỡng", icon: "maintenance", href: "/vehicles?section=repairs" },
  { key: "fuel", label: "Nhiên liệu", icon: "fuel", href: "/vehicles?section=fuel" },
  { key: "reports", label: "Báo cáo xe", icon: "reports", href: "/vehicles/reports" },
];

export function VehicleModuleNav({ active }: { active: VehicleNavSection }) {
  return (
    <nav className="vehicle-tabs" aria-label="Mục quản lý xe">
      {items.map((item) => <Link className={active === item.key ? "active" : ""} href={item.href} key={item.key}><span className="vehicle-tab-icon"><AppIcon name={item.icon} size={18} /></span><span>{item.label}</span></Link>)}
    </nav>
  );
}
