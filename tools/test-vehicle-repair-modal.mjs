import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const actions = await readFile(
  new URL("../next-app/app/(protected)/vehicles/actions.ts", import.meta.url),
  "utf8",
);
const forms = await readFile(
  new URL("../next-app/components/vehicle-forms.tsx", import.meta.url),
  "utf8",
);
const modal = await readFile(
  new URL("../next-app/components/app-modal.tsx", import.meta.url),
  "utf8",
);

const repairAction = actions.slice(
  actions.indexOf("export async function saveVehicleRepair"),
  actions.indexOf("export async function saveVehicleFuel"),
);
const repairForm = forms.slice(
  forms.indexOf("export function RepairForm"),
  forms.indexOf("export function FuelForm"),
);
const modalTrigger = modal.slice(
  modal.indexOf("export function ModalTrigger"),
  modal.indexOf("export function ModalPage"),
);

assert.match(repairAction, /\{ revalidate: false \}/, "Repair saves must return before route revalidation.");
assert.doesNotMatch(repairAction, /revalidatePath\(/, "Repair upload must not block on route revalidation.");
assert.match(repairForm, /showToast\(result\.success\)/, "Repair success should show feedback before unmounting.");
assert.match(repairForm, /onSuccess\(\)/, "Repair success should close its modal directly.");
assert.match(modalTrigger, /window\.setTimeout\(\(\) => router\.refresh\(\), 0\)/, "Modal refresh should run after the close is painted.");

console.log("vehicle repair modal regression checks passed");
