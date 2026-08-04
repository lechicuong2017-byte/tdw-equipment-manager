"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireAccess } from "@/lib/auth";

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

function isMaskedLicense(value: string) {
  if (value === "") return true;
  if (/^ref:[A-Za-z0-9._:/-]{1,180}$/i.test(value)) return true;

  const maskCount = (value.match(/[*•#Xx]/g) ?? []).length;
  const visibleCount = (value.match(/[A-Za-z0-9]/g) ?? []).length;
  return maskCount >= 4 && visibleCount <= 8;
}

const softwareSchema = z.object({
  software_name: z.string().trim().min(1, "Tên phần mềm là bắt buộc").max(200),
  version: z.string().trim().max(120),
  license_key_masked: z
    .string()
    .trim()
    .max(200)
    .refine(
      isMaskedLicense,
      "Chỉ nhập khóa đã che hoặc mã tham chiếu, không nhập khóa thật",
    ),
  license_secret_ref: z.string().trim().max(300),
  assigned_asset_id: z.preprocess(emptyToNull, z.uuid().nullable()),
  assigned_user_name: z.string().trim().max(200),
  expiry_date: z.preprocess(
    emptyToNull,
    z.iso.date("Ngày hết hạn không hợp lệ").nullable(),
  ),
  status: z.enum(["ACTIVE", "EXPIRING", "EXPIRED", "SUSPENDED", ""]),
  note: z.string().trim().max(3000),
});

export type SoftwareFormState = {
  error?: string;
  success?: string;
};

export async function createSoftwareLicense(
  _previousState: SoftwareFormState,
  formData: FormData,
): Promise<SoftwareFormState> {
  const parsed = softwareSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  }

  const { supabase, access } = await requireAccess();
  if (!can(access, "software.manage")) {
    return { error: "Bạn không có quyền thêm bản quyền phần mềm." };
  }

  const { error } = await supabase.from("software_licenses").insert(parsed.data);
  if (error) {
    return { error: "Không thể lưu bản quyền. Hãy kiểm tra quyền và dữ liệu." };
  }

  revalidatePath("/software");
  return { success: "Đã thêm bản quyền phần mềm." };
}

export async function updateSoftwareLicense(
  _previousState: SoftwareFormState,
  formData: FormData,
): Promise<SoftwareFormState> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) {
    return { error: "Mã bản quyền không hợp lệ." };
  }

  const parsed = softwareSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  }

  const { supabase, access } = await requireAccess();
  if (!can(access, "software.manage")) {
    return { error: "Bạn không có quyền sửa bản quyền phần mềm." };
  }

  const { data, error } = await supabase
    .from("software_licenses")
    .update(parsed.data)
    .eq("id", id.data)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { error: "Không thể cập nhật bản quyền. Hãy kiểm tra quyền và dữ liệu." };
  }

  revalidatePath("/software");
  revalidatePath(`/software/${id.data}/edit`);
  return { success: "Đã cập nhật bản quyền phần mềm." };
}

export async function deleteSoftwareLicense(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  const { supabase, access } = await requireAccess();
  if (!can(access, "software.delete")) return;

  await supabase.from("software_licenses").delete().eq("id", id.data);
  revalidatePath("/software");
}
