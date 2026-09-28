"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type HistorySection = "inspections" | "insurance";

export function VehicleHistoryTabs({
  active,
  currentLabel,
  historyLabel,
  section,
}: {
  active: "current" | "history";
  currentLabel: string;
  historyLabel: string;
  section: HistorySection;
}) {
  const router = useRouter();
  const currentHref = `/vehicles?section=${section}&${section === "inspections" ? "inspectionView" : "insuranceView"}=current`;
  const historyHref = `/vehicles?section=${section}&${section === "inspections" ? "inspectionView" : "insuranceView"}=history`;

  useEffect(() => {
    router.prefetch(active === "current" ? historyHref : currentHref);
  }, [active, currentHref, historyHref, router]);

  return (
    <nav className="vehicle-inspection-subtabs" aria-label={`Phân loại hồ sơ ${section === "inspections" ? "đăng kiểm" : "bảo hiểm"}`}>
      <Link className={active === "current" ? "active" : ""} href={currentHref} prefetch>{currentLabel}</Link>
      <Link className={active === "history" ? "active" : ""} href={historyHref} prefetch>{historyLabel}</Link>
    </nav>
  );
}
