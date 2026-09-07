import type { Worksheet, CellValue } from "exceljs";
import { cleanPhone, phoneSchema, type PhonePreview } from "./telecom-phones";

function text(value: CellValue): string {
  if (value == null) return "";
  if (typeof value === "object") {
    if ("result" in value) return text(value.result as CellValue);
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value) return value.text;
    return "";
  }
  return String(value).trim();
}
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases = { phone: ["telnumber", "sodienthoai", "sothuebao", "phone"], location: ["position", "vitrilapdat", "vitri", "location"], serial: ["serialnumber", "serial", "malogger"], replacement_phone: ["newtelnumber", "sothaythe", "sodienthoaimoi"], status: ["openclose", "trangthai", "status"], note: ["note", "ghichu"] };

export function parsePhoneSheet(sheet: Worksheet): PhonePreview[] {
  let header = 0; const columns: Record<string, number> = {};
  for (let i = 1; i <= Math.min(sheet.rowCount, 30); i++) {
    const found: Record<string, number> = {};
    sheet.getRow(i).eachCell((cell, col) => {
      const label = normalize(text(cell.value));
      for (const [field, names] of Object.entries(aliases)) if (names.includes(label)) found[field] = col;
    });
    if (found.phone) { Object.assign(columns, found); header = i; break; }
  }
  if (!header) throw new Error("Không tìm thấy cột Số điện thoại / TEL. NUMBER trong sheet.");
  if (sheet.rowCount > 5000) throw new Error("Mỗi sheet tối đa 5.000 dòng; vui lòng chia nhỏ file.");
  const result: PhonePreview[] = []; const seen = new Set<string>();
  for (let row = header + 1; row <= sheet.rowCount; row++) {
    const get = (key: string) => columns[key] ? text(sheet.getRow(row).getCell(columns[key]).value) : "";
    if (!get("phone") || /^(tong|total)/.test(normalize(get("phone")))) continue;
    const rawStatus = normalize(get("status"));
    const status = ["open", "active", "dangsudung"].includes(rawStatus) ? "active" : ["close", "closed", "inactive", "ngungsudung"].includes(rawStatus) ? "inactive" : ["huy", "dahuy", "cancelled"].includes(rawStatus) ? "cancelled" : "unknown";
    const input = { phone: cleanPhone(get("phone")), location: get("location"), serial: get("serial"), replacement_phone: cleanPhone(get("replacement_phone")), status, note: get("note") };
    const parsed = phoneSchema.safeParse(input);
    const warnings = [!input.location ? "Thiếu vị trí" : "", status === "unknown" ? "Kiểm tra trạng thái" : "", /huy/.test(normalize(input.note)) && status !== "cancelled" ? "Ghi chú có HỦY: kiểm tra trạng thái" : "", typeof sheet.getRow(row).getCell(columns.phone).value === "number" ? "Số lưu dạng số trong Excel: kiểm tra số 0 đầu" : ""].filter(Boolean);
    const duplicate = seen.has(input.phone); seen.add(input.phone);
    result.push({ ...input, status, row, warning: warnings.join(" · "), error: parsed.success ? "" : "Số điện thoại hoặc độ dài dữ liệu không hợp lệ", duplicate });
  }
  return result;
}
