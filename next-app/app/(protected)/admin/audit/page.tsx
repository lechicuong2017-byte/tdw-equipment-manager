import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireAccess } from "@/lib/auth";

export const metadata = { title: "Nhật ký" };
export const dynamic = "force-dynamic";

type AuditPageProps = {
  searchParams: Promise<{
    action?: string;
    table?: string;
    page?: string;
  }>;
};

type AuditMetadata = Record<string, unknown> | null;

const PAGE_SIZE = 40;
const allowedFilter = /^[a-zA-Z0-9_]{1,80}$/;

const actionLabels: Record<string, string> = {
  INSERT: "Thêm mới",
  UPDATE: "Cập nhật",
  DELETE: "Xóa",
  ACCESS_UPDATED: "Cập nhật quyền",
};

function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function metadataKeys(metadata: AuditMetadata) {
  const keys = metadata && typeof metadata === "object"
    ? Object.keys(metadata).filter((key) => !/secret|token|password|license/i.test(key))
    : [];
  return keys.length ? `Trường bổ sung: ${keys.slice(0, 4).join(", ")}` : "Không có chi tiết bổ sung";
}

function pageHref(page: number, action: string, table: string) {
  const params = new URLSearchParams();
  if (action) params.set("action", action);
  if (table) params.set("table", table);
  params.set("page", String(page));
  return `/admin/audit?${params.toString()}`;
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const { supabase } = await requireAccess();
  const params = await searchParams;
  const action = allowedFilter.test(String(params.action || "")) ? String(params.action) : "";
  const table = allowedFilter.test(String(params.table || "")) ? String(params.table) : "";
  const page = Math.max(1, Number.parseInt(String(params.page || "1"), 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("audit_logs")
    .select("id,actor_user_id,action,table_name,record_id,metadata,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (action) query = query.eq("action", action);
  if (table) query = query.eq("table_name", table);

  const { data: logs, count, error } = await query;
  const actorIds = [...new Set((logs ?? []).map((log) => log.actor_user_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id,full_name,email").in("id", actorIds)
    : { data: [] };
  const actorById = new Map(
    (actors ?? []).map((actor) => [actor.id, actor.full_name || actor.email]),
  );
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <>
      <PageHeader
        eyebrow="BẢO MẬT"
        title="Nhật ký hệ thống"
        description="Theo dõi thao tác quan trọng trong Supabase; không hiển thị dữ liệu cũ/mới có thể chứa thông tin nhạy cảm."
      />

      <section className="panel">
        <form className="audit-filter" method="get">
          <label>
            <span>Hành động</span>
            <select defaultValue={action} name="action">
              <option value="">Tất cả hành động</option>
              <option value="INSERT">Thêm mới</option>
              <option value="UPDATE">Cập nhật</option>
              <option value="DELETE">Xóa</option>
              <option value="ACCESS_UPDATED">Cập nhật quyền</option>
            </select>
          </label>
          <label>
            <span>Bảng dữ liệu</span>
            <input defaultValue={table} maxLength={80} name="table" placeholder="Ví dụ: assets" />
          </label>
          <button className="secondary-button" type="submit">Lọc nhật ký</button>
          {(action || table) ? <Link className="text-link" href="/admin/audit">Xóa bộ lọc</Link> : null}
        </form>

        {error ? (
          <p className="form-error" role="alert">Không thể đọc nhật ký bằng quyền quản trị hiện tại.</p>
        ) : (
          <>
            <div className="table-summary">
              <span>{(count ?? 0).toLocaleString("vi-VN")} sự kiện</span>
              <span>Trang {page}/{totalPages}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Người thực hiện</th>
                    <th>Hành động</th>
                    <th>Đối tượng</th>
                    <th>Thông tin an toàn</th>
                  </tr>
                </thead>
                <tbody>
                  {(logs ?? []).length ? (logs ?? []).map((log) => (
                    <tr key={log.id}>
                      <td>{formatAuditTime(log.created_at)}</td>
                      <td>{log.actor_user_id ? actorById.get(log.actor_user_id) || "Tài khoản không còn hoạt động" : "Hệ thống"}</td>
                      <td><span className="status-pill">{actionLabels[log.action] || log.action}</span></td>
                      <td>
                        <strong>{log.table_name}</strong>
                        <small className="table-secondary">{log.record_id ? `#${String(log.record_id).slice(0, 8)}` : "Không có mã bản ghi"}</small>
                      </td>
                      <td className="table-note">{metadataKeys(log.metadata as AuditMetadata)}</td>
                    </tr>
                  )) : (
                    <tr><td className="empty-cell" colSpan={5}>Chưa có sự kiện phù hợp.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <nav aria-label="Phân trang nhật ký" className="pagination">
              {page > 1 ? <Link href={pageHref(page - 1, action, table)}>← Trang trước</Link> : <span />}
              {page < totalPages ? <Link href={pageHref(page + 1, action, table)}>Trang sau →</Link> : <span />}
            </nav>
          </>
        )}
      </section>
    </>
  );
}
