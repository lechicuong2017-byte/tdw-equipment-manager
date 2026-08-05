"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { z } from "zod";
import sharp from "sharp";
import { can, requireAccess } from "@/lib/auth";
import { safeAssetsReturnTo } from "@/lib/asset-navigation";

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
  asset_kind: z.enum(["DEVICE", "COMPONENT"]),
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
  status: z.string().trim().min(1, "Trạng thái là bắt buộc").max(120),
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

  const { supabase, access } = await requireAccess();
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

  if (id && formData.get("manage_responsibles") === "1") {
    if (!access.roles.includes("admin")) {
      return { error: "Thiết bị đã lưu, nhưng bạn không có quyền đổi người phụ trách." };
    }

    const responsibleInput = z.object({
      primary: z.preprocess(emptyToNull, z.uuid().nullable()),
      secondary: z.array(z.uuid()).max(20),
    }).safeParse({
      primary: formData.get("primary_responsible_id"),
      secondary: formData.getAll("secondary_responsible_ids"),
    });
    if (!responsibleInput.success) {
      return { error: "Thiết bị đã lưu, nhưng danh sách người phụ trách chưa hợp lệ." };
    }

    const { error: responsibleError } = await supabase.rpc(
      "admin_set_asset_responsibles",
      {
        target_asset_id: data.id,
        target_primary_user_id: responsibleInput.data.primary,
        target_secondary_user_ids: responsibleInput.data.secondary,
      },
    );
    if (responsibleError) {
      return { error: "Thiết bị đã lưu, nhưng chưa cập nhật được người phụ trách." };
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/assets");
  const successMessage = id ? "Đã cập nhật thiết bị." : "Đã thêm thiết bị.";
  const returnTo = safeAssetsReturnTo(formData.get("return_to"));
  if (returnTo) {
    const separator = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${separator}ok=${encodeURIComponent(successMessage)}`);
  }
  redirect(`/assets/${data.id}?ok=${encodeURIComponent(successMessage)}`);
}

export async function archiveAsset(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Mã thiết bị không hợp lệ." };

  const { supabase } = await requireAccess();
  const { error } = await supabase.rpc("archive_asset", {
    target_asset_id: id.data,
  });

  if (error) return { error: "Không thể đưa thiết bị vào lưu trữ." };

  revalidatePath("/dashboard");
  revalidatePath("/assets");
  redirect(`/assets?ok=${encodeURIComponent("Đã đưa thiết bị vào lưu trữ.")}`);
}

const componentStatus = z.enum([
  "CON_SU_DUNG",
  "MOI_100",
  "KEM_PHAM_CHAT",
  "CAN_KIEM_TRA",
  "KHONG_SU_DUNG",
  "LUU_KHO_THANH_LY",
]);

const componentLinkSchema = z.object({
  host_asset_id: z.uuid(),
  component_asset_id: z.uuid(),
  installed_at: z.iso.date("Ngày lắp không hợp lệ"),
  slot_name: z.string().trim().max(120),
  note: z.string().trim().max(1000),
});

function componentRedirect(
  assetId: string,
  state: "installed" | "removed" | "replaced" | "error",
) {
  if (state === "error") {
    redirect(`/assets/${assetId}?component_status=error`);
  }
  const messages = {
    installed: "Đã gắn linh kiện vào thiết bị.",
    removed: "Đã tháo linh kiện và lưu lịch sử.",
    replaced: "Đã thay linh kiện và lưu lịch sử cũ/mới.",
  } as const;
  redirect(`/assets/${assetId}?ok=${encodeURIComponent(messages[state])}`);
}

export async function installAssetComponent(formData: FormData) {
  const parsed = componentLinkSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const hostId = z.uuid().safeParse(formData.get("host_asset_id"));
    if (hostId.success) componentRedirect(hostId.data, "error");
    return;
  }

  const { supabase, access } = await requireAccess();
  if (!can(access, "assets.manage")) {
    componentRedirect(parsed.data.host_asset_id, "error");
  }
  const { error } = await supabase.rpc("install_asset_component", {
    target_host_asset_id: parsed.data.host_asset_id,
    target_component_asset_id: parsed.data.component_asset_id,
    target_installed_at: parsed.data.installed_at,
    target_slot_name: parsed.data.slot_name,
    target_note: parsed.data.note,
  });
  if (error) componentRedirect(parsed.data.host_asset_id, "error");

  revalidatePath("/assets");
  revalidatePath(`/assets/${parsed.data.host_asset_id}`);
  revalidatePath(`/assets/${parsed.data.component_asset_id}`);
  componentRedirect(parsed.data.host_asset_id, "installed");
}

const removeComponentSchema = z.object({
  host_asset_id: z.uuid(),
  component_asset_id: z.uuid(),
  installation_id: z.uuid(),
  removed_at: z.iso.date("Ngày tháo không hợp lệ"),
  removal_reason: z.string().trim().min(1).max(300),
  removal_note: z.string().trim().max(1000),
  component_status: componentStatus,
});

export async function removeAssetComponent(formData: FormData) {
  const parsed = removeComponentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const hostId = z.uuid().safeParse(formData.get("host_asset_id"));
    if (hostId.success) componentRedirect(hostId.data, "error");
    return;
  }

  const { supabase, access } = await requireAccess();
  if (!can(access, "assets.manage")) {
    componentRedirect(parsed.data.host_asset_id, "error");
  }
  const { error } = await supabase.rpc("remove_asset_component", {
    target_installation_id: parsed.data.installation_id,
    target_removed_at: parsed.data.removed_at,
    target_removal_reason: parsed.data.removal_reason,
    target_removal_note: parsed.data.removal_note,
    target_component_status: parsed.data.component_status,
  });
  if (error) componentRedirect(parsed.data.host_asset_id, "error");

  revalidatePath("/assets");
  revalidatePath(`/assets/${parsed.data.host_asset_id}`);
  revalidatePath(`/assets/${parsed.data.component_asset_id}`);
  componentRedirect(parsed.data.host_asset_id, "removed");
}

const replaceComponentSchema = z.object({
  host_asset_id: z.uuid(),
  old_component_asset_id: z.uuid(),
  installation_id: z.uuid(),
  new_component_asset_id: z.uuid(),
  changed_at: z.iso.date("Ngày thay không hợp lệ"),
  slot_name: z.string().trim().max(120),
  note: z.string().trim().max(1000),
  old_component_status: componentStatus,
});

export async function replaceAssetComponent(formData: FormData) {
  const parsed = replaceComponentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const hostId = z.uuid().safeParse(formData.get("host_asset_id"));
    if (hostId.success) componentRedirect(hostId.data, "error");
    return;
  }

  const { supabase, access } = await requireAccess();
  if (!can(access, "assets.manage")) {
    componentRedirect(parsed.data.host_asset_id, "error");
  }
  const { error } = await supabase.rpc("replace_asset_component", {
    target_installation_id: parsed.data.installation_id,
    target_new_component_asset_id: parsed.data.new_component_asset_id,
    target_changed_at: parsed.data.changed_at,
    target_slot_name: parsed.data.slot_name,
    target_note: parsed.data.note,
    target_old_component_status: parsed.data.old_component_status,
  });
  if (error) componentRedirect(parsed.data.host_asset_id, "error");

  revalidatePath("/assets");
  revalidatePath(`/assets/${parsed.data.host_asset_id}`);
  revalidatePath(`/assets/${parsed.data.old_component_asset_id}`);
  revalidatePath(`/assets/${parsed.data.new_component_asset_id}`);
  componentRedirect(parsed.data.host_asset_id, "replaced");
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
  const mediaId = crypto.randomUUID();
  const objectPath = `${access.user_id}/${asset.id}/${mediaId}.${extension}`;
  const thumbnailPath = `${access.user_id}/${asset.id}/${mediaId}.thumb.webp`;
  const bytes = await parsed.data.file.arrayBuffer();
  const checksum = createHash("sha256")
    .update(Buffer.from(bytes))
    .digest("hex");
  let thumbnailBytes: Buffer;
  let imageWidth: number | null = null;
  let imageHeight: number | null = null;
  try {
    const image = sharp(bytes, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    }).rotate();
    const metadata = await image.metadata();
    const detectedMime = metadata.format === "jpeg"
      ? "image/jpeg"
      : metadata.format === "png"
        ? "image/png"
        : metadata.format === "webp"
          ? "image/webp"
          : null;
    if (
      detectedMime !== parsed.data.file.type
      || !metadata.width
      || !metadata.height
      || (metadata.pages ?? 1) > 1
    ) {
      throw new Error("Unsupported image content");
    }
    imageWidth = metadata.width ?? null;
    imageHeight = metadata.height ?? null;
    thumbnailBytes = await image
      .clone()
      .resize(480, 360, { fit: "inside", withoutEnlargement: true })
      .webp({ effort: 4, quality: 78 })
      .toBuffer();
  } catch {
    return { error: "Tệp ảnh không hợp lệ hoặc có kích thước xử lý quá lớn." };
  }
  const { error: metadataError } = await supabase.from("media_files").insert({
    id: mediaId,
    owner_type: "ASSET",
    owner_id: asset.id,
    asset_id: asset.id,
    object_path: objectPath,
    thumbnail_path: thumbnailPath,
    file_name: parsed.data.file.name.slice(0, 200),
    mime_type: parsed.data.file.type,
    byte_size: parsed.data.file.size,
    checksum,
    width: imageWidth,
    height: imageHeight,
    created_by: access.user_id,
  });

  if (metadataError) {
    return { error: "Không thể chuẩn bị metadata cho hình ảnh." };
  }

  const { error: uploadError } = await supabase.storage
    .from("asset-media")
    .upload(objectPath, bytes, {
      contentType: parsed.data.file.type,
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) {
    await supabase.from("media_files").delete().eq("id", mediaId);
    return { error: "Không thể tải ảnh lên Storage." };
  }

  const { error: thumbnailUploadError } = await supabase.storage
    .from("asset-media")
    .upload(thumbnailPath, thumbnailBytes, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
  if (thumbnailUploadError) {
    const { error: cleanupError } = await supabase.storage
      .from("asset-media")
      .remove([objectPath]);
    if (!cleanupError) {
      await supabase.from("media_files").delete().eq("id", mediaId);
    }
    return { error: "Không thể tạo ảnh xem nhanh; ảnh tải lên đã được hoàn tác." };
  }

  revalidatePath("/assets");
  revalidatePath(`/assets/${asset.id}`);
  return { success: "Đã tải ảnh lên." };
}

export async function deleteAssetMedia(formData: FormData) {
  const parsed = z.object({
    id: z.uuid(),
    asset_id: z.uuid(),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Thông tin ảnh không hợp lệ." };

  const { supabase } = await requireAccess();
  const { data } = await supabase
    .from("media_files")
    .select("object_path, thumbnail_path")
    .eq("id", parsed.data.id)
    .eq("asset_id", parsed.data.asset_id)
    .single();
  if (!data) return { error: "Không tìm thấy ảnh cần xóa." };

  const { error: storageError } = await supabase.storage
    .from("asset-media")
    .remove([
      data.object_path,
      ...(data.thumbnail_path ? [data.thumbnail_path] : []),
    ]);
  if (storageError) return { error: "Không thể xóa tệp ảnh trong kho lưu trữ." };

  const { error: databaseError } = await supabase
    .from("media_files")
    .delete()
    .eq("id", parsed.data.id);
  if (databaseError) return { error: "Không thể xóa thông tin ảnh." };
  revalidatePath("/assets");
  revalidatePath(`/assets/${parsed.data.asset_id}`);
  return { success: "Đã xóa ảnh thiết bị." };
}
