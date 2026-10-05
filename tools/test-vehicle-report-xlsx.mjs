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

const vehicle = { vehicle_code: "TDW-TEST", vehicle_name: "Xe thử nghiệm", license_plate: "51A-00000", fuel_norm_l_per_100km: 12 };
const tables = {
  vehicles: [{ id: "00000000-0000-4000-8000-000000000001", ...vehicle, brand: "TDW", model: "Synthetic", production_year: 2026, seat_count: 5, assigned_driver: "Tester", status: "DANG_SU_DUNG", note: "", deleted_at: null, departments: [{ name: "Kiểm thử" }] }],
  vehicle_inspections: [
    { id: "i-2026", vehicle_id: "00000000-0000-4000-8000-000000000001", inspection_date: "2026-09-01", expires_on: "2027-09-01", cost: 100, vehicles: vehicle },
    { id: "i-2025", vehicle_id: "00000000-0000-4000-8000-000000000001", inspection_date: "2025-09-01", expires_on: "2026-09-01", cost: 90, vehicles: vehicle },
  ],
  vehicle_insurances: [
    { id: "a", vehicle_id: "00000000-0000-4000-8000-000000000001", insurance_name: "Hiện hành", starts_on: "2026-08-01", expires_on: "2027-08-01", cost: 200, archived_at: null, vehicles: vehicle },
    { id: "h", vehicle_id: "00000000-0000-4000-8000-000000000001", insurance_name: "Lịch sử", starts_on: "2026-01-01", expires_on: "2026-08-01", cost: 180, archived_at: "2026-08-01T00:00:00Z", vehicles: vehicle },
  ],
  vehicle_repairs: [
    ...Array.from({ length: 502 }, (_, index) => ({ id: `r-${index}`, vehicle_id: "00000000-0000-4000-8000-000000000001", service_date: `2026-${String((index % 12) + 1).padStart(2, "0")}-01`, service_type: "BAO_DUONG", description: `Dòng ${index + 1}`, vat_amount: 1000 + index, vehicles: vehicle })),
    { id: "r-old", vehicle_id: "00000000-0000-4000-8000-000000000001", service_date: "2025-12-31", service_type: "BAO_DUONG", description: "Không thuộc năm", vat_amount: 1, vehicles: vehicle },
  ],
  vehicle_fuel_logs: [{ id: "f", vehicle_id: "00000000-0000-4000-8000-000000000001", payment_date: "2026-09-20", liters: 50, amount: 1000000, vehicles: vehicle }],
};

let allowed = true;
let failTable = "";
const supabase = {
  from(table) {
    let rows = [...(tables[table] ?? [])];
    return {
      select() { return this; },
      is(key, value) { rows = rows.filter((row) => row[key] === value); return this; },
      gte(key, value) { rows = rows.filter((row) => String(row[key]) >= value); return this; },
      lt(key, value) { rows = rows.filter((row) => String(row[key]) < value); return this; },
      eq(key, value) { rows = rows.filter((row) => row[key] === value); return this; },
      order() { return this; },
      async range(start, end) { return table === failTable ? { data: null, error: { message: "synthetic" } } : { data: rows.slice(start, end + 1), error: null }; },
    };
  },
};

const source = await fs.readFile(new URL("../next-app/app/api/vehicles/reports/xlsx/route.ts", import.meta.url), "utf8");
assert.doesNotMatch(source, /callAppsScript|docs\.google\.com|drive\.google\.com/, "Direct XLSX route must not depend on a Google file URL");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const module = { exports: {} };
const mocks = {
  "next/server": { NextResponse: Response },
  "@/lib/auth": { can: () => allowed, requireAccess: async () => ({ access: {}, supabase }) },
  "@/lib/vehicle-report-brand": brandModule.exports,
};
new Function("exports", "module", "require", compiled)(module.exports, module, (id) => mocks[id] || require(id));

const get = (query) => module.exports.GET({ nextUrl: new URL(`http://example.invalid/report?${query}`) });
async function workbookFrom(response) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /spreadsheetml/);
  assert.match(response.headers.get("content-disposition") || "", /^attachment;/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  return workbook;
}

const repairResponse = await get("report_type=vehicle_repairs&year=2026");
assert.equal(repairResponse.headers.get("x-report-row-count"), "502");
const repairBook = await workbookFrom(repairResponse);
assert.equal(repairBook.getWorksheet("Bao cao").rowCount, 508);
assert.equal(repairBook.getWorksheet("Bao cao").getCell("F6").value, "Dòng 1");
assert.equal(repairBook.getWorksheet("Bao cao").getCell("B1").value, "Công ty Cổ Phần B.O.O Nước Thủ Đức");
assert.equal(repairBook.getWorksheet("Bao cao").getCell("B2").value, "479 Xa lộ Hà Nội, P. Linh Xuân, TP.Hồ Chí Minh, Việt Nam");
assert.equal(repairBook.getWorksheet("Bao cao").getImages().length, 1);
assert.equal(repairBook.getWorksheet("Bao cao").getCell("H508").value.result, 502 * 1000 + (501 * 502) / 2);

const olderRepairBook = await workbookFrom(await get("report_type=vehicle_repairs&year=2025&vehicle_id=00000000-0000-4000-8000-000000000001"));
assert.equal(olderRepairBook.getWorksheet("Bao cao").getCell("H7").value.result, 1, "Total must use only the filtered rows");

const insuranceResponse = await get("report_type=vehicle_insurance&year=2026");
assert.equal(insuranceResponse.headers.get("x-report-row-count"), "2", "Current and archived insurance rows must both be exported");
const insuranceBook = await workbookFrom(insuranceResponse);
assert.deepEqual([insuranceBook.getWorksheet("Bao cao").getCell("L6").value, insuranceBook.getWorksheet("Bao cao").getCell("L7").value], ["Hiện hành", "Lịch sử"]);

for (const reportType of ["vehicles", "vehicle_inspections", "vehicle_fuel"]) {
  const response = await get(`report_type=${reportType}&year=2026`);
  assert.equal(response.headers.get("x-report-row-count"), "1", `${reportType} should export its filtered row`);
  await workbookFrom(response);
}

const empty = await workbookFrom(await get("report_type=vehicle_repairs&year=2024"));
assert.match(String(empty.getWorksheet("Bao cao").getCell("A6").value), /Không có dữ liệu/);
assert.equal(empty.getWorksheet("Bao cao").getCell("H7").value, 0);
assert.equal((await get("report_type=vehicle_repairs&month=8")).status, 400);
assert.equal((await get("report_type=invalid&year=2026")).status, 400);
allowed = false;
assert.equal((await get("report_type=vehicle_repairs&year=2026")).status, 403);
allowed = true;
failTable = "vehicle_repairs";
assert.equal((await get("report_type=vehicle_repairs&year=2026")).status, 500);

console.log("Vehicle XLSX checks passed: direct attachment without Google, all report types, year filters, 502-row pagination, insurance history, empty reports, permission and database errors.");
