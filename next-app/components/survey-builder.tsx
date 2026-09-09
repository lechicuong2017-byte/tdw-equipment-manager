"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/app-icon";
import { AppModal } from "@/components/app-modal";
import { useActionToast } from "@/components/action-toast";
import { saveSurvey } from "@/app/(protected)/surveys/actions";
import { questionTypes, surveySchema, type Question, type Survey } from "@/lib/surveys";
import type { QuestionImportRow } from "@/lib/survey-xlsx";

export function SurveyBuilder({ survey }: { survey?: Survey }) {
  const [title, setTitle] = useState(survey?.title || "");
  const [description, setDescription] = useState(survey?.description || "");
  const [questions, setQuestions] = useState<Question[]>(survey?.questions || []);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const [importOpen, setImportOpen] = useState(false);
  const router = useRouter(); const { showToast } = useActionToast();
  const locked = Boolean(survey?.published_at);
  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);
  const update = (index: number, patch: Partial<Question>) => { setDirty(true); setQuestions((rows) => rows.map((q, i) => i === index ? { ...q, ...patch } : q)); };
  const add = () => { setDirty(true); setQuestions((rows) => [...rows, { id: crypto.randomUUID(), title: "", type: "single", options: ["", ""], required: true }]); };
  const move = (index: number, delta: number) => { setDirty(true); setQuestions((rows) => { const next = [...rows]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; }); };
  const save = () => {
    const input = surveySchema.safeParse({ title, description, questions });
    if (!input.success) { setError(input.error.issues[0].message); return; }
    setError(""); startTransition(async () => {
      try {
        const result = await saveSurvey(input.data, survey?.id, survey?.revision);
        if (result.error) { setError(result.error); return; }
        setDirty(false); showToast("Đã lưu khảo sát."); router.push(`/surveys/${result.id}`); router.refresh();
      } catch { setError("Chưa lưu được khảo sát. Vui lòng thử lại."); }
    });
  };
  return <div className="survey-workspace">
    <Link className="survey-back" href={survey ? `/surveys/${survey.id}` : "/surveys"} onClick={(e) => { if (dirty && !window.confirm("Bạn có thay đổi chưa lưu. Rời trang?")) e.preventDefault(); }}>← {survey ? "Chi tiết khảo sát" : "Danh sách khảo sát"}</Link>
    <header className="survey-heading"><div><p className="eyebrow">THIẾT KẾ KHẢO SÁT</p><h1>{survey ? "Chỉnh sửa khảo sát" : "Bắt đầu từ một câu hỏi"}</h1><p className="muted">Câu hỏi rõ ràng, phản hồi có giá trị. Lưu bản nháp trước khi chia sẻ.</p></div><span className="survey-count">{questions.length}/100 câu hỏi</span></header>
    <fieldset disabled={pending} className="survey-editor-fields">
      <section className="panel survey-basics"><div className="survey-section-title"><span className="survey-step">01</span><div><h2>Thông tin chung</h2><p>Tên và lời giới thiệu sẽ hiển thị với nhân viên.</p></div></div>
        <label>Tên khảo sát <span aria-hidden="true">*</span><input value={title} onChange={(e) => { setDirty(true); setTitle(e.target.value); }} maxLength={200} placeholder="Ví dụ: Khảo sát trải nghiệm làm việc 2026"/></label>
        <label>Lời giới thiệu<textarea value={description} onChange={(e) => { setDirty(true); setDescription(e.target.value); }} maxLength={3000} rows={3} placeholder="Chia sẻ mục đích khảo sát và hướng dẫn cho người trả lời…"/></label>
      </section>
      <section className="survey-question-section"><div className="survey-section-title"><span className="survey-step">02</span><div><h2>Nội dung câu hỏi</h2><p>{locked ? "Đã khóa câu hỏi để giữ nguyên cấu trúc kết quả đã thu thập." : "Thêm thủ công hoặc nhập câu hỏi từ file Excel mẫu."}</p></div>{!locked && <button className="secondary-button" type="button" onClick={() => setImportOpen(true)}>Nhập Excel</button>}</div>
        {!questions.length && <div className="panel survey-empty"><AppIcon name="inspection" size={42}/><h2>Khảo sát của bạn đang chờ câu hỏi đầu tiên</h2><p>Hai dạng câu hỏi: điền thông tin và trắc nghiệm một hoặc nhiều đáp án.</p>{!locked && <button type="button" className="primary-button" onClick={add}>+ Thêm câu hỏi</button>}</div>}
        {questions.map((q, index) => <article className="panel survey-question" key={q.id}><div className="survey-question-top"><strong>Câu {String(index + 1).padStart(2, "0")}</strong>{!locked && <div className="survey-inline"><button type="button" className="survey-icon-button" aria-label={`Đưa câu ${index + 1} lên`} disabled={!index} onClick={() => move(index, -1)}>↑</button><button type="button" className="survey-icon-button" aria-label={`Đưa câu ${index + 1} xuống`} disabled={index === questions.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className="survey-icon-button survey-danger" aria-label={`Xóa câu ${index + 1}`} onClick={() => { if (window.confirm(`Xóa câu hỏi ${index + 1}?`)) { setDirty(true); setQuestions((rows) => rows.filter((r) => r.id !== q.id)); } }}>Xóa</button></div>}</div>
          <div className="survey-question-grid"><label>Nội dung câu hỏi<textarea disabled={locked} rows={2} value={q.title} maxLength={1000} onChange={(e) => update(index, { title: e.target.value })} placeholder="Bạn muốn hỏi điều gì?"/></label><div className="survey-question-kind"><label>Dạng câu hỏi<select disabled={locked} value={["single", "multiple"].includes(q.type) ? "choice" : "text"} onChange={(e) => update(index, { type: e.target.value === "choice" ? "single" : "short", options: e.target.value === "choice" ? ["", ""] : [] })}><option value="text">Điền thông tin</option><option value="choice">Trắc nghiệm</option></select></label><label>{["single", "multiple"].includes(q.type) ? "Cho phép trả lời" : "Độ dài câu trả lời"}<select disabled={locked} value={q.type} onChange={(e) => update(index, { type: e.target.value as Question["type"] })}>{(["single", "multiple"].includes(q.type) ? ["single", "multiple"] as const : ["short", "long"] as const).map((key) => <option value={key} key={key}>{questionTypes[key]}</option>)}</select></label></div></div>
          {["single", "multiple"].includes(q.type) && <div className="survey-options-editor">{q.options.map((option, i) => <div className="survey-option-edit" key={i}><span>{String.fromCharCode(65 + i)}</span><input aria-label={`Câu ${index + 1}, đáp án ${i + 1}`} disabled={locked} value={option} maxLength={300} onChange={(e) => update(index, { options: q.options.map((o, j) => j === i ? e.target.value : o) })} placeholder={`Đáp án ${i + 1}`}/>{!locked && <button type="button" className="survey-icon-button" disabled={q.options.length <= 2} aria-label={`Bỏ đáp án ${i + 1}`} onClick={() => update(index, { options: q.options.filter((_, j) => j !== i) })}>×</button>}</div>)}{!locked && <button type="button" className="secondary-button" disabled={q.options.length >= 20} onClick={() => update(index, { options: [...q.options, ""] })}>+ Thêm đáp án</button>}</div>}
          <label className="survey-check"><input disabled={locked} type="checkbox" checked={q.required} onChange={(e) => update(index, { required: e.target.checked })}/>Bắt buộc trả lời</label>
        </article>)}
        {!locked && questions.length > 0 && <button type="button" className="survey-add" disabled={questions.length >= 100} onClick={add}>+ Thêm câu hỏi</button>}
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="panel survey-editor-footer"><p>{locked ? "Bạn có thể cập nhật tên và lời giới thiệu." : "Lưu chưa phát hành khảo sát. Bạn sẽ mở nhận phản hồi ở bước tiếp theo."}</p><button type="button" className="primary-button" onClick={save}>{pending ? "Đang lưu…" : "Lưu khảo sát"}</button></footer>
    </fieldset>
    {importOpen && <AppModal open onClose={() => setImportOpen(false)} eyebrow="NHẬP CÂU HỎI" title="Câu hỏi từ Excel" size="wide"><QuestionImport remaining={100 - questions.length} onAdd={(rows) => { setQuestions((prev) => [...prev, ...rows]); setDirty(true); setImportOpen(false); showToast(`Đã thêm ${rows.length} câu hỏi vào bản nháp. Nhớ lưu khảo sát.`); }}/></AppModal>}
  </div>;
}

function QuestionImport({ remaining, onAdd }: { remaining: number; onAdd: (rows: Question[]) => void }) {
  const [rows, setRows] = useState<QuestionImportRow[]>([]); const [selected, setSelected] = useState<number[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const generation = useRef(0);
  const count = selected.length;
  return <div className="survey-import"><p>Dùng sheet đầu tiên, mỗi dòng là một câu hỏi. Điền thông tin: short (ngắn), long (đoạn văn). Trắc nghiệm: single (một đáp án), multiple (nhiều đáp án). Ngăn cách các đáp án bằng dấu |.</p><a className="secondary-button" href="/api/surveys/template">Tải file Excel mẫu</a>
    <label><span>File câu hỏi XLSX (tối đa 2 MB)</span><span className="app-file-picker"><input aria-label="Chọn file câu hỏi XLSX" type="file" accept=".xlsx" disabled={busy} onChange={async (e) => {
      const current = ++generation.current; const file = e.target.files?.[0]; setFileName(file?.name || ""); setRows([]); setSelected([]); setError("");
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 2 * 1024 * 1024) { setError("Chọn file XLSX tối đa 2 MB."); return; }
      setBusy(true);
      try { const { parseQuestionWorkbook } = await import("@/lib/survey-xlsx"); const result = await parseQuestionWorkbook(await file.arrayBuffer()); if (current === generation.current) { setRows(result); setSelected(result.filter((r) => r.question).map((r) => r.row)); } }
      catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : "Không đọc được file."); }
      finally { if (current === generation.current) setBusy(false); }
    }}/><strong>Chọn file XLSX</strong><em title={fileName}>{fileName || "Chưa chọn file"}</em></span></label>
    {busy && <p role="status">Đang đọc và kiểm tra câu hỏi…</p>}{error && <p role="alert" className="form-error">{error}</p>}
    {!!rows.length && <><div className="survey-inline"><button className="secondary-button" type="button" onClick={() => setSelected(rows.filter((r) => r.question).map((r) => r.row))}>Chọn hợp lệ</button><button className="secondary-button" type="button" onClick={() => setSelected([])}>Bỏ chọn</button><span>{count} câu đã chọn · Có thể thêm {remaining} câu</span></div><div className="table-wrap survey-preview"><table><thead><tr><th>Chọn</th><th>Dòng</th><th>Câu hỏi</th><th>Loại / đáp án</th><th>Kiểm tra</th></tr></thead><tbody>{rows.map((r) => <tr key={r.row}><td><input aria-label={`Chọn dòng ${r.row}`} type="checkbox" disabled={!r.question} checked={selected.includes(r.row)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, r.row] : s.filter((i) => i !== r.row))}/></td><td>{r.row}</td><td>{r.question?.title || "—"}</td><td>{r.question && <>{questionTypes[r.question.type]}<small>{r.question.options.join(" · ")}</small></>}</td><td>{r.error || (r.question?.required ? "Hợp lệ · bắt buộc" : "Hợp lệ · tùy chọn")}</td></tr>)}</tbody></table></div><div className="survey-editor-footer"><p>Câu hỏi đã chọn được thêm vào cuối bản nháp, không thay thế câu hỏi hiện có.</p><button className="primary-button" type="button" disabled={!count || count > remaining} onClick={() => onAdd(rows.filter((r) => selected.includes(r.row) && r.question).map((r) => r.question!))}>Thêm {count} câu hỏi</button></div></>}
  </div>;
}
