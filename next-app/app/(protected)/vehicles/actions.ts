"use server";

import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { PDFArray, PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { z } from "zod";
import { can, requireAccess } from "@/lib/auth";
import { settingValueFromDisplayName, vehicleSettingTypes } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { compactDateForFileName, normalizeUploadedFileName } from "@/lib/upload-file-name";

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const vehicleSchema = z.object({
  id: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
  vehicle_code: z.string().trim().min(1, "Mã xe là bắt buộc").max(80),
  vehicle_name: z.string().trim().min(1, "Tên xe là bắt buộc").max(200),
  license_plate: z.string().trim().min(4, "Biển số chưa hợp lệ").max(30),
  brand: z.string().trim().max(100),
  model: z.string().trim().max(120),
  production_year: z.preprocess(emptyToNull, z.coerce.number().int().min(1950).max(2200).nullable().optional()),
  seat_count: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(100).nullable().optional()),
  fuel_norm_l_per_100km: z.preprocess(emptyToNull, z.coerce.number().min(0).max(1000).nullable().optional()),
  assigned_driver: z.string().trim().max(160),
  department_id: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
  responsible_user_id: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
  status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE", "LIQUIDATED"]),
  note: z.string().trim().max(3000),
});

const inspectionSchema = z.object({
  id: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
  vehicle_id: z.uuid("Xe không hợp lệ"),
  inspection_date: z.iso.date("Ngày đăng kiểm không hợp lệ"),
  expires_on: z.iso.date("Ngày hết hạn không hợp lệ"),
  cost: z.coerce.number().min(0).max(1000000000000),
  reminder_days: z.coerce.number().int().min(1).max(180),
  certificate_number: z.string().trim().max(100),
  inspection_center: z.string().trim().max(200),
  seat_count: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(100).nullable().optional()),
  odometer_km: z.preprocess(emptyToNull, z.coerce.number().int().min(0).nullable().optional()),
  note: z.string().trim().max(3000),
}).refine((value) => value.expires_on >= value.inspection_date, {
  message: "Ngày hết hạn phải từ ngày đăng kiểm trở đi",
});

const repairSchema = z.object({
  id: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
  vehicle_id: z.uuid("Xe không hợp lệ"),
  service_date: z.iso.date("Ngày bảo dưỡng không hợp lệ"),
  service_type: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1, "Nội dung là bắt buộc").max(3000),
  odometer_km: z.preprocess(emptyToNull, z.coerce.number().int().min(0).nullable().optional()),
  vat_amount: z.coerce.number().min(0).max(1000000000000),
  vendor: z.string().trim().max(200),
  invoice_number: z.string().trim().max(100),
  note: z.string().trim().max(3000),
});

const fuelSchema = z.object({
  id: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
  vehicle_id: z.uuid("Xe không hợp lệ"),
  payment_date: z.iso.date("Ngày thanh toán không hợp lệ"),
  liters: z.coerce.number().positive("Số lít phải lớn hơn 0").max(100000),
  odometer_from: z.preprocess(emptyToNull, z.coerce.number().int().min(0).nullable().optional()),
  odometer_to: z.preprocess(emptyToNull, z.coerce.number().int().min(0).nullable().optional()),
  amount: z.coerce.number().min(0).max(1000000000000),
  purchaser: z.string().trim().max(160),
  note: z.string().trim().max(3000),
}).refine((value) => !value.odometer_from || !value.odometer_to || value.odometer_to >= value.odometer_from, {
  message: "Số km đến phải lớn hơn hoặc bằng số km từ",
});

const insuranceSchema = z.object({
  id: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
  renew_from_id: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
  vehicle_id: z.uuid("Xe không hợp lệ"),
  insurance_name: z.string().trim().min(1, "Tên bảo hiểm là bắt buộc").max(200),
  insurance_type: z.string().trim().min(1, "Loại bảo hiểm là bắt buộc").max(160),
  insurance_company: z.string().trim().min(1, "Hãng bảo hiểm là bắt buộc").max(200),
  certificate_number: z.string().trim().max(120),
  starts_on: z.iso.date("Ngày bắt đầu không hợp lệ"),
  expires_on: z.iso.date("Ngày kết thúc không hợp lệ"),
  cost: z.coerce.number().min(0).max(1000000000000),
  reminder_days: z.coerce.number().int().min(1).max(365),
  note: z.string().trim().max(3000),
}).refine((value) => value.expires_on >= value.starts_on, {
  message: "Ngày kết thúc phải từ ngày bắt đầu trở đi",
});

export type VehicleActionState = { error?: string; success?: string };

const vehicleSettingSchema = z.object({
  id: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
  setting_type: z.enum(vehicleSettingTypes),
  display_name: z.string().trim().min(1, "Tên hiển thị là bắt buộc").max(160),
  setting_value: z.string().trim().max(160),
  original_display_name: z.string().trim().max(160),
});

type VehicleDocumentType = "INSPECTION" | "REPAIR" | "FUEL" | "INSURANCE";
type VehicleDocumentKind = "INVOICE" | "CERTIFICATE";
type VehiclePdfCompressionMethod = "LOSSLESS" | "RASTERIZED";
type SavedVehicleRow = VehicleActionState & { recordId?: string };

const maxInvoicePdfBytes = 5 * 1024 * 1024;

function getVehiclePdf(formData: FormData, fieldName = "invoice_pdf", label = "Hóa đơn"): {
  compressionMethod?: VehiclePdfCompressionMethod;
  error?: string;
  file?: File;
  originalByteSize?: number;
} {
  if (formData.get(`${fieldName}_optimizing`) === "1") {
    return { error: `PDF ${label.toLowerCase()} vẫn đang được nén. Hãy chờ hoàn tất rồi lưu lại.` };
  }
  const value = formData.get(fieldName);
  if (!(value instanceof File) || !value.size) return {};
  if (value.type !== "application/pdf" || !value.name.toLowerCase().endsWith(".pdf")) {
    return { error: `${label} chỉ chấp nhận tệp PDF.` };
  }
  if (value.size > maxInvoicePdfBytes) {
    return { error: "PDF sau khi nén không được vượt quá 5 MB." };
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

async function optimizeInvoicePdf(file: File) {
  const originalBytes = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder("ascii").decode(originalBytes.slice(0, 1024));
  if (!header.includes("%PDF-")) throw new Error("Nội dung tệp không phải PDF hợp lệ.");

  const document = await PDFDocument.load(originalBytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const pageCount = document.getPageCount();
  if (!pageCount || pageCount > 200) throw new Error("Hóa đơn phải có từ 1 đến 200 trang.");

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

  const losslessBytes = await document.save({
    addDefaultPage: false,
    objectsPerTick: 50,
    updateFieldAppearances: false,
    useObjectStreams: true,
  });
  return {
    bytes: losslessBytes,
    checksum: createHash("sha256").update(losslessBytes).digest("hex"),
    compressionMethod: "LOSSLESS",
    originalByteSize: originalBytes.byteLength,
    pageCount,
    storedByteSize: losslessBytes.byteLength,
  };
}

async function storeVehicleDocument({
  access,
  compressionMethod,
  file,
  originalByteSize,
  documentKind,
  recordId,
  recordType,
  supabase,
  vehicleId,
  preferredBaseName,
}: {
  access: Awaited<ReturnType<typeof requireAccess>>["access"];
  compressionMethod: VehiclePdfCompressionMethod;
  file: File;
  originalByteSize: number;
  documentKind: VehicleDocumentKind;
  recordId: string;
  recordType: VehicleDocumentType;
  supabase: Awaited<ReturnType<typeof requireAccess>>["supabase"];
  vehicleId: string;
  preferredBaseName: string;
}): Promise<VehicleActionState> {
  let optimized: Awaited<ReturnType<typeof optimizeInvoicePdf>>;
  try {
    optimized = await optimizeInvoicePdf(file);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không thể đọc hoặc nén PDF hóa đơn." };
  }

  const { data: existing } = await supabase
    .from("vehicle_documents")
    .select("id,object_path")
    .eq("record_type", recordType)
    .eq("record_id", recordId)
    .eq("document_kind", documentKind)
    .maybeSingle();
  const documentId = existing?.id ?? crypto.randomUUID();
  const objectPath = `${access.user_id}/${vehicleId}/${recordType}/${recordId}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("vehicle-documents")
    .upload(objectPath, optimized.bytes, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) return { error: "Không thể tải PDF hóa đơn lên kho lưu trữ riêng tư." };

  const metadata = {
    bucket_id: "vehicle-documents",
    checksum: optimized.checksum,
    compression_method: compressionMethod === "RASTERIZED" ? "RASTERIZED" : optimized.compressionMethod,
    created_by: access.user_id,
    file_name: normalizeUploadedFileName({
      fallbackExtension: "pdf",
      originalFileName: file.name,
      preferredBaseName,
    }),
    mime_type: "application/pdf",
    object_path: objectPath,
    original_byte_size: Math.max(originalByteSize, optimized.originalByteSize),
    page_count: optimized.pageCount,
    document_kind: documentKind,
    record_id: recordId,
    record_type: recordType,
    stored_byte_size: optimized.storedByteSize,
    vehicle_id: vehicleId,
  };
  const metadataResult = existing
    ? await supabase.from("vehicle_documents").update(metadata).eq("id", documentId)
    : await supabase.from("vehicle_documents").insert({ id: documentId, ...metadata });
  if (metadataResult.error) {
    await supabase.storage.from("vehicle-documents").remove([objectPath]);
    return { error: "Đã lưu nghiệp vụ nhưng chưa thể liên kết PDF hóa đơn." };
  }

  if (existing?.object_path && existing.object_path !== objectPath) {
    await supabase.storage.from("vehicle-documents").remove([existing.object_path]);
  }
  const savedPercent = Math.max(
    0,
    Math.round((1 - optimized.storedByteSize / Math.max(originalByteSize, optimized.originalByteSize)) * 100),
  );
  return {
    success: savedPercent
      ? `Đã lưu và nén PDF hóa đơn giảm ${savedPercent}% dung lượng.`
      : "Đã lưu PDF hóa đơn ở dung lượng tối ưu.",
  };
}

async function saveRow(
  table: "vehicles" | "vehicle_inspections" | "vehicle_repairs" | "vehicle_fuel_logs" | "vehicle_insurances",
  data: Record<string, unknown> & { id?: string | null },
  success: string,
): Promise<SavedVehicleRow> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.manage")) return { error: "Bạn không có quyền quản lý xe." };
  const { id, ...payload } = data;
  const result = id
    ? await supabase.from(table).update(payload).eq("id", id).select("id").maybeSingle()
    : await supabase.from(table).insert(payload).select("id").single();
  if (result.error) {
    if (result.error.code === "23505") return { error: "Mã xe, biển số hoặc bản ghi này đã tồn tại." };
    return { error: "Không thể lưu dữ liệu. Hãy kiểm tra quyền và thông tin đã nhập." };
  }
  revalidatePath("/vehicles");
  revalidatePath("/vehicles/reports");
  if (!result.data?.id) return { error: "Không tìm thấy bản ghi vừa lưu." };
  return { recordId: result.data.id, success };
}

async function vehiclePlate(
  supabase: Awaited<ReturnType<typeof requireAccess>>["supabase"],
  vehicleId: string,
) {
  const { data } = await supabase
    .from("vehicles")
    .select("license_plate")
    .eq("id", vehicleId)
    .maybeSingle();
  return data?.license_plate || "XE";
}

export async function saveVehicleSetting(
  _state: VehicleActionState,
  formData: FormData,
): Promise<VehicleActionState> {
  const parsed = vehicleSettingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Cấu hình chưa hợp lệ." };
  }
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.manage")) {
    return { error: "Bạn không có quyền cấu hình phân hệ xe." };
  }
  const settingValue = parsed.data.id && parsed.data.display_name === parsed.data.original_display_name
    ? parsed.data.setting_value
    : settingValueFromDisplayName(parsed.data.display_name);
  if (!settingValue) return { error: "Tên hiển thị chưa tạo được mã nội bộ." };

  const { data: migratedCount, error } = await supabase.rpc("save_vehicle_setting", {
    target_display_name: parsed.data.display_name,
    target_setting_id: parsed.data.id ?? null,
    target_setting_type: parsed.data.setting_type,
    target_setting_value: settingValue,
  });
  if (error?.message.includes("VEHICLE_SETTING_TYPE_IN_USE")) {
    return { error: "Cấu hình đã được sử dụng nên không thể chuyển sang danh mục khác." };
  }
  if (error?.message.includes("VEHICLE_SETTING_VALUE_EXISTS") || error?.code === "23505") {
    return { error: "Tên này tạo ra mã nội bộ đã tồn tại trong cùng danh mục." };
  }
  if (error) return { error: "Không thể lưu cấu hình xe." };

  revalidatePath("/vehicles");
  const migratedRecords = Number(migratedCount || 0);
  return {
    success: migratedRecords
      ? `Đã lưu cấu hình và cập nhật ${migratedRecords} hồ sơ xe liên kết.`
      : "Đã lưu cấu hình xe.",
  };
}

export async function toggleVehicleSetting(formData: FormData) {
  const parsed = z.object({
    id: z.uuid(),
    active: z.enum(["true", "false"]),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.manage")) return;
  const { error } = await supabase.rpc("toggle_vehicle_setting", {
    target_active: parsed.data.active === "true",
    target_setting_id: parsed.data.id,
  });
  if (error) return;
  revalidatePath("/vehicles");
}

export async function moveVehicleSetting(formData: FormData) {
  const parsed = z.object({
    id: z.uuid(),
    direction: z.enum(["up", "down"]),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.manage")) return;
  const { error } = await supabase.rpc("reorder_vehicle_setting", {
    move_direction: parsed.data.direction,
    target_setting_id: parsed.data.id,
  });
  if (error) return;
  revalidatePath("/vehicles");
}

export async function saveVehicle(_state: VehicleActionState, formData: FormData) {
  const parsed = vehicleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  return saveRow("vehicles", parsed.data, parsed.data.id ? "Đã cập nhật hồ sơ xe." : "Đã thêm xe mới.");
}

export async function saveVehicleInspection(_state: VehicleActionState, formData: FormData) {
  const invoice = getVehiclePdf(formData);
  if (invoice.error) return { error: invoice.error };
  const parsed = inspectionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  const saved = await saveRow("vehicle_inspections", parsed.data, parsed.data.id ? "Đã cập nhật đăng kiểm." : "Đã ghi nhận đăng kiểm.");
  if (saved.error || !saved.recordId || !invoice.file) return saved;
  const context = await requireAccess();
  const plate = await vehiclePlate(context.supabase, parsed.data.vehicle_id);
  const document = await storeVehicleDocument({ ...context, compressionMethod: invoice.compressionMethod ?? "LOSSLESS", documentKind: "INVOICE", file: invoice.file, originalByteSize: invoice.originalByteSize ?? invoice.file.size, preferredBaseName: `${plate}_DANG-KIEM_${compactDateForFileName(parsed.data.expires_on)}_HOA-DON`, recordId: saved.recordId, recordType: "INSPECTION", vehicleId: parsed.data.vehicle_id });
  revalidatePath("/vehicles");
  return document.error
    ? { success: `${saved.success} ${document.error} Bạn có thể mở Sửa để tải lại.` }
    : { success: `${saved.success} ${document.success}` };
}

export async function saveVehicleRepair(_state: VehicleActionState, formData: FormData) {
  const invoice = getVehiclePdf(formData);
  if (invoice.error) return { error: invoice.error };
  const parsed = repairSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  const saved = await saveRow("vehicle_repairs", parsed.data, parsed.data.id ? "Đã cập nhật bảo dưỡng." : "Đã ghi nhận bảo dưỡng.");
  if (saved.error || !saved.recordId || !invoice.file) return saved;
  const context = await requireAccess();
  const plate = await vehiclePlate(context.supabase, parsed.data.vehicle_id);
  const document = await storeVehicleDocument({ ...context, compressionMethod: invoice.compressionMethod ?? "LOSSLESS", documentKind: "INVOICE", file: invoice.file, originalByteSize: invoice.originalByteSize ?? invoice.file.size, preferredBaseName: `${plate}_BAO-DUONG_${compactDateForFileName(parsed.data.service_date)}_HOA-DON`, recordId: saved.recordId, recordType: "REPAIR", vehicleId: parsed.data.vehicle_id });
  revalidatePath("/vehicles");
  return document.error
    ? { success: `${saved.success} ${document.error} Bạn có thể mở Sửa để tải lại.` }
    : { success: `${saved.success} ${document.success}` };
}

export async function saveVehicleFuel(_state: VehicleActionState, formData: FormData) {
  const invoice = getVehiclePdf(formData);
  if (invoice.error) return { error: invoice.error };
  const parsed = fuelSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  const saved = await saveRow("vehicle_fuel_logs", parsed.data, parsed.data.id ? "Đã cập nhật nhiên liệu." : "Đã ghi nhận nhiên liệu.");
  if (saved.error || !saved.recordId || !invoice.file) return saved;
  const context = await requireAccess();
  const plate = await vehiclePlate(context.supabase, parsed.data.vehicle_id);
  const document = await storeVehicleDocument({ ...context, compressionMethod: invoice.compressionMethod ?? "LOSSLESS", documentKind: "INVOICE", file: invoice.file, originalByteSize: invoice.originalByteSize ?? invoice.file.size, preferredBaseName: `${plate}_NHIEN-LIEU_${compactDateForFileName(parsed.data.payment_date)}_HOA-DON`, recordId: saved.recordId, recordType: "FUEL", vehicleId: parsed.data.vehicle_id });
  revalidatePath("/vehicles");
  return document.error
    ? { success: `${saved.success} ${document.error} Bạn có thể mở Sửa để tải lại.` }
    : { success: `${saved.success} ${document.success}` };
}

export async function saveVehicleInsurance(_state: VehicleActionState, formData: FormData) {
  const invoice = getVehiclePdf(formData, "insurance_invoice_pdf", "Hóa đơn bảo hiểm");
  if (invoice.error) return { error: invoice.error };
  const certificate = getVehiclePdf(formData, "insurance_certificate_pdf", "Giấy chứng nhận bảo hiểm");
  if (certificate.error) return { error: certificate.error };
  const parsed = insuranceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  const { renew_from_id: renewFromId, ...insuranceData } = parsed.data;
  let saved: SavedVehicleRow;
  if (renewFromId) {
    const { access, supabase } = await requireAccess();
    if (!can(access, "vehicles.manage")) return { error: "Bạn không có quyền gia hạn bảo hiểm xe." };
    const { data: renewedRecordId, error } = await supabase.rpc("renew_vehicle_insurance", {
      target_certificate_number: insuranceData.certificate_number,
      target_cost: insuranceData.cost,
      target_expires_on: insuranceData.expires_on,
      target_insurance_company: insuranceData.insurance_company,
      target_insurance_name: insuranceData.insurance_name,
      target_insurance_type: insuranceData.insurance_type,
      target_note: insuranceData.note,
      target_reminder_days: insuranceData.reminder_days,
      target_source_insurance_id: renewFromId,
      target_starts_on: insuranceData.starts_on,
      target_vehicle_id: insuranceData.vehicle_id,
    });
    if (error?.message.includes("VEHICLE_INSURANCE_NOT_ACTIVE") || error?.message.includes("VEHICLE_INSURANCE_ALREADY_RENEWED")) {
      return { error: "Hợp đồng này đã được gia hạn hoặc không còn hiệu lực trong danh sách." };
    }
    if (error?.message.includes("VEHICLE_INSURANCE_VEHICLE_MISMATCH")) {
      return { error: "Không thể đổi xe khi gia hạn bảo hiểm." };
    }
    if (error) return { error: "Không thể gia hạn bảo hiểm. Hãy kiểm tra thông tin và thử lại." };
    saved = { recordId: String(renewedRecordId), success: "Đã gia hạn bảo hiểm và lưu nhật ký kỳ cũ." };
  } else {
    saved = await saveRow(
      "vehicle_insurances",
      insuranceData,
      insuranceData.id ? "Đã cập nhật bảo hiểm xe." : "Đã ghi nhận bảo hiểm xe.",
    );
  }
  revalidatePath("/vehicles");
  revalidatePath("/vehicles/reports");
  if (saved.error || !saved.recordId || (!invoice.file && !certificate.file)) return saved;
  const context = await requireAccess();
  const plate = await vehiclePlate(context.supabase, parsed.data.vehicle_id);
  const messages: string[] = [];
  for (const document of [
    invoice.file ? { ...invoice, file: invoice.file, kind: "INVOICE" as const } : null,
    certificate.file ? { ...certificate, file: certificate.file, kind: "CERTIFICATE" as const } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item))) {
    const result = await storeVehicleDocument({
      ...context,
      compressionMethod: document.compressionMethod ?? "LOSSLESS",
      documentKind: document.kind,
      file: document.file,
      originalByteSize: document.originalByteSize ?? document.file.size,
      preferredBaseName: `${plate}_BAO-HIEM_${parsed.data.insurance_name}_${compactDateForFileName(parsed.data.expires_on)}_${document.kind === "INVOICE" ? "HOA-DON" : "GIAY-CHUNG-NHAN"}`,
      recordId: saved.recordId,
      recordType: "INSURANCE",
      vehicleId: parsed.data.vehicle_id,
    });
    messages.push(result.error ?? result.success ?? "");
  }
  revalidatePath("/vehicles");
  return { success: [saved.success, ...messages].filter(Boolean).join(" ") };
}

export async function deleteVehicleRecord(formData: FormData): Promise<VehicleActionState> {
  const kind = z.enum(["vehicle", "inspection", "repair", "fuel", "insurance"]).safeParse(formData.get("kind"));
  const id = z.uuid().safeParse(formData.get("id"));
  if (!kind.success || !id.success) return { error: "Bản ghi không hợp lệ." };
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.delete")) return { error: "Bạn không có quyền xóa dữ liệu xe." };
  if (kind.data === "vehicle") {
    const archiveResult = await supabase.rpc("archive_vehicle", {
      target_vehicle_id: id.data,
    });
    if (archiveResult.error) {
      const rpcUnavailable = ["42883", "PGRST202"].includes(archiveResult.error.code);
      if (!rpcUnavailable) return { error: "Không thể xóa hồ sơ xe." };

      const permissionResult = await supabase.rpc("can_access_vehicle", {
        target_vehicle_id: id.data,
        required_permission: "vehicles.delete",
      });
      if (permissionResult.error || permissionResult.data !== true) {
        return { error: "Bạn không có quyền xóa hồ sơ xe này." };
      }

      try {
        const adminClient = createAdminClient();
        const { data: archivedVehicle, error: archiveError } = await adminClient
          .from("vehicles")
          .update({
            deleted_at: new Date().toISOString(),
            updated_by: access.user_id,
          })
          .eq("id", id.data)
          .is("deleted_at", null)
          .select("id")
          .maybeSingle();
        if (archiveError || !archivedVehicle) return { error: "Không thể xóa hồ sơ xe." };
      } catch {
        return { error: "Không thể xóa hồ sơ xe do máy chủ chưa đủ cấu hình." };
      }
    }
    revalidatePath("/vehicles");
    revalidatePath("/vehicles/reports");
    return { success: "Đã ẩn hồ sơ xe; toàn bộ lịch sử vẫn được giữ nguyên." };
  }
  if (kind.data === "insurance") {
    const { data: documents, error: documentFindError } = await supabase
      .from("vehicle_documents")
      .select("id,object_path")
      .eq("record_type", "INSURANCE")
      .eq("record_id", id.data);
    if (documentFindError) return { error: "Không thể kiểm tra hồ sơ PDF của bảo hiểm." };
    const objectPaths = (documents ?? []).map((item) => item.object_path);
    if (objectPaths.length) {
      const { error: storageError } = await supabase.storage.from("vehicle-documents").remove(objectPaths);
      if (storageError) return { error: "Không thể xóa hồ sơ PDF của bảo hiểm." };
      const { error: metadataError } = await supabase
        .from("vehicle_documents")
        .delete()
        .in("id", (documents ?? []).map((item) => item.id));
      if (metadataError) return { error: "Không thể dọn thông tin hồ sơ PDF của bảo hiểm." };
    }
  }
  const table = kind.data === "inspection"
    ? "vehicle_inspections"
    : kind.data === "repair"
      ? "vehicle_repairs"
      : kind.data === "insurance"
        ? "vehicle_insurances"
        : "vehicle_fuel_logs";
  const { error } = await supabase.from(table).delete().eq("id", id.data);
  if (error) return { error: "Không thể xóa bản ghi." };
  revalidatePath("/vehicles");
  revalidatePath("/vehicles/reports");
  return { success: "Đã xóa bản ghi." };
}

export async function deleteVehicleDocument(formData: FormData): Promise<VehicleActionState> {
  const parsed = z.object({ id: z.uuid(), record_id: z.uuid() }).safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { error: "Tệp hóa đơn không hợp lệ." };
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.manage")) return { error: "Bạn không có quyền quản lý hóa đơn xe." };
  const { data: document, error: findError } = await supabase
    .from("vehicle_documents")
    .select("id,object_path")
    .eq("id", parsed.data.id)
    .eq("record_id", parsed.data.record_id)
    .single();
  if (findError || !document) return { error: "Không tìm thấy PDF hóa đơn." };
  const { error: storageError } = await supabase.storage
    .from("vehicle-documents")
    .remove([document.object_path]);
  if (storageError) return { error: "Không thể xóa PDF trong kho lưu trữ." };
  const { error: metadataError } = await supabase
    .from("vehicle_documents")
    .delete()
    .eq("id", document.id);
  if (metadataError) return { error: "PDF đã được xóa nhưng chưa thể dọn metadata." };
  revalidatePath("/vehicles");
  return { success: "Đã xóa PDF hóa đơn." };
}

type ImportKind = "fuel" | "repairs";
export type VehicleImportComparisonStatus =
  | "new_vehicle"
  | "new_record"
  | "newer"
  | "changed"
  | "already_saved"
  | "older";

export type VehicleImportRow = {
  kind: ImportKind;
  row: number;
  sheet: string;
  vehicle_name: string;
  license_plate: string;
  date: string;
  description: string;
  liters: number | null;
  odometer_from: number | null;
  odometer_to: number | null;
  amount: number;
  purchaser: string;
  note: string;
  fuel_norm: number | null;
  fingerprint: string;
  warning: string;
  comparison_status?: VehicleImportComparisonStatus;
  stored_latest_date?: string | null;
};

export type VehicleImportState = VehicleActionState & {
  fileName?: string;
  rows?: VehicleImportRow[];
  skipped?: number;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Đ/g, "D")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function stringValue(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value) return String(value.text ?? "");
    if ("result" in value) return String(value.result ?? "");
    if ("richText" in value) return value.richText.map((item) => item.text).join("");
  }
  return String(value).trim();
}

function numberValue(value: ExcelJS.CellValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = stringValue(value).replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: ExcelJS.CellValue): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 20000 && value < 100000) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  }
  const text = stringValue(value).trim();
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function normalizePlate(value: string) {
  return normalizeText(value).replace(/[^A-Z0-9]/g, "");
}

function fingerprint(row: Omit<VehicleImportRow, "fingerprint" | "warning">) {
  return createHash("sha256").update([
    row.kind, normalizePlate(row.license_plate), row.date, row.description,
    row.liters ?? "", row.odometer_from ?? "", row.odometer_to ?? "", row.amount,
  ].join("|")).digest("hex");
}

function findColumn(row: ExcelJS.Row, names: string[]) {
  let found = 0;
  row.eachCell({ includeEmpty: false }, (cell, column) => {
    const text = normalizeText(stringValue(cell.value));
    if (!found && names.some((name) => text.includes(name))) found = column;
  });
  return found;
}

function findNestedColumn(
  worksheet: ExcelJS.Worksheet,
  headerRow: number,
  parentNames: string[],
  childNames: string[],
) {
  const parentColumn = findColumn(worksheet.getRow(headerRow), parentNames);
  if (!parentColumn) return 0;
  const childRow = worksheet.getRow(headerRow + 1);
  for (let column = parentColumn; column <= parentColumn + 3; column += 1) {
    const text = normalizeText(stringValue(childRow.getCell(column).value));
    if (childNames.some((name) => text === name)) return column;
  }
  return 0;
}

function parseSheet(worksheet: ExcelJS.Worksheet, kind: ImportKind): VehicleImportRow[] {
  let headerRow = 0;
  for (let index = 1; index <= Math.min(worksheet.rowCount, 40); index += 1) {
    const rowValues = worksheet.getRow(index).values;
    const rowText = normalizeText(Array.isArray(rowValues) ? rowValues.map((value) => stringValue(value)).join(" ") : "");
    if (rowText.includes("TEN XE") && rowText.includes("BIEN SO")) {
      headerRow = index;
      break;
    }
  }
  if (!headerRow) return [];
  const header = worksheet.getRow(headerRow);
  const vehicleColumn = findColumn(header, ["TEN XE"]);
  const plateColumn = findColumn(header, ["BIEN SO"]);
  const dateColumn = findColumn(header, kind === "fuel" ? ["NGAY THANH TOAN"] : ["NGAY SUA CHUA", "NGAY BAO DUONG"]);
  const amountColumn = findColumn(header, ["SO TIEN"]);
  const descriptionColumn = kind === "repairs" ? findColumn(header, ["NOI DUNG SUA CHUA"]) : 0;
  const litersColumn = kind === "fuel" ? findColumn(header, ["SO LIT NHIEN LIEU"]) : 0;
  const normColumn = kind === "fuel" ? findColumn(header, ["DINH MUC"]) : 0;
  const kmFromColumn = kind === "fuel"
    ? findColumn(header, ["SO KM TU"]) || findNestedColumn(worksheet, headerRow, ["SO KM"], ["TU"])
    : 0;
  const kmToColumn = kind === "fuel"
    ? findColumn(header, ["SO KM DEN"]) || findNestedColumn(worksheet, headerRow, ["SO KM"], ["DEN"])
    : 0;
  const noteColumn = findColumn(header, ["GHI CHU"]);
  if (!vehicleColumn || !plateColumn || !dateColumn || !amountColumn) return [];

  const rows: VehicleImportRow[] = [];
  for (let index = headerRow + 1; index <= worksheet.rowCount; index += 1) {
    const row = worksheet.getRow(index);
    const vehicleName = stringValue(row.getCell(vehicleColumn).value);
    const licensePlate = stringValue(row.getCell(plateColumn).value);
    const date = dateValue(row.getCell(dateColumn).value);
    if (!vehicleName && !licensePlate && !date) continue;
    if (!vehicleName || !licensePlate || !date) continue;
    const amount = numberValue(row.getCell(amountColumn).value) ?? 0;
    const liters = litersColumn ? numberValue(row.getCell(litersColumn).value) : null;
    const odometerFrom = kmFromColumn ? numberValue(row.getCell(kmFromColumn).value) : null;
    const odometerTo = kmToColumn ? numberValue(row.getCell(kmToColumn).value) : null;
    const note = noteColumn ? stringValue(row.getCell(noteColumn).value) : "";
    const description = descriptionColumn ? stringValue(row.getCell(descriptionColumn).value) : "Mua nhiên liệu";
    const raw = {
      kind, row: index, sheet: worksheet.name, vehicle_name: vehicleName,
      license_plate: licensePlate, date, description, liters,
      odometer_from: odometerFrom, odometer_to: odometerTo, amount,
      purchaser: kind === "fuel" ? note : "", note: kind === "repairs" ? note : "",
      fuel_norm: normColumn ? numberValue(row.getCell(normColumn).value) : null,
    };
    const warnings: string[] = [];
    if (kind === "fuel" && (!liters || liters <= 0)) warnings.push("Thiếu số lít");
    if (amount > 10000000 && kind === "fuel") warnings.push("Số tiền nhiên liệu cao bất thường");
    if (normalizePlate(licensePlate).length < 7) warnings.push("Biển số cần kiểm tra");
    rows.push({ ...raw, fingerprint: fingerprint(raw), warning: warnings.join(" · ") });
  }
  return rows;
}

export async function previewVehicleImport(_state: VehicleImportState, formData: FormData): Promise<VehicleImportState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.import")) return { error: "Bạn không có quyền nhập dữ liệu xe." };
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Hãy chọn file XLSX." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: "Chỉ chấp nhận file .xlsx." };
  if (file.size > 8 * 1024 * 1024) return { error: "File XLSX không được vượt quá 8 MB." };
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
    const rows: VehicleImportRow[] = [];
    workbook.eachSheet((sheet) => {
      const name = normalizeText(sheet.name);
      if (name.includes("NHIEN LIEU XE")) rows.push(...parseSheet(sheet, "fuel"));
      if (name.includes("BAO DUONG XE")) rows.push(...parseSheet(sheet, "repairs"));
    });
    if (!rows.length) return { error: "Không tìm thấy sheet nhiên liệu hoặc bảo dưỡng đúng mẫu TDW." };
    if (rows.length > 1000) return { error: "Mỗi lần chỉ nhập tối đa 1.000 dòng." };

    const fileName = file.name.slice(0, 200);
    const { data: existingVehicles, error: vehicleError } = await supabase
      .from("vehicles")
      .select("id,license_plate")
      .is("deleted_at", null)
      .limit(1000);
    if (vehicleError) return { error: "Đã đọc file nhưng chưa thể đối chiếu danh sách xe đang lưu." };

    const vehicleByPlate = new Map(
      (existingVehicles ?? []).map((vehicle) => [normalizePlate(vehicle.license_plate), vehicle.id]),
    );
    const vehicleIds = [...new Set(rows
      .map((row) => vehicleByPlate.get(normalizePlate(row.license_plate)))
      .filter(Boolean))] as string[];
    const emptyHistory = Promise.resolve({ data: [], error: null });
    const [fuelHistoryResult, repairHistoryResult] = await Promise.all([
      vehicleIds.length && rows.some((row) => row.kind === "fuel")
        ? supabase
            .from("vehicle_fuel_logs")
            .select("vehicle_id,payment_date,import_fingerprint,source_file,source_sheet,source_row")
            .in("vehicle_id", vehicleIds)
            .order("payment_date", { ascending: false })
            .limit(10000)
        : emptyHistory,
      vehicleIds.length && rows.some((row) => row.kind === "repairs")
        ? supabase
            .from("vehicle_repairs")
            .select("vehicle_id,service_date,import_fingerprint,source_file,source_sheet,source_row")
            .in("vehicle_id", vehicleIds)
            .order("service_date", { ascending: false })
            .limit(10000)
        : emptyHistory,
    ]);
    if (fuelHistoryResult.error || repairHistoryResult.error) {
      return { error: "Đã đọc file nhưng chưa thể đối chiếu với lịch sử nhiên liệu và bảo dưỡng đang lưu." };
    }

    type ExistingImportRow = {
      vehicle_id: string;
      date: string;
      import_fingerprint: string | null;
      source_file: string | null;
      source_sheet: string | null;
      source_row: number | null;
    };
    const histories: Record<ImportKind, ExistingImportRow[]> = {
      fuel: (fuelHistoryResult.data ?? []).map((item) => ({ ...item, date: item.payment_date })),
      repairs: (repairHistoryResult.data ?? []).map((item) => ({ ...item, date: item.service_date })),
    };
    const latestDateByVehicle = new Map<string, string>();
    const storedFingerprints = new Set<string>();
    const storedSourceRows = new Set<string>();
    (["fuel", "repairs"] as ImportKind[]).forEach((kind) => {
      histories[kind].forEach((item) => {
        const latestKey = `${kind}|${item.vehicle_id}`;
        const latest = latestDateByVehicle.get(latestKey);
        if (!latest || item.date > latest) latestDateByVehicle.set(latestKey, item.date);
        if (item.import_fingerprint) storedFingerprints.add(`${kind}|${item.import_fingerprint}`);
        if (item.source_file && item.source_sheet && item.source_row !== null) {
          storedSourceRows.add(`${kind}|${item.source_file}|${item.source_sheet}|${item.source_row}`);
        }
      });
    });

    const comparedRows = rows.map((row): VehicleImportRow => {
      const vehicleId = vehicleByPlate.get(normalizePlate(row.license_plate));
      const storedLatestDate = vehicleId
        ? latestDateByVehicle.get(`${row.kind}|${vehicleId}`) ?? null
        : null;
      const isAlreadySaved = storedFingerprints.has(`${row.kind}|${row.fingerprint}`);
      const isChangedSourceRow = storedSourceRows.has(
        `${row.kind}|${fileName}|${row.sheet}|${row.row}`,
      );
      let comparisonStatus: VehicleImportComparisonStatus;
      if (isAlreadySaved) comparisonStatus = "already_saved";
      else if (isChangedSourceRow) comparisonStatus = "changed";
      else if (!vehicleId) comparisonStatus = "new_vehicle";
      else if (!storedLatestDate) comparisonStatus = "new_record";
      else if (row.date > storedLatestDate) comparisonStatus = "newer";
      else comparisonStatus = "older";
      return {
        ...row,
        comparison_status: comparisonStatus,
        stored_latest_date: storedLatestDate,
      };
    });

    return {
      success: `Đã đọc và đối chiếu ${comparedRows.length} dòng. Hãy chọn các dòng cần nhập.`,
      fileName,
      rows: comparedRows,
      skipped: 0,
    };
  } catch {
    return { error: "Không thể đọc file XLSX. Hãy kiểm tra file có đúng định dạng và không bị khóa." };
  }
}

const importRowsSchema = z.array(z.object({
  kind: z.enum(["fuel", "repairs"]), row: z.number().int().positive(), sheet: z.string().max(120),
  vehicle_name: z.string().min(1).max(200), license_plate: z.string().min(4).max(30), date: z.iso.date(),
  description: z.string().min(1).max(3000), liters: z.number().nullable(), odometer_from: z.number().nullable(),
  odometer_to: z.number().nullable(), amount: z.number().min(0), purchaser: z.string().max(160), note: z.string().max(3000),
  fuel_norm: z.number().nullable(), fingerprint: z.string().length(64), warning: z.string().max(300),
})).min(1).max(1000);

export async function commitVehicleImport(_state: VehicleImportState, formData: FormData): Promise<VehicleImportState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.import")) return { error: "Bạn không có quyền nhập dữ liệu xe." };
  let raw: unknown;
  try { raw = JSON.parse(String(formData.get("rows") || "[]")); } catch { return { error: "Dữ liệu xem trước không hợp lệ." }; }
  const parsed = importRowsSchema.safeParse(raw);
  if (!parsed.success) return { error: "Dữ liệu xem trước đã thay đổi hoặc không hợp lệ." };
  const fileName = String(formData.get("file_name") || "import.xlsx").slice(0, 200);
  const plates = [...new Set(parsed.data.map((row) => normalizePlate(row.license_plate)))];
  const { data: existingVehicles, error: vehicleReadError } = await supabase
    .from("vehicles").select("id,license_plate").is("deleted_at", null).limit(1000);
  if (vehicleReadError) return { error: "Không thể đọc danh sách xe." };
  const vehicleByPlate = new Map((existingVehicles ?? []).map((vehicle) => [normalizePlate(vehicle.license_plate), vehicle.id]));
  for (const plate of plates) {
    if (vehicleByPlate.has(plate)) continue;
    const source = parsed.data.find((row) => normalizePlate(row.license_plate) === plate)!;
    const { data: created, error } = await supabase.from("vehicles").insert({
      vehicle_code: `TDW-VEH-${plate}`,
      vehicle_name: source.vehicle_name,
      license_plate: source.license_plate,
      fuel_norm_l_per_100km: source.fuel_norm,
      assigned_driver: source.purchaser,
      status: "ACTIVE",
    }).select("id").single();
    if (error || !created) return { error: `Không thể tạo hồ sơ cho xe ${source.license_plate}.` };
    vehicleByPlate.set(plate, created.id);
  }
  const fuelRows = parsed.data.filter((row) => row.kind === "fuel" && row.liters && row.liters > 0).map((row) => ({
    vehicle_id: vehicleByPlate.get(normalizePlate(row.license_plate))!, payment_date: row.date, liters: row.liters!,
    odometer_from: row.odometer_from, odometer_to: row.odometer_to, amount: row.amount,
    purchaser: row.purchaser, note: row.note, source_file: fileName, source_sheet: row.sheet,
    source_row: row.row, import_fingerprint: row.fingerprint,
  }));
  let importedRepairType = "";
  if (parsed.data.some((row) => row.kind === "repairs")) {
    const { data: maintenanceTypes, error: maintenanceTypeError } = await supabase
      .from("settings")
      .select("setting_value")
      .eq("setting_type", "vehicle_maintenance_type")
      .eq("active", true)
      .order("sort_order")
      .order("display_name")
      .limit(20);
    if (maintenanceTypeError || !maintenanceTypes?.length) {
      return { error: "Hãy cấu hình ít nhất một hình thức bảo dưỡng trước khi nhập lịch sử." };
    }
    importedRepairType = maintenanceTypes.find((item) => item.setting_value === "BAO_DUONG_SUA_CHUA")?.setting_value
      ?? maintenanceTypes[0].setting_value;
  }
  const repairRows = parsed.data.filter((row) => row.kind === "repairs").map((row) => ({
    vehicle_id: vehicleByPlate.get(normalizePlate(row.license_plate))!, service_date: row.date,
    service_type: importedRepairType, description: row.description, vat_amount: row.amount,
    note: row.note, source_file: fileName, source_sheet: row.sheet, source_row: row.row,
    import_fingerprint: row.fingerprint,
  }));
  let inserted = 0;
  if (fuelRows.length) {
    const existing = await supabase.from("vehicle_fuel_logs")
      .select("source_sheet,source_row").eq("source_file", fileName).not("source_row", "is", null).limit(2000);
    if (existing.error) return { error: "Không thể đối chiếu lịch sử nhiên liệu đã nhập." };
    const existingKeys = new Set((existing.data ?? []).map((row) => `${row.source_sheet}|${row.source_row}`));
    const updates = fuelRows.filter((row) => existingKeys.has(`${row.source_sheet}|${row.source_row}`));
    const additions = fuelRows.filter((row) => !existingKeys.has(`${row.source_sheet}|${row.source_row}`));
    if (updates.length) {
      const result = await supabase.from("vehicle_fuel_logs").upsert(updates, { onConflict: "source_file,source_sheet,source_row" }).select("id");
      if (result.error) return { error: "Không thể cập nhật lịch sử nhiên liệu đã nhập." };
      inserted += result.data?.length ?? 0;
    }
    if (additions.length) {
      const result = await supabase.from("vehicle_fuel_logs").upsert(additions, { onConflict: "import_fingerprint", ignoreDuplicates: true }).select("id");
      if (result.error) return { error: "Không thể nhập lịch sử nhiên liệu." };
      inserted += result.data?.length ?? 0;
    }
  }
  if (repairRows.length) {
    const existing = await supabase.from("vehicle_repairs")
      .select("source_sheet,source_row").eq("source_file", fileName).not("source_row", "is", null).limit(2000);
    if (existing.error) return { error: "Không thể đối chiếu lịch sử bảo dưỡng đã nhập." };
    const existingKeys = new Set((existing.data ?? []).map((row) => `${row.source_sheet}|${row.source_row}`));
    const updates = repairRows.filter((row) => existingKeys.has(`${row.source_sheet}|${row.source_row}`));
    const additions = repairRows.filter((row) => !existingKeys.has(`${row.source_sheet}|${row.source_row}`));
    if (updates.length) {
      const result = await supabase.from("vehicle_repairs").upsert(updates, { onConflict: "source_file,source_sheet,source_row" }).select("id");
      if (result.error) return { error: "Không thể cập nhật lịch sử bảo dưỡng đã nhập." };
      inserted += result.data?.length ?? 0;
    }
    if (additions.length) {
      const result = await supabase.from("vehicle_repairs").upsert(additions, { onConflict: "import_fingerprint", ignoreDuplicates: true }).select("id");
      if (result.error) return { error: "Không thể nhập lịch sử bảo dưỡng." };
      inserted += result.data?.length ?? 0;
    }
  }
  revalidatePath("/vehicles");
  return { success: `Đã nhập hoặc cập nhật ${inserted} dòng; dữ liệu cùng file/sheet/dòng không bị tạo trùng.` };
}
