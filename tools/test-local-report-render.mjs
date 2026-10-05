import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import ts from "../next-app/node_modules/typescript/lib/typescript.js";

const appRoot = join(import.meta.dirname, "..", "next-app");
const appRequire = createRequire(join(appRoot, "package.json"));
process.chdir(appRoot);

async function loadTs(relativePath, overrides = {}) {
  const source = await readFile(join(appRoot, relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const require = (specifier) => specifier === "server-only" ? {} : overrides[specifier] ?? appRequire(specifier);
  new Function("require", "module", "exports", "process", compiled)(require, module, module.exports, process);
  return module.exports;
}

const brand = await loadTs("lib/vehicle-report-brand.ts");
const { renderReportPdf, renderReportXlsx } = await loadTs("lib/local-report-file.ts", { "./vehicle-report-brand": brand });
const report = {
  report_name: "BÁO CÁO BẢO DƯỠNG VÀ SỬA CHỮA",
  columns: [
    { key: "asset_name", label: "Thiết bị" },
    { key: "date", label: "Ngày thực hiện" },
    { key: "description", label: "Nội dung" },
    { key: "cost", label: "Chi phí" },
  ],
  rows: [
    { asset_name: "Máy bơm tuyến ống số 1", date: "2026-10-01", description: "Kiểm tra và thay dầu định kỳ", cost: 1250000 },
    { asset_name: "Thiết bị đo áp suất", date: "2026-10-02", description: "Thay cảm biến, kiểm tra tín hiệu", cost: 750000 },
  ],
  summary: "Năm 2026 · 2 dòng",
};

const xlsx = await renderReportXlsx(report);
assert.equal(xlsx.subarray(0, 2).toString(), "PK");
const ExcelJS = appRequire("exceljs");
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(xlsx);
const sheet = workbook.worksheets[0];
assert.match(String(sheet.getCell("B1").value), /B\.O\.O Nước Thủ Đức/);
assert.equal(sheet.getCell("E8").value, 2000000);
assert.equal(sheet.getCell("A5").value, "STT");
assert.equal(sheet.getCell("B5").value, "Thiết bị");
assert.equal(sheet.getCell("B1").alignment.horizontal, "center");
assert.equal(sheet.getImages().length, 1);

const pdf = await renderReportPdf(report);
assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
const { PDFDocument } = appRequire("pdf-lib");
assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1);
const longPdf = await renderReportPdf({
  ...report,
  rows: [{ ...report.rows[0], description: "Nội dung chi tiết phải giữ đầy đủ trên các trang PDF. ".repeat(35) }],
});
assert.ok((await PDFDocument.load(longPdf)).getPageCount() > 1, "long description must continue on another page");
if (process.env.OUTPUT_PDF) await writeFile(process.env.OUTPUT_PDF, pdf);
if (process.env.OUTPUT_LONG_PDF) await writeFile(process.env.OUTPUT_LONG_PDF, longPdf);
console.log("Synthetic local XLSX/PDF report: pass");
