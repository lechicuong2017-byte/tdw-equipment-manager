import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  sortTollQuarterlyPreviewRows,
  sortVehicleImportPreviewRows,
} from "../next-app/lib/vehicle-import-preview-sort.ts";
import { periodDueTone } from "../next-app/lib/vehicle-due-status.ts";

const vehicleRows = sortVehicleImportPreviewRows([
  { id: "saved-latest", comparison_status: "already_saved", date: "2026-09-28", row: 20, sheet: "BAO DUONG XE 2026" },
  { id: "new-older", comparison_status: "new_record", date: "2026-08-10", row: 10, sheet: "BAO DUONG XE 2026" },
  { id: "new-latest", comparison_status: "newer", date: "2026-09-27", row: 19, sheet: "BAO DUONG XE 2026" },
  { id: "older", comparison_status: "older", date: "2026-09-26", row: 18, sheet: "BAO DUONG XE 2026" },
]);
assert.deepEqual(vehicleRows.map((row) => row.id), ["new-latest", "new-older", "older", "saved-latest"]);

const tollRows = sortTollQuarterlyPreviewRows([
  { id: "saved", comparison_status: "already_saved", duplicate_in_file: false, starts_on: "2026-10-01", expires_on: "2026-12-31", row: 8, vehicle_id: "vehicle" },
  { id: "new-older", comparison_status: "new", duplicate_in_file: false, starts_on: "2026-07-01", expires_on: "2026-09-30", row: 4, vehicle_id: "vehicle" },
  { id: "new-latest", comparison_status: "new", duplicate_in_file: false, starts_on: "2026-10-01", expires_on: "2026-12-31", row: 9, vehicle_id: "vehicle" },
  { id: "unmatched", comparison_status: "new", duplicate_in_file: false, starts_on: "2026-11-01", expires_on: "2027-01-31", row: 10, vehicle_id: null },
]);
assert.deepEqual(tollRows.map((row) => row.id), ["new-latest", "new-older", "unmatched", "saved"]);

assert.deepEqual(periodDueTone("2026-08-01", "2026-09-26", "2026-09-28"), { className: "status-pill--retiring", label: "Quá hạn 2 ngày" });
assert.deepEqual(periodDueTone("2026-08-01", "2026-10-03", "2026-09-28"), { className: "status-pill--attention", label: "Còn 5 ngày" });
assert.deepEqual(periodDueTone("2026-08-01", "2026-10-20", "2026-09-28"), { className: "status-pill--new", label: "Còn 22 ngày" });
assert.deepEqual(periodDueTone("2026-08-01", "2026-12-31", "2026-09-28"), { className: "status-pill--active", label: "Còn hiệu lực" });

const [styles, vehicleReview, tollReview] = await Promise.all([
  readFile(new URL("../next-app/app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../next-app/components/vehicle-forms.tsx", import.meta.url), "utf8"),
  readFile(new URL("../next-app/components/vehicle-toll-imports.tsx", import.meta.url), "utf8"),
]);
assert.match(styles, /vehicle-import-review-table\.supply-review-table \.status-pill[^}]*white-space: normal/);
assert.match(styles, /@media \(max-width: 760px\)[\s\S]*toll-quarterly-review-table thead \{ display: none; \}/);
assert.match(vehicleReview, /<th>Nguồn \/ ngày<\/th>/);
assert.match(tollReview, /periodDueTone\(row\.starts_on, row\.expires_on, today\)/);

console.log("Vehicle XLSX preview sort tests passed.");
