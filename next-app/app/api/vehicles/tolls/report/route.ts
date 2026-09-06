import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { can, requireAccess } from "@/lib/auth";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { access, supabase } = await requireAccess();
  if (!can(access, "vehicles.view") || !can(access, "reports.vehicles.export"))
    return NextResponse.json({ error: "Không có quyền xuất báo cáo xe." }, { status: 403 });
  const input = Object.fromEntries([...request.nextUrl.searchParams.entries()].filter(([, value]) => value));
  const parsed = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(), vehicle_id: z.uuid().optional() }).safeParse(input);
  if (!parsed.success || (parsed.data.month && !parsed.data.year))
    return NextResponse.json({ error: "Bộ lọc không hợp lệ." }, { status: 400 });
  const { year, month, vehicle_id: vehicleId } = parsed.data;
  const start = year ? `${year}-${String(month || 1).padStart(2, "0")}-01` : "2000-01-01";
  const end = year ? month && month < 12 ? `${year}-${String(month + 1).padStart(2, "0")}-01` : `${year + 1}-01-01` : "2101-01-01";
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TDW Management";
  const monthly = workbook.addWorksheet("Ve le chi tiet");
  const quarterly = workbook.addWorksheet("Ve quy");
  monthly.addRow(["Xe", "Trạm", "Thời gian (Việt Nam)", "Số hóa đơn", "Mã giao dịch", "Chưa thuế", "VAT", "Sau thuế"]);
  quarterly.addRow(["Xe", "Loại xe", "Màu xe", "Trạm", "Bắt đầu", "Hết hạn", "Chi phí có VAT", "Sheet nguồn"]);
  const monthTotals = new Map<string, number>();
  let quarterlyTotal = 0;
  // PostgREST caps response rows; paginate exports to avoid silently incomplete totals.
  for (const kind of ["monthly", "quarterly"] as const) {
    let complete = false;
    for (let offset = 0; offset < 50000; offset += 500) {
      const query = kind === "monthly"
        ? supabase.from("vehicle_toll_transactions").select("id,license_plate,toll_station,transaction_at,invoice_number,transaction_code,amount_before_tax,tax_amount,amount_after_tax")
          .gte("transaction_at", `${start}T00:00:00+07:00`).lt("transaction_at", `${end}T00:00:00+07:00`).order("transaction_at").order("id")
        : supabase.from("vehicle_toll_quarterly_passes").select("id,license_plate,vehicle_type,vehicle_color,toll_station,starts_on,expires_on,amount,source_sheet")
          .gte("starts_on", start).lt("starts_on", end).order("starts_on").order("id");
      if (vehicleId) query.eq("vehicle_id", vehicleId);
      const { data, error } = await query.range(offset, offset + 499);
      if (error) return NextResponse.json({ error: "Không thể đọc dữ liệu báo cáo VETC." }, { status: 500 });
      for (const row of data || []) {
        if ("transaction_at" in row) {
          const key = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(row.transaction_at));
          monthTotals.set(key, (monthTotals.get(key) || 0) + Number(row.amount_after_tax));
          monthly.addRow([row.license_plate, row.toll_station, new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(row.transaction_at)), row.invoice_number, row.transaction_code, Number(row.amount_before_tax), Number(row.tax_amount), Number(row.amount_after_tax)]);
        } else {
          quarterlyTotal += Number(row.amount);
          quarterly.addRow([row.license_plate, row.vehicle_type, row.vehicle_color, row.toll_station, row.starts_on, row.expires_on, Number(row.amount), row.source_sheet]);
        }
      }
      if ((data?.length || 0) < 500) { complete = true; break; }
    }
    if (!complete) return NextResponse.json({ error: "Báo cáo quá lớn. Hãy chọn một năm hoặc tháng cụ thể." }, { status: 422 });
  }
  const summary = workbook.addWorksheet("Tong hop");
  summary.addRow(["Kỳ / loại chi phí", "Số tiền sau thuế"]);
  for (const [period, amount] of monthTotals) summary.addRow([`Vé lẻ ${period}`, amount]);
  summary.addRow(["Vé quý (theo ngày bắt đầu)", quarterlyTotal]);
  summary.addRow(["TỔNG CỘNG", [...monthTotals.values()].reduce((sum, value) => sum + value, quarterlyTotal)]);
  for (const sheet of workbook.worksheets) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.columns.forEach((column) => { column.width = 23; });
    sheet.getRow(1).height = 28;
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E7490" } };
    });
    sheet.eachRow((row, index) => { if (index > 1) {
      row.eachCell((cell) => { cell.alignment = { vertical: "middle", wrapText: true }; if (typeof cell.value === "number") cell.numFmt = '#,##0 "₫"'; });
    } });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: sheet.columnCount } };
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="TDW_VETC_${year || "all"}${month ? `_${month}` : ""}.xlsx"`,
    "Cache-Control": "private, no-store",
  } });
}
