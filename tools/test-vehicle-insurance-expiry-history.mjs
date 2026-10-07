import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { insuranceViewFilter, insuranceHistoryLabel, canRenewInsurance } from "../next-app/lib/vehicle-insurance-history.ts";

const today = "2026-10-07";
const rows = [
  { id: "old-expired", archived_at: null, expires_on: "2026-08-04", reminder_days: 10 },
  { id: "expired-yesterday", archived_at: null, expires_on: "2026-10-06", reminder_days: 10 },
  { id: "expires-today", archived_at: null, expires_on: today, reminder_days: 10 },
  { id: "renewed-current", archived_at: null, expires_on: "2027-08-06", reminder_days: 10 },
  { id: "already-renewed", archived_at: "2026-10-01T01:00:00Z", expires_on: "2026-10-22", reminder_days: 10 },
];
const snapshot = JSON.stringify(rows);

// Evaluate the exact PostgREST expressions returned by the production helper.
function applyViewFilter(view, day) {
  const filter = insuranceViewFilter(view, day);
  assert.equal(filter, view === "history"
    ? `archived_at.not.is.null,expires_on.lt.${day}`
    : `and(archived_at.is.null,expires_on.gte.${day})`);
  return rows.filter((row) => view === "history"
    ? row.archived_at !== null || row.expires_on < day
    : row.archived_at === null && row.expires_on >= day);
}
const current = applyViewFilter("current", today);
const history = applyViewFilter("history", today);
assert.deepEqual(current.map((row) => row.id), ["expires-today", "renewed-current"]);
assert.deepEqual(history.map((row) => row.id), ["old-expired", "expired-yesterday", "already-renewed"]);
assert.equal(new Set([...current, ...history].map((row) => row.id)).size, rows.length);
assert.equal(current.filter((row) => history.includes(row)).length, 0);
assert.equal(applyViewFilter("history", "2026-10-08").some((row) => row.id === "expires-today"), true);
assert.equal(insuranceHistoryLabel(rows[0]), "Đã hết hạn");
assert.equal(insuranceHistoryLabel(rows[4]), "Đã gia hạn");
assert.equal(canRenewInsurance(rows[0], today), true);
assert.equal(canRenewInsurance(rows[1], today), true);
assert.equal(canRenewInsurance(rows[2], today), true);
assert.equal(canRenewInsurance(rows[3], today), false);
assert.equal(canRenewInsurance(rows[4], "2026-12-01"), false);
assert.equal(JSON.stringify(rows), snapshot, "classification must not change stored dates, archive or renewal data");

const page = await readFile(new URL("../next-app/app/(protected)/vehicles/page.tsx", import.meta.url), "utf8");
assert.match(page, /\.or\(insuranceViewFilter\("current", today\)\)/); // Overview uses the same rules.
assert.match(page, /query = query\.or\(insuranceViewFilter\(insuranceView, today\)\)/); // Before count/pagination.
assert.match(page, /const canRenewNow = canRenewInsurance\(item, today\)/);
assert.match(page, /label: insuranceHistoryLabel\(item\)/);
assert.match(page, /canManage && \(insuranceView === "current" \|\| canRenewNow\)/);

console.log("Insurance expiry history checks passed: current/history partition, expiry-day boundary, next-day rollover, overview, history renewal, renewed-record guard, non-mutating classification.");
