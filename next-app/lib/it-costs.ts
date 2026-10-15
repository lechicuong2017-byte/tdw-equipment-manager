import { z } from "zod";

// Shared by manual entry, document review, server validation and report filters.
export const itCategorySeeds = [
  ["domain", "Tên miền"],
  ["hosting", "Hosting website"],
  ["email", "Email hosting/server"],
  ["ssl", "SSL"],
  ["fiber", "Internet cáp quang"],
  ["metronet", "Metronet"],
  ["server", "Máy chủ / VPS / Cloud"],
  ["other", "Khác"],
] as const;
const uuid = z.uuid();
const optionalId = z.union([uuid, z.literal("")]).default("");
const date = z.iso.date().refine((v) => v >= "2000-01-01" && v <= "2100-12-31");
const optionalDate = z.union([date, z.literal("")]).default("");
const money = z.number().finite().min(0).max(100_000_000_000).multipleOf(0.01);
export const itServiceSchema = z.object({
  id: optionalId,
  version: z.number().int().positive().default(1),
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  category_id: uuid,
  identifier: z.string().trim().max(200).default(""),
  provider: z.string().trim().max(200).default(""),
  location: z.string().trim().max(300).default(""),
  note: z.string().trim().max(2000).default(""),
  status: z.enum(["active", "paused", "archived"]).default("active"),
});
export const itPeriodSchema = z
  .object({
    id: optionalId,
    version: z.number().int().positive().default(1),
    service_id: uuid,
    starts_on: date,
    expires_on: date,
    cycle: z.enum(["month", "quarter", "year", "custom"]).default("year"),
    remind_days: z.number().int().min(0).max(365).default(30),
    renewed_from_id: optionalId,
    status: z.enum(["active", "superseded", "cancelled"]).default("active"),
    allow_overlap: z.boolean().default(false),
    note: z.string().trim().max(2000).default(""),
  })
  .refine(
    (v) => v.expires_on >= v.starts_on,
    "Ngày hết hạn phải sau ngày bắt đầu.",
  );
export const itLineSchema = z
  .object({
    id: optionalId,
    category_id: uuid,
    service_id: optionalId,
    period_id: optionalId,
    description: z.string().trim().min(1).max(2000),
    unit: z.string().trim().max(50).default(""),
    quantity: z.number().positive().max(100000).default(1),
    unit_price: money.nullable().default(null),
    amount_before_tax: money,
    tax_amount: money,
    amount_after_tax: money,
    source_key: z.string().max(150).default(""),
    source_ref: z.string().max(200).default(""),
    new_service_name: z.string().trim().max(200).default(""),
    new_identifier: z.string().trim().max(200).default(""),
    starts_on: optionalDate,
    expires_on: optionalDate,
    allow_overlap: z.boolean().default(false),
  })
  .refine(
    (v) =>
      Math.abs(v.amount_before_tax + v.tax_amount - v.amount_after_tax) <= 1,
    "Tiền trước thuế + VAT chưa khớp tổng tiền.",
  )
  .refine(
    (v) =>
      (!v.starts_on && !v.expires_on) ||
      (!!v.starts_on && !!v.expires_on && v.expires_on >= v.starts_on),
    "Bổ sung đủ ngày bắt đầu / hết hạn của kỳ dịch vụ.",
  )
  .refine(
    (v) => !v.starts_on || !!v.service_id || !!v.new_service_name,
    "Chọn dịch vụ hoặc nhập tên dịch vụ mới trước khi tạo kỳ.",
  );
export const itEntrySchema = z
  .object({
    id: optionalId,
    version: z.number().int().positive().default(1),
    request_id: uuid,
    provider: z.string().trim().min(1).max(200),
    recognized_on: date,
    description: z.string().trim().max(2000).default(""),
    status: z.enum(["draft", "confirmed", "cancelled"]).default("confirmed"),
    payment_status: z
      .enum(["unconfirmed", "unpaid", "paid"])
      .default("unconfirmed"),
    paid_on: optionalDate,
    document_id: optionalId,
    discrepancy_reason: z.string().trim().max(1000).default(""),
    lines: z.array(itLineSchema).min(1).max(200),
  })
  .refine(
    (v) => v.payment_status !== "paid" || !!v.paid_on,
    "Hãy nhập ngày thanh toán.",
  );
export const itDocumentSchema = z.object({
  id: uuid,
  kind: z.enum(["invoice", "contract", "quote", "other"]),
  provider: z.string().trim().max(200).default(""),
  issuer_tax_code: z.string().trim().max(20).default(""),
  number: z.string().trim().max(150).default(""),
  series: z.string().trim().max(50).default(""),
  issued_on: optionalDate,
  reference: z.string().trim().max(200).default(""),
  total_amount: money.nullable().default(null),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().min(1).max(200),
  mime: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  size: z
    .number()
    .int()
    .min(1)
    .max(20 * 1024 * 1024),
});
export type ItCategory = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  sort_order: number;
};
export type ItService = z.infer<typeof itServiceSchema> & { id: string };
export type ItPeriod = z.infer<typeof itPeriodSchema> & { id: string };
export type ItEntry = z.infer<typeof itEntrySchema> & { id: string };
export type ItDocument = z.infer<typeof itDocumentSchema> & {
  created_at?: string;
  storage_path?: string;
};
export type ItLine = z.infer<typeof itLineSchema>;
export type ItActionState = { error?: string; success?: string; id?: string };
export type ItFilter = {
  year: string;
  month: string;
  category: string;
  service: string;
  provider: string;
  payment: string;
  q: string;
  page: number;
};
export function parseItFilter(
  params: Record<string, string | string[] | undefined>,
): ItFilter {
  const get = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";
  const y = get("year"),
    m = get("month");
  return {
    year: /^(20\d{2}|2100)$/.test(y) ? y : "",
    month: /^(0?[1-9]|1[0-2])$/.test(m) && y ? String(Number(m)) : "",
    category: uuid.safeParse(get("category")).success ? get("category") : "",
    service: uuid.safeParse(get("service")).success ? get("service") : "",
    provider: get("provider").slice(0, 200),
    payment: ["paid", "unpaid", "unconfirmed"].includes(get("payment"))
      ? get("payment")
      : "",
    q: get("q").slice(0, 200),
    page: Math.min(100000, Math.max(1, Number(get("page")) || 1)),
  };
}
export const emptyItLine = (): ItLine => ({
  id: "",
  category_id: "",
  service_id: "",
  period_id: "",
  description: "",
  unit: "",
  quantity: 1,
  unit_price: null,
  amount_before_tax: 0,
  tax_amount: 0,
  amount_after_tax: 0,
  source_key: "",
  source_ref: "",
  new_service_name: "",
  new_identifier: "",
  starts_on: "",
  expires_on: "",
  allow_overlap: false,
});
export function itPeriodHistory(
  p: Pick<ItPeriod, "expires_on" | "status">,
  today: string,
) {
  return p.status !== "active" || p.expires_on < today;
}
export function itSum(lines: Pick<ItLine, "amount_after_tax">[]) {
  return (
    Math.round(
      lines.reduce((sum, l) => sum + Number(l.amount_after_tax), 0) * 100,
    ) / 100
  );
}
