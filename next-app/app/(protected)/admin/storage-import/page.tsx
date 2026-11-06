import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireAccess } from "@/lib/auth";
import { storageRoot } from "@/lib/db/storage";
import { storageImportStatus } from "@/lib/db/storage-import";
import { StorageImportButton } from "./import-button";

export const metadata = { title: "Chuyển file từ Supabase" };
export const dynamic = "force-dynamic";

const bucketLabels: Record<string, string> = {
  "asset-media": "Ảnh thiết bị & bảo trì",
  "asset-documents": "Chứng từ thiết bị",
  "vehicle-documents": "Hồ sơ xe",
  "it-cost-documents": "Chứng từ chi phí IT",
};

export default async function StorageImportPage() {
  const { access } = await requireAccess();
  if (!access.roles.includes("admin")) redirect("/dashboard");
  const status = await storageImportStatus();
  const done = status.total > 0 && status.missing === 0;

  return (
    <>
      <PageHeader
        eyebrow="HỆ THỐNG"
        title="Chuyển file từ Supabase"
        description="Tải ảnh và chứng từ cũ từ Supabase Storage về máy chủ Hostinger. Chạy lại bao nhiêu lần cũng được — file đã có sẽ được bỏ qua."
        actions={<Link className="secondary-button" href="/admin/health">Trạng thái hệ thống</Link>}
      />
      <section className="panel storage-import-panel">
        <div className="storage-import-summary">
          <div><small>Tổng số file</small><strong>{status.total}</strong></div>
          <div><small>Đã có trên Hostinger</small><strong className="text-ok">{status.present}</strong></div>
          <div><small>Còn thiếu</small><strong className={status.missing ? "text-warn" : "text-ok"}>{status.missing}</strong>
            {status.missing ? <small>{(status.missingBytes / 1048576).toFixed(1)} MB</small> : null}</div>
        </div>
        <p className="form-help">
          Thư mục lưu file: <code>{storageRoot()}</code>
          {process.env.STORAGE_DIR ? null : " (mặc định — nên đặt biến STORAGE_DIR trỏ ra ngoài thư mục ứng dụng để không mất file khi deploy lại)"}
        </p>
        <table>
          <thead><tr><th>Loại file</th><th>Đã có</th><th>Tổng</th></tr></thead>
          <tbody>
            {status.byBucket.map((item) => (
              <tr key={item.bucket}>
                <td>{bucketLabels[item.bucket] ?? item.bucket}</td>
                <td>{item.present}</td>
                <td>{item.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {done ? (
          <p className="storage-import-done">✓ Tất cả file đã được chuyển. Có thể xóa biến SUPABASE_SERVICE_ROLE_KEY trên hPanel.</p>
        ) : !status.configured ? (
          <div className="storage-import-help">
            <strong>Cần cấu hình trước khi chuyển</strong>
            <p>Vào hPanel → Websites → quanly.tdw.com.vn → Environment variables, thêm 2 biến rồi deploy lại:</p>
            <ul>
              <li><code>SUPABASE_URL</code> — địa chỉ dự án, dạng <code>https://xxxx.supabase.co</code></li>
              <li><code>SUPABASE_SERVICE_ROLE_KEY</code> — khóa <em>secret / service_role</em> ở Supabase → Project Settings → API Keys</li>
            </ul>
            <p>Khóa này có toàn quyền trên dự án Supabase cũ — chỉ dùng tạm, xóa đi sau khi chuyển xong.</p>
          </div>
        ) : null}
        {!done ? <StorageImportButton disabled={!status.configured} /> : null}
      </section>
    </>
  );
}
