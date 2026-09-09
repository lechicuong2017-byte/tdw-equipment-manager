import ExcelJS from "exceljs";
import { questionSchema, type Question } from "@/lib/surveys";

export type QuestionImportRow = { row: number; question?: Question; error?: string };
// Only plain cell values: never evaluate workbook formulas or external links.
function cellText(cell: ExcelJS.Cell) {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((p) => p.text).join("").trim();
    throw new Error("Không dùng công thức, ngày tháng hoặc liên kết trong ô câu hỏi.");
  }
  return String(v).trim();
}
export async function parseQuestionWorkbook(buffer: ArrayBuffer): Promise<QuestionImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("File không có sheet dữ liệu.");
  const headers = ["Câu hỏi", "Loại", "Lựa chọn", "Bắt buộc"];
  if (headers.some((h, i) => cellText(sheet.getRow(1).getCell(i + 1)) !== h)) throw new Error("Tiêu đề chưa đúng. Hãy dùng file mẫu: Câu hỏi, Loại, Lựa chọn, Bắt buộc.");
  if (sheet.actualRowCount > 101 || sheet.rowCount > 1000) throw new Error("Mỗi lần nhập tối đa 100 câu hỏi.");
  const rows: QuestionImportRow[] = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    try {
      const values = [1, 2, 3, 4].map((i) => cellText(row.getCell(i)));
      if (values.every((v) => !v)) return;
      const required = values[3].toLocaleLowerCase("vi");
      if (!["có", "không", "true", "false", "1", "0"].includes(required)) throw new Error("Bắt buộc: nhập Có hoặc Không.");
      const parsed = questionSchema.safeParse({ id: crypto.randomUUID(), title: values[0], type: values[1].toLowerCase(), options: values[2] ? values[2].split("|").map((v) => v.trim()) : [], required: ["có", "true", "1"].includes(required) });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      rows.push({ row: number, question: parsed.data });
    } catch (e) { rows.push({ row: number, error: e instanceof Error ? e.message : "Dữ liệu không hợp lệ." }); }
  });
  if (!rows.length) throw new Error("File không có câu hỏi.");
  return rows;
}
