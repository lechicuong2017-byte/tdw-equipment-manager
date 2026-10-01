import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { can, requireAccess } from "@/lib/auth";

export const maxDuration = 60;

const reportTypes = ["vehicles", "vehicle_inspections", "vehicle_insurance", "vehicle_repairs", "vehicle_fuel"] as const;
type ReportType = (typeof reportTypes)[number];
type ExportRow = Record<string, unknown>;
type Column = { key: string; label: string; width: number; money?: boolean; number?: boolean };

const inputSchema = z.object({
  report_type: z.enum(reportTypes),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  vehicle_id: z.uuid().optional(),
}).refine((value) => !value.month || Boolean(value.year), { message: "Phải chọn năm trước khi chọn tháng." });

const reportCatalog: Record<ReportType, { title: string; file: string; columns: Column[] }> = {
  vehicles: {
    title: "BÁO CÁO DANH SÁCH XE",
    file: "DANH-SACH-XE",
    columns: [
      { key: "vehicle_code", label: "Mã xe", width: 20 }, { key: "vehicle_name", label: "Tên xe", width: 34 },
      { key: "license_plate", label: "Biển số", width: 16 }, { key: "brand", label: "Thương hiệu", width: 18 },
      { key: "model", label: "Model", width: 22 }, { key: "production_year", label: "Năm sản xuất", width: 15, number: true },
      { key: "seat_count", label: "Số chỗ ngồi", width: 14, number: true }, { key: "fuel_norm_l_per_100km", label: "Định mức lít/100 km", width: 21, number: true },
      { key: "assigned_driver", label: "Tài xế / người sử dụng", width: 26 }, { key: "department", label: "Phòng ban", width: 24 },
      { key: "status", label: "Trạng thái", width: 18 }, { key: "note", label: "Ghi chú", width: 34 },
    ],
  },
  vehicle_inspections: {
    title: "BÁO CÁO ĐĂNG KIỂM XE",
    file: "DANG-KIEM-XE",
    columns: [
      { key: "vehicle_code", label: "Mã xe", width: 20 }, { key: "vehicle_name", label: "Tên xe", width: 32 }, { key: "license_plate", label: "Biển số", width: 16 },
      { key: "inspection_date", label: "Ngày đăng kiểm", width: 17 }, { key: "expires_on", label: "Ngày hết hạn", width: 17 },
      { key: "seat_count", label: "Số chỗ ngồi", width: 14, number: true }, { key: "cost", label: "Chi phí", width: 18, money: true },
      { key: "certificate_number", label: "Số giấy chứng nhận", width: 24 }, { key: "inspection_center", label: "Trung tâm đăng kiểm", width: 34 },
      { key: "odometer_km", label: "Số km", width: 16, number: true }, { key: "reminder_days", label: "Nhắc trước (ngày)", width: 18, number: true },
      { key: "note", label: "Ghi chú", width: 32 },
    ],
  },
  vehicle_insurance: {
    title: "BÁO CÁO BẢO HIỂM XE",
    file: "BAO-HIEM-XE",
    columns: [
      { key: "vehicle_code", label: "Mã xe", width: 20 }, { key: "vehicle_name", label: "Tên xe", width: 32 }, { key: "license_plate", label: "Biển số", width: 16 },
      { key: "insurance_name", label: "Tên bảo hiểm", width: 38 }, { key: "insurance_type", label: "Loại bảo hiểm", width: 20 },
      { key: "insurance_company", label: "Hãng bảo hiểm", width: 32 }, { key: "certificate_number", label: "Số giấy chứng nhận", width: 24 },
      { key: "starts_on", label: "Ngày bắt đầu", width: 17 }, { key: "expires_on", label: "Ngày kết thúc", width: 17 },
      { key: "cost", label: "Chi phí", width: 18, money: true }, { key: "reminder_days", label: "Nhắc trước (ngày)", width: 18, number: true },
      { key: "record_status", label: "Phân loại hồ sơ", width: 18 }, { key: "note", label: "Ghi chú", width: 32 },
    ],
  },
  vehicle_repairs: {
    title: "NHẬT KÝ BẢO TRÌ BẢO DƯỠNG SỬA CHỮA XE Ô TÔ",
    file: "BAO-DUONG-SUA-CHUA-XE",
    columns: [
      { key: "vehicle_code", label: "Mã xe", width: 20 }, { key: "vehicle_name", label: "Tên xe", width: 32 }, { key: "license_plate", label: "Biển số", width: 16 },
      { key: "service_date", label: "Ngày sửa chữa / bảo dưỡng", width: 24 }, { key: "service_type", label: "Hình thức", width: 22 },
      { key: "description", label: "Nội dung sửa chữa", width: 54 }, { key: "odometer_km", label: "Số km", width: 16, number: true },
      { key: "vat_amount", label: "Chi phí gồm VAT", width: 20, money: true }, { key: "vendor", label: "Đơn vị thực hiện", width: 34 },
      { key: "invoice_number", label: "Số hóa đơn", width: 20 }, { key: "note", label: "Ghi chú", width: 34 },
    ],
  },
  vehicle_fuel: {
    title: "SỔ THEO DÕI MUA NHIÊN LIỆU XE Ô TÔ",
    file: "NHIEN-LIEU-XE",
    columns: [
      { key: "vehicle_code", label: "Mã xe", width: 20 }, { key: "vehicle_name", label: "Tên xe", width: 32 }, { key: "license_plate", label: "Biển số", width: 16 },
      { key: "fuel_norm_l_per_100km", label: "Định mức (lít/100 km)", width: 22, number: true }, { key: "liters", label: "Số lít nhiên liệu", width: 18, number: true },
      { key: "odometer_from", label: "Số km từ", width: 16, number: true }, { key: "odometer_to", label: "Số km đến", width: 16, number: true },
      { key: "payment_date", label: "Ngày thanh toán", width: 18 }, { key: "amount", label: "Số tiền", width: 20, money: true },
      { key: "purchaser", label: "Người mua / tài xế", width: 24 }, { key: "note", label: "Ghi chú", width: 34 },
    ],
  },
};

function dateRange(year?: number, month?: number) {
  if (!year) return null;
  const startMonth = month ?? 1;
  const endYear = month === 12 || !month ? year + 1 : year;
  const endMonth = month === 12 || !month ? 1 : month + 1;
  return {
    start: `${year}-${String(startMonth).padStart(2, "0")}-01`,
    end: `${endYear}-${String(endMonth).padStart(2, "0")}-01`,
  };
}

function relatedVehicle(value: unknown) {
  if (Array.isArray(value)) return (value[0] ?? {}) as ExportRow;
  return (value ?? {}) as ExportRow;
}

function normalizeRows(rows: ExportRow[], reportType: ReportType) {
  return rows.map((item) => {
    const vehicle = relatedVehicle(item.vehicles);
    const { vehicles: _vehicles, departments, archived_at: archivedAt, ...fields } = item;
    const department = Array.isArray(departments)
      ? (departments[0] as ExportRow | undefined)?.name
      : (departments as ExportRow | null)?.name;
    return {
      ...fields,
      vehicle_code: fields.vehicle_code ?? vehicle.vehicle_code ?? "",
      vehicle_name: fields.vehicle_name ?? vehicle.vehicle_name ?? "",
      license_plate: fields.license_plate ?? vehicle.license_plate ?? "",
      fuel_norm_l_per_100km: vehicle.fuel_norm_l_per_100km ?? fields.fuel_norm_l_per_100km ?? "",
      department: department ?? "",
      record_status: reportType === "vehicle_insurance" ? (archivedAt ? "Lịch sử" : "Hiện hành") : undefined,
    };
  });
}

async function readRows(supabase: Awaited<ReturnType<typeof requireAccess>>["supabase"], reportType: ReportType, year?: number, month?: number, vehicleId?: string) {
  const range = dateRange(year, month);
  const rows: ExportRow[] = [];
  for (let offset = 0; offset < 50000; offset += 500) {
    let query;
    if (reportType === "vehicles") {
      query = supabase.from("vehicles")
        .select("vehicle_code,vehicle_name,license_plate,brand,model,production_year,seat_count,fuel_norm_l_per_100km,assigned_driver,status,note,departments(name)")
        .is("deleted_at", null).order("vehicle_code").order("id");
      if (vehicleId) query = query.eq("id", vehicleId);
    } else if (reportType === "vehicle_inspections") {
      query = supabase.from("vehicle_inspections")
        .select("id,vehicle_id,inspection_date,expires_on,cost,reminder_days,certificate_number,inspection_center,seat_count,odometer_km,note,vehicles(vehicle_code,vehicle_name,license_plate)")
        .order("inspection_date", { ascending: false }).order("id");
      if (range) query = query.gte("inspection_date", range.start).lt("inspection_date", range.end);
      if (vehicleId) query = query.eq("vehicle_id", vehicleId);
    } else if (reportType === "vehicle_insurance") {
      query = supabase.from("vehicle_insurances")
        .select("id,vehicle_id,insurance_name,insurance_type,insurance_company,certificate_number,starts_on,expires_on,cost,reminder_days,note,archived_at,vehicles(vehicle_code,vehicle_name,license_plate)")
        .order("starts_on", { ascending: false }).order("id");
      if (range) query = query.gte("starts_on", range.start).lt("starts_on", range.end);
      if (vehicleId) query = query.eq("vehicle_id", vehicleId);
    } else if (reportType === "vehicle_repairs") {
      query = supabase.from("vehicle_repairs")
        .select("id,vehicle_id,service_date,service_type,description,odometer_km,vat_amount,vendor,invoice_number,note,vehicles(vehicle_code,vehicle_name,license_plate)")
        .order("service_date", { ascending: false }).order("id");
      if (range) query = query.gte("service_date", range.start).lt("service_date", range.end);
      if (vehicleId) query = query.eq("vehicle_id", vehicleId);
    } else {
      query = supabase.from("vehicle_fuel_logs")
        .select("id,vehicle_id,payment_date,liters,odometer_from,odometer_to,amount,purchaser,note,vehicles(vehicle_code,vehicle_name,license_plate,fuel_norm_l_per_100km)")
        .order("payment_date", { ascending: false }).order("id");
      if (range) query = query.gte("payment_date", range.start).lt("payment_date", range.end);
      if (vehicleId) query = query.eq("vehicle_id", vehicleId);
    }
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as ExportRow[]));
    if ((data?.length ?? 0) < 500) return normalizeRows(rows, reportType);
  }
  throw new Error("Báo cáo quá lớn. Hãy chọn một năm hoặc tháng cụ thể.");
}

function scopeLabel(year?: number, month?: number) {
  if (year && month) return `Tháng ${month}/${year}`;
  if (year) return `Năm ${year}`;
  return "Tất cả thời gian";
}

function buildWorkbook(reportType: ReportType, rows: ExportRow[], year?: number, month?: number) {
  const config = reportCatalog[reportType];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TDW Management";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Bao cao", { views: [{ state: "frozen", ySplit: 5 }] });
  const endColumn = config.columns.length;
  sheet.mergeCells(1, 1, 1, endColumn);
  sheet.getCell(1, 1).value = "CÔNG TY CỔ PHẦN NƯỚC THỦ ĐỨC — TDW";
  sheet.mergeCells(2, 1, 2, endColumn);
  sheet.getCell(2, 1).value = config.title;
  sheet.mergeCells(3, 1, 3, endColumn);
  sheet.getCell(3, 1).value = `Bộ lọc: ${reportType === "vehicles" ? "Danh sách hiện hành" : scopeLabel(year, month)} · Ngày xuất ${new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())}`;
  [1, 2, 3].forEach((rowNumber) => {
    const cell = sheet.getCell(rowNumber, 1);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.font = { bold: rowNumber < 3, size: rowNumber === 2 ? 17 : rowNumber === 1 ? 12 : 10, color: { argb: rowNumber === 2 ? "FF08769A" : "FF17324D" } };
  });
  const header = sheet.getRow(5);
  header.values = config.columns.map((column) => column.label);
  header.height = 32;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF08769A" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: { style: "thin", color: { argb: "FFBFD8E4" } }, bottom: { style: "thin", color: { argb: "FFBFD8E4" } }, left: { style: "thin", color: { argb: "FFBFD8E4" } }, right: { style: "thin", color: { argb: "FFBFD8E4" } } };
  });
  rows.forEach((item, index) => {
    const row = sheet.addRow(config.columns.map((column) => item[column.key] ?? ""));
    row.height = 30;
    row.eachCell((cell, columnNumber) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "FFF2F7FA" : "FFFFFFFF" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFD2E2EA" } }, left: { style: "thin", color: { argb: "FFD2E2EA" } }, right: { style: "thin", color: { argb: "FFD2E2EA" } } };
      const column = config.columns[columnNumber - 1];
      if (column.money) cell.numFmt = '#,##0 "₫"';
      else if (column.number && typeof cell.value === "number") cell.numFmt = "#,##0.###";
    });
  });
  if (!rows.length) {
    const emptyRow = sheet.addRow([`Không có dữ liệu phù hợp với bộ lọc ${scopeLabel(year, month)}.`]);
    sheet.mergeCells(emptyRow.number, 1, emptyRow.number, endColumn);
    emptyRow.height = 38;
    emptyRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    emptyRow.getCell(1).font = { italic: true, color: { argb: "FF5C7086" } };
  }
  sheet.columns = config.columns.map((column) => ({ width: column.width }));
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: endColumn } };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  return workbook;
}

export async function GET(request: NextRequest) {
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.view") || !can(access, "reports.vehicles.export")) {
    return NextResponse.json({ error: "Không có quyền xuất báo cáo xe." }, { status: 403 });
  }
  const input = Object.fromEntries([...request.nextUrl.searchParams.entries()].filter(([, value]) => value));
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Bộ lọc báo cáo không hợp lệ." }, { status: 400 });
  const { report_type: reportType, year, month, vehicle_id: vehicleId } = parsed.data;
  try {
    const rows = await readRows(supabase, reportType, year, month, vehicleId);
    const workbook = buildWorkbook(reportType, rows, year, month);
    const buffer = await workbook.xlsx.writeBuffer();
    const config = reportCatalog[reportType];
    const suffix = reportType === "vehicles" ? "" : year ? `_${year}${month ? `_T${String(month).padStart(2, "0")}` : ""}` : "_TAT-CA";
    return new NextResponse(buffer as ArrayBuffer, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="TDW_${config.file}${suffix}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Report-Row-Count": String(rows.length),
    } });
  } catch (error) {
    console.error("vehicle_xlsx_export_failed", { report_type: reportType, reason: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Không thể đọc dữ liệu để tạo báo cáo xe." }, { status: 500 });
  }
}
