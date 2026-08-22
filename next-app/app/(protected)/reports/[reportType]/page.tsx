import Link from "next/link";
import { notFound } from "next/navigation";
import { AppIcon } from "@/components/app-icon";
import { AssetQrLabels } from "@/components/asset-qr-labels";
import { AssetReportExportConfigurator } from "@/components/asset-report-export-configurator";
import { ExportReportButton } from "@/components/export-assets-button";
import { PageHeader } from "@/components/page-header";
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

  const needsAssets = report.slug === "assets" || report.slug === "qr-labels";
  const { data: assetData } = needsAssets
    ? await supabase
        .from("assets")
        .select("id,asset_code,asset_name,asset_group,asset_group_label,purchase_year,last_maintenance_date,warranty_end_date,status")
        .is("deleted_at", null)
        .neq("status", "DA_THANH_LY")
        .order("asset_code")
    : { data: [] };
  const assets = assetData ?? [];

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
          <div className="report-detail-actions">
            <ExportReportButton reportType={report.exportType} />
            <ExportReportButton buttonLabel="Xuất PDF" outputFormat="pdf" reportType={report.exportType} />
          </div>
        </section>
      ) : null}
    </>
  );
}
