import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { z } from "zod";
import type { TollMonthlyPreviewRow, TollQuarterlyPreviewRow } from "@/app/(protected)/vehicles/vehicle-tolls-actions";

export function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeSearchText(value: unknown) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Đ/g, "D")
    .replace(/đ/g, "d")
    .toUpperCase();
}

export function normalizePlate(value: string) {
  return normalizeSearchText(value).replace(/[^A-Z0-9]/g, "");
}

export function numberFromVietnameseText(value: string) {
  const parsed = Number(value.replace(/[^0-9-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export function vehicleMatch(
  plate: string,
  vehiclesByPlate: Map<string, { id: string; vehicle_name: string; license_plate: string }>,
) {
  const normalized = normalizePlate(plate);
  const exact = vehiclesByPlate.get(normalized);
  if (exact) return exact;
  if (normalized.endsWith("T")) return vehiclesByPlate.get(normalized.slice(0, -1));
  return undefined;
}

export function vehicleMap(rows: { id: string; vehicle_name: string; license_plate: string }[]) {
  return new Map(rows.map((vehicle) => [normalizePlate(vehicle.license_plate), vehicle]));
}

export function parsePdfTransaction(text: string, page: number): Omit<TollMonthlyPreviewRow, "vehicle_id" | "vehicle_name" | "already_saved"> | null {
  const compact = text.replace(/\s+/g, " ").trim();
  const invoiceNumber = compact.match(/Số\s*:\s*(\d{5,})/i)?.[1] ?? "";
  const transaction = compact.match(
    /Cước đường bộ xe\s*([A-Z0-9 -]+?)\s*đi qua\s*trạm\s*(.+?)\s*thời gian GD\s*(\d{1,2})\s*:\s*(\d{1,2})\s*:\s*(\d{1,2})\s*ngày\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\s*mã GD\s*(-?\d+)/i,
  );
  const totals = compact.match(/Tổng tiền\s*:\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (!transaction || !totals) return null;

  const [, rawPlate, rawStation, hour, minute, second, day, month, year, transactionCode] = transaction;
  const licensePlate = normalizePlate(rawPlate);
  const tollStation = rawStation.replace(/\s+/g, " ").trim();
  const transactionAt = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}+07:00`;
  const amountBeforeTax = numberFromVietnameseText(totals[1]);
  const taxAmount = numberFromVietnameseText(totals[2]);
  const amountAfterTax = numberFromVietnameseText(totals[3]);
  if (!z.iso.datetime({ offset: true }).safeParse(transactionAt).success
    || !z.iso.date().safeParse(transactionAt.slice(0, 10)).success
    || Math.abs(amountBeforeTax + taxAmount - amountAfterTax) > 1) return null;
  const fingerprint = monthlyFingerprint({
    invoice_number: invoiceNumber, transaction_code: transactionCode,
    license_plate: licensePlate, transaction_at: transactionAt,
  });

  return {
    page,
    invoice_number: invoiceNumber,
    transaction_code: transactionCode,
    license_plate: licensePlate,
    toll_station: tollStation,
    transaction_at: transactionAt,
    amount_before_tax: amountBeforeTax,
    tax_amount: taxAmount,
    amount_after_tax: amountAfterTax,
    fingerprint,
  };
}

export function excelString(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value) return String(value.text ?? "");
    if ("result" in value) return String(value.result ?? "");
    if ("richText" in value) return value.richText.map((item) => item.text).join("");
  }
  return String(value).trim();
}

export function excelNumber(value: ExcelJS.CellValue) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return numberFromVietnameseText(excelString(value));
}

export function excelDate(value: ExcelJS.CellValue) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 20000 && value < 100000) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  }
  const match = excelString(value).match(/(\d{1,2})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{4})/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
}

export function quarterlyFingerprint(row: Omit<TollQuarterlyPreviewRow, "vehicle_id" | "vehicle_name" | "comparison_status">) {
  return sha256([
    normalizePlate(row.license_plate), row.starts_on, row.expires_on,
    normalizeSearchText(row.toll_station), row.amount,
  ].join("|"));
}


export function parseQuarterlyWorkbook(workbook: ExcelJS.Workbook) {
    const rawRows: Omit<TollQuarterlyPreviewRow, "vehicle_id" | "vehicle_name" | "comparison_status">[] = [];
    workbook.eachSheet((sheet) => {
      let headerRow = 0;
      for (let index = 1; index <= Math.min(sheet.rowCount, 20); index += 1) {
        const rowText = normalizeSearchText((sheet.getRow(index).values as ExcelJS.CellValue[]).map(excelString).join(" "));
        if (rowText.includes("BIEN KIEM SOAT") && rowText.includes("DOT GIA HAN") && rowText.includes("TRAM DANG KY")) {
          headerRow = index;
          break;
        }
      }
      if (!headerRow) return;
      const header = sheet.getRow(headerRow);
      const column = (name: string) => {
        let found = 0;
        header.eachCell((cell, index) => { if (normalizeSearchText(excelString(cell.value)).includes(name)) found = index; });
        return found;
      };
      const plateColumn = column("BIEN KIEM SOAT"), periodColumn = column("DOT GIA HAN"), stationColumn = column("TRAM DANG KY");
      const typeColumn = column("LOAI XE"), colorColumn = column("MAU XE"), amountColumn = column("CHI PHI");
      if (!plateColumn || !periodColumn || !stationColumn || !amountColumn) throw new Error(`Sheet ${sheet.name}: thiếu cột bắt buộc.`);
      for (let index = headerRow + 1; index <= sheet.rowCount; index += 1) {
        const row = sheet.getRow(index);
        const plate = excelString(row.getCell(plateColumn).value);
        const period = excelString(row.getCell(periodColumn).value);
        const tollStation = excelString(row.getCell(stationColumn).value);
        if (!/^\d{2}[A-Z]/.test(normalizePlate(plate))) continue;
        if (!period || !tollStation) throw new Error(`Sheet ${sheet.name}, dòng ${index}: thiếu kỳ hoặc trạm.`);
        const dateMatches = [...period.matchAll(/(\d{1,2})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{4})/g)];
        const startsOn = dateMatches[0] ? excelDate(dateMatches[0][0]) : "";
        const expiresOn = dateMatches[1] ? excelDate(dateMatches[1][0]) : "";
        if (!z.iso.date().safeParse(startsOn).success || !z.iso.date().safeParse(expiresOn).success || expiresOn < startsOn)
          throw new Error(`Sheet ${sheet.name}, dòng ${index}: khoảng hiệu lực không hợp lệ.`);
        const amountValue = row.getCell(amountColumn).value;
        const amount = typeof amountValue === "object" && amountValue && "result" in amountValue ? excelNumber(amountValue.result as ExcelJS.CellValue) : excelNumber(amountValue);
        if (!excelString(amountValue) || !Number.isFinite(amount) || amount <= 0)
          throw new Error(`Sheet ${sheet.name}, dòng ${index}: chi phí không hợp lệ.`);
        const base = {
          row: index,
          sheet: sheet.name,
          vehicle_type: typeColumn ? excelString(row.getCell(typeColumn).value) : "",
          vehicle_color: colorColumn ? excelString(row.getCell(colorColumn).value) : "",
          license_plate: normalizePlate(plate),
          starts_on: startsOn,
          expires_on: expiresOn,
          toll_station: tollStation,
          amount,
        };
        rawRows.push({ ...base, fingerprint: quarterlyFingerprint({ ...base, fingerprint: "" }) });
      }
    });

    return rawRows;
}

export function monthlyFingerprint(row: Pick<TollMonthlyPreviewRow, "invoice_number" | "transaction_code" | "license_plate" | "transaction_at">) {
  return sha256([row.invoice_number.trim(), row.transaction_code.trim(),
    normalizePlate(row.license_plate), new Date(row.transaction_at).toISOString()].join("|"));
}
