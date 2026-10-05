import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../next-app/package.json", import.meta.url));
const ts = require("typescript");
const ExcelJS = require("exceljs");
process.chdir(fileURLToPath(new URL("../next-app/", import.meta.url)));
const brandSource = await fs.readFile(new URL("../next-app/lib/vehicle-report-brand.ts", import.meta.url), "utf8");
const brandModule = { exports: {} };
new Function("exports", "module", "require", ts.transpileModule(brandSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(brandModule.exports, brandModule, require);
const vehicleId = "00000000-0000-4000-8000-000000000001";
const secondVehicleId = "00000000-0000-4000-8000-000000000002";
const tables = {
  vehicles: [
    { id: vehicleId, vehicle_code: "TDW-01", vehicle_name: "Xe một", license_plate: "51A-00001", deleted_at: null },
    { id: secondVehicleId, vehicle_code: "TDW-02", vehicle_name: "Xe hai", license_plate: "51A-00002", deleted_at: null },
  ],
  vehicle_inspections: [
    { id: "i1", vehicle_id: vehicleId, inspection_date: "2025-01-01", cost: 100 },
    { id: "i2", vehicle_id: vehicleId, inspection_date: "2026-01-01", cost: 120 },
  ],
  vehicle_insurances: [
    { id: "n1", vehicle_id: vehicleId, starts_on: "2025-02-01", cost: 200 },
    { id: "n2", vehicle_id: vehicleId, starts_on: "2026-02-01", cost: 220 },
  ],
  vehicle_repairs: [
    { id: "r1", vehicle_id: vehicleId, service_date: "2025-03-01", vat_amount: 300 },
    { id: "r2", vehicle_id: vehicleId, service_date: "2026-03-01", vat_amount: 330 },
  ],
  vehicle_fuel_logs: [
    { id: "f1", vehicle_id: vehicleId, payment_date: "2025-04-01", amount: 400 },
    { id: "f2", vehicle_id: vehicleId, payment_date: "2026-04-01", amount: 440 },
  ],
  vehicle_toll_transactions: [
    { id: "t1", vehicle_id: vehicleId, license_plate: "51A00001", transaction_at: "2025-05-01T00:00:00+07:00", amount_after_tax: 50 },
    { id: "t2", vehicle_id: null, license_plate: "51A00001", transaction_at: "2026-05-01T00:00:00+07:00", amount_after_tax: 60 },
  ],
  vehicle_toll_quarterly_passes: [
    { id: "q1", vehicle_id: vehicleId, license_plate: "51A00001", starts_on: "2025-06-01", amount: 25 },
    { id: "q2", vehicle_id: vehicleId, license_plate: "51A00001", starts_on: "2026-06-01", amount: 30 },
  ],
};

let allowed = true;
let failTable = "";
const supabase = {
  from(table) {
    let rows = [...(tables[table] ?? [])];
    const builder = {
      select() { return this; },
      is(key, value) { rows = rows.filter((row) => row[key] === value); return this; },
      gte(key, value) { rows = rows.filter((row) => String(row[key]) >= value); return this; },
      lt(key, value) { rows = rows.filter((row) => String(row[key]) < value); return this; },
      eq(key, value) { rows = rows.filter((row) => row[key] === value); return this; },
      order() { return this; },
      async range(start, end) { return table === failTable ? { data: null, error: { message: "synthetic" } } : { data: rows.slice(start, end + 1), error: null }; },
      then(resolve, reject) { return Promise.resolve(table === failTable ? { data: null, error: { message: "synthetic" } } : { data: rows, error: null }).then(resolve, reject); },
    };
    return builder;
  },
};

const source = await fs.readFile(new URL("../next-app/app/api/vehicles/reports/comparison/route.ts", import.meta.url), "utf8");
assert.doesNotMatch(source, /callAppsScript|docs\.google\.com|drive\.google\.com/);
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const module = { exports: {} };
const mocks = { "next/server": { NextResponse: Response }, "@/lib/auth": { can: () => allowed, requireAccess: async () => ({ access: {}, supabase }) }, "@/lib/vehicle-report-brand": brandModule.exports };
new Function("exports", "module", "require", compiled)(module.exports, module, (id) => mocks[id] || require(id));
const get = (query) => module.exports.GET({ nextUrl: new URL(`http://example.invalid/report?${query}`) });

const response = await get("year_a=2025&year_b=2026");
assert.equal(response.status, 200);
assert.equal(response.headers.get("x-report-row-count"), "2");
assert.match(response.headers.get("content-disposition") || "", /2025-2026\.xlsx/);
const reportBuffer = Buffer.from(await response.arrayBuffer());
if (process.env.TDW_REPORT_PREVIEW_PATH) await fs.writeFile(process.env.TDW_REPORT_PREVIEW_PATH, reportBuffer);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(reportBuffer);
const summary = workbook.getWorksheet("So sanh theo xe");
assert.equal(summary.getCell("B1").value, "Công ty Cổ Phần B.O.O Nước Thủ Đức");
assert.equal(summary.getCell("B2").value, "479 Xa lộ Hà Nội, P. Linh Xuân, TP.Hồ Chí Minh, Việt Nam");
assert.equal(summary.getImages().length, 1);
assert.equal(summary.getCell("I7").value, 1075);
assert.equal(summary.getCell("O7").value, 1200);
assert.equal(summary.getCell("P7").value, 125);
assert.equal(summary.getCell("Q7").value, 125 / 1075);
assert.equal(summary.getCell("I8").value, 0);
assert.equal(workbook.getWorksheet("Chi tiet theo muc").rowCount, 26);
assert.equal(workbook.getWorksheet("Chi tiet theo muc").getImages().length, 1);
assert.equal(summary.getCell("I9").value.result, 1075);
assert.equal(summary.getCell("O9").value.result, 1200);

const selectedResponse = await get("year_a=2025&year_b=2026&categories_selected=1&category=repair&category=fuel");
assert.equal(selectedResponse.status, 200);
const selectedWorkbook = new ExcelJS.Workbook();
await selectedWorkbook.xlsx.load(Buffer.from(await selectedResponse.arrayBuffer()));
const selectedSummary = selectedWorkbook.getWorksheet("So sanh theo xe");
assert.deepEqual([selectedSummary.getCell("D6").value, selectedSummary.getCell("E6").value, selectedSummary.getCell("F6").value], ["Bảo dưỡng / sửa chữa", "Nhiên liệu", "Tổng"]);
assert.equal(selectedSummary.getCell("F7").value, 700);
assert.equal(selectedSummary.getCell("I7").value, 770);
assert.equal(selectedSummary.getCell("J7").value, 70);
assert.equal(selectedSummary.getCell("K7").value, 0.1);
assert.equal(selectedSummary.columnCount, 11);
const selectedDetail = selectedWorkbook.getWorksheet("Chi tiet theo muc");
assert.equal(selectedDetail.rowCount, 14);
assert.deepEqual([selectedDetail.getCell("E7").value, selectedDetail.getCell("E8").value], ["Bảo dưỡng / sửa chữa", "Nhiên liệu"]);

const tollResponse = await get("year_a=2025&year_b=2026&categories_selected=1&category=toll");
assert.equal(tollResponse.status, 200);
const tollWorkbook = new ExcelJS.Workbook();
await tollWorkbook.xlsx.load(Buffer.from(await tollResponse.arrayBuffer()));
assert.equal(tollWorkbook.getWorksheet("So sanh theo xe").getCell("E7").value, 75);
assert.equal(tollWorkbook.getWorksheet("So sanh theo xe").getCell("G7").value, 90);
assert.equal(tollWorkbook.getWorksheet("Chi tiet theo muc").rowCount, 10);
assert.equal((await get("year_a=2025&year_b=2026&categories_selected=1")).status, 400);
assert.equal((await get("year_a=2025&year_b=2026&category=unknown")).status, 400);

const filtered = await get(`year_a=2025&year_b=2026&vehicle_id=${vehicleId}`);
assert.equal(filtered.headers.get("x-report-row-count"), "1");
assert.equal((await get("year_a=2026&year_b=2026")).status, 400);
allowed = false;
assert.equal((await get("year_a=2025&year_b=2026")).status, 403);
allowed = true;
failTable = "vehicle_repairs";
assert.equal((await get("year_a=2025&year_b=2026")).status, 500);
assert.equal((await get("year_a=2025&year_b=2026&category=fuel")).status, 200);

console.log("Vehicle cost comparison checks passed: two-year per-vehicle totals, selectable category columns/details, VETC plate matching, empty/invalid selections, vehicle filter, direct XLSX, permission and database errors.");
