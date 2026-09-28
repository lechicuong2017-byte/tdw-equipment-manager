import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(
  new URL("../next-app/app/(protected)/vehicles/page.tsx", import.meta.url),
  "utf8",
);

assert.match(
  page,
  /const needsInspections = \["overview", "fleet", "inspections"\]\.includes\(section\)/,
  "The fleet section must load current vehicle inspections.",
);
assert.ok(
  page.includes('supabase.from("vehicle_inspections").select(inspectionSelect).is("archived_at", null).order("inspection_date", { ascending: false })'),
  "Fleet inspection data must exclude archived renewals and put the latest inspection first.",
);
assert.match(
  page,
  /if \(!latestInspectionByVehicle\.has\(item\.vehicle_id\)\) latestInspectionByVehicle\.set\(item\.vehicle_id, item\)/,
  "Inspections must be linked back to vehicle profiles by vehicle_id.",
);

console.log("vehicle fleet latest-inspection link checks passed");
