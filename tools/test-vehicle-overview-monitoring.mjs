import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(
  new URL("../next-app/app/(protected)/vehicles/page.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../next-app/app/globals.css", import.meta.url),
  "utf8",
);

assert.ok(page.includes('from("vehicle_toll_quarterly_records")'), "Overview must load quarterly VETC passes.");
assert.ok(page.includes('.eq("is_current", true).lte("starts_on", today)'), "Only current, already-started VETC passes should be monitored.");
assert.ok(page.includes("daysUntil(item.expires_on, today) <= 30"), "VETC warnings should use a 30-day window.");
assert.ok(page.includes("ĐĂNG KIỂM") && page.includes("BẢO HIỂM") && page.includes("VETC THEO QUÝ"), "The monitoring area must contain all three requested sections.");
assert.match(styles, /\.vehicle-overview-grid \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/, "Desktop monitoring cards should use three equal columns.");
assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?\.vehicle-overview-grid \{ grid-template-columns: 1fr; \}/, "Monitoring cards should stack on smaller screens.");

console.log("vehicle overview monitoring checks passed");
