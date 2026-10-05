import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../next-app/package.json", import.meta.url));
const ts = require("typescript");
const ExcelJS = require("exceljs");
process.chdir(fileURLToPath(new URL("../next-app/", import.meta.url)));

async function load(relative, mocks = {}) {
  const source = await fs.readFile(new URL(`../next-app/${relative}`, import.meta.url), "utf8");
  const module = { exports: {} };
  new Function("exports", "module", "require", ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText)(module.exports, module, (id) => mocks[id] ?? require(id));
  return module.exports;
}
const brand = await load("lib/vehicle-report-brand.ts");
const requestId = "00000000-0000-4000-8000-000000000001";
const records = {
  supply_requests: [{ id: requestId, request_no: "TEST-01", category: "OFFICE_SUPPLY", period_type: "YEAR", period_year: 2026, requested_on: "2026-10-01" }],
  supply_request_lines: [{ request_id: requestId, item_name: "Giấy thử", unit: "ram", proposed_quantity: 1, stock_quantity: 0, ordered_quantity: 1, approved_unit_price: 100, amount: 100, sort_order: 1 }],
  vehicle_toll_transactions: [{ id: "t1", license_plate: "51A-00001", toll_station: "Trạm thử", transaction_at: "2026-08-01T01:00:00+07:00", invoice_number: "001", transaction_code: "A", amount_before_tax: 100, tax_amount: 8, amount_after_tax: 108 }],
  vehicle_toll_quarterly_passes: [{ id: "q1", license_plate: "51A-00001", vehicle_type: "Xe con", vehicle_color: "Trắng", toll_station: "Trạm thử", starts_on: "2026-08-01", expires_on: "2026-10-31", amount: 300, source_sheet: "Q3" }],
};
const supabase = { from(table) {
  let rows = [...(records[table] ?? [])];
  const query = {
    select() { return this; }, order() { return this; },
    eq(key, value) { rows = rows.filter((row) => row[key] === value); return this; },
    gte(key, value) { rows = rows.filter((row) => String(row[key]) >= value); return this; },
    lt(key, value) { rows = rows.filter((row) => String(row[key]) < value); return this; },
    in(key, values) { rows = rows.filter((row) => values.includes(row[key])); return this; },
    async range(start, end) { return { data: rows.slice(start, end + 1), error: null }; },
    then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
  };
  return query;
} };
const mocks = {
  "next/server": { NextResponse: Response },
  "@/lib/auth": { can: () => true, requireAccess: async () => ({ access: {}, supabase }) },
  "@/lib/vehicle-report-brand": brand,
};
async function getWorkbook(routePath, query) {
  const route = await load(routePath, mocks);
  const response = await route.GET({ nextUrl: new URL(`http://example.invalid/?${query}`) });
  assert.equal(response.status, 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  return workbook;
}

const supplies = await getWorkbook("app/api/supplies/reports/route.ts", "year=2026");
const supplySheet = supplies.worksheets[0];
assert.equal(supplySheet.getCell("B1").alignment.horizontal, "center");
assert.equal(supplySheet.getCell("F6").value, "Giấy thử");
assert.equal(supplySheet.getImages().length, 1);

const tolls = await getWorkbook("app/api/vehicles/tolls/report/route.ts", "year=2026");
assert.equal(tolls.worksheets.length, 3);
for (const sheet of tolls.worksheets) {
  assert.equal(sheet.getCell("B1").alignment.horizontal, "center");
  assert.equal(sheet.getImages().length, 1);
  assert.match(String(sheet.autoFilter), /^A6:/);
}
assert.equal(tolls.getWorksheet("Ve le chi tiet").getCell("H7").value, 108);
assert.equal(tolls.getWorksheet("Ve quy").getCell("G7").value, 300);
assert.equal(tolls.getWorksheet("Tong hop").getCell("B9").value, 408);
console.log("Supply and VETC XLSX checks passed: branded sheets, data rows, filters, and totals.");
