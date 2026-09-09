import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { can, requireModuleAccess } from "@/lib/auth";
import { answerText, questionTypes, type Survey, type SurveyResponse } from "@/lib/surveys";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { access, supabase } = await requireModuleAccess("surveys");
  if (!can(access, "surveys.view") || !can(access, "reports.surveys.export")) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  const { data, error } = await supabase.from("company_surveys").select("*").eq("id", id).maybeSingle();
  if (error) return new NextResponse("Chưa tải được khảo sát.", { status: 503 });
  if (!data) return new NextResponse("Not found", { status: 404 });
  const survey = data as Survey; const rows: SurveyResponse[] = [];
  // A fixed cutoff and append-only response rows keep page boundaries stable.
  const cutoff = new Date().toISOString();
  for (let offset = 0; offset <= 10000; offset += 500) {
    const result = await supabase.from("survey_responses").select("id,full_name,phone,email,answers,submitted_at").eq("survey_id", id).lte("submitted_at", cutoff).order("submitted_at").order("id").range(offset, offset + 499);
    if (result.error) return new NextResponse("Chưa xuất đủ dữ liệu. Vui lòng thử lại.", { status: 503 });
    if (offset === 10000 && result.data.length) return new NextResponse("Dữ liệu vượt giới hạn xuất.", { status: 422 });
    rows.push(...result.data as SurveyResponse[]); if (result.data.length < 500) break;
  }
  const workbook = new ExcelJS.Workbook(); workbook.creator = "TDW";
  const summary = workbook.addWorksheet("Tong hop"); summary.columns = [{ width: 65 }, { width: 80 }];
  summary.addRows([["KHẢO SÁT", survey.title], ["Lời giới thiệu", survey.description], ["Số phản hồi", rows.length], ["Thời điểm xuất (VN)", new Date(cutoff).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })], ["Bảo mật", "Chứa thông tin liên hệ của nhân viên. Chỉ sử dụng trong phạm vi quản lý khảo sát."], []]);
  for (const [index, question] of survey.questions.entries()) {
    summary.addRow([`${index + 1}. ${question.title}`, questionTypes[question.type]]);
    const answered = rows.filter((r) => !!answerText(r.answers[question.id]).trim());
    summary.addRow(["Số người trả lời", answered.length]);
    if (["single", "multiple"].includes(question.type)) {
      for (const option of question.options) summary.addRow([option, answered.filter((r) => Array.isArray(r.answers[question.id]) ? (r.answers[question.id] as string[]).includes(option) : String(r.answers[question.id]) === option).length]);
    }
    summary.addRow([]);
  }
  const sheet = workbook.addWorksheet("Cau tra loi");
  sheet.columns = [{ header: "Họ tên", width: 28 }, { header: "Số điện thoại", width: 20 }, { header: "Email", width: 32 }, { header: "Ngày gửi (VN)", width: 26 }, ...survey.questions.map((q, i) => ({ header: `${i + 1}. ${q.title}`, width: 45 }))];
  for (const row of rows) sheet.addRow([row.full_name, row.phone, row.email, new Date(row.submitted_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }), ...survey.questions.map((q) => answerText(row.answers[q.id]))]);
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: 4 + survey.questions.length } };
  for (const ws of [summary, sheet]) {
    ws.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E6E8E" } }; });
  }
  return new NextResponse(await workbook.xlsx.writeBuffer() as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="Khao_sat_${id.slice(0, 8)}.xlsx"`, "Cache-Control": "private, no-store" } });
}
