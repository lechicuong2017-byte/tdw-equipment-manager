"use server";

import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireAccess } from "@/lib/auth";
import {
  buildSupplyItemCode,
  normalizedSupplyName,
  supplyItemCodeSequence,
  type SupplyItemCategory,
} from "@/lib/supply-item-codes";

export type SupplierQuotePreviewExistingItem = {
  id: string;
  category: SupplyItemCategory;
  itemCode: string;
};

export type SupplierQuotePreviewLine = ParsedQuoteLine & {
  key: string;
  category: SupplyItemCategory;
  itemCode: string;
  existingItems: SupplierQuotePreviewExistingItem[];
};

export type SupplierQuotePreview = {
  vendorName: string;
  vendorAddress: string;
  vendorContact: string;
  quoteDate: string | null;
  taxRate: number;
  sourceFileOriginal: string;
  sourceFile: string;
  sourceSheet: string;
  fingerprint: string;
  codeYear: number;
  nextSequences: Record<SupplyItemCategory, number>;
  lines: SupplierQuotePreviewLine[];
};

export type SupplyWorkbookPreviewLine = ParsedLine & {
  key: string;
  category: SupplyItemCategory;
  itemCode: string;
  existingItem: SupplierQuotePreviewExistingItem | null;
};

export type SupplyWorkbookPreview = {
  sourceFile: string;
  sourceSheet: string;
  fingerprint: string;
  codeYear: number;
  nextSequences: Record<SupplyItemCategory, number>;
  requestNo: string;
  periodYear: number;
  periodQuarter: number;
  requestedOn: string;
  requestingDepartment: string;
  requesterName: string;
  checkerName: string;
  approverName: string;
  lines: SupplyWorkbookPreviewLine[];
};

export type SupplyActionState = {
  error?: string;
  success?: string;
  quotePreview?: SupplierQuotePreview;
  workbookPreview?: SupplyWorkbookPreview;
};

const categorySchema = z.enum(["OFFICE_SUPPLY", "CLEANING_SUPPLY"]);
const quoteCategorySchema = z.enum(["OFFICE_SUPPLY", "CLEANING_SUPPLY", "MIXED"]);
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

const quoteSchema = z.object({
  id: z.string().uuid(),
  quote_no: z.string().trim().max(100),
  vendor_name: z.string().trim().min(1, "Tên nhà cung cấp là bắt buộc").max(300),
  vendor_address: z.string().trim().max(1000),
  vendor_contact: z.string().trim().max(1000),
  category: quoteCategorySchema,
  quote_date: z.string().optional(),
  valid_until: z.string().optional(),
  status: z.enum(["RECEIVED", "REVIEWING", "SELECTED", "REJECTED", "EXPIRED"]),
  note: z.string().trim().max(3000),
});

const requestMetadataSchema = z.object({
  id: z.string().uuid(),
  request_no: z.string().trim().min(1).max(80),
  requested_on: z.iso.date(),
  requester_name: z.string().trim().max(160),
  checker_name: z.string().trim().max(160),
  approver_name: z.string().trim().max(160),
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "ORDERED", "CLOSED", "REJECTED"]),
  note: z.string().trim().max(3000),
});

const inventoryMovementSchema = z.object({
  item_id: z.string().uuid("Hãy chọn hàng hóa."),
  direction: z.enum(["IN", "OUT"]),
  quantity: z.coerce.number().positive("Số lượng phải lớn hơn 0.").max(1000000000),
  unit_price: z.coerce.number().min(0).max(1000000000000),
  movement_date: z.iso.date(),
  reference_no: z.string().trim().max(120),
  note: z.string().trim().max(2000),
});

function normalizeText(value: unknown) {
  return normalizedSupplyName(value);
}

function collapseRepeatedPhrase(value: string) {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  for (let size = 1; size <= Math.floor(words.length / 2); size += 1) {
    if (words.length % size) continue;
    if (words.every((word, index) => word.toLocaleUpperCase("vi-VN") === words[index % size].toLocaleUpperCase("vi-VN"))) {
      return words.slice(0, size).join(" ");
    }
  }
  return words.join(" ");
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
  const cellValue = (row: ExcelJS.Row, column: number) => column > 0 ? row.getCell(column).value : null;

  for (let rowIndex = headerRow + 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const itemName = cellText(cellValue(row, itemColumn)).replace(/\s+/g, " ").trim();
    const normalized = normalizeText(itemName);
    if (!itemName || normalized.includes("TONG CHI PHI") || normalized === "VAN PHONG PHAM") continue;
    const unit = cellText(cellValue(row, unitColumn)) || "Đơn vị";
    const approvedUnitPrice = cellNumber(cellValue(row, approvedPriceColumn));
    lines.push({
      itemName,
      unit,
      proposedQuantity: cellNumber(cellValue(row, proposedColumn)),
      stockQuantity: cellNumber(cellValue(row, stockColumn)),
      orderedQuantity: cellNumber(cellValue(row, orderedColumn)),
      requestedDepartments: cellText(cellValue(row, departmentColumn)),
      approvalNote: cellText(cellValue(row, approvalColumn)),
      proposedUnitPrice: proposedPriceColumn ? cellNumber(cellValue(row, proposedPriceColumn)) : null,
      approvedUnitPrice,
      note: cellText(cellValue(row, noteColumn)),
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

type ParsedQuoteLine = {
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  oldUnitPrice: number | null;
  amount: number;
  note: string;
};

function parseVietnameseDateText(text: string) {
  const slash = text.match(/(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{4})/);
  const words = normalizeText(text).match(/NGAY\s*(\d{1,2})\s*THANG\s*(\d{1,2})\s*NAM\s*(\d{4})/);
  const match = slash ?? words;
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function quoteHeaderScore(worksheet: ExcelJS.Worksheet) {
  let best = 0;
  for (let rowIndex = 1; rowIndex <= Math.min(30, worksheet.rowCount); rowIndex += 1) {
    const values = Array.from({ length: worksheet.columnCount }, (_, index) => normalizeText(worksheet.getRow(rowIndex).getCell(index + 1).value));
    const score = [
      values.some((value) => value.includes("TEN VAT TU HANG HOA") || value === "VAN PHONG PHAM"),
      values.some((value) => value === "DVT" || value === "DV"),
      values.some((value) => value === "SO LUONG" || value === "SL"),
      values.some((value) => value === "DON GIA"),
      values.some((value) => value === "THANH TIEN"),
    ].filter(Boolean).length;
    best = Math.max(best, score);
  }
  return best;
}

function parseSupplierQuoteWorksheet(worksheet: ExcelJS.Worksheet) {
  let headerRow = 0;
  let headerValues: string[] = [];
  for (let rowIndex = 1; rowIndex <= Math.min(30, worksheet.rowCount); rowIndex += 1) {
    const values = Array.from({ length: worksheet.columnCount }, (_, index) => normalizeText(worksheet.getRow(rowIndex).getCell(index + 1).value));
    const hasItem = values.some((value) => value.includes("TEN VAT TU HANG HOA") || value === "VAN PHONG PHAM");
    const hasPrice = values.some((value) => value === "DON GIA");
    if (hasItem && hasPrice) {
      headerRow = rowIndex;
      headerValues = values;
      break;
    }
  }
  if (!headerRow) throw new Error("Không nhận diện được dòng tiêu đề hàng hóa của báo giá.");
  const findColumn = (...candidates: string[]) => {
    for (const candidate of candidates) {
      const wanted = normalizeText(candidate);
      const index = headerValues.findIndex((value) => value === wanted || value.includes(wanted));
      if (index >= 0) return index + 1;
    }
    return 0;
  };
  const sttColumn = findColumn("STT", "TT");
  const itemColumn = findColumn("TÊN VẬT TƯ HÀNG HÓA", "VĂN PHÒNG PHẨM");
  const unitColumn = findColumn("ĐVT", "ĐV");
  const quantityColumn = findColumn("SỐ LƯỢNG", "SL");
  const unitPriceColumn = findColumn("ĐƠN GIÁ");
  const amountColumn = findColumn("THÀNH TIỀN");
  const oldPriceColumn = findColumn("GIÁ CŨ");
  const noteColumn = findColumn("GHI CHÚ");
  const lines: ParsedQuoteLine[] = [];

  for (let rowIndex = headerRow + 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const stt = cellNumber(row.getCell(sttColumn).value);
    const itemName = cellText(row.getCell(itemColumn).value).replace(/\s+/g, " ").trim();
    if (!stt || !itemName) continue;
    const quantity = cellNumber(row.getCell(quantityColumn).value);
    const unitPrice = cellNumber(row.getCell(unitPriceColumn).value);
    lines.push({
      itemName,
      unit: cellText(row.getCell(unitColumn).value) || "Đơn vị",
      quantity,
      unitPrice,
      oldUnitPrice: oldPriceColumn ? cellNumber(row.getCell(oldPriceColumn).value) || null : null,
      amount: cellNumber(row.getCell(amountColumn).value) || quantity * unitPrice,
      note: noteColumn ? cellText(row.getCell(noteColumn).value) : "",
    });
  }
  if (!lines.length) throw new Error("Báo giá không có dòng hàng hóa hợp lệ.");

  const topRows = Array.from({ length: Math.min(headerRow - 1, 12) }, (_, index) =>
    Array.from({ length: worksheet.columnCount }, (_, column) => cellText(worksheet.getRow(index + 1).getCell(column + 1).value)).filter(Boolean).join(" "),
  ).filter(Boolean);
  const vendorName = collapseRepeatedPhrase(topRows.find((value) => /CÔNG TY|VĂN PHÒNG PHẨM/i.test(value))?.trim() || "Nhà cung cấp chưa xác định");
  const vendorAddress = topRows.find((value) => /ĐỊA CHỈ|ADDRESS/i.test(value))?.trim() || "";
  const vendorContact = topRows.filter((value) => /ĐIỆN THOẠI|PHONE|EMAIL|HOTLINE/i.test(value)).join(" · ");
  const fullText = Array.from({ length: worksheet.rowCount }, (_, index) =>
    Array.from({ length: worksheet.columnCount }, (_, column) => cellText(worksheet.getRow(index + 1).getCell(column + 1).value)).join(" "),
  ).join("\n");
  const quoteDate = parseVietnameseDateText(fullText);
  let subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  let taxRate = 0;
  let taxAmount = 0;
  let totalAmount = subtotal;
  for (let rowIndex = headerRow + 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const rowText = Array.from({ length: worksheet.columnCount }, (_, index) => cellText(worksheet.getRow(rowIndex).getCell(index + 1).value)).join(" ");
    const normalized = normalizeText(rowText);
    const numbers = Array.from({ length: worksheet.columnCount }, (_, index) => cellNumber(worksheet.getRow(rowIndex).getCell(index + 1).value)).filter((value) => value > 0);
    if (normalized.includes("THUE SUAT") || normalized.includes("VAT")) {
      const rate = rowText.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (rate) taxRate = Number(rate[1].replace(",", "."));
      if (numbers.length) taxAmount = numbers.at(-1) ?? taxAmount;
    } else if (normalized.includes("TONG CONG") || normalized.includes("TONG TIEN THANH TOAN")) {
      if (numbers.length) totalAmount = numbers.at(-1) ?? totalAmount;
    } else if (normalized.includes("CONG TIEN HANG") || normalized.includes("TONG CHI PHI")) {
      if (numbers.length) subtotal = numbers.at(-1) ?? subtotal;
    }
  }
  if (!taxAmount && taxRate) taxAmount = Math.round(subtotal * taxRate / 100);
  if (totalAmount <= subtotal && taxAmount) totalAmount = subtotal + taxAmount;
  return { vendorName, vendorAddress, vendorContact, quoteDate, subtotal, taxRate, taxAmount, totalAmount, lines };
}

function canonicalQuoteFileName(vendorName: string, quoteDate: string | null) {
  const vendor = normalizeText(vendorName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "nha-cung-cap";
  return `bao-gia-${vendor}-${quoteDate ?? new Date().toISOString().slice(0, 10)}.xlsx`;
}

const quoteReviewSchema = z.object({
  vendorName: z.string().trim().min(1).max(300),
  vendorAddress: z.string().trim().max(1000),
  vendorContact: z.string().trim().max(1000),
  quoteDate: z.string().nullable(),
  taxRate: z.number().min(0).max(100),
  sourceFileOriginal: z.string().trim().min(1).max(255),
  sourceFile: z.string().trim().min(1).max(255),
  sourceSheet: z.string().trim().min(1).max(255),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  codeYear: z.number().int().min(2000).max(2200),
  lines: z.array(z.object({
    key: z.string().trim().min(1).max(100),
    itemName: z.string().trim().min(1).max(300),
    unit: z.string().trim().min(1).max(80),
    quantity: z.number().min(0).max(1000000000),
    unitPrice: z.number().min(0).max(1000000000000),
    oldUnitPrice: z.number().min(0).max(1000000000000).nullable(),
    amount: z.number().min(0).max(1000000000000000),
    note: z.string().trim().max(2000),
    category: categorySchema,
    itemCode: z.string().trim().max(80),
  })).min(1).max(1000),
});

const workbookReviewSchema = z.object({
  sourceFile: z.string().trim().min(1).max(255),
  sourceSheet: z.string().trim().min(1).max(255),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  codeYear: z.number().int().min(2000).max(2200),
  requestNo: z.string().trim().min(1).max(80),
  periodYear: z.number().int().min(2000).max(2200),
  periodQuarter: z.number().int().min(1).max(4),
  requestedOn: z.string().date(),
  requestingDepartment: z.string().trim().max(300),
  requesterName: z.string().trim().max(160),
  checkerName: z.string().trim().max(160),
  approverName: z.string().trim().max(160),
  lines: z.array(z.object({
    key: z.string().trim().min(1).max(100),
    category: categorySchema,
    itemCode: z.string().trim().min(1).max(80),
    itemName: z.string().trim().min(1).max(300),
    unit: z.string().trim().min(1).max(80),
    proposedQuantity: z.number().min(0).max(1000000000),
    stockQuantity: z.number().min(0).max(1000000000),
    orderedQuantity: z.number().min(0).max(1000000000),
    requestedDepartments: z.string().trim().max(1000),
    approvalNote: z.string().trim().max(1000),
    proposedUnitPrice: z.number().min(0).max(1000000000000).nullable(),
    approvedUnitPrice: z.number().min(0).max(1000000000000),
    note: z.string().trim().max(2000),
  })).min(1).max(1000),
});

function nextSupplyCodeSequences(items: Array<{ item_code?: string | null }>, year: number) {
  const result: Record<SupplyItemCategory, number> = { OFFICE_SUPPLY: 1, CLEANING_SUPPLY: 1 };
  for (const category of ["OFFICE_SUPPLY", "CLEANING_SUPPLY"] as const) {
    result[category] = Math.max(0, ...items.map((item) => supplyItemCodeSequence(item.item_code, category, year))) + 1;
  }
  return result;
}

export async function saveSupplyItem(_state: SupplyActionState, formData: FormData): Promise<SupplyActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.manage")) return { error: "Bạn không có quyền quản lý danh mục hàng." };
  const parsed = itemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ." };
  const { id, active, ...values } = parsed.data;
  let itemCode = values.item_code;
  if (!itemCode) {
    const year = new Date().getFullYear();
    const { data: existingCodes } = await supabase.from("supply_items").select("item_code").is("deleted_at", null);
    const sequences = nextSupplyCodeSequences(existingCodes ?? [], year);
    itemCode = buildSupplyItemCode(values.category, year, sequences[values.category]);
  }
  const payload = { ...values, item_code: itemCode, active: active === "on", updated_by: access.user_id };
  const result = id
    ? await supabase.from("supply_items").update(payload).eq("id", id)
    : await supabase.from("supply_items").insert({ ...payload, created_by: access.user_id });
  if (result.error) return { error: result.error.code === "23505" ? "Tên hàng hoặc mã hàng này đã có trong danh mục." : "Không thể lưu hàng hóa." };
  revalidatePath("/supplies");
  return { success: id ? "Đã cập nhật hàng hóa." : "Đã thêm hàng hóa." };
}

export async function saveSupplyRequest(_state: SupplyActionState, formData: FormData): Promise<SupplyActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.manage")) return { error: "Bạn không có quyền tạo phiếu yêu cầu." };
  const parsed = requestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu phiếu chưa hợp lệ." };
  const { item_id, proposed_quantity, stock_quantity, ordered_quantity, approved_unit_price, requested_departments, approval_note, line_note, ...request } = parsed.data;
  const { data: item, error: itemError } = await supabase.from("supply_items").select("item_name,item_code,unit,category").eq("id", item_id).single();
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
    request_id: saved.id, item_id, item_code: item.item_code, item_name: item.item_name, unit: item.unit,
    proposed_quantity, stock_quantity, ordered_quantity, approved_unit_price,
    requested_departments, approval_note, note: line_note,
    created_by: access.user_id, updated_by: access.user_id,
  });
  if (lineResult.error) {
    await supabase.from("supply_requests").update({ deleted_at: new Date().toISOString(), updated_by: access.user_id }).eq("id", saved.id);
    return { error: lineResult.error.message.includes("Kho không đủ") ? lineResult.error.message : "Chưa thể thêm dòng hàng vào phiếu." };
  }
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

export async function previewSupplyWorkbook(_state: SupplyActionState, formData: FormData): Promise<SupplyActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.import")) return { error: "Bạn không có quyền nhập file XLSX." };
  const file = formData.get("workbook");
  if (!(file instanceof File) || !file.size) return { error: "Hãy chọn file XLSX." };
  if (file.size > 10 * 1024 * 1024 || !/\.xlsx$/i.test(file.name)) return { error: "File phải là XLSX và không quá 10 MB." };
  const bytes = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes);
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
  const fingerprint = createHash("sha256").update(new Uint8Array(bytes)).update(`|${worksheet.name}|${parsed.category}`).digest("hex");
  const { data: duplicate } = await supabase.from("supply_requests").select("id").eq("import_fingerprint", fingerprint).maybeSingle();
  if (duplicate) return { error: "Phiếu từ file này đã được nhập trước đó." };

  const { data: allItems, error: itemError } = await supabase.from("supply_items").select("id,item_name,category,item_code").is("deleted_at", null);
  if (itemError) return { error: "Không thể kiểm tra danh mục hàng hóa hiện có." };
  const existingByName = new Map(
    (allItems ?? [])
      .filter((item) => item.category === parsed.category)
      .map((item) => [normalizeText(item.item_name), item]),
  );
  const nextSequences = nextSupplyCodeSequences(allItems ?? [], parsed.periodYear);
  let sequence = nextSequences[parsed.category];
  const proposedCodes = new Map<string, string>();
  const lines: SupplyWorkbookPreviewLine[] = parsed.lines.map((line, index) => {
    const nameKey = normalizeText(line.itemName);
    const existing = existingByName.get(nameKey);
    let itemCode = existing?.item_code || proposedCodes.get(nameKey) || "";
    if (!itemCode) {
      itemCode = buildSupplyItemCode(parsed.category, parsed.periodYear, sequence++);
      proposedCodes.set(nameKey, itemCode);
    }
    return {
      ...line,
      key: `${index + 1}-${nameKey.slice(0, 48)}`,
      category: parsed.category,
      itemCode,
      existingItem: existing ? {
        id: existing.id,
        category: existing.category as SupplyItemCategory,
        itemCode: existing.item_code || "",
      } : null,
    };
  });

  return {
    success: `Đã phân tích ${lines.length} dòng. Hãy kiểm tra và tick các dòng cần nhập.`,
    workbookPreview: {
      sourceFile: file.name,
      sourceSheet: worksheet.name,
      fingerprint,
      codeYear: parsed.periodYear,
      nextSequences,
      requestNo: parsed.requestNo,
      periodYear: parsed.periodYear,
      periodQuarter: parsed.periodQuarter,
      requestedOn: parsed.requestedOn,
      requestingDepartment: parsed.requestingDepartment,
      requesterName: parsed.requesterName,
      checkerName: parsed.checkerName,
      approverName: parsed.approverName,
      lines,
    },
  };
}

export async function commitSupplyWorkbookReview(_state: SupplyActionState, formData: FormData): Promise<SupplyActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.import")) return { error: "Bạn không có quyền nhập file XLSX." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("review") ?? ""));
  } catch {
    return { error: "Dữ liệu xem trước không hợp lệ. Hãy đọc lại file." };
  }
  const parsed = workbookReviewSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu duyệt chưa hợp lệ." };
  const review = parsed.data;
  const categories = new Set(review.lines.map((line) => line.category));
  if (categories.size !== 1) return { error: "Một phiếu nhập chỉ được chứa một loại hàng." };
  const category = review.lines[0].category;
  const { data: duplicate } = await supabase.from("supply_requests").select("id").eq("import_fingerprint", review.fingerprint).maybeSingle();
  if (duplicate) return { error: "Phiếu từ file này đã được nhập trước đó." };

  const { data: allItems, error: itemReadError } = await supabase.from("supply_items").select("id,item_name,category,item_code").is("deleted_at", null);
  if (itemReadError) return { error: "Không thể kiểm tra trùng danh mục hàng hóa." };
  const byKey = new Map((allItems ?? []).map((item) => [`${item.category}|${normalizeText(item.item_name)}`, item]));
  const usedCodes = new Set((allItems ?? []).map((item) => String(item.item_code || "").toUpperCase()).filter(Boolean));
  const nextSequences = nextSupplyCodeSequences(allItems ?? [], review.codeYear);
  const pending = new Map<string, {
    category: SupplyItemCategory;
    item_name: string;
    unit: string;
    item_code: string;
    default_unit_price: number;
    created_by: string;
    updated_by: string;
  }>();

  for (const line of review.lines) {
    const key = `${line.category}|${normalizeText(line.itemName)}`;
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.item_code) {
        let code = line.itemCode.toUpperCase();
        while (!code || usedCodes.has(code)) code = buildSupplyItemCode(line.category, review.codeYear, nextSequences[line.category]++);
        const { error } = await supabase.from("supply_items").update({ item_code: code, updated_by: access.user_id }).eq("id", existing.id);
        if (error) return { error: `Không thể bổ sung mã cho ${line.itemName}.` };
        existing.item_code = code;
        usedCodes.add(code);
      }
      continue;
    }
    if (pending.has(key)) continue;
    let code = line.itemCode.toUpperCase();
    while (!code || usedCodes.has(code)) code = buildSupplyItemCode(line.category, review.codeYear, nextSequences[line.category]++);
    usedCodes.add(code);
    pending.set(key, {
      category: line.category,
      item_name: line.itemName,
      unit: line.unit,
      item_code: code,
      default_unit_price: line.approvedUnitPrice,
      created_by: access.user_id,
      updated_by: access.user_id,
    });
  }
  if (pending.size) {
    const { data: inserted, error } = await supabase.from("supply_items").insert([...pending.values()]).select("id,item_name,category,item_code");
    if (error) return { error: error.code === "23505" ? "Có mặt hàng hoặc mã hàng bị trùng. Hãy đọc lại file để cập nhật danh mục." : "Không thể tạo danh mục hàng từ file." };
    inserted?.forEach((item) => byKey.set(`${item.category}|${normalizeText(item.item_name)}`, item));
  }

  const { data: request, error: requestError } = await supabase.from("supply_requests").insert({
    request_no: review.requestNo, category, period_type: "QUARTER",
    period_year: review.periodYear, period_quarter: review.periodQuarter,
    requested_on: review.requestedOn, requesting_department: review.requestingDepartment,
    requester_name: review.requesterName, checker_name: review.checkerName,
    approver_name: review.approverName, status: "APPROVED", source_file: review.sourceFile,
    source_sheet: review.sourceSheet, import_fingerprint: review.fingerprint,
    created_by: access.user_id, updated_by: access.user_id,
  }).select("id").single();
  if (requestError || !request) return { error: "Không thể tạo phiếu từ file." };
  const { error: lineError } = await supabase.from("supply_request_lines").insert(review.lines.map((line, index) => {
    const catalogItem = byKey.get(`${line.category}|${normalizeText(line.itemName)}`);
    return {
      request_id: request.id,
      item_id: catalogItem?.id ?? null,
      item_code: catalogItem?.item_code ?? line.itemCode,
      item_name: line.itemName,
      unit: line.unit,
      proposed_quantity: line.proposedQuantity,
      stock_quantity: line.stockQuantity,
      ordered_quantity: line.orderedQuantity,
      requested_departments: line.requestedDepartments,
      approval_note: line.approvalNote,
      proposed_unit_price: line.proposedUnitPrice,
      approved_unit_price: line.approvedUnitPrice,
      note: line.note,
      sort_order: index + 1,
      created_by: access.user_id,
      updated_by: access.user_id,
    };
  }));
  if (lineError) {
    await supabase.from("supply_requests").update({ deleted_at: new Date().toISOString(), updated_by: access.user_id }).eq("id", request.id);
    return { error: lineError.message.includes("Kho không đủ") ? lineError.message : "Không thể lưu các dòng hàng của phiếu." };
  }
  revalidatePath("/supplies");
  return { success: `Đã nhập ${review.lines.length} dòng đã chọn từ ${category === "OFFICE_SUPPLY" ? "Văn phòng phẩm" : "Dụng cụ vệ sinh"}.` };
}

export async function previewSupplierQuoteWorkbook(_state: SupplyActionState, formData: FormData): Promise<SupplyActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.import")) return { error: "Bạn không có quyền nhập báo giá XLSX." };
  const file = formData.get("workbook");
  const defaultCategory = categorySchema.safeParse(formData.get("category"));
  if (!defaultCategory.success) return { error: "Hãy chọn loại hàng gợi ý." };
  if (!(file instanceof File) || !file.size) return { error: "Hãy chọn file báo giá XLSX." };
  if (file.size > 10 * 1024 * 1024 || !/\.xlsx$/i.test(file.name)) return { error: "File phải là XLSX và không quá 10 MB." };
  const bytes = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes);
  } catch {
    return { error: "Không thể đọc file báo giá XLSX." };
  }
  const worksheet = [...workbook.worksheets].sort((a, b) => quoteHeaderScore(b) - quoteHeaderScore(a))[0];
  if (!worksheet || quoteHeaderScore(worksheet) < 4) return { error: "Không tìm thấy sheet báo giá có tên hàng, đơn vị, số lượng và đơn giá." };
  let parsed: ReturnType<typeof parseSupplierQuoteWorksheet>;
  try {
    parsed = parseSupplierQuoteWorksheet(worksheet);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không thể nhận diện mẫu báo giá." };
  }
  const fingerprint = createHash("sha256").update(new Uint8Array(bytes)).update(`|${worksheet.name}`).digest("hex");
  const { data: duplicate } = await supabase.from("supply_quotes").select("id").eq("import_fingerprint", fingerprint).maybeSingle();
  if (duplicate) return { error: "Báo giá này đã được nhập trước đó." };

  const { data: existingItems, error: itemError } = await supabase
    .from("supply_items")
    .select("id,item_name,category,item_code,default_unit_price")
    .is("deleted_at", null);
  if (itemError) return { error: "Không thể kiểm tra danh mục hàng hóa hiện có." };
  const codeYear = Number((parsed.quoteDate ?? new Date().toISOString().slice(0, 10)).slice(0, 4));
  const nextSequences = nextSupplyCodeSequences(existingItems ?? [], codeYear);
  const counters = { ...nextSequences };
  const previewLines: SupplierQuotePreviewLine[] = parsed.lines.map((line, index) => {
    const nameKey = normalizeText(line.itemName);
    const matches = (existingItems ?? []).filter((item) => normalizeText(item.item_name) === nameKey).map((item) => ({
      id: item.id,
      category: item.category as SupplyItemCategory,
      itemCode: item.item_code || "",
    }));
    const selectedExisting = matches.find((item) => item.category === defaultCategory.data);
    const itemCode = selectedExisting?.itemCode || buildSupplyItemCode(defaultCategory.data, codeYear, counters[defaultCategory.data]++);
    return { ...line, key: `${index + 1}-${nameKey.slice(0, 48)}`, category: defaultCategory.data, itemCode, existingItems: matches };
  });
  const canonicalFile = canonicalQuoteFileName(parsed.vendorName, parsed.quoteDate);
  return {
    success: `Đã phân tích ${previewLines.length} dòng. Hãy kiểm tra và tick các dòng cần nhập.`,
    quotePreview: {
      vendorName: parsed.vendorName,
      vendorAddress: parsed.vendorAddress,
      vendorContact: parsed.vendorContact,
      quoteDate: parsed.quoteDate,
      taxRate: parsed.taxRate,
      sourceFileOriginal: file.name,
      sourceFile: canonicalFile,
      sourceSheet: worksheet.name,
      fingerprint,
      codeYear,
      nextSequences,
      lines: previewLines,
    },
  };
}

export async function commitSupplierQuoteReview(_state: SupplyActionState, formData: FormData): Promise<SupplyActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.import")) return { error: "Bạn không có quyền nhập báo giá XLSX." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("review") ?? ""));
  } catch {
    return { error: "Dữ liệu xem trước không hợp lệ. Hãy đọc lại file." };
  }
  const parsed = quoteReviewSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu duyệt chưa hợp lệ." };
  const review = parsed.data;
  const { data: duplicate } = await supabase.from("supply_quotes").select("id").eq("import_fingerprint", review.fingerprint).maybeSingle();
  if (duplicate) return { error: "Báo giá này đã được nhập trước đó." };

  const { data: existingItems, error: itemReadError } = await supabase
    .from("supply_items")
    .select("id,item_name,category,item_code")
    .is("deleted_at", null);
  if (itemReadError) return { error: "Không thể kiểm tra trùng danh mục hàng hóa." };
  const byKey = new Map((existingItems ?? []).map((item) => [`${item.category}|${normalizeText(item.item_name)}`, item]));
  const usedCodes = new Set((existingItems ?? []).map((item) => String(item.item_code || "").toUpperCase()).filter(Boolean));
  const nextSequences = nextSupplyCodeSequences(existingItems ?? [], review.codeYear);
  const pending = new Map<string, { category: SupplyItemCategory; item_name: string; unit: string; item_code: string; default_unit_price: number; description: string; created_by: string; updated_by: string }>();

  for (const line of review.lines) {
    const key = `${line.category}|${normalizeText(line.itemName)}`;
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.item_code) {
        let code = line.itemCode.toUpperCase();
        while (!code || usedCodes.has(code)) code = buildSupplyItemCode(line.category, review.codeYear, nextSequences[line.category]++);
        const { error } = await supabase.from("supply_items").update({ item_code: code, updated_by: access.user_id }).eq("id", existing.id);
        if (error) return { error: `Không thể bổ sung mã cho ${line.itemName}.` };
        existing.item_code = code;
        usedCodes.add(code);
      }
      continue;
    }
    if (pending.has(key)) continue;
    let code = line.itemCode.toUpperCase();
    while (!code || usedCodes.has(code)) code = buildSupplyItemCode(line.category, review.codeYear, nextSequences[line.category]++);
    usedCodes.add(code);
    pending.set(key, {
      category: line.category,
      item_name: line.itemName,
      unit: line.unit,
      item_code: code,
      default_unit_price: line.unitPrice,
      description: `Tạo từ báo giá ${collapseRepeatedPhrase(review.vendorName)}`,
      created_by: access.user_id,
      updated_by: access.user_id,
    });
  }
  if (pending.size) {
    const { data: inserted, error } = await supabase.from("supply_items").insert([...pending.values()]).select("id,item_name,category,item_code");
    if (error) return { error: error.code === "23505" ? "Có mặt hàng hoặc mã hàng bị trùng. Hãy đọc lại file để cập nhật danh mục." : "Không thể tạo các mặt hàng đã chọn." };
    inserted?.forEach((item) => byKey.set(`${item.category}|${normalizeText(item.item_name)}`, item));
  }

  const categories = new Set(review.lines.map((line) => line.category));
  const subtotal = review.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const taxAmount = Math.round(subtotal * review.taxRate / 100);
  const { data: quote, error: quoteError } = await supabase.from("supply_quotes").insert({
    quote_no: "",
    vendor_name: collapseRepeatedPhrase(review.vendorName),
    vendor_address: review.vendorAddress,
    vendor_contact: review.vendorContact,
    category: categories.size === 1 ? [...categories][0] : "MIXED",
    quote_date: review.quoteDate,
    subtotal,
    tax_rate: review.taxRate,
    tax_amount: taxAmount,
    total_amount: subtotal + taxAmount,
    note: review.sourceFileOriginal === review.sourceFile ? "" : `Tên file gốc: ${review.sourceFileOriginal}`,
    source_file: review.sourceFile,
    source_sheet: review.sourceSheet,
    import_fingerprint: review.fingerprint,
    created_by: access.user_id,
    updated_by: access.user_id,
  }).select("id").single();
  if (quoteError || !quote) return { error: "Không thể lưu thông tin báo giá." };
  const { error: lineError } = await supabase.from("supply_quote_lines").insert(review.lines.map((line, index) => {
    const item = byKey.get(`${line.category}|${normalizeText(line.itemName)}`);
    return {
      quote_id: quote.id,
      item_id: item?.id ?? null,
      item_code: item?.item_code || line.itemCode,
      category: line.category,
      item_name: line.itemName,
      unit: line.unit,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      old_unit_price: line.oldUnitPrice,
      amount: line.quantity * line.unitPrice,
      note: line.note,
      sort_order: index + 1,
      created_by: access.user_id,
      updated_by: access.user_id,
    };
  }));
  if (lineError) {
    await supabase.from("supply_quotes").update({ deleted_at: new Date().toISOString(), updated_by: access.user_id }).eq("id", quote.id);
    return { error: "Không thể lưu các dòng báo giá đã chọn." };
  }
  revalidatePath("/supplies");
  return { success: `Đã nhập ${review.lines.length} dòng đã chọn; các mặt hàng trùng được dùng lại, không tạo bản ghi mới.` };
}

export async function recordSupplyInventoryMovement(_state: SupplyActionState, formData: FormData): Promise<SupplyActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.manage")) return { error: "Bạn không có quyền nhập hoặc xuất kho." };
  const parsed = inventoryMovementSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Thông tin kho chưa hợp lệ." };
  const values = parsed.data;
  const { data: item, error: itemError } = await supabase
    .from("supply_items")
    .select("id,item_name")
    .eq("id", values.item_id)
    .is("deleted_at", null)
    .single();
  if (itemError || !item) return { error: "Không tìm thấy hàng hóa trong kho." };
  const { error } = await supabase.from("supply_inventory_movements").insert({
    item_id: values.item_id,
    movement_type: values.direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
    quantity: values.quantity,
    unit_price: values.unit_price,
    movement_date: values.movement_date,
    source_type: "MANUAL",
    reference_no: values.reference_no,
    note: values.note || (values.direction === "IN" ? "Nhập kho thủ công" : "Xuất kho thủ công"),
    created_by: access.user_id,
  });
  if (error) return { error: error.message.includes("Kho không đủ") ? error.message : "Không thể ghi nhận giao dịch kho." };
  revalidatePath("/supplies");
  return { success: `${values.direction === "IN" ? "Đã nhập" : "Đã xuất"} ${values.quantity.toLocaleString("vi-VN")} đơn vị ${item.item_name}.` };
}

export async function saveSupplyQuote(_state: SupplyActionState, formData: FormData): Promise<SupplyActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.manage")) return { error: "Bạn không có quyền sửa báo giá." };
  const parsed = quoteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Thông tin báo giá chưa hợp lệ." };
  const { id, quote_date, valid_until, ...values } = parsed.data;
  const { error } = await supabase.from("supply_quotes").update({
    ...values,
    quote_date: quote_date || null,
    valid_until: valid_until || null,
    updated_by: access.user_id,
  }).eq("id", id);
  if (error) return { error: "Không thể cập nhật báo giá." };
  revalidatePath("/supplies");
  return { success: "Đã cập nhật báo giá." };
}

export async function deleteSupplyQuote(formData: FormData): Promise<SupplyActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.delete")) return { error: "Bạn không có quyền xóa báo giá." };
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Báo giá không hợp lệ." };
  const { error } = await supabase.from("supply_quotes").update({ deleted_at: new Date().toISOString(), updated_by: access.user_id }).eq("id", id.data);
  if (error) return { error: "Không thể xóa báo giá." };
  revalidatePath("/supplies");
  return { success: "Đã xóa báo giá và giữ nhật ký kiểm toán." };
}

export async function saveSupplyRequestMetadata(_state: SupplyActionState, formData: FormData): Promise<SupplyActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.manage")) return { error: "Bạn không có quyền sửa phiếu yêu cầu." };
  const parsed = requestMetadataSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Thông tin phiếu chưa hợp lệ." };
  const { id, ...values } = parsed.data;
  const { error } = await supabase.from("supply_requests").update({ ...values, updated_by: access.user_id }).eq("id", id);
  if (error) return { error: "Không thể cập nhật phiếu yêu cầu." };
  revalidatePath("/supplies");
  return { success: "Đã cập nhật phiếu yêu cầu." };
}

export async function deleteSupplyRequest(formData: FormData): Promise<SupplyActionState> {
  const { access, supabase } = await requireAccess();
  if (!can(access, "supplies.delete")) return { error: "Bạn không có quyền xóa phiếu yêu cầu." };
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Phiếu yêu cầu không hợp lệ." };
  const { error } = await supabase.from("supply_requests").update({ deleted_at: new Date().toISOString(), updated_by: access.user_id }).eq("id", id.data);
  if (error) return { error: "Không thể xóa phiếu yêu cầu." };
  revalidatePath("/supplies");
  return { success: "Đã xóa phiếu yêu cầu và giữ nhật ký kiểm toán." };
}
