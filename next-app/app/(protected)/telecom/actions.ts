"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, hasModule, requireAccess } from "@/lib/auth";
import { telecomInvoiceSchema, telecomInvoiceKey, telecomCategorySchema, type TelecomPreviewRow } from "@/lib/telecom-invoices";

export type TelecomActionState = { error?: string; success?: string };
const rowsSchema = z.array(telecomInvoiceSchema).min(1).max(200);
const metadataSchema = z.object({ source: z.string().trim().min(1).max(200), group: z.string().trim().max(120),category:telecomCategorySchema });

export async function previewTelecomInvoices(input: unknown): Promise<{ rows?: TelecomPreviewRow[]; error?: string }> {
  const { access, supabase } = await requireAccess();
  if (!hasModule(access, "telecom") || !can(access, "telecom.import")) return { error: "Bạn chưa có quyền nhập hóa đơn viễn thông." };
  const parsed = rowsSchema.safeParse(input);
  if (!parsed.success) return { error: "Dữ liệu hóa đơn không hợp lệ. Hãy kiểm tra lại PDF." };
  const rows = parsed.data.map((r) => ({ ...r, invoice_series: r.invoice_series.toUpperCase(), invoice_number: r.invoice_number.replace(/^0+(?=\d)/, "") }));
  const { data, error } = await supabase.from("telecom_invoices")
    .select("issuer_tax_code,invoice_series,invoice_number,subscriber,period_month,issued_on,amount_before_tax,tax_amount,amount_after_tax")
    .in("invoice_number", rows.map((r) => r.invoice_number)).is("deleted_at", null).limit(1000);
  if (error) return { error: "Chưa đối chiếu được hóa đơn đã lưu. Vui lòng thử lại." };
  const saved = new Map((data || []).map((r) => [telecomInvoiceKey(r), r]));
  const seen = new Map<string, typeof rows[number]>();
  const result: TelecomPreviewRow[] = rows.map((row) => {
    const key = telecomInvoiceKey(row);
    const existing = saved.get(key) || seen.get(key);
    const same = !existing || (existing.subscriber === row.subscriber && existing.period_month === row.period_month
      && existing.issued_on === row.issued_on && Number(existing.amount_before_tax) === row.amount_before_tax
      && Number(existing.tax_amount) === row.tax_amount && Number(existing.amount_after_tax) === row.amount_after_tax);
    const status = !same ? "conflict" : saved.has(key) ? "saved" : seen.has(key) ? "duplicate" : "new";
    seen.set(key, row);
    return { ...row, key, status };
  });
  // Block all occurrences of a conflicting identity, not just the last page.
  const conflicts = new Set(result.filter((r) => r.status === "conflict").map((r) => r.key));
  return { rows: result.map((r) => conflicts.has(r.key) ? { ...r, status: "conflict" } : r) };
}

export async function importTelecomInvoices(_state: TelecomActionState, form: FormData): Promise<TelecomActionState> {
  const { access, supabase } = await requireAccess();
  if (!hasModule(access, "telecom") || !can(access, "telecom.import")) return { error: "Bạn chưa có quyền nhập hóa đơn." };
  let input: unknown;
  try { input = JSON.parse(String(form.get("rows") || "[]")); } catch { return { error: "Dữ liệu xem trước không hợp lệ." }; }
  const parsed = rowsSchema.safeParse(input);
  const meta = metadataSchema.safeParse({ source: form.get("source"), group: form.get("group") || "",category:form.get("category") });
  if (!parsed.success || !meta.success) return { error: "Chọn ít nhất một hóa đơn hợp lệ và kiểm tra tên nhóm (tối đa 120 ký tự)." };
  const { data, error } = await supabase.rpc("import_telecom_invoices", { target_rows: parsed.data, target_source: meta.data.source, target_group: meta.data.group,target_category:meta.data.category });
  if (error) return { error: error.message.includes("TELECOM_INVOICE_CONFLICT")
    ? "Số hóa đơn đã tồn tại nhưng số tiền hoặc thuê bao khác. Hãy đối chiếu hóa đơn đã lưu; chưa có dữ liệu mới nào được ghi."
    : "Không lưu được hóa đơn. Hãy kiểm tra quyền truy cập và thử lại." };
  revalidatePath("/telecom");
  return { success: `Đã nhập ${data ?? 0} hóa đơn viễn thông. Hóa đơn trùng được bỏ qua.` };
}

export async function updateTelecomInvoice(_state: TelecomActionState, form: FormData): Promise<TelecomActionState> {
  const { access, supabase } = await requireAccess();
  if (!hasModule(access, "telecom") || !can(access, "telecom.manage")) return { error: "Bạn chưa có quyền sửa thông tin thanh toán." };
  const parsed = z.object({ id: z.uuid(), paid_on: z.union([z.iso.date(), z.literal("")]), note: z.string().max(2000), group: z.string().trim().max(120), category:telecomCategorySchema })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Kiểm tra ngày thanh toán và độ dài ghi chú." };
  const { error } = await supabase.rpc("update_telecom_invoice", { target_id: parsed.data.id, target_paid_on: parsed.data.paid_on || null, target_note: parsed.data.note, target_group: parsed.data.group,target_category:parsed.data.category });
  if (error) return { error: "Không thể cập nhật hóa đơn." };
  revalidatePath("/telecom");
  return { success: "Đã cập nhật thông tin thanh toán." };
}

export async function deleteTelecomInvoice(_state: TelecomActionState, form: FormData): Promise<TelecomActionState> {
  const { access, supabase } = await requireAccess();
  if (!hasModule(access, "telecom") || !can(access, "telecom.delete")) return { error: "Bạn chưa có quyền xóa hóa đơn." };
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Hóa đơn không hợp lệ." };
  const { error } = await supabase.rpc("delete_telecom_invoice", { target_id: id.data });
  if (error) return { error: "Không thể xóa hóa đơn. Hãy tải lại danh sách." };
  revalidatePath("/telecom");
  return { success: "Đã xóa hóa đơn khỏi danh sách. Nhật ký thay đổi vẫn được lưu." };
}
