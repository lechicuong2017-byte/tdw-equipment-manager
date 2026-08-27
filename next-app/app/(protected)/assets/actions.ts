"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { PDFArray, PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { z } from "zod";
import sharp from "sharp";
import { can, requireAccess } from "@/lib/auth";
import { assetCodePrefix, currentAssetCodeYear } from "@/lib/asset-code";
import { safeAssetsReturnTo } from "@/lib/asset-navigation";
import { compactDateForFileName, normalizeUploadedFileName } from "@/lib/upload-file-name";

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
  auto_asset_code: z.preprocess((value) => value === "true", z.boolean()),
});

export type AssetFormState = {
  error?: string;
};

export type LiquidationActionState = {
  error?: string;
  success?: string;
};

type AssetInvoiceCompressionMethod = "LOSSLESS" | "RASTERIZED";

const maxAssetInvoicePdfBytes = 5 * 1024 * 1024;

function getAssetPurchasePdf(formData: FormData): {
  compressionMethod?: AssetInvoiceCompressionMethod;
  error?: string;
  file?: File;
  originalByteSize?: number;
} {
  const fieldName = "purchase_invoice_pdf";
  if (formData.get(`${fieldName}_optimizing`) === "1") {
    return { error: "PDF hóa đơn mua vẫn đang được tối ưu. Hãy chờ hoàn tất rồi lưu lại." };
  }
  const value = formData.get(fieldName);
  if (!(value instanceof File) || !value.size) return {};
  if (value.type !== "application/pdf" || !value.name.toLowerCase().endsWith(".pdf")) {
    return { error: "Hóa đơn mua chỉ chấp nhận tệp PDF." };
  }
  if (value.size > maxAssetInvoicePdfBytes) {
    return { error: "PDF hóa đơn sau khi tối ưu không được vượt quá 5 MB." };
  }
  const methodValue = formData.get(`${fieldName}_compression_method`);
  const originalSizeValue = Number(formData.get(`${fieldName}_original_byte_size`));
  const originalByteSize = Number.isFinite(originalSizeValue)
    && originalSizeValue >= value.size
    && originalSizeValue <= 20 * 1024 * 1024
    ? Math.trunc(originalSizeValue)
    : value.size;
  return {
    compressionMethod: methodValue === "RASTERIZED" ? "RASTERIZED" : "LOSSLESS",
    file: value,
    originalByteSize,
  };
}

async function optimizeAssetPurchasePdf(file: File) {
  const originalBytes = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder("ascii").decode(originalBytes.slice(0, 1024));
  if (!header.includes("%PDF-")) throw new Error("Nội dung tệp không phải PDF hợp lệ.");

  const document = await PDFDocument.load(originalBytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const pageCount = document.getPageCount();
  if (!pageCount || pageCount > 200) {
    throw new Error("Hóa đơn mua phải có từ 1 đến 200 trang.");
  }

  document.catalog.delete(PDFName.of("OpenAction"));
  document.catalog.delete(PDFName.of("AA"));
  const names = document.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  names?.delete(PDFName.of("JavaScript"));
  names?.delete(PDFName.of("EmbeddedFiles"));
  document.getPages().forEach((page) => {
    const annotations = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    annotations?.asArray().forEach((reference) => {
      const annotation = document.context.lookup(reference, PDFDict);
      annotation?.delete(PDFName.of("A"));
      annotation?.delete(PDFName.of("AA"));
    });
  });

  const optimizedBytes = await document.save({
    addDefaultPage: false,
    objectsPerTick: 50,
    updateFieldAppearances: false,
    useObjectStreams: true,
  });
  if (optimizedBytes.byteLength > maxAssetInvoicePdfBytes) {
    throw new Error("PDF hóa đơn vẫn vượt quá 5 MB sau khi kiểm tra và tối ưu trên máy chủ.");
  }
  return {
    bytes: optimizedBytes,
    checksum: createHash("sha256").update(optimizedBytes).digest("hex"),
    originalByteSize: originalBytes.byteLength,
    pageCount,
    storedByteSize: optimizedBytes.byteLength,
  };
}

async function storeAssetPurchaseDocument({
  access,
  assetCode,
  assetId,
  assetKind,
  compressionMethod,
  file,
  originalByteSize,
  purchaseDate,
  supabase,
}: {
  access: Awaited<ReturnType<typeof requireAccess>>["access"];
  assetCode: string;
  assetId: string;
  assetKind: "DEVICE" | "COMPONENT";
  compressionMethod: AssetInvoiceCompressionMethod;
  file: File;
  originalByteSize: number;
  purchaseDate: string | null;
  supabase: Awaited<ReturnType<typeof requireAccess>>["supabase"];
}): Promise<{ error?: string; success?: string }> {
  let optimized: Awaited<ReturnType<typeof optimizeAssetPurchasePdf>>;
  try {
    optimized = await optimizeAssetPurchasePdf(file);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không thể đọc hoặc tối ưu PDF hóa đơn." };
  }

  const { data: existing } = await supabase
    .from("asset_documents")
    .select("id,object_path")
    .eq("asset_id", assetId)
    .eq("document_kind", "PURCHASE_INVOICE")
    .maybeSingle();
  const documentId = existing?.id ?? crypto.randomUUID();
  const objectPath = `${access.user_id}/${assetId}/PURCHASE_INVOICE/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("asset-documents")
    .upload(objectPath, optimized.bytes, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) return { error: "Không thể tải PDF hóa đơn lên kho lưu trữ riêng tư." };

  const preferredBaseName = [
    assetCode,
    assetKind === "COMPONENT" ? "LINH-KIEN" : "THIET-BI",
    "HOA-DON-MUA",
    compactDateForFileName(purchaseDate ?? undefined),
  ].filter(Boolean).join("_");
  const metadata = {
    asset_id: assetId,
    bucket_id: "asset-documents",
    checksum: optimized.checksum,
    compression_method: compressionMethod,
    created_by: access.user_id,
    document_kind: "PURCHASE_INVOICE",
    file_name: normalizeUploadedFileName({
      fallbackExtension: "pdf",
      originalFileName: file.name,
      preferredBaseName,
    }),
    mime_type: "application/pdf",
    object_path: objectPath,
    original_byte_size: Math.max(originalByteSize, optimized.originalByteSize),
    page_count: optimized.pageCount,
    stored_byte_size: optimized.storedByteSize,
  };
  const metadataResult = existing
    ? await supabase.from("asset_documents").update(metadata).eq("id", documentId)
    : await supabase.from("asset_documents").insert({ id: documentId, ...metadata });
  if (metadataResult.error) {
    await supabase.storage.from("asset-documents").remove([objectPath]);
    return { error: "Thiết bị đã lưu nhưng chưa thể liên kết PDF hóa đơn mua." };
  }
  if (existing?.object_path && existing.object_path !== objectPath) {
    await supabase.storage.from("asset-documents").remove([existing.object_path]);
  }
  const sourceSize = Math.max(originalByteSize, optimized.originalByteSize);
  const savedPercent = Math.max(0, Math.round((1 - optimized.storedByteSize / sourceSize) * 100));
  return {
    success: savedPercent
      ? `Đã lưu hóa đơn mua và giảm ${savedPercent}% dung lượng PDF.`
      : "Đã lưu hóa đơn mua ở dung lượng tối ưu.",
  };
}

export async function saveAsset(
  _previousState: AssetFormState,
  formData: FormData,
): Promise<AssetFormState> {
  const purchasePdf = getAssetPurchasePdf(formData);
  if (purchasePdf.error) return { error: purchasePdf.error };
  const parsed = assetSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  }

  const { supabase, access } = await requireAccess();
  const { id, auto_asset_code: autoAssetCode, ...payload } = parsed.data;
  if (!id && autoAssetCode) {
    const prefix = assetCodePrefix(payload.asset_type, payload.asset_kind);
    const year = payload.purchase_year ?? currentAssetCodeYear();
    const { data: generatedCode, error: codeError } = await supabase.rpc(
      "next_asset_code",
      {
        target_prefix: prefix,
        target_year: year,
      },
    );
    if (codeError || typeof generatedCode !== "string") {
      return { error: "Không thể tự sinh mã thiết bị. Vui lòng thử lại hoặc nhập mã thủ công." };
    }
    payload.asset_code = generatedCode;
  }
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
  const documentResult = purchasePdf.file
    ? await storeAssetPurchaseDocument({
        access,
        assetCode: payload.asset_code,
        assetId: data.id,
        assetKind: payload.asset_kind,
        compressionMethod: purchasePdf.compressionMethod ?? "LOSSLESS",
        file: purchasePdf.file,
        originalByteSize: purchasePdf.originalByteSize ?? purchasePdf.file.size,
        purchaseDate: payload.purchase_date,
        supabase,
      })
    : {};
  const baseSuccessMessage = id ? "Đã cập nhật thiết bị." : "Đã thêm thiết bị.";
  const successMessage = documentResult.error
    ? `${baseSuccessMessage} Tuy nhiên ${documentResult.error} Bạn có thể mở Chỉnh sửa để tải lại.`
    : [baseSuccessMessage, documentResult.success].filter(Boolean).join(" ");
  const returnTo = safeAssetsReturnTo(formData.get("return_to"));
  if (returnTo) {
    const separator = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${separator}ok=${encodeURIComponent(successMessage)}`);
  }
  redirect(`/assets/${data.id}?ok=${encodeURIComponent(successMessage)}`);
}

export async function deleteAssetPurchaseDocument(formData: FormData) {
  const parsed = z.object({
    asset_id: z.uuid(),
    id: z.uuid(),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Hồ sơ hóa đơn mua không hợp lệ." };

  const { supabase, access } = await requireAccess();
  if (!can(access, "assets.manage")) {
    return { error: "Bạn không có quyền xóa hóa đơn mua." };
  }
  const { data: document } = await supabase
    .from("asset_documents")
    .select("id,object_path")
    .eq("id", parsed.data.id)
    .eq("asset_id", parsed.data.asset_id)
    .eq("document_kind", "PURCHASE_INVOICE")
    .maybeSingle();
  if (!document) return { error: "Không tìm thấy hóa đơn mua cần xóa." };

  const { error: storageError } = await supabase.storage
    .from("asset-documents")
    .remove([document.object_path]);
  if (storageError) return { error: "Không thể xóa PDF hóa đơn khỏi kho riêng tư." };
  const { error } = await supabase.from("asset_documents").delete().eq("id", document.id);
  if (error) return { error: "PDF đã được xóa nhưng chưa thể dọn bản ghi hồ sơ." };

  revalidatePath("/assets");
  revalidatePath(`/assets/${parsed.data.asset_id}`);
  revalidatePath(`/assets/${parsed.data.asset_id}/edit`);
  return { success: "Đã xóa hóa đơn mua." };
}

export async function archiveAsset(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Mã thiết bị không hợp lệ." };

  const { supabase, access } = await requireAccess();
  if (!can(access, "assets.delete")) {
    return { error: "Bạn không có quyền xóa thiết bị." };
  }
  const { error } = await supabase.rpc("archive_asset", {
    target_asset_id: id.data,
  });

  if (error?.code === "23503") {
    return { error: "Thiết bị đang có liên kết linh kiện. Hãy tháo hoặc kết thúc liên kết trước khi xóa." };
  }
  if (error) return { error: "Không thể xóa thiết bị. Vui lòng kiểm tra quyền và thử lại." };

  revalidatePath("/dashboard");
  revalidatePath("/assets");
  const successMessage = "Đã xóa thiết bị khỏi danh sách quản lý. Lịch sử liên quan vẫn được giữ lại.";
  const returnTo = safeAssetsReturnTo(formData.get("return_to"));
  if (returnTo) {
    const separator = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${separator}ok=${encodeURIComponent(successMessage)}`);
  }
  redirect(`/assets?ok=${encodeURIComponent(successMessage)}`);
}

const optionalMoney = z.preprocess(
  emptyToNull,
  z.coerce.number().min(0).max(1000000000000).nullable(),
);

const liquidationSchema = z.object({
  asset_id: z.uuid("Thiết bị không hợp lệ"),
  liquidation_date: z.iso.date("Ngày thanh lý không hợp lệ"),
  recovery_value: optionalMoney,
  reason: z.string().trim().min(1, "Lý do thanh lý là bắt buộc").max(500),
  note: z.string().trim().max(2000),
});

export async function liquidateAsset(
  _previousState: LiquidationActionState,
  formData: FormData,
): Promise<LiquidationActionState> {
  const parsed = liquidationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Thông tin thanh lý chưa hợp lệ." };
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  if (parsed.data.liquidation_date > today) {
    return { error: "Ngày thanh lý không được lớn hơn ngày hiện tại." };
  }

  const { supabase, access } = await requireAccess();
  if (!can(access, "assets.delete")) {
    return { error: "Bạn không có quyền ghi nhận thanh lý thiết bị." };
  }

  const { error } = await supabase.rpc("liquidate_asset", {
    target_asset_id: parsed.data.asset_id,
    target_liquidation_date: parsed.data.liquidation_date,
    target_recovery_value: parsed.data.recovery_value,
    target_reason: parsed.data.reason,
    target_note: parsed.data.note,
  });
  if (error?.code === "23503") {
    return { error: "Hãy tháo các linh kiện đang gắn trước khi thanh lý thiết bị." };
  }
  if (error) return { error: "Không thể ghi nhận thanh lý. Vui lòng kiểm tra lại dữ liệu." };

  revalidatePath("/dashboard");
  revalidatePath("/assets");
  revalidatePath("/reports");
  redirect(`/assets?scope=liquidated&ok=${encodeURIComponent("Đã ghi nhận thiết bị thanh lý.")}`);
}

export async function restoreLiquidatedAsset(formData: FormData) {
  const parsed = z.object({
    id: z.uuid(),
    reason: z.string().trim().max(500).default("Khôi phục do ghi nhận nhầm"),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Thông tin khôi phục không hợp lệ." };

  const { supabase, access } = await requireAccess();
  if (!can(access, "assets.delete")) {
    return { error: "Bạn không có quyền khôi phục thiết bị thanh lý." };
  }
  const { error } = await supabase.rpc("restore_liquidated_asset", {
    target_asset_id: parsed.data.id,
    target_void_reason: parsed.data.reason,
  });
  if (error) return { error: "Không thể khôi phục thiết bị vào danh sách quản lý." };

  revalidatePath("/dashboard");
  revalidatePath("/assets");
  revalidatePath("/reports");
  redirect(`/assets?status=LUU_KHO_THANH_LY&ok=${encodeURIComponent("Đã khôi phục thiết bị về trạng thái lưu kho chờ thanh lý.")}`);
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
  state: "installed" | "updated" | "removed" | "replaced" | "error",
) {
  if (state === "error") {
    redirect(`/assets/${assetId}?component_status=error`);
  }
  const messages = {
    installed: "Đã gắn linh kiện vào thiết bị.",
    updated: "Đã cập nhật ngày lắp và ghi chú linh kiện.",
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

const updateComponentInstallationSchema = z.object({
  host_asset_id: z.uuid(),
  component_asset_id: z.uuid(),
  installation_id: z.uuid(),
  installed_at: z.iso.date("Ngày lắp không hợp lệ"),
  slot_name: z.string().trim().max(120),
  note: z.string().trim().max(1000),
});

export async function updateAssetComponentInstallation(formData: FormData) {
  const parsed = updateComponentInstallationSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    const hostId = z.uuid().safeParse(formData.get("host_asset_id"));
    if (hostId.success) componentRedirect(hostId.data, "error");
    return;
  }

  const { supabase, access } = await requireAccess();
  if (!can(access, "assets.manage")) {
    componentRedirect(parsed.data.host_asset_id, "error");
  }
  const { error } = await supabase.rpc("update_asset_component_installation", {
    target_installation_id: parsed.data.installation_id,
    target_installed_at: parsed.data.installed_at,
    target_slot_name: parsed.data.slot_name,
    target_note: parsed.data.note,
  });
  if (error) componentRedirect(parsed.data.host_asset_id, "error");

  revalidatePath("/assets");
  revalidatePath(`/assets/${parsed.data.host_asset_id}`);
  revalidatePath(`/assets/${parsed.data.component_asset_id}`);
  componentRedirect(parsed.data.host_asset_id, "updated");
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

const assetMediaFileSchema = z
  .instanceof(File)
  .refine((file) => file.size > 0, "Hãy chọn ít nhất một hình ảnh")
  .refine((file) => file.size <= 5 * 1024 * 1024, "Mỗi ảnh không được vượt quá 5 MB")
  .refine(
    (file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type),
    "Chỉ chấp nhận JPEG, PNG hoặc WebP",
  );

const mediaSchema = z.object({
  asset_id: z.uuid(),
  files: z.array(assetMediaFileSchema).min(1).max(5, "Chỉ được chọn tối đa 5 ảnh"),
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
    files: formData.getAll("files"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ảnh chưa hợp lệ" };
  }

  const { supabase, access } = await requireAccess();
  const { data: asset, error: assetError } = await supabase
    .from("assets")
    .select("id,asset_code")
    .eq("id", parsed.data.asset_id)
    .single();
  if (assetError || !asset) {
    return { error: "Không tìm thấy thiết bị hoặc bạn không có quyền tải ảnh." };
  }

  const { count: existingCount, error: countError } = await supabase
    .from("media_files")
    .select("id", { count: "exact", head: true })
    .eq("asset_id", asset.id)
    .eq("owner_type", "ASSET")
    .eq("owner_id", asset.id);
  if (countError) {
    return { error: "Không thể kiểm tra số lượng ảnh hiện tại." };
  }
  const remainingSlots = Math.max(0, 5 - (existingCount ?? 0));
  if (parsed.data.files.length > remainingSlots) {
    return {
      error: remainingSlots
        ? `Thiết bị chỉ còn chỗ cho ${remainingSlots} ảnh.`
        : "Thiết bị đã đủ 5 ảnh. Hãy xóa ảnh cũ trước khi tải ảnh khác lên.",
    };
  }

  const insertedIds: string[] = [];
  const uploadedPaths: string[] = [];
  const rollbackUploads = async () => {
    if (uploadedPaths.length) {
      await supabase.storage.from("asset-media").remove(uploadedPaths);
    }
    if (insertedIds.length) {
      await supabase.from("media_files").delete().in("id", insertedIds);
    }
  };

  for (const file of parsed.data.files) {
    const extension = file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
    const mediaId = crypto.randomUUID();
    const objectPath = `${access.user_id}/${asset.id}/${mediaId}.${extension}`;
    const thumbnailPath = `${access.user_id}/${asset.id}/${mediaId}.thumb.webp`;
    const bytes = await file.arrayBuffer();
    const checksum = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
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
      await rollbackUploads();
      return { error: `Ảnh “${file.name}” không hợp lệ hoặc có kích thước xử lý quá lớn.` };
    }

    const { error: metadataError } = await supabase.from("media_files").insert({
      id: mediaId,
      owner_type: "ASSET",
      owner_id: asset.id,
      asset_id: asset.id,
      object_path: objectPath,
      thumbnail_path: thumbnailPath,
      file_name: normalizeUploadedFileName({
        fallbackExtension: extension,
        originalFileName: file.name,
        preferredBaseName: `${asset.asset_code}_ANH-THIET-BI_${compactDateForFileName()}_${mediaId.slice(0, 8)}`,
      }),
      mime_type: file.type,
      byte_size: file.size,
      checksum,
      width: imageWidth,
      height: imageHeight,
      created_by: access.user_id,
    });
    if (metadataError) {
      await rollbackUploads();
      return { error: "Không thể chuẩn bị metadata cho hình ảnh." };
    }
    insertedIds.push(mediaId);

    const { error: uploadError } = await supabase.storage
      .from("asset-media")
      .upload(objectPath, bytes, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
    if (uploadError) {
      await rollbackUploads();
      return { error: `Không thể tải ảnh “${file.name}” lên Storage.` };
    }
    uploadedPaths.push(objectPath);

    const { error: thumbnailUploadError } = await supabase.storage
      .from("asset-media")
      .upload(thumbnailPath, thumbnailBytes, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      });
    if (thumbnailUploadError) {
      await rollbackUploads();
      return { error: "Không thể tạo ảnh xem nhanh; các ảnh trong lần tải này đã được hoàn tác." };
    }
    uploadedPaths.push(thumbnailPath);
  }

  revalidatePath("/assets");
  revalidatePath(`/assets/${asset.id}`);
  return {
    success: parsed.data.files.length > 1
      ? `Đã tải ${parsed.data.files.length} ảnh lên.`
      : "Đã tải ảnh lên.",
  };
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
    .eq("owner_type", "ASSET")
    .eq("owner_id", parsed.data.asset_id)
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
    .eq("owner_type", "ASSET")
    .eq("owner_id", parsed.data.asset_id);
  if (databaseError) return { error: "Không thể xóa thông tin ảnh." };
  revalidatePath("/assets");
  revalidatePath(`/assets/${parsed.data.asset_id}`);
  return { success: "Đã xóa ảnh thiết bị." };
}
