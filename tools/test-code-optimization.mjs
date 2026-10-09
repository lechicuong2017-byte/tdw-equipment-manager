import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(new URL("../next-app/package.json", import.meta.url));
const ts = require("typescript");
async function load(file) {
  const source = await readFile(new URL(`../next-app/${file}.ts`, import.meta.url), "utf8");
  const module = { exports: {} };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function("exports", "module", "require", compiled)(module.exports, module, require);
  return module.exports;
}
const { groupBy } = await load("lib/collections");
const { vietnamToday, vietnamMonth } = await load("lib/format");
const { summarizeAnswers, answerText } = await load("lib/surveys");

// Deterministic fixtures only: no real inventory, responses, or credentials.
const input = Object.freeze([
  Object.freeze({ id: "one", group: "a" }),
  Object.freeze({ id: "two", group: "b" }),
  Object.freeze({ id: "three", group: "a" }),
]);
const groups = groupBy(input, (row) => row.group);
assert.deepEqual([...groups.keys()], ["a", "b"]);
assert.deepEqual(groups.get("a").map((row) => row.id), ["one", "three"]);
assert.equal(groups.get("a")[0], input[0]);
assert.equal(groupBy([], (row) => row.id).size, 0);
groups.get("a").pop();
assert.equal(input.length, 3, "Grouping must not mutate the source array");
const fresh = groupBy(input, (row) => row.group);
assert.equal(fresh.get("a").length, 2, "Results must not be shared between requests");
assert.equal(vietnamToday(new Date("2026-12-31T16:59:59Z")), "2026-12-31");
assert.equal(vietnamToday(new Date("2026-12-31T17:00:00Z")), "2027-01-01");
assert.equal(vietnamMonth(new Date("2026-09-30T17:00:00Z")), "2026-10");
assert.equal(vietnamToday(new Date("2024-02-28T17:00:00Z")), "2024-02-29");

for (const type of ["short", "long", "single", "multiple"]) {
  const question = { id: "synthetic", type, options: type === "single" || type === "multiple" ? ["A", "B", "C"] : [] };
  const values = [undefined, "", "  ", [], ["A"], ["A", "B"], ["A", "A"], "B", "A", "C", "other", 0];
  const rows = Array.from({ length: 120 }, (_, index) => ({ answers: { synthetic: values[index % values.length] } }));
  const legacyAnswered = rows.filter((row) => !!answerText(row.answers.synthetic).trim());
  const result = summarizeAnswers(question, rows);
  assert.equal(result.answered, legacyAnswered.length);
  for (const option of question.options) {
    const legacyCount = legacyAnswered.filter((row) => Array.isArray(row.answers.synthetic)
      ? row.answers.synthetic.includes(option) : String(row.answers.synthetic) === option).length;
    assert.equal(result.counts.get(option), legacyCount, `${type} counts must match the old report`);
  }
}

const maintenance = await readFile(new URL("../next-app/app/(protected)/maintenance/actions.ts", import.meta.url), "utf8");
const createLog = maintenance.slice(maintenance.indexOf("export async function createMaintenanceLog"), maintenance.indexOf("export async function updateMaintenanceLog"));
assert.match(createLog, /if \(createdLog && mediaFiles\.files\.length\)\s*\{\s*const assetCode = await assetCodeForMedia/);
const vehicles = await readFile(new URL("../next-app/app/(protected)/vehicles/page.tsx", import.meta.url), "utf8");
assert.match(vehicles, /documentRecordType && documentRecordIds\.length/);
assert.match(vehicles, /\.in\("record_id", documentRecordIds\)/);
assert.doesNotMatch(vehicles, /\.limit\(1500\)/);
const reportPage = await readFile(new URL("../next-app/app/(protected)/reports/[reportType]/page.tsx", import.meta.url), "utf8");
assert.match(reportPage, /\[\{ data: assetData \}, \{ data: maintenanceTypeData \}, \{ data: softwareData \}\] = await Promise\.all/);
assert.doesNotMatch(reportPage, /\.eq\("is_active", true\)/);

// Validate linear key lookup count instead of asserting unstable timing ratios.
let calls = 0;
const large = Array.from({ length: 10000 }, (_, id) => ({ id, group: "one" }));
assert.equal(groupBy(large, (row) => { calls += 1; return row.group; }).get("one").length, 10000);
assert.equal(calls, 10000);
console.log("Code optimization checks passed: grouping isolation/order, VN boundaries, unchanged survey totals, scoped document loading and no-image query guard.");
