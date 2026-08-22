import Link from "next/link";
import { AppIcon } from "@/components/app-icon";
import { PageHeader } from "@/components/page-header";
import { can, requireAccess } from "@/lib/auth";
import { equipmentReports } from "@/lib/equipment-report-catalog";

export const metadata = { title: "Báo cáo" };

export default async function ReportsPage() {
  const { access } = await requireAccess();
  const availableReports = equipmentReports.filter((report) => can(access, report.permission));

  return (
    <>
      <PageHeader
        eyebrow="BÁO CÁO"
        title="Trung tâm báo cáo"
        description="Chọn đúng loại báo cáo cần làm; bộ lọc và thao tác xuất sẽ nằm trong từng trang riêng."
      />
      <section className="report-workspace-section">
        <div className="report-section-heading">
          <div>
            <p className="eyebrow">THIẾT BỊ & HỆ THỐNG</p>
            <h2>Chọn loại báo cáo</h2>
            <p>Mỗi khu vực được tách riêng để dễ cấu hình, kiểm tra và xuất dữ liệu.</p>
          </div>
        </div>
        <div className="report-hub-grid">
          {availableReports.map((report) => (
            <Link
              className={`panel report-hub-card report-hub-card--${report.tone}`}
              href={`/reports/${report.slug}`}
              key={report.slug}
            >
              <span className="report-hub-icon"><AppIcon name={report.icon} size={30} /></span>
              <span className="report-hub-content">
                <span className="eyebrow">{report.eyebrow}</span>
                <strong>{report.title}</strong>
                <small>{report.description}</small>
              </span>
              <span className="report-hub-arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
