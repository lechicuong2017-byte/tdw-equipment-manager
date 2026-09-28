import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [migration, immutableImportMigration, constraintMigration, section, page, tabs] = await Promise.all([
  readFile(new URL("supabase/migrations/202609280002_vehicle_toll_quarterly_history.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/202609280003_vehicle_toll_quarterly_immutable_import.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/202609280004_drop_toll_source_position_constraint.sql", root), "utf8"),
  readFile(new URL("next-app/components/vehicle-toll-section.tsx", root), "utf8"),
  readFile(new URL("next-app/app/(protected)/vehicles/page.tsx", root), "utf8"),
  readFile(new URL("next-app/components/vehicle-history-tabs.tsx", root), "utf8"),
]);

assert.match(migration, /create or replace view public\.vehicle_toll_quarterly_records/);
assert.match(migration, /row_number\(\) over/);
assert.match(migration, /security_invoker = true/);
assert.match(immutableImportMigration, /drop constraint if exists vehicle_toll_quarterly_passes_source_file_source_sheet_source_row_key/);
assert.match(immutableImportMigration, /on conflict \(fingerprint\) do nothing/);
assert.doesNotMatch(immutableImportMigration, /on conflict \(source_file, source_sheet, source_row\)/);
assert.match(constraintMigration, /pg_catalog\.pg_constraint/);
assert.match(constraintMigration, /array\['source_file', 'source_sheet', 'source_row'\]/);
assert.match(constraintMigration, /VETC_SOURCE_POSITION_CONSTRAINT_STILL_EXISTS/);
assert.match(section, /\.from\("vehicle_toll_quarterly_records"\)/);
assert.match(section, /\.eq\("is_current", view === "current"\)/);
assert.match(section, /Lịch sử vé quý/);
assert.match(section, /label: "Đã gia hạn"/);
assert.match(page, /view=\{params\.tollView\}/);
assert.match(tabs, /tolls: "tollView"/);

const passesBeforeRenewal = [
  { id: "old", vehicle: "ford", station: "xa-lo-ha-noi", startsOn: "2026-05-01" },
  { id: "other-station", vehicle: "ford", station: "an-suong", startsOn: "2026-05-01" },
];
const renewedPass = { id: "renewed", vehicle: "ford", station: "xa-lo-ha-noi", startsOn: "2026-08-01" };

function classify(rows) {
  const latest = new Map();
  for (const pass of rows.toSorted((a, b) => b.startsOn.localeCompare(a.startsOn))) {
    const key = `${pass.vehicle}|${pass.station}`;
    if (!latest.has(key)) latest.set(key, pass.id);
  }
  return {
    current: rows.filter((pass) => latest.get(`${pass.vehicle}|${pass.station}`) === pass.id).map((pass) => pass.id).sort(),
    history: rows.filter((pass) => latest.get(`${pass.vehicle}|${pass.station}`) !== pass.id).map((pass) => pass.id).sort(),
  };
}

assert.deepEqual(classify(passesBeforeRenewal), { current: ["old", "other-station"], history: [] });
assert.deepEqual(classify([...passesBeforeRenewal, renewedPass]), {
  current: ["other-station", "renewed"],
  history: ["old"],
});

const olderImportedLater = { id: "older-imported-later", vehicle: "ford", station: "xa-lo-ha-noi", startsOn: "2026-02-01" };
assert.deepEqual(classify([...passesBeforeRenewal, renewedPass, olderImportedLater]), {
  current: ["other-station", "renewed"],
  history: ["old", "older-imported-later"],
});

console.log("vehicle toll quarterly history checks passed");
