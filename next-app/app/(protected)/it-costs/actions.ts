"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createHash } from "node:crypto";
import { checkDocxArchive } from "@/lib/it-cost-documents";
import { can, requireModuleAccess } from "@/lib/auth";
import {
  itServiceSchema,
  itPeriodSchema,
  itEntrySchema,
  itDocumentSchema,
  type ItActionState,
} from "@/lib/it-costs";

function errorMessage(message: string) {
  if (message.includes("IT_STALE"))
    return "Dữ liệu đã được sửa ở phiên khác. Tải lại trước khi cập nhật.";
  if (message.includes("IT_OVERLAP"))
    return "Kỳ sử dụng chồng với kỳ đã lưu. Kiểm tra ngày hoặc xác nhận chồng kỳ.";
  if (
    message.includes("IT_DUPLICATE_LINE") ||
    message.includes("unique constraint")
  )
    return "Dữ liệu hoặc dòng chứng từ đã tồn tại. Hãy đối chiếu và liên kết hồ sơ cũ.";
  if (message.includes("IT_TOTAL_MISMATCH"))
    return "Tổng các dòng vượt tổng chứng từ. Kiểm tra số tiền hoặc ghi lý do chênh lệch.";
  if (message.includes("IT_FORBIDDEN"))
    return "Bạn chưa có quyền thực hiện thao tác này.";
  return "Không lưu được dữ liệu. Kiểm tra thông tin, kết nối và thử lại.";
}
export async function saveItEntity(
  kind: string,
  input: unknown,
): Promise<ItActionState> {
  const { access, supabase } = await requireModuleAccess("it_costs");
  const permission =
    kind === "category" ? "it_costs.settings" : "it_costs.manage";
  if (!can(access, permission))
    return { error: "Bạn chưa có quyền quản lý mục này." };
  const categorySchema = z.object({
    id: z.union([z.uuid(), z.literal("")]),
    code: z
      .string()
      .trim()
      .regex(/^[a-z0-9_-]{1,60}$/),
    name: z.string().trim().min(1).max(150),
    sort_order: z.number().int(),
    active: z.boolean(),
  });
  const schema =
    kind === "service"
      ? itServiceSchema
      : kind === "period"
        ? itPeriodSchema
        : kind === "category"
          ? categorySchema
          : null;
  const parsed = schema?.safeParse(input);
  if (!parsed?.success)
    return {
      error: parsed?.error.issues[0]?.message || "Dữ liệu không hợp lệ.",
    };
  const { data, error } = await supabase.rpc("save_it_entity", {
    target_kind: kind,
    target_data: parsed.data,
  });
  if (error) return { error: errorMessage(error.message) };
  revalidatePath("/it-costs");
  return { success: "Đã lưu thông tin.", id: data };
}
export async function saveItEntry(input: unknown): Promise<ItActionState> {
  const { access, supabase } = await requireModuleAccess("it_costs");
  if (!can(access, "it_costs.manage"))
    return { error: "Bạn chưa có quyền quản lý chi phí." };
  const parsed = itEntrySchema.safeParse(input);
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message || "Kiểm tra các dòng chi phí.",
    };
  const { data, error } = await supabase.rpc("save_it_cost_entry", {
    target_data: parsed.data,
  });
  if (error) return { error: errorMessage(error.message) };
  revalidatePath("/it-costs");
  return { success: "Đã lưu khoản chi phí.", id: data };
}
export async function registerItDocument(
  input: unknown,
): Promise<ItActionState> {
  const { access, supabase } = await requireModuleAccess("it_costs");
  if (!can(access, "it_costs.import"))
    return { error: "Bạn chưa có quyền nhập chứng từ." };
  const parsed = itDocumentSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Kiểm tra thông tin chứng từ và tệp đính kèm." };
  const path = `${access.user_id}/${parsed.data.id}.${parsed.data.mime === "application/pdf" ? "pdf" : "docx"}`;
  const file = await supabase.storage.from("it-cost-documents").download(path);
  if (file.error || !file.data || file.data.size !== parsed.data.size)
    return { error: "Tệp tải lên chưa đầy đủ. Hãy thử lại." };
  const bytes = Buffer.from(await file.data.arrayBuffer());
  if (
    bytes.length < 5 ||
    createHash("sha256").update(bytes).digest("hex") !== parsed.data.hash ||
    (parsed.data.mime === "application/pdf"
      ? bytes.subarray(0, 5).toString() !== "%PDF-"
      : bytes.readUInt32LE(0) !== 0x04034b50)
  )
    return { error: "Chữ ký hoặc nội dung tệp không hợp lệ." };
  if (parsed.data.mime !== "application/pdf") {
    try {
      checkDocxArchive(bytes);
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(bytes);
      if (
        !zip.file("word/document.xml") ||
        Object.keys(zip.files).some((n) => /vbaProject\.bin$/i.test(n))
      )
        return { error: "DOCX không hợp lệ hoặc có macro." };
    } catch {
      return {
        error: "Cấu trúc DOCX không hợp lệ hoặc vượt giới hạn giải nén.",
      };
    }
  }
  const { data, error } = await supabase.rpc("register_it_document", {
    target_data: parsed.data,
  });
  if (error) return { error: errorMessage(error.message) };
  revalidatePath("/it-costs");
  return { id: data, success: "Đã lưu chứng từ. Chưa phát sinh chi phí." };
}
export async function prepareItUpload(id: string, mime: string) {
  const { access, supabase } = await requireModuleAccess("it_costs");
  if (
    !can(access, "it_costs.import") ||
    !z.uuid().safeParse(id).success ||
    ![
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].includes(mime)
  )
    return { error: "Không có quyền tải tệp." };
  const path = `${access.user_id}/${id}.${mime === "application/pdf" ? "pdf" : "docx"}`;
  const { data, error } = await supabase.storage
    .from("it-cost-documents")
    .createSignedUploadUrl(path);
  if (error)
    return {
      error: "Chưa chuẩn bị được chỗ lưu tệp. Kiểm tra cấu hình Storage.",
    };
  return { path, token: data.token };
}
export async function linkItDocument(
  documentId: string,
  kind: string,
  id: string,
  remove = false,
): Promise<ItActionState> {
  const { access, supabase } = await requireModuleAccess("it_costs");
  if (
    !can(access, "it_costs.import") ||
    (remove && !can(access, "it_costs.delete"))
  )
    return { error: "Bạn chưa có quyền liên kết hoặc gỡ chứng từ." };
  if (
    !z.uuid().safeParse(documentId).success ||
    !z.uuid().safeParse(id).success ||
    !["entry", "service", "period"].includes(kind)
  )
    return { error: "Đối tượng liên kết không hợp lệ." };
  const { error } = await supabase.rpc("link_it_document", {
    target_document: documentId,
    target_kind: kind,
    target_id: id,
    target_remove: remove,
  });
  if (error) return { error: errorMessage(error.message) };
  revalidatePath("/it-costs");
  return {
    success: remove
      ? "Đã gỡ liên kết; tệp và chi phí vẫn được giữ."
      : "Đã liên kết chứng từ. Tổng chi phí không thay đổi.",
  };
}
// Read the complete entry only when opening its editor, rather than loading every line on the list page.
export async function getItEntry(id: string) {
  const { supabase } = await requireModuleAccess("it_costs");
  if (!z.uuid().safeParse(id).success) return { error: "Hồ sơ không hợp lệ." };
  const [entry, lines, links] = await Promise.all([
    supabase.from("it_cost_entries").select("*").eq("id", id).single(),
    supabase
      .from("it_cost_entry_lines")
      .select("*")
      .eq("entry_id", id)
      .order("id"),
    supabase
      .from("it_document_links")
      .select("id,document_id,it_documents(id,name,kind)")
      .eq("entry_id", id),
  ]);
  if (entry.error || lines.error || links.error)
    return { error: "Không đọc được hồ sơ chi phí." };
  return {
    entry: {
      ...entry.data,
      paid_on: entry.data.paid_on || "",
      document_id: "",
      lines: (lines.data || []).map((l) => ({
        ...l,
        service_id: l.service_id || "",
        period_id: l.period_id || "",
        unit_price: l.unit_price === null ? null : Number(l.unit_price),
        quantity: Number(l.quantity),
        amount_before_tax: Number(l.amount_before_tax),
        tax_amount: Number(l.tax_amount),
        amount_after_tax: Number(l.amount_after_tax),
      })),
    },
    links: links.data,
  };
}
export async function compareItDocument(
  hash: string,
  reference: string,
  identity?: {
    issuer_tax_code: string;
    number: string;
    series: string;
    kind: string;
  },
) {
  const { access, supabase } = await requireModuleAccess("it_costs");
  if (
    !can(access, "it_costs.import") ||
    !/^[a-f0-9]{64}$/.test(hash) ||
    reference.length > 200
  )
    return { error: "Không thể đối chiếu chứng từ." };
  let saved = await supabase
    .from("it_documents")
    .select("id,name,number,reference,hash")
    .eq("hash", hash)
    .maybeSingle();
  if (saved.error) return { error: "Không thể đối chiếu chứng từ." };
  if (
    !saved.data &&
    identity?.kind === "invoice" &&
    identity.number &&
    identity.series &&
    identity.issuer_tax_code
  ) {
    if (
      [identity.number, identity.series, identity.issuer_tax_code].some(
        (v) => v.length > 150,
      )
    )
      return { error: "Thông tin hóa đơn không hợp lệ." };
    saved = await supabase
      .from("it_documents")
      .select("id,name,number,reference,hash")
      .eq("kind", "invoice")
      .eq("issuer_tax_code", identity.issuer_tax_code.trim())
      .eq("number", identity.number.trim())
      .eq("series", identity.series.trim().toUpperCase())
      .maybeSingle();
    if (saved.error) return { error: "Chưa đối chiếu được số hóa đơn." };
  }
  const candidates = reference
    ? await supabase
        .from("it_documents")
        .select("id,name,number,reference,it_document_links(entry_id)")
        .eq("number", reference)
        .limit(20)
    : { data: [], error: null };
  const used = saved.data
    ? await supabase
        .from("it_cost_entry_lines")
        .select("source_key,entry_id")
        .eq("document_id", saved.data.id)
    : { data: [], error: null };
  if (candidates.error || used.error)
    return { error: "Không thể đối chiếu các dòng đã nhập." };
  return {
    saved: saved.data,
    used: used.data || [],
    candidates: candidates.data || [],
    differentFile: !!saved.data && saved.data.hash !== hash,
  };
}
export async function findItEntryCandidates(provider: string) {
  const { access, supabase } = await requireModuleAccess("it_costs");
  if (!can(access, "it_costs.import") || provider.length > 200)
    return { error: "Không thể tìm hồ sơ." };
  let q = supabase
    .from("it_cost_entries")
    .select("id,provider,recognized_on,description")
    .neq("status", "cancelled")
    .order("recognized_on", { ascending: false })
    .limit(30);
  if (provider.trim()) q = q.ilike("provider", `%${provider.trim()}%`);
  const { data, error } = await q;
  return error
    ? { error: "Không đọc được hồ sơ để liên kết." }
    : { entries: data };
}
