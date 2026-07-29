"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const optionalDate = z.preprocess(
  emptyToNull,
  z.iso.date("Ngày không hợp lệ").nullable(),
);

const optionalYear = z.preprocess(
  emptyToNull,
  z.coerce.number().int().min(1990).max(2100).nullable(),
);

const optionalUuid = z.preprocess(
  emptyToNull,
  z.uuid("Phòng ban không hợp lệ").nullable(),
);

const assetSchema = z.object({
  id: z.preprocess(emptyToNull, z.uuid().nullable()),
  asset_code: z.string().trim().min(1, "Mã thiết bị là bắt buộc").max(80),
  asset_name: z.string().trim().min(1, "Tên thiết bị là bắt buộc").max(200),
  asset_group: z.string().trim().max(120),
  asset_type: z.string().trim().max(120),
  brand: z.string().trim().max(120),
  model: z.string().trim().max(120),
  serial_number: z.string().trim().max(160),
  purchase_year: optionalYear,
  purchase_date: optionalDate,
  quantity: z.coerce.number().int().min(1).max(100000),
  unit_price: z.coerce.number().min(0).max(1000000000000),
  assigned_to_name: z.string().trim().max(200),
  department_id: optionalUuid,
  location: z.string().trim().max(200),
  status: z.enum([
    "CON_SU_DUNG",
    "MOI_100",
    "KEM_PHAM_CHAT",
    "CAN_KIEM_TRA",
    "KHONG_SU_DUNG",
    "LUU_KHO_THANH_LY",
  ]),
  quality_level: z.string().trim().max(120),
  warranty_end_date: optionalDate,
  last_maintenance_date: optionalDate,
  next_check_date: optionalDate,
  note: z.string().trim().max(3000),
});

export type AssetFormState = {
  error?: string;
};

export async function saveAsset(
  _previousState: AssetFormState,
  formData: FormData,
): Promise<AssetFormState> {
  const parsed = assetSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  }

  const { supabase } = await requireAccess();
  const { id, ...payload } = parsed.data;
  const query = id
    ? supabase.from("assets").update(payload).eq("id", id).select("id").single()
    : supabase.from("assets").insert(payload).select("id").single();

  const { data, error } = await query;
  if (error) {
    if (error.code === "23505") {
      return { error: "Mã thiết bị đã tồn tại." };
    }
    return { error: "Không thể lưu thiết bị. Vui lòng kiểm tra quyền và dữ liệu." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/assets");
  redirect(`/assets/${data.id}`);
}

export async function archiveAsset(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  const { supabase, access } = await requireAccess();
  const { error } = await supabase
    .from("assets")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: access.user_id,
    })
    .eq("id", id.data);

  if (!error) {
    revalidatePath("/dashboard");
    revalidatePath("/assets");
    redirect("/assets");
  }
}

const mediaSchema = z.object({
  asset_id: z.uuid(),
  file: z
    .instanceof(File)
    .refine((file) => file.size > 0, "Hãy chọn một hình ảnh")
    .refine((file) => file.size <= 5 * 1024 * 1024, "Ảnh không được vượt quá 5 MB")
    .refine(
      (file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type),
      "Chỉ chấp nhận JPEG, PNG hoặc WebP",
    ),
});

export type MediaFormState = {
  error?: string;
  success?: string;
};

export async function uploadAssetMedia(
  _previousState: MediaFormState,
  formData: FormData,
): Promise<MediaFormState> {
  const parsed = mediaSchema.safeParse({
    asset_id: formData.get("asset_id"),
    file: formData.get("file"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ảnh chưa hợp lệ" };
  }

  const { supabase, access } = await requireAccess();
  const { data: asset, error: assetError } = await supabase
    .from("assets")
    .select("id")
    .eq("id", parsed.data.asset_id)
    .single();
  if (assetError || !asset) {
    return { error: "Không tìm thấy thiết bị hoặc bạn không có quyền tải ảnh." };
  }

  const extension =
    parsed.data.file.type === "image/png"
      ? "png"
      : parsed.data.file.type === "image/webp"
        ? "webp"
        : "jpg";
  const objectPath = `${access.user_id}/${asset.id}/${crypto.randomUUID()}.${extension}`;
  const bytes = await parsed.data.file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("asset-media")
    .upload(objectPath, bytes, {
      contentType: parsed.data.file.type,
      cacheControl: "31536000",
      upsert: false,
    });

  if (uploadError) {
    return { error: "Không thể tải ảnh lên Storage." };
  }

  const { error: metadataError } = await supabase.from("media_files").insert({
    owner_type: "ASSET",
    owner_id: asset.id,
    asset_id: asset.id,
    object_path: objectPath,
    file_name: parsed.data.file.name.slice(0, 200),
    mime_type: parsed.data.file.type,
    byte_size: parsed.data.file.size,
    created_by: access.user_id,
  });

  if (metadataError) {
    await supabase.storage.from("asset-media").remove([objectPath]);
    return { error: "Ảnh đã được hoàn tác vì không thể lưu metadata." };
  }

  revalidatePath(`/assets/${asset.id}`);
  return { success: "Đã tải ảnh lên." };
}

export async function deleteAssetMedia(formData: FormData) {
  const parsed = z.object({
    id: z.uuid(),
    asset_id: z.uuid(),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const { supabase } = await requireAccess();
  const { data } = await supabase
    .from("media_files")
    .select("object_path")
    .eq("id", parsed.data.id)
    .eq("asset_id", parsed.data.asset_id)
    .single();
  if (!data) return;

  const { error: storageError } = await supabase.storage
    .from("asset-media")
    .remove([data.object_path]);
  if (storageError) return;

  await supabase.from("media_files").delete().eq("id", parsed.data.id);
  revalidatePath(`/assets/${parsed.data.asset_id}`);
}
