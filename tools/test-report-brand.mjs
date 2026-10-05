import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../next-app/package.json", import.meta.url));
const ExcelJS = require("exceljs");
const ts = require("typescript");
process.chdir(fileURLToPath(new URL("../next-app/", import.meta.url)));
const source = await fs.readFile(new URL("../next-app/lib/vehicle-report-brand.ts", import.meta.url), "utf8");
const brand = { exports: {} };
new Function("exports", "module", "require", ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText)(brand.exports, brand, require);
const originalLogo = await fs.readFile(new URL("../next-app/public/tdw-report-logo.png", import.meta.url));

for (const columnCount of [2, 6, 17]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Report ${columnCount}`);
  await brand.exports.addVehicleReportHeader(workbook, sheet, columnCount, "BÁO CÁO THỬ", "Dữ liệu thử");
  assert.equal(sheet.getCell("B1").value, brand.exports.VEHICLE_REPORT_COMPANY);
  assert.equal(sheet.getCell("B2").value, brand.exports.VEHICLE_REPORT_ADDRESS);
  for (let row = 1; row <= 4; row++) assert.equal(sheet.getCell(row, 2).alignment.horizontal, "center");
  assert.deepEqual(Buffer.from(workbook.model.media[0].base64, "base64"), originalLogo);
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(loaded.worksheets[0].getImages().length, 1);
  assert.equal(loaded.worksheets[0].getCell("B3").value, "BÁO CÁO THỬ");
}
console.log("Shared XLSX branding checks passed: source-color logo, centered company/address/title, narrow and wide sheets.");
