"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireAccess } from "@/lib/auth";
import ExcelJS from "exceljs";
import { monthlyFingerprint, quarterlyFingerprint, parsePdfTransaction, parseQuarterlyWorkbook, sha256, vehicleMap, vehicleMatch } from "@/lib/vehicle-tolls";

export type TollActionState = { error?: string; success?: string };

export type TollMonthlyPreviewRow = {
  page: number;
  invoice_number: string;
  transaction_code: string;
  license_plate: string;
  vehicle_id: string | null;
  vehicle_name: string;
  toll_station: string;
  transaction_at: string;
  amount_before_tax: number;
  tax_amount: number;
  amount_after_tax: number;
  fingerprint: string;
  already_saved: boolean;
};

export type TollMonthlyPreviewState = TollActionState & {
  fileName?: string;
  checksum?: string;
  pageCount?: number;
  periodMonth?: string;
  rows?: TollMonthlyPreviewRow[];
};

export type TollQuarterlyPreviewRow = {
  row: number;
  sheet: string;
  vehicle_type: string;
  vehicle_color: string;
  license_plate: string;
  vehicle_id: string | null;
  vehicle_name: string;
  starts_on: string;
  expires_on: string;
  toll_station: string;
  amount: number;
  fingerprint: string;
  comparison_status: "new" | "changed" | "already_saved";
};

export type TollQuarterlyPreviewState = TollActionState & {
  fileName?: string;
  rows?: TollQuarterlyPreviewRow[];
};

export async function previewTollMonthlyPdf(
  _state: TollMonthlyPreviewState,
  formData: FormData,
): Promise<TollMonthlyPreviewState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.import")) return { error: "Bạn không có quyền nhập dữ liệu VETC." };
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Hãy chọn hóa đơn PDF VETC." };
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    return { error: "Chỉ chấp nhận hóa đơn định dạng PDF." };
  }
  if (file.size > 4 * 1024 * 1024) return { error: "PDF tối đa 4 MB. Hãy tách file lớn thành nhiều phần và nhập lần lượt vào cùng tháng." };

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = new TextDecoder("ascii").decode(bytes.slice(0, 1024));
    if (!header.includes("%PDF-")) return { error: "Nội dung tệp không phải PDF hợp lệ." };
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await getDocument({
      data: bytes.slice(),
      isEvalSupported: false,
      useWorkerFetch: false,
    }).promise;
    try {
    if (!document.numPages || document.numPages > 500) return { error: "PDF phải có từ 1 đến 500 trang." };

    const parsedRows: ReturnType<typeof parsePdfTransaction>[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? " " : "") : "").join("");
      parsedRows.push(parsePdfTransaction(text, pageNumber));
    }
    const validRows = parsedRows.filter((row): row is NonNullable<typeof row> => Boolean(row));
    if (!validRows.length) return { error: "Không nhận diện được giao dịch VETC trong PDF." };
    if (validRows.length !== document.numPages) {
      const missingPages = parsedRows.flatMap((row, index) => row ? [] : [index + 1]);
      return { error: `Không đọc được trang ${missingPages.join(", ")}. Hãy kiểm tra PDF trước khi nhập.` };
    }
    const months = new Set(validRows.map((row) => row.transaction_at.slice(0, 7)));
    if (months.size !== 1) return { error: "Một hóa đơn nhập liệu chỉ được chứa giao dịch trong cùng một tháng." };

    const [{ data: vehicles, error: vehicleError }, { data: storedRows, error: storedError }] = await Promise.all([
      supabase.from("vehicles").select("id,vehicle_name,license_plate").is("deleted_at", null).limit(1000),
      supabase.from("vehicle_toll_transactions").select("fingerprint").in("fingerprint", validRows.map((row) => row.fingerprint)).limit(1000),
    ]);
    if (vehicleError || storedError) return { error: "Đã đọc PDF nhưng chưa thể đối chiếu dữ liệu đang lưu." };
    const vehiclesByPlate = vehicleMap(vehicles ?? []);
    const storedFingerprints = new Set((storedRows ?? []).map((row) => row.fingerprint));
    const rows = validRows.map((row): TollMonthlyPreviewRow => {
      const matchedVehicle = vehicleMatch(row.license_plate, vehiclesByPlate);
      return {
        ...row,
        already_saved: storedFingerprints.has(row.fingerprint),
        vehicle_id: matchedVehicle?.id ?? null,
        vehicle_name: matchedVehicle?.vehicle_name ?? "Chưa khớp hồ sơ xe",
      };
    });
    const periodMonth = `${[...months][0]}-01`;
    const total = rows.reduce((sum, row) => sum + row.amount_after_tax, 0);
    return {
      success: `Đã đọc ${rows.length} lượt qua trạm, tổng sau thuế ${total.toLocaleString("vi-VN")} đ.`,
      checksum: sha256(bytes),
      fileName: file.name.slice(0, 200),
      pageCount: document.numPages,
      periodMonth,
      rows,
    };
    } finally { await document.destroy(); }
  } catch {
    return { error: "Không thể đọc PDF VETC. Hãy kiểm tra file không bị khóa hoặc hỏng." };
  }
}

const monthlyRowsSchema = z.array(z.object({
  page: z.number().int().positive(),
  invoice_number: z.string().max(80),
  transaction_code: z.string().max(100),
  license_plate: z.string().min(4).max(30),
  vehicle_id: z.uuid().nullable(),
  vehicle_name: z.string().max(200),
  toll_station: z.string().min(1).max(300),
  transaction_at: z.iso.datetime({ offset: true }),
  amount_before_tax: z.number().finite().min(0).max(100000000000),
  tax_amount: z.number().finite().min(0).max(100000000000),
  amount_after_tax: z.number().finite().min(0).max(100000000000),
  fingerprint: z.string().length(64),
  already_saved: z.boolean(),
})).min(1).max(500);

export async function commitTollMonthlyPdf(
  _state: TollActionState,
  formData: FormData,
): Promise<TollActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.import")) return { error: "Bạn không có quyền nhập dữ liệu VETC." };
  const parsedRows = (() => {
    try { return monthlyRowsSchema.safeParse(JSON.parse(String(formData.get("rows") || "[]"))); }
    catch { return monthlyRowsSchema.safeParse([]); }
  })();
  if (!parsedRows.success) return { error: "Dữ liệu xem trước không hợp lệ hoặc chưa chọn giao dịch." };
  const periodMonth = z.iso.date().safeParse(String(formData.get("period_month") || ""));
  const checksum = z.string().regex(/^[0-9a-f]{64}$/).safeParse(String(formData.get("checksum") || ""));
  const pageCount = z.coerce.number().int().min(1).max(500).safeParse(formData.get("page_count"));
  if (!periodMonth.success || !checksum.success || !pageCount.success || !periodMonth.data.endsWith("-01")) {
    return { error: "Thông tin tệp xem trước không hợp lệ." };
  }
  if (parsedRows.data.some((row) => `${row.transaction_at.slice(0, 7)}-01` !== periodMonth.data)) {
    return { error: "Danh sách chọn có giao dịch không thuộc tháng đang nhập." };
  }

  const { data: vehicles, error: vehiclesError } = await supabase.from("vehicles")
    .select("id,vehicle_name,license_plate").is("deleted_at", null).limit(1000);
  if (vehiclesError) return { error: "Không thể đối chiếu hồ sơ xe." };
  const byPlate = vehicleMap(vehicles ?? []);
  const rows = parsedRows.data.map((row) => ({ ...row,
    vehicle_id: vehicleMatch(row.license_plate, byPlate)?.id ?? null,
    fingerprint: monthlyFingerprint(row),
  }));
  if (rows.some((row) => !row.vehicle_id || row.page > pageCount.data
    || Math.abs(row.amount_before_tax + row.tax_amount - row.amount_after_tax) > 1))
    return { error: "Có giao dịch chưa khớp xe hoặc số tiền không hợp lệ. Hãy đọc lại file." };
  const { data: count, error } = await supabase.rpc("import_vehicle_tolls", {
    target_kind: "monthly", target_source: String(formData.get("file_name") || "VETC.pdf").slice(0, 200),
    target_rows: rows, target_month: periodMonth.data, target_checksum: checksum.data,
    target_pages: pageCount.data,
  });
  if (error) return { error: "Không thể lưu VETC. Dữ liệu cũ được giữ nguyên; hãy kiểm tra quyền của các xe và thử lại." };
  revalidatePath("/vehicles");
  revalidatePath("/vehicles/reports");
  return { success: `Đã nhập ${count ?? 0} lượt VETC mới; giao dịch trùng được bỏ qua.` };
}


export async function previewTollQuarterlyWorkbook(
  _state: TollQuarterlyPreviewState,
  formData: FormData,
): Promise<TollQuarterlyPreviewState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.import")) return { error: "Bạn không có quyền nhập dữ liệu VETC." };
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Hãy chọn file Excel vé quý VETC." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: "Chỉ chấp nhận file .xlsx." };
  if (file.size > 4 * 1024 * 1024) return { error: "File Excel không được vượt quá 4 MB." };

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
    const rawRows = parseQuarterlyWorkbook(workbook);
    if (!rawRows.length) return { error: "Không tìm thấy bảng vé quý đúng mẫu VETC." };
    if (rawRows.length > 1000) return { error: "Mỗi lần chỉ nhập tối đa 1.000 dòng." };

    const fileName = file.name.slice(0, 200);
    const [{ data: vehicles, error: vehicleError }, { data: storedRows, error: storedError }] = await Promise.all([
      supabase.from("vehicles").select("id,vehicle_name,license_plate").is("deleted_at", null).limit(1000),
      supabase.from("vehicle_toll_quarterly_passes").select("source_file,source_sheet,source_row,fingerprint").limit(5000),
    ]);
    if (vehicleError || storedError) return { error: "Đã đọc Excel nhưng chưa thể đối chiếu dữ liệu đang lưu." };
    const vehiclesByPlate = vehicleMap(vehicles ?? []);
    const storedFingerprints = new Set((storedRows ?? []).map((row) => row.fingerprint));
    const storedSources = new Set((storedRows ?? []).map((row) => `${row.source_file}|${row.source_sheet}|${row.source_row}`));
    const rows = rawRows.map((row): TollQuarterlyPreviewRow => {
      const matchedVehicle = vehicleMatch(row.license_plate, vehiclesByPlate);
      return {
        ...row,
        vehicle_id: matchedVehicle?.id ?? null,
        vehicle_name: matchedVehicle?.vehicle_name ?? "Chưa khớp hồ sơ xe",
        comparison_status: storedFingerprints.has(row.fingerprint)
          ? "already_saved"
          : storedSources.has(`${fileName}|${row.sheet}|${row.row}`) ? "changed" : "new",
      };
    });
    return {
      success: `Đã đọc và đối chiếu ${rows.length} đăng ký vé quý.`,
      fileName,
      rows,
    };
  } catch {
    return { error: "Không thể đọc file Excel vé quý. Hãy kiểm tra file không bị khóa hoặc hỏng." };
  }
}

const quarterlyRowsSchema = z.array(z.object({
  row: z.number().int().positive(),
  sheet: z.string().min(1).max(120),
  vehicle_type: z.string().max(160),
  vehicle_color: z.string().max(100),
  license_plate: z.string().min(4).max(30),
  vehicle_id: z.uuid().nullable(),
  vehicle_name: z.string().max(200),
  starts_on: z.iso.date(),
  expires_on: z.iso.date(),
  toll_station: z.string().min(1).max(300),
  amount: z.number().finite().min(0).max(100000000000),
  fingerprint: z.string().length(64),
  comparison_status: z.enum(["new", "changed", "already_saved"]),
})).min(1).max(1000);

export async function commitTollQuarterlyWorkbook(
  _state: TollActionState,
  formData: FormData,
): Promise<TollActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.import")) return { error: "Bạn không có quyền nhập dữ liệu VETC." };
  let raw: unknown;
  try { raw = JSON.parse(String(formData.get("rows") || "[]")); }
  catch { return { error: "Dữ liệu xem trước không hợp lệ." }; }
  const parsed = quarterlyRowsSchema.safeParse(raw);
  if (!parsed.success) return { error: "Hãy chọn ít nhất một đăng ký vé quý hợp lệ." };
  const { data: vehicles, error: vehiclesError } = await supabase.from("vehicles")
    .select("id,vehicle_name,license_plate").is("deleted_at", null).limit(1000);
  if (vehiclesError) return { error: "Không thể đối chiếu hồ sơ xe." };
  const byPlate = vehicleMap(vehicles ?? []);
  const rows = parsed.data.map((row) => ({ ...row,
    vehicle_id: vehicleMatch(row.license_plate, byPlate)?.id ?? null,
    fingerprint: quarterlyFingerprint(row),
  }));
  if (rows.some((row) => !row.vehicle_id || row.expires_on < row.starts_on))
    return { error: "Có đăng ký chưa khớp xe hoặc ngày hiệu lực không hợp lệ." };
  const { data: count, error } = await supabase.rpc("import_vehicle_tolls", {
    target_kind: "quarterly", target_source: String(formData.get("file_name") || "VETC.xlsx").slice(0, 200),
    target_rows: rows,
  });
  if (error) return { error: "Không thể lưu vé quý. Dữ liệu cũ được giữ nguyên; hãy kiểm tra quyền của các xe và thử lại." };
  revalidatePath("/vehicles");
  revalidatePath("/vehicles/reports");
  return { success: `Đã nhập hoặc cập nhật ${count ?? 0} đăng ký vé quý VETC.` };
}

async function deleteToll(kind: string, formData: FormData): Promise<TollActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.delete")) return { error: "Bạn không có quyền xóa dữ liệu xe." };
  const id = z.uuid().safeParse(String(formData.get("id") || ""));
  if (!id.success) return { error: "Mã bản ghi không hợp lệ." };
  const { data, error } = await supabase.rpc("delete_vehicle_toll", { target_kind: kind, target_id: id.data });
  if (error || !data) return { error: "Không thể xóa bản ghi hoặc bạn không có quyền trên các xe liên quan." };
  revalidatePath("/vehicles");
  revalidatePath("/vehicles/reports");
  return { success: "Đã xóa dữ liệu VETC." };
}

export async function deleteTollMonthlyBatch(formData: FormData) {
  return deleteToll("monthly", formData);
}
export async function deleteTollQuarterlyPass(formData: FormData) {
  return deleteToll("quarterly", formData);
}
