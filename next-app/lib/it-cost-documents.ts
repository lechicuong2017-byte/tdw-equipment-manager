import { emptyItLine, type ItLine } from "./it-costs";
export type ItTextSource = { ref: string; text: string; ocr: boolean };
export type ItDocumentDraft = {
  provider: string;
  number: string;
  series: string;
  issuer_tax_code: string;
  issued_on: string;
  reference: string;
  total_amount: number | null;
  lines: ItLine[];
  warnings: string[];
};
const folded = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
export function parseItMoney(s: string): number | null {
  let v = s
    .trim()
    .replace(/(?:VND|VNĐ|VNÐ|đ|₫)/gi, "")
    .replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(v)) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(v)) v = v.replace(/[.,]/g, "");
  else if (/^\d+([.,]\d{1,2})$/.test(v)) v = v.replace(",", ".");
  else if (/^\d{1,3}([.,]\d{3})+[.,]\d{1,2}$/.test(v)) {
    const last = Math.max(v.lastIndexOf("."), v.lastIndexOf(","));
    v = v.slice(0, last).replace(/[.,]/g, "") + "." + v.slice(last + 1);
  } else if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) && n <= 100_000_000_000 ? n : null;
}
function dateValue(s: string) {
  const m = s.match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](20\d{2})/);
  if (!m) return "";
  const v = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
    ? v
    : "";
}
function amountAfter(text: string, pattern: RegExp) {
  const m = folded(text).replaceAll("|", " ").match(pattern);
  return m ? parseItMoney(m[1]) : null;
}
// Conservative label-based suggestions. Unknown amounts remain NaN (blank in UI), never silently zero.
export function draftItDocument(sources: ItTextSource[]): ItDocumentDraft {
  const text = sources.map((s) => s.text).join("\n"),
    t = folded(text);
  const field = (p: RegExp) => t.match(p)?.[1]?.trim() || "";
  const total = amountAfter(
    text,
    /(?:tong\s*(?:cong\s*)?(?:tien\s*)?thanh\s*toan|(?:tong\s*)?gia\s*tri\s*hop dong|tong cong)\s*[:：]?\s*([\d][\d., ]+)/i,
  );
  const before = amountAfter(
    text,
    /(?:cong tien hang|tong tien truoc thue|tong cong truoc thue)\s*[:：]?\s*([\d][\d., ]+)/i,
  );
  const vat = amountAfter(
    text,
    /(?:tien thue GTGT|tien thue VAT|thue GTGT)\s*(?:\d+\s*%)?\s*[:：]?\s*([\d][\d., ]+)/i,
  );
  const lines: ItLine[] = [];
  for (let p = 0; p < sources.length; p++) {
    const rows = sources[p].text.split("\n");
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i],
        f = folded(row);
      const grouped =
        row.match(/\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?\b/g) || [];
      const datedRow =
        /\b\d{1,2}\/\d{1,2}\/20\d{2}\b/.test(row) && grouped.length >= 2;
      if (
        (!/(hosting|ssl|ten mien|domain|email server|metronet|cap quang|vps|may chu)/i.test(
          f,
        ) &&
          !datedRow) ||
        /(tong cong|tong tien|thanh toan|ben a|ben b)/i.test(f)
      )
        continue;
      // DOCX cells or PDF columns retain separators. Only explicit row totals are suggested.
      const cells = row.split(/\s*\|\s*|\t+/);
      let amounts = cells
        .map(parseItMoney)
        .filter((n): n is number => n !== null);
      if (amounts.length < 2 && grouped.length >= 2)
        amounts = grouped
          .map(parseItMoney)
          .filter((n): n is number => n !== null);
      if (!amounts.length) continue;
      const l = emptyItLine();
      l.description = row.slice(0, 2000);
      l.source_key = `p${p + 1}-r${i + 1}`;
      l.source_ref = sources[p].ref + ` · dòng ${i + 1}`;
      l.amount_before_tax = NaN;
      l.tax_amount = NaN;
      l.amount_after_tax = amounts[amounts.length - 1];
      if (amounts.length >= 3) {
        const [b, v, a] = amounts.slice(-3);
        if (Math.abs(b + v - a) <= 1) {
          l.amount_before_tax = b;
          l.tax_amount = v;
        }
      }
      const dates = row.match(/\b\d{1,2}[/.]\d{1,2}[/.]20\d{2}\b/g) || [];
      if (dates.length >= 2) {
        l.starts_on = dateValue(dates[0] || "");
        l.expires_on = dateValue(dates[1] || "");
      } else if (dates.length === 1 && datedRow)
        l.expires_on = dateValue(dates[0] || "");
      lines.push(l);
    }
  }
  if (!lines.length) {
    const l = emptyItLine();
    l.description =
      text
        .split("\n")
        .find((s) =>
          /(hosting|ssl|ten mien|domain|metronet|may chu)/i.test(folded(s)),
        )
        ?.slice(0, 2000) || "";
    l.source_key = "document-total";
    l.source_ref = "Tổng chứng từ · cần đối chiếu";
    l.amount_before_tax = before ?? NaN;
    l.tax_amount = vat ?? NaN;
    l.amount_after_tax = total ?? NaN;
    lines.push(l);
  }
  return {
    provider: "",
    number: field(
      /(?:so hop dong|hop dong so|so hoa don)\s*[:：]?\s*([A-Z0-9/._-]+)/i,
    ),
    series: field(/ky hieu\s*[:：]?\s*([A-Z0-9/._-]+)/i),
    issuer_tax_code: field(/ma so thue\s*[:：]?\s*(\d[\d-]+)/i),
    issued_on: dateValue(
      field(/(?:ngay lap|ngay hoa don)\s*[:：]?\s*([\d/.-]+)/i),
    ),
    reference: field(
      /(?:theo|can cu)\s*(?:hop dong)\s*(?:so)?\s*[:：]?\s*([A-Z0-9/._-]+)/i,
    ),
    total_amount: total,
    lines: lines.slice(0, 200),
    warnings: [
      "Kiểm tra từng dòng, thuế và ngày từ chứng từ trước khi lưu. Các ô trống chưa được nhận diện.",
      ...(sources.some((s) => s.ocr)
        ? [
            "Tệp có bản scan: OCR có thể đọc sai số, dấu và bảng. Hãy đối chiếu bản gốc.",
          ]
        : []),
      ...(lines.length === 1
        ? [
            "Nếu chứng từ gồm nhiều dịch vụ, tách thêm từng dòng và gán đúng danh mục.",
          ]
        : []),
    ],
  };
}
// Validate ZIP central-directory sizes before inflating DOCX, including hidden media.
export function checkDocxArchive(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("DOCX không phải tệp ZIP hợp lệ.");
  const count = view.getUint16(end + 10, true),
    offset = view.getUint32(end + 16, true);
  let cursor = offset,
    total = 0;
  if (count > 1000) throw new Error("DOCX có quá nhiều thành phần.");
  for (let i = 0; i < count; i++) {
    if (
      cursor + 46 > bytes.length ||
      view.getUint32(cursor, true) !== 0x02014b50
    )
      throw new Error("Cấu trúc DOCX không hợp lệ.");
    if (view.getUint16(cursor + 8, true) & 1)
      throw new Error("Không nhận DOCX mã hóa.");
    const size = view.getUint32(cursor + 24, true);
    total += size;
    if (size > 20 * 1024 * 1024 || total > 60 * 1024 * 1024)
      throw new Error("DOCX giải nén vượt giới hạn 60 MB.");
    cursor +=
      46 +
      view.getUint16(cursor + 28, true) +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true);
  }
}
