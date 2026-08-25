import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { can, requireAccess } from "@/lib/auth";

const categoryLabel = (value: string) => value === "OFFICE_SUPPLY" ? "Văn phòng phẩm" : "Dụng cụ vệ sinh";
const formatDate = (value: string) => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

export async function GET(request: NextRequest) {
  const { access, supabase } = await requireAccess();
  if (!can(access, "reports.supplies.export")) return NextResponse.json({ error: "Không có quyền xuất báo cáo." }, { status: 403 });
  const year = Number(request.nextUrl.searchParams.get("year")) || new Date().getFullYear();
  const quarter = Number(request.nextUrl.searchParams.get("quarter")) || 0;
  const month = Number(request.nextUrl.searchParams.get("month")) || 0;
  const category = request.nextUrl.searchParams.get("category") || "";
  let requestQuery = supabase.from("supply_requests").select("id,request_no,category,period_type,period_year,period_month,period_quarter,requested_on,requester_name,requesting_department,status").eq("period_year", year);
  if (quarter) requestQuery = requestQuery.eq("period_quarter", quarter);
  if (month) requestQuery = requestQuery.eq("period_month", month);
  if (category === "OFFICE_SUPPLY" || category === "CLEANING_SUPPLY") requestQuery = requestQuery.eq("category", category);
  const { data: requests, error } = await requestQuery.order("requested_on");
  if (error) return NextResponse.json({ error: "Không thể đọc dữ liệu báo cáo." }, { status: 500 });
  const ids = (requests ?? []).map((item) => item.id);
  const { data: lines, error: lineError } = ids.length
    ? await supabase.from("supply_request_lines").select("request_id,item_name,unit,proposed_quantity,stock_quantity,ordered_quantity,requested_departments,approval_note,approved_unit_price,amount,note,sort_order").in("request_id", ids).order("sort_order")
    : { data: [], error: null };
  if (lineError) return NextResponse.json({ error: "Không thể đọc chi tiết báo cáo." }, { status: 500 });

  const requestById = new Map((requests ?? []).map((item) => [item.id, item]));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TDW Management";
  const sheet = workbook.addWorksheet("Bao cao mua sam", { views: [{ state: "frozen", ySplit: 5 }] });
  sheet.mergeCells("A1:N1");
  sheet.getCell("A1").value = "CÔNG TY CỔ PHẦN NƯỚC THỦ ĐỨC — TDW";
  sheet.mergeCells("A2:N2");
  sheet.getCell("A2").value = `BÁO CÁO VĂN PHÒNG PHẨM & DỤNG CỤ VỆ SINH NĂM ${year}`;
  sheet.mergeCells("A3:N3");
  sheet.getCell("A3").value = `Bộ lọc: ${quarter ? `Quý ${quarter}` : month ? `Tháng ${month}` : "Cả năm"}${category ? ` · ${categoryLabel(category)}` : " · Tất cả loại"} · Ngày xuất ${new Date().toLocaleDateString("vi-VN")}`;
  ["A1", "A2", "A3"].forEach((cell, index) => {
    sheet.getCell(cell).alignment = { horizontal: "center", vertical: "middle" };
    sheet.getCell(cell).font = { bold: index < 2, color: { argb: index === 1 ? "FF08769A" : "FF17324D" }, size: index === 1 ? 17 : index === 0 ? 12 : 10 };
  });
  sheet.getRow(5).values = ["STT", "Số phiếu", "Ngày đề nghị", "Loại", "Kỳ mua", "Tên hàng", "Đơn vị", "SL đề xuất", "Tồn kho", "SL đặt mua", "Đơn giá", "Thành tiền", "Bộ phận đề nghị", "Phê duyệt / Ghi chú"];
  const header = sheet.getRow(5);
  header.height = 28;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF08769A" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: { style: "thin", color: { argb: "FFBFD8E4" } }, bottom: { style: "thin", color: { argb: "FFBFD8E4" } }, left: { style: "thin", color: { argb: "FFBFD8E4" } }, right: { style: "thin", color: { argb: "FFBFD8E4" } } };
  });
  let totalAmount = 0;
  let totalQuantity = 0;
  (lines ?? []).forEach((line, index) => {
    const parent = requestById.get(line.request_id);
    const period = parent?.period_type === "MONTH" ? `Tháng ${parent.period_month}/${parent.period_year}` : parent?.period_type === "QUARTER" ? `Quý ${parent.period_quarter}/${parent.period_year}` : `Năm ${parent?.period_year ?? year}`;
    const amount = Number(line.amount || 0);
    const ordered = Number(line.ordered_quantity || 0);
    totalAmount += amount;
    totalQuantity += ordered;
    const row = sheet.addRow([index + 1, parent?.request_no ?? "", formatDate(parent?.requested_on ?? ""), categoryLabel(parent?.category ?? ""), period, line.item_name, line.unit, Number(line.proposed_quantity), Number(line.stock_quantity), ordered, Number(line.approved_unit_price), amount, line.requested_departments, [line.approval_note, line.note].filter(Boolean).join(" · ")]);
    row.height = 30;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "FFF2F7FA" : "FFFFFFFF" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFD2E2EA" } }, left: { style: "thin", color: { argb: "FFD2E2EA" } }, right: { style: "thin", color: { argb: "FFD2E2EA" } } };
    });
    row.getCell(11).numFmt = '#,##0 "₫"';
    row.getCell(12).numFmt = '#,##0 "₫"';
  });
  const totalRow = sheet.addRow(["", "TỔNG CỘNG", "", "", "", "", "", "", "", totalQuantity, "", totalAmount, "", `${lines?.length ?? 0} dòng`]);
  sheet.mergeCells(totalRow.number, 2, totalRow.number, 9);
  totalRow.eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF075D80" } }; });
  totalRow.getCell(12).numFmt = '#,##0 "₫"';
  sheet.columns = [8, 14, 14, 20, 15, 36, 12, 13, 12, 13, 16, 18, 24, 32].map((width) => ({ width }));
  sheet.autoFilter = { from: "A5", to: "N5" };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `TDW_BAO-CAO-MUA-SAM_${year}${quarter ? `_Q${quarter}` : month ? `_T${month}` : ""}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "no-store" } });
}
