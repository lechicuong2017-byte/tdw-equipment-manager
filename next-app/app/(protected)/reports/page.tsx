import { ExportAssetsButton } from "@/components/export-assets-button";
import { PageHeader } from "@/components/page-header";
import { can, requireAccess } from "@/lib/auth";

export const metadata = { title: "Báo cáo" };

export default async function ReportsPage() {
  const { access } = await requireAccess();

  return (
    <>
      <PageHeader
        eyebrow="BÁO CÁO"
        title="Báo cáo và xuất dữ liệu"
        description="Dữ liệu được đọc từ Supabase; Apps Script chỉ đảm nhiệm tạo tài liệu Google."
      />
      <section className="report-grid">
        <article className="panel report-card">
          <div className="report-icon" aria-hidden="true">▤</div>
          <div>
            <p className="eyebrow">THIẾT BỊ</p>
            <h2>Danh sách thiết bị</h2>
            <p>Xuất toàn bộ thiết bị đang hoạt động cùng giá trị, vị trí và trạng thái.</p>
          </div>
          {can(access, "reports.assets.export") ? (
            <ExportAssetsButton />
          ) : (
            <small>Bạn không có quyền xuất báo cáo này.</small>
          )}
        </article>
        <article className="panel report-card report-card-muted">
          <div className="report-icon" aria-hidden="true">◇</div>
          <div>
            <p className="eyebrow">GIAI ĐOẠN TIẾP THEO</p>
            <h2>Bảo trì, phần mềm và luân chuyển</h2>
            <p>Cấu trúc dữ liệu và quyền xuất đã sẵn sàng; giao diện sẽ nối sau khi nhập dữ liệu nguồn.</p>
          </div>
        </article>
      </section>
    </>
  );
}
