"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { can, requireModuleAccess } from "@/lib/auth";
import { phoneSchema, type PhonePreview } from "@/lib/telecom-phones";
import { parsePhoneSheet } from "@/lib/telecom-phone-workbook";
export type PhoneState = { error?: string; success?: string };

export async function previewPhones(form: FormData): Promise<{ sheets?: string[]; rows?: PhonePreview[]; error?: string }> {
  const { access, supabase } = await requireModuleAccess("telecom");
  if (!can(access, "telecom.manage")) return { error: "Bạn chưa có quyền quản lý số điện thoại." };
  const file = form.get("file");
  if (!(file instanceof File) || !/\.xlsx$/i.test(file.name) || file.size > 3_000_000 || !file.size) return { error: "Chọn file XLSX tối đa 3 MB." };
  try {
    const { Workbook } = await import("exceljs"); const book = new Workbook();
    await book.xlsx.load(await file.arrayBuffer());
    const sheets = book.worksheets.map((s) => s.name);
    if (!form.get("sheet")) return { sheets };
    const sheet = book.getWorksheet(String(form.get("sheet")));
    if (!sheet) return { error: "Chọn lại sheet cần nhập." };
    const rows = parsePhoneSheet(sheet);
    if (rows.length > 500) return { error: "Mỗi lần nhập tối đa 500 số điện thoại; hãy chia nhỏ sheet." };
    if (!rows.length) return { sheets, rows: [] };
    const { data, error } = await supabase.from("telecom_phones").select("phone").in("phone", rows.map((r) => r.phone)).is("deleted_at", null).limit(500);
    if (error) return { error: "Chưa đối chiếu được danh mục đã lưu. Hãy thử lại." };
    const saved = new Set((data || []).map((r) => r.phone));
    return { sheets, rows: rows.map((r) => ({ ...r, saved: saved.has(r.phone) })) };
  } catch { return { error: "Không đọc được sheet. Kiểm tra cột Số điện thoại / TEL. NUMBER và giới hạn 5.000 dòng." }; }
}
export async function savePhones(_state: PhoneState, form: FormData): Promise<PhoneState> {
  const { access, supabase } = await requireModuleAccess("telecom");
  if (!can(access, "telecom.manage")) return { error: "Bạn chưa có quyền quản lý số điện thoại." };
  let input: unknown;
  try { input = form.has("rows") ? JSON.parse(String(form.get("rows"))) : [Object.fromEntries(form)]; } catch { return { error: "Dữ liệu không hợp lệ." }; }
  const rows = z.array(phoneSchema).min(1).max(500).safeParse(input);
  const id = z.uuid().nullable().safeParse(form.get("id") || null);
  const version = z.iso.datetime({ offset: true }).nullable().safeParse(form.get("version") || null);
  if (!rows.success || !id.success || !version.success) return { error: "Kiểm tra số điện thoại, trạng thái và độ dài thông tin." };
  const { data, error } = await supabase.rpc("save_telecom_phones", { target_rows: rows.data, target_id: id.data, target_version: version.data });
  if (error) return { error: error.message.includes("STALE_PHONE") ? "Bản ghi đã thay đổi. Hãy đóng form và tải lại danh sách." : "Không lưu được: số điện thoại có thể đã tồn tại hoặc quyền truy cập đã thay đổi." };
  if (!data && !form.has("rows")) return { error: "Số điện thoại này đã có trong danh mục. Hãy mở bản ghi hiện có để sửa." };
  revalidatePath("/telecom/phones");
  return { success: `Đã lưu ${data} số điện thoại. Số đã có được bỏ qua, không ghi đè.` };
}
export async function deletePhone(_state: PhoneState, form: FormData): Promise<PhoneState> {
  const { access, supabase } = await requireModuleAccess("telecom");
  if (!can(access, "telecom.delete")) return { error: "Bạn chưa có quyền xóa." };
  const parsed = z.object({ id: z.uuid(), version: z.iso.datetime({ offset: true }) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Bản ghi không hợp lệ." };
  const { error } = await supabase.rpc("delete_telecom_phone", { target_id: parsed.data.id, target_version: parsed.data.version });
  if (error) return { error: "Không xóa được hoặc bản ghi đã thay đổi. Hãy tải lại danh sách." };
  revalidatePath("/telecom/phones"); return { success: "Đã xóa khỏi danh mục; nhật ký vẫn được giữ lại." };
}
