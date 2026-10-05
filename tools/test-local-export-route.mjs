import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../next-app/package.json", import.meta.url));
const ts = require("typescript");
const ExcelJS = require("exceljs");
process.chdir(fileURLToPath(new URL("../next-app/", import.meta.url)));
async function load(path, mocks = {}) {
  const source = await fs.readFile(new URL(`../next-app/${path}`, import.meta.url), "utf8");
  const module = { exports: {} };
  new Function("exports", "module", "require", ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText)(module.exports, module, (id) => id === "server-only" ? {} : mocks[id] ?? require(id));
  return module.exports;
}
const brand = await load("lib/vehicle-report-brand.ts");
const render = await load("lib/local-report-file.ts", { "./vehicle-report-brand": brand });
const asset = { asset_code: "TEST-001", asset_name: "Thiết bị thử", asset_group: "TEST", asset_group_label: "Nhóm thử", asset_type: "Máy", department_legacy_name: "Kiểm thử" };
const tables = {
  assets: [{ ...asset, id: "asset-1", asset_kind: "DEVICE", status: "CON_SU_DUNG", deleted_at: null, purchase_year: 2026, quantity: 1, total_price: 100 }],
  asset_component_installations: [],
  asset_liquidations: [{ assets: asset, liquidation_date: "2026-10-01", recovery_value: 50, voided_at: null }],
  maintenance_plans: [],
  maintenance_logs: [
    { assets: asset, maintenance_date: "2026-10-01", cost: 200, description: "Dòng thuộc năm", action_type: "Bảo trì" },
    { assets: asset, maintenance_date: "2025-10-01", cost: 500, description: "Dòng ngoài năm", action_type: "Bảo trì" },
  ],
  inventory_movements: [{ assets: asset, movement_date: "2026-10-01", from_user_name: "A", to_user_name: "B" }],
  software_licenses: [{ assets: asset, software_name: "Phần mềm thử", expiry_date: "2026-10-01", status: "ACTIVE" }],
};
let claims = { sub: "synthetic-user", aal: "aal2" };
let allowed = true;
let fail = false;
const supabase = {
  auth: { getClaims: async () => ({ data: { claims } }) },
  rpc: async () => ({ data: { roles: ["admin"], email: "test@example.invalid" } }),
  from(table) {
    let data = [...(tables[table] ?? [])];
    return {
      select() { return this; }, order() { return this; }, limit() { return this; },
      is(key, value) { data = data.filter((row) => row[key] === value); return this; },
      neq(key, value) { data = data.filter((row) => row[key] !== value); return this; },
      then(resolve, reject) { return Promise.resolve({ data, error: fail ? { message: "synthetic" } : null }).then(resolve, reject); },
    };
  },
};
const source = await fs.readFile(new URL("../next-app/app/api/reports/export/route.ts", import.meta.url), "utf8");
assert.doesNotMatch(source, /callAppsScript|docs\.google|drive\.google/);
const route = await load("app/api/reports/export/route.ts", {
  "next/server": { NextResponse: Response },
  "@/lib/auth": { can: () => allowed },
  "@/lib/format": { labelStatus: (status) => status },
  "@/lib/supabase/server": { createClient: async () => supabase },
  "@/lib/local-report-file": render,
});
const request = (report_type, filters = { year: 2026 }) => new Request("http://example.invalid/api/reports/export", {
  method: "POST",
  body: JSON.stringify({ report_type, output_format: "xlsx", idempotency_token: "00000000-0000-4000-8000-000000000001", filters }),
});
for (const type of ["assets", "liquidations", "maintenance", "movement", "software"]) {
  const response = await route.POST(request(type));
  assert.equal(response.status, 200, type);
  assert.equal(response.headers.get("X-Report-Row-Count"), "1", type);
  assert.match(response.headers.get("Content-Disposition"), /attachment/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell("B1").alignment.horizontal, "center");
  assert.equal(sheet.getImages().length, 1);
  assert.equal(sheet.getCell("A5").value, "STT");
  if (type === "maintenance") assert.equal(sheet.getCell("J7").value, 200, "total follows year filter");
}
assert.equal((await route.POST(request("maintenance", { month: 10 }))).status, 400);
allowed = false;
assert.equal((await route.POST(request("assets"))).status, 403);
allowed = true;
claims.aal = "aal1";
assert.equal((await route.POST(request("assets"))).status, 403);
claims = null;
assert.equal((await route.POST(request("assets"))).status, 401);
claims = { sub: "synthetic-user", aal: "aal2" };
fail = true;
assert.equal((await route.POST(request("assets"))).status, 500);
console.log("Native equipment export passed: five report categories, centered brand, correct headers, year totals, auth, MFA and failures.");
