"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";
import sharp from "sharp";
import { can, requireAccess } from "@/lib/auth";
import { runMaintenanceReminders } from "@/lib/maintenance-reminders";

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const formBoolean = z.preprocess(
  (value) => value === true || value === "true" || value === "on",
  z.boolean(),
);

const planSchema = z.object({
  scope_type: z.enum(["ASSET", "GROUP", "TYPE"]),
  asset_id: z.string().trim().max(160).default(""),
  asset_group: z.string().trim().max(160).default(""),
  asset_type: z.string().trim().max(160).default(""),
  title: z.string().trim().min(1, "Tên kế hoạch là bắt buộc").max(200),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
  next_due_date: z.iso.date("Ngày đến hạn không hợp lệ"),
  note: z.string().trim().max(3000),
  active: formBoolean,
  repeat_enabled: formBoolean,
});

const planUpdateSchema = z.object({
  id: z.uuid("Kế hoạch không hợp lệ"),
  title: z.string().trim().min(1, "Tên kế hoạch là bắt buộc").max(200),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
  next_due_date: z.iso.date("Ngày đến hạn không hợp lệ"),
  note: z.string().trim().max(3000),
  active: formBoolean,
  repeat_enabled: formBoolean,
  apply_to_batch: formBoolean,
});

const logSchema = z.object({
  asset_id: z.uuid("Thiết bị không hợp lệ"),
  plan_id: z.preprocess(emptyToNull, z.uuid().nullable()),
  maintenance_date: z.iso.date("Ngày bảo trì không hợp lệ"),
  action_type: z.string().trim().max(120),
  description: z.string().trim().min(1, "Nội dung bảo trì là bắt buộc").max(3000),
  cost: z.coerce.number().min(0, "Chi phí không được âm").max(1000000000000),
  vendor: z.string().trim().max(200),
  warranty_months: z.coerce.number().int().min(0).max(600),
  performed_by: z.string().trim().max(200),
  note: z.string().trim().max(3000),
});

const logCreateSchema = logSchema.omit({ asset_id: true, plan_id: true }).extend({
  plan_batch_id: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
});

const logAssetIdsSchema = z
  .array(z.uuid("Thiết bị không hợp lệ"))
  .min(1, "Hãy chọn ít nhất một thiết bị")
  .max(200, "Chỉ được ghi nhận tối đa 200 thiết bị mỗi lần");

const logPlanIdsSchema = z
  .array(z.uuid("Kế hoạch không hợp lệ"))
  .max(200, "Chỉ được ghi nhận tối đa 200 kế hoạch mỗi lần");

const logUpdateSchema = logSchema.extend({
  id: z.uuid("Nhật ký bảo trì không hợp lệ"),
});

const maintenanceMediaSchema = z.object({
  maintenance_log_id: z.uuid("Nhật ký bảo trì không hợp lệ"),
});

const maintenanceMediaFileSchema = z
  .instanceof(File)
  .refine((file) => file.size > 0, "Hãy chọn ít nhất một hình ảnh")
  .refine((file) => file.size <= 5 * 1024 * 1024, "Ảnh không được vượt quá 5 MB")
  .refine(
    (file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type),
    "Chỉ chấp nhận JPEG, PNG hoặc WebP",
  );

const maxMaintenanceMediaFiles = 5;
const maxMaintenanceMediaBytes = 5 * 1024 * 1024;

type AccessContext = Awaited<ReturnType<typeof requireAccess>>;

export type MaintenanceFormState = {
  error?: string;
  success?: string;
  logId?: string;
};

export type MaintenanceMediaFormState = {
  error?: string;
  success?: string;
};

export type ReminderFormState = {
  error?: string;
  success?: string;
};

function selectedScopeValue(data: z.infer<typeof planSchema>) {
  if (data.scope_type === "GROUP") return data.asset_group;
  if (data.scope_type === "TYPE") return data.asset_type;
  return z.uuid().safeParse(data.asset_id).success ? data.asset_id : "";
}

function maintenanceRpcError(message: string) {
  if (message.includes("at most 200")) {
    return "Phạm vi có hơn 200 thiết bị. Hãy chọn nhóm hoặc loại nhỏ hơn.";
  }
  if (message.includes("No assets match")) {
    return "Không có thiết bị nào phù hợp với phạm vi đã chọn.";
  }
  if (message.includes("access denied") || message.includes("Access denied")) {
    return "Bạn không có quyền quản lý một hoặc nhiều thiết bị trong phạm vi này.";
  }
  return "Không thể lưu kế hoạch. Hãy kiểm tra quyền và dữ liệu.";
}

function getMaintenanceMediaFiles(formData: FormData) {
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length > maxMaintenanceMediaFiles) {
    return {
      error: `Chỉ được tải tối đa ${maxMaintenanceMediaFiles} ảnh cho mỗi lần ghi nhận.`,
      files: [] as File[],
    };
  }
  if (files.reduce((total, file) => total + file.size, 0) > maxMaintenanceMediaBytes) {
    return {
      error: "Tổng dung lượng ảnh mỗi lần tải không được vượt quá 5 MB.",
      files: [] as File[],
    };
  }
  for (const file of files) {
    const parsed = maintenanceMediaFileSchema.safeParse(file);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Ảnh chưa hợp lệ",
        files: [] as File[],
      };
    }
  }
  return { files };
}

async function storeMaintenanceMedia({
  access,
  assetId,
  file,
  logId,
  supabase,
}: {
  access: AccessContext["access"];
  assetId: string;
  file: File;
  logId: string;
  supabase: AccessContext["supabase"];
}): Promise<{ error?: string }> {
  const extension =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const mediaId = crypto.randomUUID();
  const objectPath = `${access.user_id}/${assetId}/maintenance/${logId}/${mediaId}.${extension}`;
  const thumbnailPath = `${access.user_id}/${assetId}/maintenance/${logId}/${mediaId}.thumb.webp`;
  const bytes = await file.arrayBuffer();
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
    const detectedMime =
      metadata.format === "jpeg"
        ? "image/jpeg"
        : metadata.format === "png"
          ? "image/png"
          : metadata.format === "webp"
            ? "image/webp"
            : null;
    if (
      detectedMime !== file.type
      || !metadata.width
      || !metadata.height
      || (metadata.pages ?? 1) > 1
    ) {
      throw new Error("Unsupported image content");
    }
    imageWidth = metadata.width;
    imageHeight = metadata.height;
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
    owner_type: "MAINTENANCE",
    owner_id: logId,
    asset_id: assetId,
    object_path: objectPath,
    thumbnail_path: thumbnailPath,
    file_name: file.name.slice(0, 200),
    mime_type: file.type,
    byte_size: file.size,
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
      contentType: file.type,
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

  return {};
}

export async function createMaintenancePlan(
  _previousState: MaintenanceFormState,
  formData: FormData,
): Promise<MaintenanceFormState> {
  const parsed = planSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  }

  const { supabase, access } = await requireAccess();
  if (!can(access, "maintenance.manage")) {
    return { error: "Bạn không có quyền tạo kế hoạch bảo trì." };
  }

  const scopeValue = selectedScopeValue(parsed.data);
  if (!scopeValue) {
    return { error: "Hãy chọn phạm vi áp dụng cho kế hoạch." };
  }

  const { data: createdCount, error } = await supabase.rpc(
    "create_maintenance_plan_batch",
    {
      target_scope_type: parsed.data.scope_type,
      target_scope_value: scopeValue,
      target_title: parsed.data.title,
      target_frequency: parsed.data.frequency,
      target_next_due_date: parsed.data.next_due_date,
      target_note: parsed.data.note,
      target_active: parsed.data.active,
      target_repeat_enabled: parsed.data.repeat_enabled,
    },
  );
  if (error) {
    return { error: maintenanceRpcError(error.message) };
  }

  revalidatePath("/maintenance");
  const count = typeof createdCount === "number" ? createdCount : 0;
  return { success: `Đã tạo kế hoạch cho ${count} thiết bị.` };
}

export async function updateMaintenancePlan(
  _previousState: MaintenanceFormState,
  formData: FormData,
): Promise<MaintenanceFormState> {
  const parsed = planUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  }

  const { supabase, access } = await requireAccess();
  if (!can(access, "maintenance.manage")) {
    return { error: "Bạn không có quyền sửa kế hoạch bảo trì." };
  }

  const { data: updatedCount, error } = await supabase.rpc(
    "update_maintenance_plan_schedule",
    {
      target_plan_id: parsed.data.id,
      target_title: parsed.data.title,
      target_frequency: parsed.data.frequency,
      target_next_due_date: parsed.data.next_due_date,
      target_note: parsed.data.note,
      target_active: parsed.data.active,
      target_repeat_enabled: parsed.data.repeat_enabled,
      target_apply_to_batch: parsed.data.apply_to_batch,
    },
  );
  if (error) {
    return { error: maintenanceRpcError(error.message) };
  }

  revalidatePath("/maintenance");
  const count = typeof updatedCount === "number" ? updatedCount : 0;
  return { success: `Đã cập nhật ${count} kế hoạch.` };
}

export async function createMaintenanceLog(
  _previousState: MaintenanceFormState,
  formData: FormData,
): Promise<MaintenanceFormState> {
  const parsed = logCreateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  }
  const parsedAssetIds = logAssetIdsSchema.safeParse([
    ...new Set(
      formData
        .getAll("asset_ids")
        .filter((value): value is string => typeof value === "string" && value !== ""),
    ),
  ]);
  if (!parsedAssetIds.success) {
    return { error: parsedAssetIds.error.issues[0]?.message ?? "Thiết bị chưa hợp lệ" };
  }
  const parsedPlanIds = logPlanIdsSchema.safeParse([
    ...new Set(
      formData
        .getAll("plan_ids")
        .filter((value): value is string => typeof value === "string" && value !== ""),
    ),
  ]);
  if (!parsedPlanIds.success) {
    return { error: parsedPlanIds.error.issues[0]?.message ?? "Kế hoạch chưa hợp lệ" };
  }
  const mediaFiles = getMaintenanceMediaFiles(formData);
  if (mediaFiles.error) return { error: mediaFiles.error };
  if (parsedAssetIds.data.length > 1 && mediaFiles.files.length) {
    return {
      error: "Chưa hỗ trợ dùng chung ảnh khi ghi nhận nhiều thiết bị. Hãy bỏ ảnh hoặc ghi từng thiết bị.",
    };
  }

  const { supabase, access } = await requireAccess();
  if (!can(access, "maintenance.manage")) {
    return { error: "Bạn không có quyền ghi nhận bảo trì." };
  }

  const planByAssetId = new Map<string, string>();
  if (parsedPlanIds.data.length) {
    if (parsedPlanIds.data.length !== parsedAssetIds.data.length) {
      return { error: "Danh sách thiết bị và kế hoạch không khớp." };
    }
    const { data: matchingPlans, error: planError } = await supabase
      .from("maintenance_plans")
      .select("id,asset_id")
      .in("id", parsedPlanIds.data)
      .eq("active", true)
      .in("asset_id", parsedAssetIds.data);
    if (planError || matchingPlans?.length !== parsedPlanIds.data.length) {
      return { error: "Một hoặc nhiều thiết bị không thuộc kế hoạch đang áp dụng." };
    }
    matchingPlans.forEach((plan) => planByAssetId.set(plan.asset_id, plan.id));
    if (planByAssetId.size !== parsedAssetIds.data.length) {
      return { error: "Mỗi thiết bị phải tương ứng với đúng một kế hoạch." };
    }
  } else if (parsed.data.plan_batch_id) {
    const { data: matchingPlans, error: planError } = await supabase
      .from("maintenance_plans")
      .select("id,asset_id")
      .eq("batch_id", parsed.data.plan_batch_id)
      .eq("active", true)
      .in("asset_id", parsedAssetIds.data);
    if (planError || matchingPlans?.length !== parsedAssetIds.data.length) {
      return { error: "Một hoặc nhiều thiết bị không thuộc kế hoạch đang áp dụng." };
    }
    matchingPlans.forEach((plan) => planByAssetId.set(plan.asset_id, plan.id));
  } else if (parsedAssetIds.data.length > 1) {
    return { error: "Chỉ có thể ghi nhận nhiều thiết bị khi chọn một kế hoạch định kỳ." };
  }

  const { plan_batch_id: _planBatchId, ...sharedLogFields } = parsed.data;
  const logRows = parsedAssetIds.data.map((assetId) => ({
    ...sharedLogFields,
    asset_id: assetId,
    plan_id: planByAssetId.get(assetId) ?? null,
  }));
  const { data: createdLogs, error } = await supabase
    .from("maintenance_logs")
    .insert(logRows)
    .select("id,asset_id");
  if (error || !createdLogs || createdLogs.length !== logRows.length) {
    return { error: "Không thể lưu nhật ký. Hãy kiểm tra quyền và dữ liệu." };
  }

  let uploadedMedia = 0;
  const createdLog = createdLogs[0];
  if (createdLog) {
    for (const file of mediaFiles.files) {
      const result = await storeMaintenanceMedia({
        access,
        assetId: createdLog.asset_id,
        file,
        logId: createdLog.id,
        supabase,
      });
      if (!result.error) uploadedMedia += 1;
    }
  }

  revalidatePath("/maintenance");
  parsedAssetIds.data.forEach((assetId) => revalidatePath(`/assets/${assetId}`));
  const mediaMessage = mediaFiles.files.length
    ? ` Đã tải ${uploadedMedia}/${mediaFiles.files.length} ảnh.`
    : "";
  const retryMessage = uploadedMedia < mediaFiles.files.length
    ? " Hãy mở nút Ảnh của nhật ký để tải lại ảnh chưa thành công."
    : "";
  return {
    logId: createdLog?.id,
    success: `Đã ghi nhận bảo trì cho ${createdLogs.length} thiết bị.${mediaMessage}${retryMessage}`,
  };
}

export async function updateMaintenanceLog(
  _previousState: MaintenanceFormState,
  formData: FormData,
): Promise<MaintenanceFormState> {
  const parsed = logUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  }

  const { supabase, access } = await requireAccess();
  if (!can(access, "maintenance.manage")) {
    return { error: "Bạn không có quyền sửa nhật ký bảo trì." };
  }

  const { data: currentLog } = await supabase
    .from("maintenance_logs")
    .select("id,asset_id")
    .eq("id", parsed.data.id)
    .single();
  if (!currentLog) return { error: "Không tìm thấy nhật ký cần sửa." };
  if (currentLog.asset_id !== parsed.data.asset_id) {
    return { error: "Không thể chuyển nhật ký sang thiết bị khác." };
  }

  if (parsed.data.plan_id) {
    const { data: matchingPlan } = await supabase
      .from("maintenance_plans")
      .select("id")
      .eq("id", parsed.data.plan_id)
      .eq("asset_id", currentLog.asset_id)
      .maybeSingle();
    if (!matchingPlan) {
      return { error: "Kế hoạch đã chọn không thuộc thiết bị này." };
    }
  }

  const { id, ...updates } = parsed.data;
  const { error } = await supabase
    .from("maintenance_logs")
    .update(updates)
    .eq("id", id);
  if (error) {
    return { error: "Không thể cập nhật nhật ký. Hãy kiểm tra quyền và dữ liệu." };
  }

  revalidatePath("/maintenance");
  revalidatePath(`/maintenance/${id}`);
  revalidatePath(`/assets/${currentLog.asset_id}`);
  return { logId: id, success: "Đã cập nhật nhật ký bảo trì." };
}

export async function uploadMaintenanceMedia(
  _previousState: MaintenanceMediaFormState,
  formData: FormData,
): Promise<MaintenanceMediaFormState> {
  const parsed = maintenanceMediaSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nhật ký bảo trì không hợp lệ" };
  }
  const mediaFiles = getMaintenanceMediaFiles(formData);
  if (mediaFiles.error) return { error: mediaFiles.error };
  if (!mediaFiles.files.length) return { error: "Hãy chọn ít nhất một hình ảnh." };

  const { supabase, access } = await requireAccess();
  if (!can(access, "maintenance.manage")) {
    return { error: "Bạn không có quyền tải hình ảnh bảo trì." };
  }
  const { data: log, error: logError } = await supabase
    .from("maintenance_logs")
    .select("id, asset_id")
    .eq("id", parsed.data.maintenance_log_id)
    .single();
  if (logError || !log) {
    return { error: "Không tìm thấy nhật ký hoặc bạn không có quyền tải ảnh." };
  }

  let uploadedMedia = 0;
  for (const file of mediaFiles.files) {
    const result = await storeMaintenanceMedia({
      access,
      assetId: log.asset_id,
      file,
      logId: log.id,
      supabase,
    });
    if (!result.error) uploadedMedia += 1;
  }
  if (!uploadedMedia) return { error: "Không thể tải ảnh lên Storage." };

  revalidatePath("/maintenance");
  revalidatePath(`/maintenance/${log.id}`);
  revalidatePath(`/assets/${log.asset_id}`);
  return {
    success: `Đã tải ${uploadedMedia}/${mediaFiles.files.length} ảnh cho nhật ký bảo trì.`,
  };
}

export async function deleteMaintenanceMedia(formData: FormData) {
  const parsed = z.object({
    id: z.uuid("Ảnh không hợp lệ"),
    maintenance_log_id: z.uuid("Nhật ký bảo trì không hợp lệ"),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Thông tin ảnh không hợp lệ." };

  const { supabase, access } = await requireAccess();
  if (!can(access, "maintenance.manage")) {
    return { error: "Bạn không có quyền xóa hình ảnh bảo trì." };
  }
  const { data } = await supabase
    .from("media_files")
    .select("object_path, thumbnail_path, asset_id")
    .eq("id", parsed.data.id)
    .eq("owner_type", "MAINTENANCE")
    .eq("owner_id", parsed.data.maintenance_log_id)
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
    .eq("id", parsed.data.id)
    .eq("owner_type", "MAINTENANCE")
    .eq("owner_id", parsed.data.maintenance_log_id);
  if (databaseError) return { error: "Không thể xóa thông tin ảnh." };

  revalidatePath("/maintenance");
  revalidatePath(`/maintenance/${parsed.data.maintenance_log_id}`);
  revalidatePath(`/assets/${data.asset_id}`);
  return { success: "Đã xóa ảnh bảo trì." };
}

export async function toggleMaintenancePlan(formData: FormData) {
  const parsed = z.object({
    id: z.uuid(),
    active: z.enum(["true", "false"]),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const { supabase, access } = await requireAccess();
  if (!can(access, "maintenance.manage")) return;

  await supabase
    .from("maintenance_plans")
    .update({ active: parsed.data.active === "true" })
    .eq("id", parsed.data.id);
  revalidatePath("/maintenance");
}

export async function deleteMaintenanceRecord(formData: FormData) {
  const parsed = z.object({
    id: z.uuid(),
    kind: z.enum(["plan", "log"]),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Thông tin cần xóa không hợp lệ." };

  const { supabase, access } = await requireAccess();
  if (!can(access, "maintenance.delete")) return { error: "Bạn không có quyền xóa dữ liệu bảo trì." };

  const table =
    parsed.data.kind === "plan" ? "maintenance_plans" : "maintenance_logs";
  if (parsed.data.kind === "log") {
    const { data: mediaRows, error: mediaLookupError } = await supabase
      .from("media_files")
      .select("id, object_path, thumbnail_path")
      .eq("owner_type", "MAINTENANCE")
      .eq("owner_id", parsed.data.id);
    if (mediaLookupError) {
      return { error: "Không thể kiểm tra hình ảnh của nhật ký bảo trì." };
    }
    if (mediaRows?.length) {
      const { error: storageError } = await supabase.storage
        .from("asset-media")
        .remove(
          mediaRows.flatMap((media) => [
            media.object_path,
            ...(media.thumbnail_path ? [media.thumbnail_path] : []),
          ]),
        );
      if (storageError) {
        return { error: "Không thể xóa hình ảnh của nhật ký bảo trì." };
      }
      const { error: mediaDeleteError } = await supabase
        .from("media_files")
        .delete()
        .eq("owner_type", "MAINTENANCE")
        .eq("owner_id", parsed.data.id);
      if (mediaDeleteError) {
        return { error: "Không thể xóa metadata hình ảnh của nhật ký bảo trì." };
      }
    }
  }
  const { error } = await supabase.from(table).delete().eq("id", parsed.data.id);
  if (error) return { error: "Không thể xóa dữ liệu bảo trì." };
  revalidatePath("/maintenance");
  return {
    success: parsed.data.kind === "plan"
      ? "Đã xóa kế hoạch bảo trì."
      : "Đã xóa nhật ký bảo trì.",
  };
}

export async function sendMaintenanceReminders(
  _previousState: ReminderFormState,
): Promise<ReminderFormState> {
  const { access } = await requireAccess();
  if (!access.roles.includes("admin")) {
    return { error: "Chỉ quản trị viên được gửi email nhắc bảo trì." };
  }

  try {
    const result = await runMaintenanceReminders();
    revalidatePath("/maintenance");
    return {
      success: result.claimed
        ? `Đã gửi ${result.sent}; lỗi ${result.failed}; chưa xác nhận ${result.unknown}.`
        : `Không có email mới cần gửi. Đã kiểm tra ${result.checked} kế hoạch.`,
    };
  } catch (error) {
    console.error("manual_maintenance_reminder_failed", {
      reason:
        error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
    });
    return {
      error: "Không thể hoàn tất gửi email. Hãy xem nhật ký hệ thống.",
    };
  }
}
