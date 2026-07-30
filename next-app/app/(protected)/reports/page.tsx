import { ExportReportButton } from "@/components/export-assets-button";
import { PageHeader } from "@/components/page-header";
import { can, requireAccess } from "@/lib/auth";

export const metadata = { title: "Báo cáo" };

export default async function ReportsPage() {
  const { access } = await requireAccess();
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
        description="Dữ liệu được đọc từ Supabase; Apps Script chỉ đảm nhiệm tạo tài liệu Google."
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
              <ExportReportButton reportType={report.type} />
            ) : (
              <small>Bạn không có quyền xuất báo cáo này.</small>
            )}
          </article>
        ))}
      </section>
    </>
  );
}
