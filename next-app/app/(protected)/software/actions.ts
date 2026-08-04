"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireAccess } from "@/lib/auth";
import {
  decryptSoftwareLicenseKey,
  encryptSoftwareLicenseKey,
  maskSoftwareLicenseKey,
} from "@/lib/software-license-secret";

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const softwareSchema = z.object({
  software_name: z.string().trim().min(1, "Tên phần mềm là bắt buộc").max(200),
  version: z.string().trim().max(120),
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

export type SoftwareSecretFormState = SoftwareFormState & {
  clearSecretInput?: boolean;
};

type EncryptedSecretRow = {
  ciphertext: string;
  iv: string;
  auth_tag: string;
  encryption_version: number;
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

export async function saveSoftwareLicenseSecret(
  _previousState: SoftwareSecretFormState,
  formData: FormData,
): Promise<SoftwareSecretFormState> {
  const id = z.uuid().safeParse(formData.get("id"));
  const licenseKey = z
    .string()
    .trim()
    .min(1, "Hãy nhập key bản quyền")
    .max(4096, "Key bản quyền quá dài")
    .safeParse(formData.get("license_key_plaintext"));
  if (!id.success || !licenseKey.success) {
    return {
      error: id.success
        ? licenseKey.error?.issues[0]?.message
        : "Mã bản quyền không hợp lệ.",
    };
  }

  const { supabase, access } = await requireAccess();
  if (!access.roles.includes("admin")) {
    return { error: "Chỉ quản trị viên mới được cập nhật key bản quyền." };
  }

  let encrypted;
  try {
    encrypted = encryptSoftwareLicenseKey(licenseKey.data, id.data);
  } catch {
    return { error: "Máy chủ chưa được cấu hình khóa mã hóa bản quyền." };
  }

  const { error } = await supabase.rpc(
    "admin_store_software_license_secret",
    {
      target_license_id: id.data,
      target_ciphertext: encrypted.ciphertext,
      target_iv: encrypted.iv,
      target_auth_tag: encrypted.authTag,
      target_masked: maskSoftwareLicenseKey(licenseKey.data),
      target_encryption_version: encrypted.encryptionVersion,
    },
  );
  if (error) {
    return { error: "Không thể lưu key đã mã hóa. Hãy kiểm tra lại cấu hình." };
  }

  revalidatePath("/software");
  revalidatePath(`/software/${id.data}/edit`);
  return {
    success: "Đã mã hóa và lưu key bản quyền.",
    clearSecretInput: true,
  };
}

export async function revealSoftwareLicenseSecret(licenseId: string): Promise<{
  error?: string;
  key?: string;
}> {
  const id = z.uuid().safeParse(licenseId);
  if (!id.success) return { error: "Mã bản quyền không hợp lệ." };

  const { supabase, access } = await requireAccess();
  if (!access.roles.includes("admin")) {
    return { error: "Chỉ quản trị viên mới được xem key bản quyền." };
  }

  const { data, error } = await supabase.rpc(
    "admin_get_software_license_secret",
    { target_license_id: id.data },
  );
  const encrypted = (data?.[0] ?? null) as EncryptedSecretRow | null;
  if (error || !encrypted) {
    return { error: "Bản quyền này chưa có key được mã hóa." };
  }

  try {
    return {
      key: decryptSoftwareLicenseKey(
        {
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.auth_tag,
          encryptionVersion: encrypted.encryption_version,
        },
        id.data,
      ),
    };
  } catch {
    return { error: "Không thể giải mã key bản quyền." };
  }
}

export async function deleteSoftwareLicense(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  const { supabase, access } = await requireAccess();
  if (!can(access, "software.delete")) return;

  await supabase.from("software_licenses").delete().eq("id", id.data);
  revalidatePath("/software");
}
