import Link from "next/link";
import { can, requireModuleAccess } from "@/lib/auth";
import { AppIcon } from "@/components/app-icon";
import { surveyStatuses, type Survey } from "@/lib/surveys";
export const metadata = { title: "Khảo sát công ty" };

export default async function SurveysPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { access, supabase } = await requireModuleAccess("surveys");
  if (!can(access, "surveys.view")) return <p>Bạn chưa được cấp quyền xem khảo sát.</p>;
  const raw = await searchParams; const page = Math.max(1, Math.min(10000, Math.floor(Number(raw.page) || 1)));
  const status = Object.hasOwn(surveyStatuses, raw.status || "") ? raw.status! : "";
  let query = supabase.from("company_surveys").select("id,title,description,status,response_count,created_at", { count: "exact" });
  if (status) query = query.eq("status", status);
  const { data, count, error } = await query.order("created_at", { ascending: false }).order("id").range((page - 1) * 20, page * 20 - 1);
  const pages = Math.max(1, Math.ceil((count || 0) / 20));
  return <div className="survey-workspace"><header className="survey-heading"><div><p className="eyebrow">LẮNG NGHE & KẾT NỐI</p><h1>Khảo sát công ty</h1><p className="muted">Một nơi để đặt câu hỏi, lắng nghe và tổng hợp ý kiến nhân viên.</p></div>{can(access, "surveys.manage") && <Link className="primary-button" href="/surveys/new">+ Tạo khảo sát</Link>}</header>
    <section className="survey-banner"><span className="survey-banner-icon"><AppIcon name="inspection" size={36}/></span><div><h2>Từ câu hỏi đến những thay đổi tích cực</h2><p>Soạn câu hỏi hoặc nhập Excel → Chia sẻ link → Thu thập và xuất kết quả.</p></div><span className="survey-count">Không cần tài khoản để trả lời</span></section>
    <nav className="survey-tabs" aria-label="Lọc khảo sát"><Link aria-current={!status ? "page" : undefined} href="/surveys">Tất cả</Link>{Object.entries(surveyStatuses).map(([key, label]) => <Link aria-current={status === key ? "page" : undefined} href={`/surveys?status=${key}`} key={key}>{label}</Link>)}</nav>
    <div className="survey-list-heading"><h2>Danh sách khảo sát</h2><p className="muted">{count || 0} khảo sát · 20 khảo sát/trang</p></div>
    {error ? <p className="form-error" role="alert">Chưa tải được khảo sát. Vui lòng tải lại trang.</p> : !data?.length ? <section className="panel survey-empty"><AppIcon name="inspection" size={42}/><h2>Chưa có khảo sát {status ? "ở trạng thái này" : "nào"}</h2><p>{can(access, "surveys.manage") ? "Tạo khảo sát đầu tiên để bắt đầu lắng nghe ý kiến nhân viên." : "Khảo sát sẽ xuất hiện tại đây khi được tạo."}</p></section> : <div className="survey-card-grid">{(data as Survey[]).map((s) => <Link className="panel survey-card" key={s.id} href={`/surveys/${s.id}`}><div className="survey-card-top"><span className={`survey-status survey-status-${s.status}`}>{surveyStatuses[s.status]}</span><AppIcon name="inspection"/></div><h2>{s.title}</h2><p>{s.description || "Chưa có lời giới thiệu."}</p><div className="survey-card-bottom"><span><strong>{s.response_count}</strong> phản hồi</span><span>Quản lý khảo sát →</span></div></Link>)}</div>}
    {pages > 1 && <nav className="survey-pagination" aria-label="Phân trang khảo sát">{page > 1 ? <Link href={`/surveys?status=${status}&page=${page - 1}`}>← Trang trước</Link> : <span/>}<span>Trang {page}/{pages}</span>{page < pages ? <Link href={`/surveys?status=${status}&page=${page + 1}`}>Trang sau →</Link> : <span/>}</nav>}
  </div>;
}
