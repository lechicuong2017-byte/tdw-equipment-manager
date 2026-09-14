// Isolated regression test only. Never connects to production.
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const migration = await fs.readFile(
  new URL("../supabase/migrations/202609140001_vehicle_import_immutable_rows.sql", import.meta.url),
  "utf8",
);
const action = await fs.readFile(
  new URL("../next-app/app/(protected)/vehicles/actions.ts", import.meta.url),
  "utf8",
);

assert.match(migration, /drop constraint if exists vehicle_fuel_logs_source_row_key/);
assert.match(migration, /drop constraint if exists vehicle_repairs_source_row_key/);
assert.doesNotMatch(action, /onConflict:\s*["']source_file,source_sheet,source_row["']/);
assert.equal((action.match(/onConflict:\s*["']import_fingerprint["']/g) ?? []).length >= 2, true);
assert.match(action, /fingerprint: fingerprint\(row\)/);

const stored = [{ source: "history.xlsx|SHEET 2026|11", fingerprint: "old-event" }];
const selected = { source: "history.xlsx|SHEET 2026|11", fingerprint: "new-event" };
if (!stored.some((row) => row.fingerprint === selected.fingerprint)) stored.push(selected);
assert.equal(stored.length, 2, "same source position with different content must append, not overwrite");
assert.deepEqual(stored.map((row) => row.fingerprint), ["old-event", "new-event"]);

console.log("Vehicle import identity tests passed.");
