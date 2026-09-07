import { z } from "zod";

export const telecomCategories = [
  {code:"pipeline",label:"Tuyến ống & ICCPs"},
  {code:"landline",label:"Điện thoại bàn"},
  {code:"director",label:"Điện thoại TGĐ"},
] as const;
export const telecomCategorySchema=z.enum(["pipeline","landline","director"]);
export type TelecomCategory=z.infer<typeof telecomCategorySchema>;
export const telecomCategoryLabel=(code:string)=>telecomCategories.find((c)=>c.code===code)?.label||code;

const money = z.number().finite().min(0).max(100_000_000_000).multipleOf(0.01);

// PDFs may store text in drawing order (right-to-left columns in MobiFone).
// Reconstruct visual lines before reading labels and invoice totals.
export function telecomPageText(items: {str:string;transform:number[]}[]) {
  const lines: {y:number;items:typeof items}[]=[];
  for(const item of [...items].filter((i)=>i.str.trim()).sort((a,b)=>b.transform[5]-a.transform[5])) {
    const y=item.transform[5];
    const line=lines.find((l)=>Math.abs(l.y-y)<3);
    if(line)line.items.push(item);else lines.push({y,items:[item]});
  }
  return lines.map((l)=>l.items.sort((a,b)=>a.transform[4]-b.transform[4]).map((i)=>i.str).join(" ")).join("\n");
}
export const telecomInvoiceSchema = z.object({
  page: z.number().int().min(1).max(200),
  provider: z.string().trim().min(1).max(200),
  issuer_tax_code: z.string().regex(/^\d{10}(?:-?\d{3})?$/),
  invoice_series: z.string().trim().min(1).max(30),
  invoice_number: z.string().regex(/^\d{1,20}$/),
  issued_on: z.iso.date(),
  period_month: z.iso.date().refine((s) => s.endsWith("-01") && s >= "2000-01-01" && s < "2101-01-01"),
  subscriber: z.string().regex(/^\+?\d{6,20}$/),
  contract_number: z.string().trim().max(150),
  service: z.string().trim().min(1).max(200),
  amount_before_tax: money,
  tax_amount: money,
  amount_after_tax: money,
}).refine((r) => Math.abs(r.amount_before_tax + r.tax_amount - r.amount_after_tax) <= 1, "Tổng thanh toán không khớp tiền dịch vụ và thuế.");
export type TelecomInvoiceInput = z.infer<typeof telecomInvoiceSchema>;
export type TelecomPreviewRow = TelecomInvoiceInput & {
  key: string;
  status: "new" | "saved" | "duplicate" | "conflict";
};

export function telecomInvoiceKey(row: Pick<TelecomInvoiceInput, "issuer_tax_code" | "invoice_series" | "invoice_number">) {
  return [row.issuer_tax_code, row.invoice_series.toUpperCase(), row.invoice_number.replace(/^0+(?=\d)/, "")].join("|");
}

function dateFromParts(value: string) {
  const [day, month, year] = value.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// Parse invoice totals rather than summing service lines and counting VAT twice.
// Keep the printed subscriber identifier; older SIM numbers must not be guessed.
export function parseTelecomInvoice(text: string, page: number): TelecomInvoiceInput {
  const t = text.normalize("NFC").replace(/\s+/g, " ").trim();
  const field = (pattern: RegExp) => t.match(pattern)?.[1]?.trim() || "";
  if (!/HÓA ĐƠN DỊCH VỤ VIỄN THÔNG/i.test(t)) throw new Error(`Trang ${page}: chưa nhận diện được mẫu hóa đơn viễn thông.`);
  if (/VIỄN THÔNG MOBIFONE/i.test(t)) {
    const dates=t.match(/Cước từ ngày\s*\(Charging from\)\s*:\s*(\d{2}\/\d{2}\/\d{4})\s*đến ngày\s*\(to\)\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
    const issued=t.match(/Ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i);
    const amounts=t.match(/CỘNG\s*\(TOTAL\)\s*:\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
    const parsed=telecomInvoiceSchema.safeParse({
      page,provider:"MobiFone",issuer_tax_code:field(/Mã số thuế\s*\(taxcode\)\s*:\s*([\d-]+)/i),
      invoice_series:field(/Ký hiệu\s*\(Serial No\)\s*:\s*([A-Z0-9]+)/i).toUpperCase(),
      invoice_number:field(/Số\s*\(No\)\s*:\s*(\d+)/i),
      issued_on:issued?dateFromParts(`${issued[1]}/${issued[2]}/${issued[3]}`):"",
      period_month:dates?`${dateFromParts(dates[1]).slice(0,7)}-01`:"",
      subscriber:field(/Số thuê bao\s*\(Sub No\)\s*:\s*(\+?\d+)/i),contract_number:"",
      service:field(/\b1\s+(Cước dịch vụ.*?)\s+[\d.]+\s+\d+%/i),
      amount_before_tax:amounts?Number(amounts[1].replaceAll(".","")):-1,
      tax_amount:amounts?Number(amounts[2].replaceAll(".","")):-1,
      amount_after_tax:amounts?Number(amounts[3].replaceAll(".","")):-1,
    });
    if(!parsed.success || !dates || !z.iso.date().safeParse(dateFromParts(dates[1])).success || !z.iso.date().safeParse(dateFromParts(dates[2])).success
      || dates[1].slice(3)!==dates[2].slice(3) || dateFromParts(dates[1])>dateFromParts(dates[2]))
      throw new Error(`Trang ${page}: chưa đọc đủ thông tin MobiFone hoặc kỳ cước trải qua nhiều tháng. Hãy kiểm tra hóa đơn.`);
    return parsed.data;
  }
  const period = t.match(/Kỳ cước\s*:\s*Tháng\s*(\d{1,2})\s*\/\s*(\d{4})/i);
  const totals = t.match(/(?:^|\s)CỘNG\s+([\d.]+)\s+([\d.]+)\s+(?:TỔNG CỘNG TIỀN THANH TOÁN\s+)?([\d.]+)(?=\s|$)/);
  const subscriberText = field(/Số thuê bao\s*:\s*(.*?)\s*Kỳ cước/i);
  const subscriber = subscriberText.match(/^(?:Đại diện\s*\(\s*)?(\+?\d{6,20})\s*\)?$/i)?.[1] || "";
  const issued = field(/Ngày lập\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const service = t.match(/\b1\s+(Dịch vụ.*?)\s+0?1\s+[\d.]+\s+[\d.,]+%/i)?.[1] || "";
  // This template represents one subscriber per invoice. Aggregate/unknown
  // templates must be reviewed rather than assigning all costs to one SIM.
  const parsed = telecomInvoiceSchema.safeParse({
    page,
    provider: /VIỄN THÔNG QUÂN ĐỘI/i.test(t) ? "Viettel" : "",
    issuer_tax_code: field(/Mã số thuế\s*:\s*([\d-]+)/i),
    invoice_series: field(/Ký hiệu\s*:\s*([A-Z0-9]+)/i).toUpperCase(),
    invoice_number: field(/(?:^|\s)Số\s*:\s*(\d+)/),
    issued_on: issued ? dateFromParts(issued) : "",
    period_month: period ? `${period[2]}-${period[1].padStart(2, "0")}-01` : "",
    subscriber,
    contract_number: field(/Số hợp đồng\s*:\s*(.*?)\s*Hình thức thanh toán/i),
    service,
    amount_before_tax: totals ? Number(totals[1].replaceAll(".", "")) : -1,
    tax_amount: totals ? Number(totals[2].replaceAll(".", "")) : -1,
    amount_after_tax: totals ? Number(totals[3].replaceAll(".", "")) : -1,
  });
  if (!parsed.success) throw new Error(`Trang ${page}: thiếu thông tin thuê bao/kỳ cước hoặc tổng tiền không hợp lệ. Hãy kiểm tra hóa đơn.`);
  return parsed.data;
}

export function telecomPeriod(year: number, month?: number) {
  return {
    start: `${year}-${String(month || 1).padStart(2, "0")}-01`,
    end: month && month < 12 ? `${year}-${String(month + 1).padStart(2, "0")}-01` : `${year + 1}-01-01`,
  };
}

export const telecomFilterSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  category: telecomCategorySchema.optional(),
});
