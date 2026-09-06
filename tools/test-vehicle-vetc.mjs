import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ExcelJS from "../next-app/node_modules/exceljs/excel.js";
import { markTollPreviewDuplicates } from "../next-app/lib/toll-preview-selection.ts";
import { parsePdfTransaction, parseQuarterlyWorkbook, monthlyFingerprint, vehicleMap, vehicleMatch } from "../next-app/lib/vehicle-tolls.ts";

const invoice = "Số: 12345678 Cước đường bộ xe 51A12345T đi qua trạm Trạm mẫu thời gian GD 00:01:02 ngày 01/01/2026 mã GD -123456 Tổng tiền: 12.963 1.037 14.000";
const row = parsePdfTransaction(invoice, 1);
assert.equal(row.amount_after_tax, 14000);
assert.equal(row.transaction_at, "2026-01-01T00:01:02+07:00");
assert.equal(parsePdfTransaction(invoice.replace("01/01/2026", "31/02/2026"), 1), null);
assert.equal(parsePdfTransaction(invoice.replace("14.000", "99.000"), 1), null);
assert.equal(parsePdfTransaction("Scanned page without text", 1), null);
assert.equal(monthlyFingerprint(row), monthlyFingerprint({ ...row, transaction_at: "2025-12-31T17:01:02Z" }));
const map = vehicleMap([{ id: "vehicle-1", vehicle_name: "Xe mẫu", license_plate: "51A-12345" }]);
assert.equal(vehicleMatch("51A12345T", map)?.id, "vehicle-1");
assert.equal(vehicleMatch("51B12345T", map), undefined);
const duplicatePreview = markTollPreviewDuplicates([{ fingerprint: "a" }, { fingerprint: "b" }, { fingerprint: "a" }]);
assert.deepEqual(duplicatePreview.map((item) => item.duplicate_in_file), [false, false, true]);
assert.equal(duplicatePreview.filter((item) => !item.duplicate_in_file).length, 2);

for (const offset of [0, 1, 3]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Quy mau");
  sheet.getRow(3).values = [...Array(offset).fill(null), "Stt", "Loại xe", "Màu xe", "Biển kiểm soát", "Đợt gia hạn", "Trạm đăng ký", "Chi phí (có VAT)"];
  sheet.getRow(4).values = [...Array(offset).fill(null), 1, "Xe mẫu", "Bạc", "51A12345T", "03/08/2026 - 31/10/2026", "Trạm mẫu", 2187000];
  sheet.getRow(5).values = [...Array(offset).fill(null), "Tổng cộng", "", "", "", "", "", { formula: "1+1", result: 2 }];
  const passes = parseQuarterlyWorkbook(workbook);
  assert.equal(passes.length, 1);
  assert.equal(passes[0].amount, 2187000);
  assert.equal(passes[0].starts_on, "2026-08-03");
  sheet.getRow(4).getCell(offset + 5).value = "31/02/2026 - 31/10/2026";
  assert.throws(() => parseQuarterlyWorkbook(workbook), /hiệu lực/);
}

// Optional local sample files are read only; no source data is copied to the repo.
if (process.argv[2] && process.argv[3]) {
  const { getDocument } = await import("../next-app/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({ data: new Uint8Array(await fs.readFile(process.argv[2])), isEvalSupported: false, useWorkerFetch: false }).promise;
  try {
    const rows = [];
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i);
      const text = (await page.getTextContent()).items.map((item) => "str" in item ? item.str + (item.hasEOL ? " " : "") : "").join("");
      const parsed = parsePdfTransaction(text, i);
      assert.ok(parsed, `Unread page ${i}`);
      rows.push(parsed);
    }
    assert.equal(rows.length, 22);
    assert.equal(rows.reduce((sum, item) => sum + item.amount_after_tax, 0), 331272);
    assert.equal(new Set(rows.map((item) => item.toll_station)).size, 4);
  } finally { await document.destroy(); }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(process.argv[3]);
  const passes = parseQuarterlyWorkbook(workbook);
  assert.equal(passes.length, 24);
  assert.equal(passes.reduce((sum, item) => sum + item.amount, 0), 52488000);
  const uniquePasses = markTollPreviewDuplicates(passes).filter((item) => !item.duplicate_in_file);
  assert.equal(uniquePasses.length, 21);
  assert.equal(uniquePasses.reduce((sum, item) => sum + item.amount, 0), 45927000);
}
console.log("VETC parser checks passed: dates, VAT, shifted columns, plate matching, duplicate identity and optional samples.");
