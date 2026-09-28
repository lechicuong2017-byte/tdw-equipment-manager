"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type HistorySection = "inspections" | "insurance" | "tolls";

const viewParamBySection: Record<HistorySection, string> = {
  inspections: "inspectionView",
  insurance: "insuranceView",
  tolls: "tollView",
};

const sectionLabel: Record<HistorySection, string> = {
  inspections: "đăng kiểm",
  insurance: "bảo hiểm",
  tolls: "vé quý VETC",
};

export function VehicleHistoryTabs({
  active,
  currentLabel,
  historyLabel,
  section,
  year,
}: {
  active: "current" | "history";
  currentLabel: string;
  historyLabel: string;
  section: HistorySection;
  year?: number;
}) {
  const router = useRouter();
  const yearQuery = year ? `&year=${year}` : "";
  const currentHref = `/vehicles?section=${section}&${viewParamBySection[section]}=current${yearQuery}`;
  const historyHref = `/vehicles?section=${section}&${viewParamBySection[section]}=history${yearQuery}`;

  useEffect(() => {
    router.prefetch(active === "current" ? historyHref : currentHref);
  }, [active, currentHref, historyHref, router]);

  return (
    <nav className="vehicle-inspection-subtabs" aria-label={`Phân loại hồ sơ ${sectionLabel[section]}`}>
      <Link className={active === "current" ? "active" : ""} href={currentHref} prefetch>{currentLabel}</Link>
      <Link className={active === "history" ? "active" : ""} href={historyHref} prefetch>{historyLabel}</Link>
    </nav>
  );
}
