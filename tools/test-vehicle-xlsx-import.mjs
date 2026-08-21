import assert from "node:assert/strict";
import ExcelJS from "../next-app/node_modules/exceljs/excel.js";

const files = process.argv.slice(2);
assert.equal(files.length, 2, "Pass the fuel and repair workbooks");

function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/Đ/g, "D").replace(/đ/g, "d").replace(/\s+/g, " ").trim().toUpperCase();
}

const summary = [];
for (const file of files) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  for (const sheet of workbook.worksheets) {
    const sheetName = normalize(sheet.name);
    if (!sheetName.includes("NHIEN LIEU XE") && !sheetName.includes("BAO DUONG XE")) continue;
    let headerRow = null;
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 40); rowNumber += 1) {
      const values = sheet.getRow(rowNumber).values;
      const text = normalize(Array.isArray(values) ? values.join(" ") : "");
      if (text.includes("TEN XE") && text.includes("BIEN SO")) {
        headerRow = rowNumber;
        break;
      }
    }
    assert.ok(headerRow, `Header not found in ${sheet.name}`);
    let dataRows = 0;
    for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const text = normalize(sheet.getRow(rowNumber).values.join(" "));
      if (/FORD RANGER|TOYOTA FORTUNER|HONDA CRV/.test(text)) dataRows += 1;
    }
    assert.ok(dataRows > 0, `No vehicle rows found in ${sheet.name}`);
    summary.push({ sheet: sheet.name, headerRow, dataRows });
  }
}

assert.ok(summary.some((item) => normalize(item.sheet).includes("NHIEN LIEU XE")), "Fuel sheet not detected");
assert.ok(summary.some((item) => normalize(item.sheet).includes("BAO DUONG XE")), "Repair sheet not detected");
process.stdout.write(`${JSON.stringify(summary, null, 2)}\nVehicle XLSX template checks passed.\n`);
