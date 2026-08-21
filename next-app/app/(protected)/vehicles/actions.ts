"use server";

import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

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
  service_type: z.string().trim().min(1).max(80),
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

export type VehicleActionState = { error?: string; success?: string };

async function saveRow(
  table: "vehicles" | "vehicle_inspections" | "vehicle_repairs" | "vehicle_fuel_logs",
  data: Record<string, unknown> & { id?: string | null },
  success: string,
): Promise<VehicleActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.manage")) return { error: "Bạn không có quyền quản lý xe." };
  const { id, ...payload } = data;
  const result = id
    ? await supabase.from(table).update(payload).eq("id", id)
    : await supabase.from(table).insert(payload);
  if (result.error) {
    if (result.error.code === "23505") return { error: "Mã xe, biển số hoặc bản ghi này đã tồn tại." };
    return { error: "Không thể lưu dữ liệu. Hãy kiểm tra quyền và thông tin đã nhập." };
  }
  revalidatePath("/vehicles");
  revalidatePath("/vehicles/reports");
  return { success };
}

export async function saveVehicle(_state: VehicleActionState, formData: FormData) {
  const parsed = vehicleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  return saveRow("vehicles", parsed.data, parsed.data.id ? "Đã cập nhật hồ sơ xe." : "Đã thêm xe mới.");
}

export async function saveVehicleInspection(_state: VehicleActionState, formData: FormData) {
  const parsed = inspectionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  return saveRow("vehicle_inspections", parsed.data, parsed.data.id ? "Đã cập nhật đăng kiểm." : "Đã ghi nhận đăng kiểm.");
}

export async function saveVehicleRepair(_state: VehicleActionState, formData: FormData) {
  const parsed = repairSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  return saveRow("vehicle_repairs", parsed.data, parsed.data.id ? "Đã cập nhật bảo dưỡng." : "Đã ghi nhận bảo dưỡng.");
}

export async function saveVehicleFuel(_state: VehicleActionState, formData: FormData) {
  const parsed = fuelSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  return saveRow("vehicle_fuel_logs", parsed.data, parsed.data.id ? "Đã cập nhật nhiên liệu." : "Đã ghi nhận nhiên liệu.");
}

export async function deleteVehicleRecord(formData: FormData): Promise<VehicleActionState> {
  const kind = z.enum(["vehicle", "inspection", "repair", "fuel"]).safeParse(formData.get("kind"));
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
  const table = kind.data === "inspection" ? "vehicle_inspections" : kind.data === "repair" ? "vehicle_repairs" : "vehicle_fuel_logs";
  const { error } = await supabase.from(table).delete().eq("id", id.data);
  if (error) return { error: "Không thể xóa bản ghi." };
  revalidatePath("/vehicles");
  revalidatePath("/vehicles/reports");
  return { success: "Đã xóa bản ghi." };
}

type ImportKind = "fuel" | "repairs";
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
  const { access } = await requireAccess();
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
    return { success: `Đã đọc ${rows.length} dòng. Hãy kiểm tra trước khi xác nhận.`, fileName: file.name.slice(0, 200), rows, skipped: 0 };
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
  const repairRows = parsed.data.filter((row) => row.kind === "repairs").map((row) => ({
    vehicle_id: vehicleByPlate.get(normalizePlate(row.license_plate))!, service_date: row.date,
    service_type: "BAO_DUONG_SUA_CHUA", description: row.description, vat_amount: row.amount,
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
