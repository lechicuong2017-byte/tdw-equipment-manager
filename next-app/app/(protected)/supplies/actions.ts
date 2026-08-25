"use server";

import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireAccess } from "@/lib/auth";

export type SupplyActionState = { error?: string; success?: string };

const categorySchema = z.enum(["OFFICE_SUPPLY", "CLEANING_SUPPLY"]);
const itemSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  category: categorySchema,
  item_code: z.string().trim().max(80).default(""),
  item_name: z.string().trim().min(1, "Tên hàng là bắt buộc").max(300),
  unit: z.string().trim().min(1, "Đơn vị là bắt buộc").max(80),
  description: z.string().trim().max(2000).default(""),
  default_unit_price: z.coerce.number().min(0).max(1000000000000),
  active: z.string().optional(),
});

const requestSchema = z.object({
  request_no: z.string().trim().min(1).max(80),
  category: categorySchema,
  period_type: z.enum(["MONTH", "QUARTER", "YEAR"]),
  period_year: z.coerce.number().int().min(2000).max(2200),
  period_month: z.string().optional(),
  period_quarter: z.string().optional(),
  requested_on: z.iso.date(),
  required_on: z.string().optional(),
  department_id: z.string().optional(),
  requesting_department: z.string().trim().max(300),
  requester_name: z.string().trim().max(160),
  checker_name: z.string().trim().max(160),
  approver_name: z.string().trim().max(160),
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "ORDERED", "CLOSED", "REJECTED"]),
  note: z.string().trim().max(3000),
  item_id: z.string().uuid(),
  proposed_quantity: z.coerce.number().min(0),
  stock_quantity: z.coerce.number().min(0),
  ordered_quantity: z.coerce.number().min(0),
  approved_unit_price: z.coerce.number().min(0),
  requested_departments: z.string().trim().max(1000),
  approval_note: z.string().trim().max(1000),
  line_note: z.string().trim().max(2000),
});

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value) return String(value.text ?? "").trim();
    if ("result" in value) return String(value.result ?? "").trim();
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
  }
  return String(value).trim();
}

function cellNumber(value: ExcelJS.CellValue): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value && typeof value === "object" && "result" in value) return cellNumber(value.result ?? null);
  const parsed = Number(cellText(value).replace(/[^0-9.,-]/g, "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function excelDate(value: ExcelJS.CellValue): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = cellText(value);
  const match = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function scanValue(worksheet: ExcelJS.Worksheet, label: string) {
  const wanted = normalizeText(label);
  for (let rowIndex = 1; rowIndex <= Math.min(12, worksheet.rowCount); rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    for (let column = 1; column <= Math.min(14, worksheet.columnCount); column += 1) {
      const text = normalizeText(row.getCell(column).value);
      if (text === wanted || text.startsWith(`${wanted}:`)) {
        for (let next = column + 1; next <= Math.min(14, worksheet.columnCount); next += 1) {
          const value = cellText(row.getCell(next).value);
          if (value) return value;
        }
      }
    }
  }
  return "";
}

type ParsedLine = {
  itemName: string;
  unit: string;
  proposedQuantity: number;
  stockQuantity: number;
  orderedQuantity: number;
  requestedDepartments: string;
  approvalNote: string;
  proposedUnitPrice: number | null;
  approvedUnitPrice: number;
  note: string;
};

function parseWorksheet(worksheet: ExcelJS.Worksheet, fileName: string) {
  let headerRow = 0;
  for (let rowIndex = 1; rowIndex <= Math.min(25, worksheet.rowCount); rowIndex += 1) {
    const values = Array.from({ length: worksheet.columnCount }, (_, index) => normalizeText(worksheet.getRow(rowIndex).getCell(index + 1).value));
    if (values.some((value) => value === "TEN HANG")) {
      headerRow = rowIndex;
      break;
    }
  }
  if (!headerRow) throw new Error("Không tìm thấy cột TÊN HÀNG trong file mẫu.");

  const header = worksheet.getRow(headerRow);
  const columns = new Map<string, number[]>();
  for (let column = 1; column <= worksheet.columnCount; column += 1) {
    const name = normalizeText(header.getCell(column).value);
    if (!name) continue;
    columns.set(name, [...(columns.get(name) ?? []), column]);
  }
  const findColumn = (...names: string[]) => {
    for (const name of names) {
      const matches = columns.get(normalizeText(name));
      if (matches?.length) return matches[matches.length - 1];
    }
    return 0;
  };
  const itemColumn = findColumn("TÊN HÀNG");
  const unitColumn = findColumn("ĐV");
  const proposedColumn = findColumn("SỐ LƯỢNG ĐỀ XUẤT");
  const stockColumn = [...columns.entries()].find(([name]) => name.includes("SO LUONG TON DEN NGAY"))?.[1]?.[0] ?? 0;
  const orderedColumn = findColumn("SỐ LƯỢNG ĐẶT MUA");
  const departmentColumn = findColumn("BỘ PHẬN ĐỀ NGHỊ");
  const approvalColumn = findColumn("TGĐ DUYỆT");
  const priceColumns = columns.get("DON GIA") ?? [];
  const approvedPriceColumn = priceColumns.at(-1) ?? 0;
  const proposedPriceColumn = priceColumns.length > 1 ? priceColumns[0] : 0;
  const noteColumn = findColumn("GHI CHÚ");
  const lines: ParsedLine[] = [];

  for (let rowIndex = headerRow + 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const itemName = cellText(row.getCell(itemColumn).value).replace(/\s+/g, " ").trim();
    const normalized = normalizeText(itemName);
    if (!itemName || normalized.includes("TONG CHI PHI") || normalized === "VAN PHONG PHAM") continue;
    const unit = cellText(row.getCell(unitColumn).value) || "Đơn vị";
    const approvedUnitPrice = cellNumber(row.getCell(approvedPriceColumn).value);
    lines.push({
      itemName,
      unit,
      proposedQuantity: cellNumber(row.getCell(proposedColumn).value),
      stockQuantity: cellNumber(row.getCell(stockColumn).value),
      orderedQuantity: cellNumber(row.getCell(orderedColumn).value),
      requestedDepartments: cellText(row.getCell(departmentColumn).value),
      approvalNote: cellText(row.getCell(approvalColumn).value),
      proposedUnitPrice: proposedPriceColumn ? cellNumber(row.getCell(proposedPriceColumn).value) : null,
      approvedUnitPrice,
      note: cellText(row.getCell(noteColumn).value),
    });
  }
  if (!lines.length) throw new Error("File không có dòng hàng hóa hợp lệ.");

  const titleText = Array.from({ length: Math.min(15, worksheet.rowCount) }, (_, index) =>
    Array.from({ length: worksheet.columnCount }, (_, column) => cellText(worksheet.getRow(index + 1).getCell(column + 1).value)).join(" "),
  ).join(" ");
  const normalizedTitle = normalizeText(titleText);
  const category = normalizedTitle.includes("VAN PHONG PHAM") || normalizeText(fileName).includes("VAN PHONG PHAM")
    ? "OFFICE_SUPPLY" as const
    : "CLEANING_SUPPLY" as const;
  const quarterMatch = normalizedTitle.match(/QUY\s*(I{1,3}|IV|[1-4])\s*[\/-]\s*(20\d{2})/);
  const romanQuarter: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };
  const yearMatch = titleText.match(/20\d{2}/);
  const periodYear = quarterMatch ? Number(quarterMatch[2]) : Number(yearMatch?.[0] ?? new Date().getFullYear());
  const periodQuarter = quarterMatch ? (romanQuarter[quarterMatch[1]] ?? Number(quarterMatch[1])) : Math.ceil((new Date().getMonth() + 1) / 3);
  let requestedOn: string | null = null;
  for (let rowIndex = 1; rowIndex <= Math.min(8, worksheet.rowCount) && !requestedOn; rowIndex += 1) {
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      requestedOn = excelDate(worksheet.getRow(rowIndex).getCell(column).value);
      if (requestedOn) break;
    }
  }
  return {
    category,
    periodYear,
    periodQuarter,
    requestedOn: requestedOn ?? `${periodYear}-01-01`,
    requestNo: scanValue(worksheet, "Số") || `${periodQuarter}/${periodYear}`,
    requestingDepartment: scanValue(worksheet, "Bộ phận yêu cầu"),
    requesterName: scanValue(worksheet, "Người đề nghị"),
    checkerName: scanValue(worksheet, "Người kiểm tra"),
    approverName: scanValue(worksheet, "Người duyệt"),
    lines,
  };
}

export async function saveSupplyItem(_state: SupplyActionState, formData: FormData): Promise<SupplyActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.manage")) return { error: "Bạn không có quyền quản lý danh mục hàng." };
  const parsed = itemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ." };
  const { id, active, ...values } = parsed.data;
  const payload = { ...values, active: active === "on", updated_by: access.user_id };
  const result = id
    ? await supabase.from("supply_items").update(payload).eq("id", id)
    : await supabase.from("supply_items").insert({ ...payload, created_by: access.user_id });
  if (result.error) return { error: result.error.code === "23505" ? "Tên hàng này đã có trong danh mục." : "Không thể lưu hàng hóa." };
  revalidatePath("/supplies");
  return { success: id ? "Đã cập nhật hàng hóa." : "Đã thêm hàng hóa." };
}

export async function saveSupplyRequest(_state: SupplyActionState, formData: FormData): Promise<SupplyActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.manage")) return { error: "Bạn không có quyền tạo phiếu yêu cầu." };
  const parsed = requestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu phiếu chưa hợp lệ." };
  const { item_id, proposed_quantity, stock_quantity, ordered_quantity, approved_unit_price, requested_departments, approval_note, line_note, ...request } = parsed.data;
  const { data: item, error: itemError } = await supabase.from("supply_items").select("item_name,unit,category").eq("id", item_id).single();
  if (itemError || !item) return { error: "Không tìm thấy hàng hóa đã chọn." };
  if (item.category !== request.category) return { error: "Loại phiếu phải trùng với loại hàng hóa đã chọn." };
  const periodMonth = request.period_type === "MONTH" ? Number(request.period_month) : null;
  const periodQuarter = request.period_type === "QUARTER" ? Number(request.period_quarter) : null;
  if (request.period_type === "MONTH" && (!periodMonth || periodMonth > 12)) return { error: "Hãy chọn tháng của phiếu." };
  if (request.period_type === "QUARTER" && (!periodQuarter || periodQuarter > 4)) return { error: "Hãy chọn quý của phiếu." };
  const { data: saved, error } = await supabase.from("supply_requests").insert({
    ...request,
    period_month: periodMonth,
    period_quarter: periodQuarter,
    required_on: request.required_on || null,
    department_id: request.department_id || null,
    created_by: access.user_id,
    updated_by: access.user_id,
  }).select("id").single();
  if (error || !saved) return { error: "Không thể tạo phiếu yêu cầu." };
  const lineResult = await supabase.from("supply_request_lines").insert({
    request_id: saved.id, item_id, item_name: item.item_name, unit: item.unit,
    proposed_quantity, stock_quantity, ordered_quantity, approved_unit_price,
    requested_departments, approval_note, note: line_note,
    created_by: access.user_id, updated_by: access.user_id,
  });
  if (lineResult.error) return { error: "Đã tạo phiếu nhưng chưa thể thêm dòng hàng." };
  revalidatePath("/supplies");
  return { success: "Đã tạo phiếu yêu cầu." };
}

export async function archiveSupplyItem(formData: FormData): Promise<SupplyActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.delete")) return { error: "Bạn không có quyền ngừng dùng hàng hóa." };
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Hàng hóa không hợp lệ." };
  const { error } = await supabase.from("supply_items").update({ active: false, deleted_at: new Date().toISOString(), updated_by: access.user_id }).eq("id", id.data);
  if (error) return { error: "Không thể ngừng dùng hàng hóa." };
  revalidatePath("/supplies");
  return { success: "Đã ngừng dùng hàng hóa." };
}

export async function importSupplyWorkbook(_state: SupplyActionState, formData: FormData): Promise<SupplyActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.import")) return { error: "Bạn không có quyền nhập file XLSX." };
  const file = formData.get("workbook");
  if (!(file instanceof File) || !file.size) return { error: "Hãy chọn file XLSX." };
  if (file.size > 10 * 1024 * 1024 || !/\.xlsx$/i.test(file.name)) return { error: "File phải là XLSX và không quá 10 MB." };
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return { error: "Không thể đọc file XLSX." };
  }
  const worksheet = workbook.worksheets.find((sheet) => sheet.rowCount > 10);
  if (!worksheet) return { error: "File không có sheet dữ liệu hợp lệ." };
  let parsed: ReturnType<typeof parseWorksheet>;
  try {
    parsed = parseWorksheet(worksheet, file.name);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không thể nhận diện mẫu file." };
  }
  const fingerprint = createHash("sha256").update(`${file.name}|${worksheet.name}|${parsed.category}|${parsed.requestNo}|${parsed.periodYear}|${parsed.periodQuarter}`).digest("hex");
  const { data: duplicate } = await supabase.from("supply_requests").select("id").eq("import_fingerprint", fingerprint).maybeSingle();
  if (duplicate) return { error: "Phiếu từ file này đã được nhập trước đó." };

  const { data: existingItems } = await supabase.from("supply_items").select("id,item_name,category").eq("category", parsed.category);
  const byName = new Map((existingItems ?? []).map((item) => [normalizeText(item.item_name), item.id]));
  const missing = parsed.lines.filter((line) => !byName.has(normalizeText(line.itemName))).map((line) => ({
    category: parsed.category, item_name: line.itemName, unit: line.unit,
    default_unit_price: line.approvedUnitPrice, created_by: access.user_id, updated_by: access.user_id,
  }));
  if (missing.length) {
    const { data: inserted, error } = await supabase.from("supply_items").insert(missing).select("id,item_name");
    if (error) return { error: "Không thể tạo danh mục hàng từ file." };
    inserted?.forEach((item) => byName.set(normalizeText(item.item_name), item.id));
  }
  const { data: request, error: requestError } = await supabase.from("supply_requests").insert({
    request_no: parsed.requestNo, category: parsed.category, period_type: "QUARTER",
    period_year: parsed.periodYear, period_quarter: parsed.periodQuarter,
    requested_on: parsed.requestedOn, requesting_department: parsed.requestingDepartment,
    requester_name: parsed.requesterName, checker_name: parsed.checkerName,
    approver_name: parsed.approverName, status: "APPROVED", source_file: file.name,
    source_sheet: worksheet.name, import_fingerprint: fingerprint,
    created_by: access.user_id, updated_by: access.user_id,
  }).select("id").single();
  if (requestError || !request) return { error: "Không thể tạo phiếu từ file." };
  const { error: lineError } = await supabase.from("supply_request_lines").insert(parsed.lines.map((line, index) => ({
    request_id: request.id,
    item_id: byName.get(normalizeText(line.itemName)) ?? null,
    item_name: line.itemName, unit: line.unit,
    proposed_quantity: line.proposedQuantity, stock_quantity: line.stockQuantity,
    ordered_quantity: line.orderedQuantity, requested_departments: line.requestedDepartments,
    approval_note: line.approvalNote, proposed_unit_price: line.proposedUnitPrice,
    approved_unit_price: line.approvedUnitPrice, note: line.note, sort_order: index + 1,
    created_by: access.user_id, updated_by: access.user_id,
  })));
  if (lineError) return { error: "Đã tạo phiếu nhưng không thể lưu các dòng hàng." };
  revalidatePath("/supplies");
  return { success: `Đã nhập ${parsed.lines.length} mặt hàng từ ${parsed.category === "OFFICE_SUPPLY" ? "Văn phòng phẩm" : "Dụng cụ vệ sinh"}.` };
}
