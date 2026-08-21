import Link from "next/link";
import { AppIcon } from "@/components/app-icon";
import { can, requireAccess } from "@/lib/auth";

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
      available: can(access, "assets.view"),
      tone: "blue",
    },
    {
      href: "/vehicles",
      icon: "vehicle" as const,
      eyebrow: "PHƯƠNG TIỆN",
      title: "Quản lý xe",
      description: "Hồ sơ xe, đăng kiểm, bảo dưỡng sửa chữa, nhiên liệu và nhắc hạn.",
      available: can(access, "vehicles.view"),
      tone: "green",
    },
  ];

  return (
    <section className="module-picker-page">
      <div className="module-picker-heading">
        <p className="eyebrow">TDW MANAGEMENT</p>
        <h1>Chọn phân hệ làm việc</h1>
        <p className="muted">Bạn có thể đổi phân hệ bất kỳ lúc nào từ thanh điều hướng.</p>
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
    </section>
  );
}
