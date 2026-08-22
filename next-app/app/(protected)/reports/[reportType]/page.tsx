import Link from "next/link";
import { notFound } from "next/navigation";
import { AppIcon } from "@/components/app-icon";
import { AssetQrLabels } from "@/components/asset-qr-labels";
import { AssetReportExportConfigurator } from "@/components/asset-report-export-configurator";
import { PageHeader } from "@/components/page-header";
import { ReportExportConfigurator } from "@/components/report-export-configurator";
import { can, requireAccess } from "@/lib/auth";
import type { AssetQrData } from "@/lib/asset-qr";
import { getEquipmentReport } from "@/lib/equipment-report-catalog";
import { labelStatus } from "@/lib/format";

export default async function EquipmentReportPage({ params }: { params: Promise<{ reportType: string }> }) {
  const { reportType } = await params;
  const report = getEquipmentReport(reportType);
  if (!report) notFound();

  const { supabase, access } = await requireAccess();
  if (!can(access, report.permission)) notFound();

  const needsAssets = report.slug === "assets"
    || report.slug === "qr-labels"
    || Boolean(report.exportType);
  let assetQuery = supabase
    .from("assets")
    .select("id,asset_code,asset_name,asset_group,asset_group_label,asset_type,purchase_year,last_maintenance_date,warranty_end_date,status,department_legacy_name,departments(name)")
    .is("deleted_at", null);
  if (report.slug !== "liquidations") assetQuery = assetQuery.neq("status", "DA_THANH_LY");
  const { data: assetData } = needsAssets
    ? await assetQuery.order("asset_code")
    : { data: [] };
  const assets = assetData ?? [];
  const [{ data: maintenanceTypeData }, { data: softwareData }] = await Promise.all([
    report.slug === "maintenance"
      ? supabase
          .from("settings")
          .select("setting_value,display_name")
          .eq("setting_type", "maintenance_type")
          .eq("is_active", true)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
    report.slug === "software"
      ? supabase
          .from("software_licenses")
          .select("software_name,status")
          .order("software_name")
      : Promise.resolve({ data: [] }),
  ]);

  function uniqueOptions(values: Array<{ value: string; label: string }>) {
    return [...new Map(values.filter((item) => item.value).map((item) => [item.value, item])).values()]
      .sort((left, right) => left.label.localeCompare(right.label, "vi"));
  }

  const filterOptions = {
    assetGroups: uniqueOptions(assets.map((asset) => ({
      value: asset.asset_group,
      label: asset.asset_group_label || asset.asset_group,
    }))),
    assetTypes: uniqueOptions(assets.map((asset) => ({
      value: asset.asset_type || "",
      label: asset.asset_type || "",
    }))),
    departments: uniqueOptions(assets.map((asset) => {
      const departments = asset.departments as { name?: string } | { name?: string }[] | null;
      const department = Array.isArray(departments) ? departments[0]?.name : departments?.name;
      const value = department || asset.department_legacy_name || "";
      return { value, label: value };
    })),
    maintenanceTypes: uniqueOptions((maintenanceTypeData ?? []).map((item) => ({
      value: item.setting_value,
      label: item.display_name,
    }))),
    softwareNames: uniqueOptions((softwareData ?? []).map((item) => ({
      value: item.software_name,
      label: item.software_name,
    }))),
    softwareStatuses: uniqueOptions((softwareData ?? []).map((item) => ({
      value: item.status,
      label: item.status === "ACTIVE" ? "Đang hoạt động" : item.status === "EXPIRED" ? "Đã hết hạn" : item.status,
    }))),
  };

  return (
    <>
      <PageHeader
        actions={<Link className="secondary-button" href="/reports">← Tất cả báo cáo</Link>}
        eyebrow={report.eyebrow}
        title={report.title}
        description={report.description}
      />

      {report.slug === "assets" ? (
        <section className={`panel report-detail-panel report-detail-panel--${report.tone}`}>
          <div className="report-detail-heading">
            <span><AppIcon name={report.icon} size={28} /></span>
            <div>
              <p className="eyebrow">BỘ LỌC XUẤT DỮ LIỆU</p>
              <h2>Cấu hình báo cáo thiết bị</h2>
              <p>Chỉ dữ liệu phù hợp với năm, danh mục và trạng thái đã chọn mới được đưa vào file.</p>
            </div>
          </div>
          <AssetReportExportConfigurator assets={assets.map((asset) => ({
            asset_group: asset.asset_group,
            asset_group_label: asset.asset_group_label,
            purchase_year: asset.purchase_year,
            status: asset.status,
            status_label: labelStatus(asset.status),
          }))} />
        </section>
      ) : null}

      {report.slug === "qr-labels" ? <AssetQrLabels assets={assets as AssetQrData[]} /> : null}

      {report.exportType && report.slug !== "assets" ? (
        <section className={`panel report-detail-panel report-detail-panel--${report.tone}`}>
          <div className="report-detail-heading">
            <span><AppIcon name={report.icon} size={28} /></span>
            <div><p className="eyebrow">XUẤT BÁO CÁO</p><h2>{report.title}</h2><p>{report.description}</p></div>
          </div>
          <ReportExportConfigurator
            options={filterOptions}
            reportType={report.exportType as "liquidations" | "maintenance" | "movement" | "software"}
          />
        </section>
      ) : null}
    </>
  );
}
