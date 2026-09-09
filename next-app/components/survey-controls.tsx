"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useActionToast } from "@/components/action-toast";
import { AppModal } from "@/components/app-modal";
import { changeSurveyStatus } from "@/app/(protected)/surveys/actions";
import { answerText, type Survey, type SurveyResponse } from "@/lib/surveys";

export function SurveyControls({ survey, manage, exportable }: { survey: Survey; manage: boolean; exportable: boolean }) {
  const [pending, startTransition] = useTransition(); const [confirm, setConfirm] = useState(false);
  const [link, setLink] = useState(""); const { showToast } = useActionToast(); const router = useRouter();
  return <div className="survey-controls"><div className="survey-inline">
    {manage && <Link className="secondary-button" href={`/surveys/${survey.id}/edit`}>Chỉnh sửa</Link>}
    {exportable && <a className="secondary-button" href={`/api/surveys/${survey.id}/export`}>Xuất kết quả Excel</a>}
    {survey.status === "open" && <><button className="secondary-button" onClick={async () => { const url = `${window.location.origin}/s/${survey.public_token}`; setLink(url); try { await navigator.clipboard.writeText(url); showToast("Đã sao chép link khảo sát."); } catch { showToast("Bạn có thể sao chép link hiển thị bên dưới.", "info"); } }}>Sao chép link</button><a className="secondary-button" href={`/s/${survey.public_token}`} target="_blank" rel="noreferrer">Mở trang trả lời ↗</a></>}
    {manage && <button className={survey.status === "open" ? "secondary-button" : "primary-button"} disabled={pending} onClick={() => setConfirm(true)}>{pending ? "Đang cập nhật…" : survey.status === "open" ? "Đóng khảo sát" : "Mở nhận phản hồi"}</button>}
  </div>{link && <label className="survey-share-link">Link gửi nhân viên<input value={link} readOnly onFocus={(e) => e.target.select()}/></label>}
    <AppModal open={confirm} onClose={() => setConfirm(false)} title={survey.status === "open" ? "Đóng nhận phản hồi?" : "Mở khảo sát?"} size="small"><div className="survey-import"><p>{survey.status === "open" ? "Nhân viên sẽ không gửi được câu trả lời mới. Kết quả đã thu thập vẫn được giữ lại và có thể xuất Excel." : "Người có link có thể điền họ tên, điện thoại hoặc email để trả lời. Câu hỏi sẽ được khóa sau khi mở; không thể xác minh danh tính vì không yêu cầu đăng nhập."}</p><button disabled={pending} className="primary-button" onClick={() => startTransition(async () => { try { const result = await changeSurveyStatus(survey.id, survey.revision, survey.status === "open" ? "closed" : "open"); if (result.error) { showToast(result.error, "error"); return; } showToast(result.success!); setConfirm(false); router.refresh(); } catch { showToast("Chưa cập nhật được. Vui lòng thử lại.", "error"); } })}>{pending ? "Đang cập nhật…" : "Xác nhận"}</button></div></AppModal>
  </div>;
}
export function ResponseDetail({ row, survey }: { row: SurveyResponse; survey: Survey }) {
  const [open, setOpen] = useState(false);
  return <><button className="survey-text-button" onClick={() => setOpen(true)}>Xem trả lời</button><AppModal open={open} onClose={() => setOpen(false)} title={row.full_name} eyebrow="CHI TIẾT PHẢN HỒI" size="large"><div className="survey-import"><p className="muted">{row.phone || row.email} · {new Date(row.submitted_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>{survey.questions.map((q, i) => <section className="survey-answer-detail" key={q.id}><strong>{i + 1}. {q.title}</strong><p>{answerText(row.answers[q.id]) || "Không trả lời"}</p></section>)}</div></AppModal></>;
}
