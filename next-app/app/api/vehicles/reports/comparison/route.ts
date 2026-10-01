import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { can, requireAccess } from "@/lib/auth";

export const maxDuration = 60;

const inputSchema = z.object({
  year_a: z.coerce.number().int().min(2000).max(2100),
  year_b: z.coerce.number().int().min(2000).max(2100),
  vehicle_id: z.uuid().optional(),
}).refine((value) => value.year_a !== value.year_b, { message: "Hai năm so sánh phải khác nhau." });

type CostCategory = "inspection" | "insurance" | "repair" | "fuel" | "toll";
type CostBucket = Record<CostCategory | "total", number>;
type VehicleRow = { id: string; vehicle_code: string; vehicle_name: string; license_plate: string };
type CostSourceRow = { vehicle_id?: string | null; license_plate?: string | null; occurred_on: string; amount: number };

const categories: { key: CostCategory; label: string }[] = [
  { key: "inspection", label: "Đăng kiểm" },
  { key: "insurance", label: "Bảo hiểm" },
  { key: "repair", label: "Bảo dưỡng / sửa chữa" },
  { key: "fuel", label: "Nhiên liệu" },
  { key: "toll", label: "VETC" },
];

function emptyBucket(): CostBucket {
  return { inspection: 0, insurance: 0, repair: 0, fuel: 0, toll: 0, total: 0 };
}

async function readPaged(buildQuery: (offset: number) => PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>) {
  const rows: unknown[] = [];
  for (let offset = 0; offset < 50000; offset += 500) {
    const { data, error } = await buildQuery(offset);
    if (error) throw new Error(error.message || "Không thể đọc dữ liệu chi phí.");
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return rows;
  }
  throw new Error("Dữ liệu quá lớn. Hãy chọn một xe cụ thể.");
}

async function costRows(
  supabase: Awaited<ReturnType<typeof requireAccess>>["supabase"],
  table: string,
  dateField: string,
  amountField: string,
  start: string,
  end: string,
  vehicleId?: string,
  includePlate = false,
) {
  const rows = await readPaged((offset) => {
    let query = supabase.from(table)
      .select(`id,vehicle_id,${includePlate ? "license_plate," : ""}${dateField},${amountField}`)
      .gte(dateField, start).lt(dateField, end).order(dateField).order("id");
    if (vehicleId) query = query.eq("vehicle_id", vehicleId);
    return query.range(offset, offset + 499);
  });
  return rows.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      vehicle_id: typeof row.vehicle_id === "string" ? row.vehicle_id : null,
      license_plate: typeof row.license_plate === "string" ? row.license_plate : null,
      occurred_on: String(row[dateField] ?? ""),
      amount: Number(row[amountField] ?? 0),
    } satisfies CostSourceRow;
  });
}

function yearOf(value: string) {
  return Number(value.slice(0, 4));
}

function styleTitleSheet(sheet: ExcelJS.Worksheet, endColumn: number) {
  [1, 2, 3].forEach((rowNumber) => {
    sheet.mergeCells(rowNumber, 1, rowNumber, endColumn);
    const cell = sheet.getCell(rowNumber, 1);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.font = { bold: rowNumber < 3, size: rowNumber === 2 ? 17 : rowNumber === 1 ? 12 : 10, color: { argb: rowNumber === 2 ? "FF08769A" : "FF17324D" } };
  });
}

function styleHeader(row: ExcelJS.Row, fill = "FF08769A") {
  row.height = 30;
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: { style: "thin", color: { argb: "FFBFD8E4" } }, bottom: { style: "thin", color: { argb: "FFBFD8E4" } }, left: { style: "thin", color: { argb: "FFBFD8E4" } }, right: { style: "thin", color: { argb: "FFBFD8E4" } } };
  });
}

function addComparisonSheet(workbook: ExcelJS.Workbook, vehicles: VehicleRow[], costs: Map<string, Map<number, CostBucket>>, yearA: number, yearB: number) {
  const sheet = workbook.addWorksheet("So sanh theo xe", { views: [{ state: "frozen", ySplit: 6, xSplit: 3 }] });
  styleTitleSheet(sheet, 17);
  sheet.getCell("A1").value = "CÔNG TY CỔ PHẦN NƯỚC THỦ ĐỨC — TDW";
  sheet.getCell("A2").value = `SO SÁNH CHI PHÍ XE NĂM ${yearA} VÀ ${yearB}`;
  sheet.getCell("A3").value = `Mỗi xe một dòng · Chi phí gồm đăng kiểm, bảo hiểm, bảo dưỡng, nhiên liệu và VETC · Ngày xuất ${new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())}`;
  sheet.getRow(5).values = ["Mã xe", "Tên xe", "Biển số", `Năm ${yearA}`, "", "", "", "", "", `Năm ${yearB}`, "", "", "", "", "", "Chênh lệch", "Tỷ lệ tăng/giảm"];
  sheet.getRow(6).values = ["", "", "", ...categories.map((item) => item.label), "Tổng", ...categories.map((item) => item.label), "Tổng", "", ""];
  ["A5", "B5", "C5", "P5", "Q5"].forEach((address) => sheet.mergeCells(`${address}:${address[0]}6`));
  sheet.mergeCells("D5:I5");
  sheet.mergeCells("J5:O5");
  styleHeader(sheet.getRow(5), "FF075D80");
  styleHeader(sheet.getRow(6), "FF128396");
  vehicles.forEach((vehicle, index) => {
    const first = costs.get(vehicle.id)?.get(yearA) ?? emptyBucket();
    const second = costs.get(vehicle.id)?.get(yearB) ?? emptyBucket();
    const difference = second.total - first.total;
    const percent = first.total ? difference / first.total : second.total ? 1 : 0;
    const row = sheet.addRow([
      vehicle.vehicle_code, vehicle.vehicle_name, vehicle.license_plate,
      ...categories.map((item) => first[item.key]), first.total,
      ...categories.map((item) => second[item.key]), second.total,
      difference, percent,
    ]);
    row.height = 30;
    row.eachCell((cell, columnNumber) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "FFF2F7FA" : "FFFFFFFF" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFD2E2EA" } }, left: { style: "thin", color: { argb: "FFD2E2EA" } }, right: { style: "thin", color: { argb: "FFD2E2EA" } } };
      if (columnNumber >= 4 && columnNumber <= 16) cell.numFmt = '#,##0 "₫"';
      if (columnNumber === 17) cell.numFmt = "0.0%;[Red]-0.0%";
    });
  });
  const totalRowNumber = 7 + vehicles.length;
  const totalRow = sheet.addRow([
    "", "TỔNG CỘNG", "",
    ...Array.from({ length: 13 }, (_, index) => ({ formula: `SUM(${sheet.getColumn(index + 4).letter}7:${sheet.getColumn(index + 4).letter}${6 + vehicles.length})` })),
    { formula: `IF(I${totalRowNumber}=0,IF(O${totalRowNumber}=0,0,1),(O${totalRowNumber}-I${totalRowNumber})/I${totalRowNumber})` },
  ]);
  sheet.mergeCells(totalRow.number, 2, totalRow.number, 3);
  totalRow.eachCell((cell, columnNumber) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF075D80" } };
    if (columnNumber >= 4 && columnNumber <= 16) cell.numFmt = '#,##0 "₫"';
    if (columnNumber === 17) cell.numFmt = "0.0%;[Red]-0.0%";
  });
  sheet.columns = [18, 33, 16, 18, 18, 21, 18, 18, 20, 18, 18, 21, 18, 18, 20, 20, 18].map((width) => ({ width }));
  sheet.autoFilter = { from: "A6", to: "Q6" };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
}

function addDetailSheet(workbook: ExcelJS.Workbook, vehicles: VehicleRow[], costs: Map<string, Map<number, CostBucket>>, years: number[]) {
  const sheet = workbook.addWorksheet("Chi tiet theo muc", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow(["Mã xe", "Tên xe", "Biển số", "Năm", "Hạng mục", "Chi phí"]);
  styleHeader(sheet.getRow(1));
  for (const vehicle of vehicles) for (const year of years) {
    const bucket = costs.get(vehicle.id)?.get(year) ?? emptyBucket();
    for (const category of categories) sheet.addRow([vehicle.vehicle_code, vehicle.vehicle_name, vehicle.license_plate, year, category.label, bucket[category.key]]);
  }
  sheet.columns = [18, 33, 16, 12, 24, 20].map((width) => ({ width }));
  sheet.getColumn(6).numFmt = '#,##0 "₫"';
  sheet.autoFilter = { from: "A1", to: "F1" };
}

export async function GET(request: NextRequest) {
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.view") || !can(access, "reports.vehicles.export")) {
    return NextResponse.json({ error: "Không có quyền xuất báo cáo xe." }, { status: 403 });
  }
  const input = Object.fromEntries([...request.nextUrl.searchParams.entries()].filter(([, value]) => value));
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Hai năm so sánh hoặc xe chưa hợp lệ." }, { status: 400 });
  const { year_a: yearA, year_b: yearB, vehicle_id: vehicleId } = parsed.data;
  const firstYear = Math.min(yearA, yearB);
  const lastYear = Math.max(yearA, yearB);
  const start = `${firstYear}-01-01`;
  const end = `${lastYear + 1}-01-01`;
  try {
    let vehicleQuery = supabase.from("vehicles").select("id,vehicle_code,vehicle_name,license_plate").is("deleted_at", null).order("license_plate");
    if (vehicleId) vehicleQuery = vehicleQuery.eq("id", vehicleId);
    const [vehicleResult, inspectionRows, insuranceRows, repairRows, fuelRows, monthlyTollRows, quarterlyTollRows] = await Promise.all([
      vehicleQuery,
      costRows(supabase, "vehicle_inspections", "inspection_date", "cost", start, end, vehicleId),
      costRows(supabase, "vehicle_insurances", "starts_on", "cost", start, end, vehicleId),
      costRows(supabase, "vehicle_repairs", "service_date", "vat_amount", start, end, vehicleId),
      costRows(supabase, "vehicle_fuel_logs", "payment_date", "amount", start, end, vehicleId),
      costRows(supabase, "vehicle_toll_transactions", "transaction_at", "amount_after_tax", `${start}T00:00:00+07:00`, `${end}T00:00:00+07:00`, vehicleId, true),
      costRows(supabase, "vehicle_toll_quarterly_passes", "starts_on", "amount", start, end, vehicleId, true),
    ]);
    if (vehicleResult.error) throw new Error(vehicleResult.error.message);
    const vehicles = (vehicleResult.data ?? []) as VehicleRow[];
    const byPlate = new Map(vehicles.map((vehicle) => [vehicle.license_plate.replace(/[^A-Z0-9]/gi, "").toUpperCase(), vehicle.id]));
    const costs = new Map<string, Map<number, CostBucket>>();
    const add = (row: CostSourceRow, category: CostCategory) => {
      const normalizedPlate = row.license_plate?.replace(/[^A-Z0-9]/gi, "").toUpperCase() ?? "";
      const targetVehicle = row.vehicle_id || byPlate.get(normalizedPlate);
      const year = yearOf(row.occurred_on);
      if (!targetVehicle || (year !== yearA && year !== yearB)) return;
      const vehicleCosts = costs.get(targetVehicle) ?? new Map<number, CostBucket>();
      const bucket = vehicleCosts.get(year) ?? emptyBucket();
      bucket[category] += row.amount;
      bucket.total += row.amount;
      vehicleCosts.set(year, bucket);
      costs.set(targetVehicle, vehicleCosts);
    };
    inspectionRows.forEach((row) => add(row, "inspection"));
    insuranceRows.forEach((row) => add(row, "insurance"));
    repairRows.forEach((row) => add(row, "repair"));
    fuelRows.forEach((row) => add(row, "fuel"));
    [...monthlyTollRows, ...quarterlyTollRows].forEach((row) => add(row, "toll"));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "TDW Management";
    workbook.created = new Date();
    addComparisonSheet(workbook, vehicles, costs, yearA, yearB);
    addDetailSheet(workbook, vehicles, costs, [yearA, yearB]);
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="TDW_SO-SANH-CHI-PHI-XE_${yearA}-${yearB}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Report-Row-Count": String(vehicles.length),
    } });
  } catch (error) {
    console.error("vehicle_comparison_export_failed", { reason: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Không thể tạo báo cáo so sánh chi phí xe." }, { status: 500 });
  }
}
