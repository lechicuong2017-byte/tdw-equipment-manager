import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { can, requireModuleAccess } from "@/lib/auth";
import { SurveyControls, ResponseDetail } from "@/components/survey-controls";
import { questionTypes, surveyStatuses, type Survey, type SurveyResponse } from "@/lib/surveys";
export const metadata = { title: "Quản lý khảo sát" };

export default async function SurveyDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { access, supabase } = await requireModuleAccess("surveys");
  if (!can(access, "surveys.view")) return <p>Bạn chưa có quyền xem khảo sát.</p>;
  const { id } = await params; if (!z.uuid().safeParse(id).success) notFound();
  const raw = await searchParams; const page = Math.max(1, Math.min(500, Math.floor(Number(raw.page) || 1)));
  const [surveyResult, results] = await Promise.all([
    supabase.from("company_surveys").select("*").eq("id", id).maybeSingle(),
    supabase.from("survey_responses").select("id,full_name,phone,email,answers,submitted_at", { count: "exact" }).eq("survey_id", id).order("submitted_at", { ascending: false }).order("id").range((page - 1) * 20, page * 20 - 1),
  ]);
  if (surveyResult.error) throw new Error("Chưa tải được khảo sát. Hãy thử lại.");
  if (!surveyResult.data) notFound();
  const survey = surveyResult.data as Survey; const pages = Math.max(1, Math.ceil((results.count || 0) / 20));
  return <div className="survey-workspace"><Link className="survey-back" href="/surveys">← Danh sách khảo sát</Link><header className="survey-heading"><div><p className="eyebrow">QUẢN LÝ KHẢO SÁT</p><h1>{survey.title}</h1><p className="survey-description muted">{survey.description}</p></div><span className={`survey-status survey-status-${survey.status}`}>{surveyStatuses[survey.status]}</span></header>
    <div className="survey-metrics"><section className="panel"><small>Phản hồi đã nhận</small><strong>{survey.response_count}</strong></section><section className="panel"><small>Câu hỏi</small><strong>{survey.questions.length}</strong></section><section className="panel"><small>Ngày tạo</small><strong>{new Date(survey.created_at).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</strong></section></div>
    <section className="panel survey-sharing"><h2>Chia sẻ & quản lý</h2><p className="muted">{survey.status === "draft" ? "Kiểm tra câu hỏi rồi mở khảo sát để lấy link gửi nhân viên." : "Chỉ người có quyền trong phân hệ này được xem thông tin liên hệ và kết quả. Không chia sẻ file kết quả ngoài phạm vi cần thiết."}</p><SurveyControls survey={survey} manage={can(access, "surveys.manage")} exportable={can(access, "reports.surveys.export")}/></section>
    <section className="panel"><div className="survey-list-heading"><h2>Phản hồi từ nhân viên</h2><span className="muted">20 dòng/trang</span></div>{results.error ? <p className="form-error">Chưa tải được phản hồi. Vui lòng thử lại.</p> : <><div className="table-wrap survey-results"><table><thead><tr><th>Nhân viên</th><th>Số điện thoại</th><th>Email</th><th>Ngày gửi</th><th>Chi tiết</th></tr></thead><tbody>{(results.data as SurveyResponse[] || []).map((r) => <tr key={r.id}><td><strong>{r.full_name}</strong></td><td>{r.phone || "—"}</td><td>{r.email || "—"}</td><td>{new Date(r.submitted_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</td><td><ResponseDetail row={r} survey={survey}/></td></tr>)}{!results.data?.length && <tr><td colSpan={5}>Chưa có phản hồi. Kết quả sẽ xuất hiện sau khi nhân viên gửi khảo sát.</td></tr>}</tbody></table></div>{pages > 1 && <nav className="survey-pagination" aria-label="Phân trang phản hồi">{page > 1 ? <Link href={`/surveys/${id}?page=${page - 1}`}>← Trang trước</Link> : <span/>}<span>Trang {page}/{pages}</span>{page < pages ? <Link href={`/surveys/${id}?page=${page + 1}`}>Trang sau →</Link> : <span/>}</nav>}</>}</section>
    <details className="panel survey-question-overview"><summary>Nội dung khảo sát · {survey.questions.length} câu hỏi</summary>{survey.questions.map((q, i) => <div className="survey-answer-detail" key={q.id}><strong>{i + 1}. {q.title}</strong><p>{questionTypes[q.type]} · {q.required ? "Bắt buộc" : "Tùy chọn"}</p>{!!q.options.length && <p>{q.options.join(" · ")}</p>}</div>)}</details>
  </div>;
}
