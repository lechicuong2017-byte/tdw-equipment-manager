import { ExportReportButton } from "@/components/export-assets-button";
import { AssetQrLabels } from "@/components/asset-qr-labels";
import { PageHeader } from "@/components/page-header";
import { can, requireAccess } from "@/lib/auth";
import type { AssetQrData } from "@/lib/asset-qr";

export const metadata = { title: "Báo cáo" };

export default async function ReportsPage() {
  const { supabase, access } = await requireAccess();
  const canExportAssets = can(access, "reports.assets.export");
  const { data: qrAssetData } = canExportAssets
    ? await supabase
        .from("assets")
        .select("id,asset_code,asset_name,asset_group,asset_group_label,purchase_year,last_maintenance_date,warranty_end_date")
        .is("deleted_at", null)
        .order("asset_code")
    : { data: [] };
  const reports = [
    {
      type: "assets",
      eyebrow: "THIẾT BỊ",
      title: "Danh sách thiết bị",
      description:
        "Thiết bị đang hoạt động cùng giá trị, vị trí và trạng thái.",
      icon: "▤",
      permission: "reports.assets.export",
    },
    {
      type: "maintenance",
      eyebrow: "BẢO TRÌ",
      title: "Kế hoạch và lịch sử bảo trì",
      description:
        "Kế hoạch định kỳ, mốc đến hạn, nội dung thực hiện và chi phí.",
      icon: "◇",
      permission: "reports.maintenance.export",
    },
    {
      type: "movement",
      eyebrow: "LUÂN CHUYỂN",
      title: "Lịch sử bàn giao",
      description:
        "Người giao nhận, vị trí trước/sau, lý do và người phê duyệt.",
      icon: "⇄",
      permission: "reports.movement.export",
    },
    {
      type: "software",
      eyebrow: "PHẦN MỀM",
      title: "Bản quyền phần mềm",
      description:
        "Phân bổ, ngày hết hạn và khóa đã che; không xuất tham chiếu bí mật.",
      icon: "◫",
      permission: "reports.software.export",
    },
  ] as const;

  return (
    <>
      <PageHeader
        eyebrow="BÁO CÁO"
        title="Báo cáo và xuất dữ liệu"
        description="Dữ liệu được đọc từ Supabase; Apps Script chỉ đảm nhiệm tạo liên kết tải XLSX và PDF từ Google Drive."
      />
      <section className="report-grid">
        {reports.map((report) => (
          <article className="panel report-card" key={report.type}>
            <div className="report-icon" aria-hidden="true">{report.icon}</div>
            <div>
              <p className="eyebrow">{report.eyebrow}</p>
              <h2>{report.title}</h2>
              <p>{report.description}</p>
            </div>
            {can(access, report.permission) ? (
              <div className="report-actions">
                <ExportReportButton reportType={report.type} />
                <ExportReportButton
                  buttonLabel="Xuất PDF"
                  outputFormat="pdf"
                  reportType={report.type}
                />
              </div>
            ) : (
              <small>Bạn không có quyền xuất báo cáo này.</small>
            )}
          </article>
        ))}
      </section>
      {canExportAssets ? <AssetQrLabels assets={(qrAssetData ?? []) as AssetQrData[]} /> : null}
    </>
  );
}
