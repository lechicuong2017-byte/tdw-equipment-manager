import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [migration, actions, page, forms, historyTabs] = await Promise.all([
  readFile(new URL("supabase/migrations/202609280001_vehicle_inspection_renewal_history.sql", root), "utf8"),
  readFile(new URL("next-app/app/(protected)/vehicles/actions.ts", root), "utf8"),
  readFile(new URL("next-app/app/(protected)/vehicles/page.tsx", root), "utf8"),
  readFile(new URL("next-app/components/vehicle-forms.tsx", root), "utf8"),
  readFile(new URL("next-app/components/vehicle-history-tabs.tsx", root), "utf8"),
]);

assert.match(migration, /vehicle_inspections_one_active_per_vehicle/);
assert.match(migration, /create or replace function public\.renew_vehicle_inspection/);
assert.match(migration, /archived_at = renewal_time/);
assert.match(actions, /rpc\("renew_vehicle_inspection"/);
assert.match(forms, /name="renew_from_id"/);
assert.match(page, /\.is\("archived_at", null\)/);
assert.match(page, /\.not\("archived_at", "is", null\)/);
assert.match(page, /Lịch sử đăng kiểm/);
assert.match(page, /renewFromId=\{item\.id\}/);
assert.match(page, /insuranceView === "history"/);
assert.match(page, /Lịch sử bảo hiểm/);
assert.match(page, /\.from\("vehicle_insurances"\).*\.not\("archived_at", "is", null\)/s);
assert.match(historyTabs, /router\.prefetch/);
assert.match(historyTabs, /inspections: "inspectionView"/);
assert.match(historyTabs, /insurance: "insuranceView"/);

const rows = [
  { id: "old", vehicle: "ford", inspectionDate: "2026-03-26", archivedAt: "2026-09-25" },
  { id: "current", vehicle: "ford", inspectionDate: "2026-09-25", archivedAt: null },
  { id: "honda", vehicle: "honda", inspectionDate: "2026-08-26", archivedAt: null },
];
assert.deepEqual(rows.filter((row) => row.archivedAt === null).map((row) => row.id), ["current", "honda"]);
assert.deepEqual(rows.filter((row) => row.archivedAt !== null).map((row) => row.id), ["old"]);

console.log("vehicle inspection renewal history checks passed");
