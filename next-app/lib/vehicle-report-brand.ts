import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import sharp from "sharp";

export const VEHICLE_REPORT_COMPANY = "Công ty Cổ Phần B.O.O Nước Thủ Đức";
export const VEHICLE_REPORT_ADDRESS = "479 Xa lộ Hà Nội, P. Linh Xuân, TP.Hồ Chí Minh, Việt Nam";

let logoPromise: Promise<Buffer> | undefined;

function logoPng() {
  logoPromise ??= readFile(join(process.cwd(), "public", "tdw-logo.webp"))
    .then((source) => sharp(source).png().toBuffer())
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
  const imageId = workbook.addImage({ base64: logo.toString("base64"), extension: "png" });
  sheet.addImage(imageId, { tl: { col: 0.08, row: 0.14 }, ext: { width: 118, height: 44 } });

  const lines = [VEHICLE_REPORT_COMPANY, VEHICLE_REPORT_ADDRESS, title, subtitle];
  const heights = [29, 25, 37, 25];
  lines.forEach((value, index) => {
    const rowNumber = index + 1;
    sheet.mergeCells(rowNumber, 2, rowNumber, lastColumn);
    const cell = sheet.getCell(rowNumber, 2);
    cell.value = value;
    cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    cell.font = {
      bold: rowNumber === 1 || rowNumber === 3,
      size: rowNumber === 3 ? 16 : rowNumber === 1 ? 12 : 10,
      color: { argb: rowNumber === 3 ? "FF08769A" : rowNumber === 4 ? "FF5C7086" : "FF17324D" },
    };
    sheet.getRow(rowNumber).height = heights[index];
  });
}
