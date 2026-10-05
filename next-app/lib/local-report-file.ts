import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { addVehicleReportHeader, VEHICLE_REPORT_ADDRESS, VEHICLE_REPORT_COMPANY } from "./vehicle-report-brand";

export type LocalReport = {
  report_name: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | boolean | null>[];
  summary?: string;
  group_key?: string;
};

const moneyKey = /(^|_)(cost|price|amount|value|recovery)(_|$)/i;
const currency = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function safeCell(value: string | number | boolean | null | undefined) {
  if (typeof value !== "string") return value ?? "";
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function text(value: unknown) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim();
}

function xml(value: unknown) {
  return text(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character] || character);
}

function moneyColumns(report: LocalReport) {
  return report.columns.map((column, index) => moneyKey.test(column.key) ? index + 2 : 0).filter(Boolean);
}

export async function renderReportXlsx(report: LocalReport) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TDW Management";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Bao cao", { views: [{ state: "frozen", ySplit: 5, xSplit: 2 }] });
  const lastColumn = report.columns.length + 1;
  const date = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  await addVehicleReportHeader(workbook, sheet, lastColumn, report.report_name, `Ngày xuất ${date} · ${report.rows.length} dòng${report.summary ? ` · ${report.summary}` : ""}`);
  const header = sheet.getRow(5);
  header.values = ["STT", ...report.columns.map((column) => column.label)];
  header.height = 36;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF08769A" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  let lastGroup = "";
  report.rows.forEach((item, index) => {
    const group = report.group_key ? text(item[report.group_key]) || "CHƯA PHÂN NHÓM" : "";
    if (group && group !== lastGroup) {
      const groupRow = sheet.addRow([safeCell(group)]);
      sheet.mergeCells(groupRow.number, 1, groupRow.number, lastColumn);
      groupRow.height = 27;
      groupRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE8A3" } };
      groupRow.getCell(1).font = { bold: true, color: { argb: "FF17324D" } };
      lastGroup = group;
    }
    const row = sheet.addRow([index + 1, ...report.columns.map((column) => safeCell(item[column.key]))]);
    row.height = Math.max(30, Math.min(409, 14 * Math.max(...report.columns.map((column) => {
      const width = Math.min(55, Math.max(17, column.label.length + 8));
      return String(item[column.key] ?? "").split("\n").reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / (width - 3))), 0);
    })) + 12));
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "FFF2F7FA" : "FFFFFFFF" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFD2E2EA" } } };
    });
    for (const column of moneyColumns(report)) {
      const cell = row.getCell(column);
      cell.value = Number(item[report.columns[column - 2].key] ?? 0) || 0;
      cell.numFmt = '#,##0 "₫"';
      cell.alignment = { vertical: "middle", horizontal: "right" };
    }
  });
  if (!report.rows.length) {
    const empty = sheet.addRow(["Không có dữ liệu phù hợp với bộ lọc."]);
    sheet.mergeCells(empty.number, 1, empty.number, lastColumn);
    empty.height = 34;
  }
  const totalRow = sheet.addRow(["TỔNG CHI PHÍ"]);
  if (lastColumn > 2 && !moneyColumns(report).includes(2)) sheet.mergeCells(totalRow.number, 1, totalRow.number, 2);
  for (const column of moneyColumns(report)) {
    const key = report.columns[column - 2].key;
    totalRow.getCell(column).value = report.rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
    totalRow.getCell(column).numFmt = '#,##0 "₫"';
  }
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell = totalRow.getCell(column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF075D80" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  }
  totalRow.height = 32;
  sheet.getColumn(1).width = lastColumn <= 3 ? 20 : 9;
  report.columns.forEach((column, index) => { sheet.getColumn(index + 2).width = Math.min(55, Math.max(lastColumn <= 3 ? 34 : 17, column.label.length + 8)); });
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: lastColumn } };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  sheet.pageSetup.printTitlesRow = "1:5";
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function wrap(value: unknown, limit: number, maxLines = Number.POSITIVE_INFINITY) {
  const words = text(value).split(/\s+/).flatMap((word) => {
    const pieces: string[] = [];
    for (let index = 0; index < word.length; index += limit) pieces.push(word.slice(index, index + limit));
    return pieces;
  });
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > limit && line) {
      lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const visible = lines.slice(0, maxLines);
    visible[maxLines - 1] = `${visible[maxLines - 1].slice(0, Math.max(0, limit - 1))}…`;
    return visible;
  }
  return lines.length ? lines : ["—"];
}

export async function renderReportPdf(report: LocalReport) {
  if (report.rows.length > 1000) throw new Error("PDF quá 1.000 dòng. Hãy lọc bớt dữ liệu hoặc xuất XLSX.");
  const pdf = await PDFDocument.create();
  pdf.setTitle(report.report_name);
  pdf.setAuthor(VEHICLE_REPORT_COMPANY);
  const logo = await readFile(join(process.cwd(), "public", "tdw-report-logo.png"));
  const logoUrl = `data:image/png;base64,${logo.toString("base64")}`;
  const columnGroups: Array<typeof report.columns> = [];
  for (let index = 0; index < report.columns.length; index += 6) columnGroups.push(report.columns.slice(index, index + 6));
  const chunks = columnGroups.length ? columnGroups : [[]];
  type PdfRowSegment = { number: string; lines: string[][]; height: number };
  type PdfPage = { columns: typeof report.columns; columnPart: number; segments: PdfRowSegment[] };
  const pages: PdfPage[] = [];
  for (const [columnPart, columns] of chunks.entries()) {
    let currentPage: PdfPage = { columns, columnPart: columnPart + 1, segments: [] };
    let usedHeight = 0;
    for (const [rowIndex, row] of report.rows.entries()) {
      const lineSets = columns.map((column) => wrap(moneyKey.test(column.key) ? `${currency.format(Number(row[column.key]) || 0)} ₫` : row[column.key], 24));
      const maximumLines = Math.max(1, ...lineSets.map((lines) => lines.length));
      let lineOffset = 0;
      while (lineOffset < maximumLines) {
        const remaining = 535 - usedHeight;
        if (remaining < 42) {
          pages.push(currentPage);
          currentPage = { columns, columnPart: columnPart + 1, segments: [] };
          usedHeight = 0;
          continue;
        }
        const linesThisPage = Math.min(maximumLines - lineOffset, Math.max(1, Math.floor((remaining - 12) / 15)));
        const height = Math.max(40, linesThisPage * 15 + 12);
        currentPage.segments.push({
          number: lineOffset ? "↳" : String(rowIndex + 1),
          lines: lineSets.map((lines) => lines.slice(lineOffset, lineOffset + linesThisPage)),
          height,
        });
        usedHeight += height;
        lineOffset += linesThisPage;
      }
    }
    pages.push(currentPage);
  }
  for (const [pageIndex, { columns, columnPart, segments }] of pages.entries()) {
      const left = 42;
      const tableWidth = 1116;
      const indexWidth = 48;
      const columnWidth = (tableWidth - indexWidth) / Math.max(columns.length, 1);
      const elements: string[] = [];
      elements.push(`<rect width="1200" height="850" fill="#fff"/>`);
      elements.push(`<image href="${logoUrl}" x="42" y="27" width="122" height="46"/>`);
      elements.push(`<text x="670" y="38" text-anchor="middle" font-size="17" font-weight="700" fill="#17324d">${xml(VEHICLE_REPORT_COMPANY)}</text>`);
      elements.push(`<text x="670" y="60" text-anchor="middle" font-size="13" fill="#50657b">${xml(VEHICLE_REPORT_ADDRESS)}</text>`);
      wrap(report.report_name, 80, 2).forEach((line, index) => elements.push(`<text x="600" y="${105 + index * 26}" text-anchor="middle" font-size="23" font-weight="700" fill="#08769a">${xml(line)}</text>`));
      elements.push(`<text x="600" y="151" text-anchor="middle" font-size="13" fill="#50657b">${xml(`${report.summary || `${report.rows.length} dòng`} · Phần cột ${columnPart}/${chunks.length}`.slice(0, 145))}</text>`);
      elements.push(`<rect x="${left}" y="169" width="${tableWidth}" height="42" fill="#08769a"/>`);
      elements.push(`<text x="${left + 10}" y="196" font-size="13" font-weight="700" fill="#fff">STT</text>`);
      columns.forEach((column, index) => {
        const x = left + indexWidth + index * columnWidth + 8;
        wrap(column.label, 22, 2).forEach((line, lineIndex) => elements.push(`<text x="${x}" y="${lineIndex ? 202 : 188}" font-size="12" font-weight="700" fill="#fff">${xml(line)}</text>`));
      });
      let y = 211;
      segments.forEach((segment, index) => {
        elements.push(`<rect x="${left}" y="${y}" width="${tableWidth}" height="${segment.height}" fill="${index % 2 ? "#f2f7fa" : "#fff"}" stroke="#d2e2ea" stroke-width="1"/>`);
        elements.push(`<text x="${left + 10}" y="${y + 24}" font-size="12" fill="#17324d">${segment.number}</text>`);
        segment.lines.forEach((lines, columnIndex) => {
          const x = left + indexWidth + columnIndex * columnWidth + 8;
          lines.forEach((line, lineIndex) => elements.push(`<text x="${x}" y="${y + 22 + lineIndex * 15}" font-size="12" fill="#17324d">${xml(line)}</text>`));
        });
        y += segment.height;
      });
      if (!report.rows.length) elements.push(`<text x="50" y="230" font-size="15" fill="#50657b">Không có dữ liệu phù hợp với bộ lọc.</text>`);
      const costSummary = columns.filter((column) => moneyKey.test(column.key)).map((column) => `${column.label}: ${currency.format(report.rows.reduce((sum, row) => sum + (Number(row[column.key]) || 0), 0))} ₫`).join("  ·  ");
      if (costSummary) wrap(costSummary, 145).forEach((line, index) => elements.push(`<text x="42" y="${778 + index * 15}" font-size="12" font-weight="700" fill="#075d80">${xml(line)}</text>`));
      elements.push(`<text x="42" y="825" font-size="12" fill="#50657b">TDW Management · ${new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())}</text>`);
      elements.push(`<text x="1110" y="825" font-size="12" fill="#50657b">${pageIndex + 1}/${pages.length}</text>`);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="850" viewBox="0 0 1200 850"><g font-family="Arial, DejaVu Sans, sans-serif">${elements.join("")}</g></svg>`;
      const png = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
      const embedded = await pdf.embedPng(png);
      const page = pdf.addPage([842, 595]);
      page.drawImage(embedded, { x: 0, y: 0, width: 842, height: 595 });
  }
  return Buffer.from(await pdf.save());
}
