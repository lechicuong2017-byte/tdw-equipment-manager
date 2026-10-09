import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";

export const VEHICLE_REPORT_COMPANY = "Công ty Cổ Phần B.O.O Nước Thủ Đức";
export const VEHICLE_REPORT_ADDRESS = "479 Xa lộ Hà Nội, P. Linh Xuân, TP.Hồ Chí Minh, Việt Nam";

let logoPromise: Promise<Buffer> | undefined;
// Một ảnh/logo cho mỗi workbook, nhiều sheet cùng dùng lại imageId.
// WeakMap không giữ workbook đã xuất xong và không trộn dữ liệu báo cáo.
const logoIds = new WeakMap<ExcelJS.Workbook, number>();

function logoPng() {
  // Keep the supplied PNG untouched so the TDW gradient and tagline retain their colors.
  logoPromise ??= readFile(join(process.cwd(), "public", "tdw-report-logo.png"))
    .catch((error) => {
      logoPromise = undefined;
      throw error;
    });
  return logoPromise;
}

export async function addVehicleReportHeader(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  lastColumn: number,
  title: string,
  subtitle: string,
) {
  const logo = await logoPng();
  let imageId = logoIds.get(workbook);
  if (imageId === undefined) {
    imageId = workbook.addImage({ base64: logo.toString("base64"), extension: "png" });
    logoIds.set(workbook, imageId);
  }
  sheet.addImage(imageId, { tl: { col: 0.08, row: 0.12 }, ext: { width: 124, height: 46 } });

  const lines = [VEHICLE_REPORT_COMPANY, VEHICLE_REPORT_ADDRESS, title, subtitle];
  const heights = lastColumn <= 2 ? [42, 45, 50, 36] : [42, 27, 38, 28];
  lines.forEach((value, index) => {
    const rowNumber = index + 1;
    sheet.mergeCells(rowNumber, 2, rowNumber, lastColumn);
    const cell = sheet.getCell(rowNumber, 2);
    cell.value = value;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.font = {
      bold: rowNumber === 1 || rowNumber === 3,
      size: rowNumber === 3 ? 16 : rowNumber === 1 ? 12 : 10,
      color: { argb: rowNumber === 3 ? "FF08769A" : rowNumber === 4 ? "FF5C7086" : "FF17324D" },
    };
    sheet.getRow(rowNumber).height = heights[index];
  });
}
