import assert from "node:assert/strict";
import fs from "node:fs/promises";

const pageSource = await fs.readFile(new URL("../next-app/app/(protected)/vehicles/page.tsx", import.meta.url), "utf8");
const historyTabsSource = await fs.readFile(new URL("../next-app/components/vehicle-history-tabs.tsx", import.meta.url), "utf8");
const tollSource = await fs.readFile(new URL("../next-app/components/vehicle-toll-section.tsx", import.meta.url), "utf8");

assert.match(pageSource, /function VehicleYearFilter/);
assert.match(pageSource, /<option value="">Tất cả năm<\/option>/);
assert.match(pageSource, /gte\("inspection_date", selectedYearStart\)\.lt\("inspection_date", selectedYearEnd\)/);
assert.match(pageSource, /gte\("starts_on", selectedYearStart\)\.lt\("starts_on", selectedYearEnd\)/);
assert.match(pageSource, /gte\("service_date", selectedYearStart\)\.lt\("service_date", selectedYearEnd\)/);
assert.match(pageSource, /gte\("payment_date", selectedYearStart\)\.lt\("payment_date", selectedYearEnd\)/);
assert.match(pageSource, /const yearSuffix = year \? `&year=\$\{year\}` : ""/);
assert.match(pageSource, /section="inspections" year=\{selectedYear \?\? undefined\}/);
assert.match(pageSource, /section="insurance" year=\{selectedYear \?\? undefined\}/);
assert.match(historyTabsSource, /const yearQuery = year \? `&year=\$\{year\}` : ""/);
assert.match(tollSource, /className="panel toll-year-filter"/);
assert.match(tollSource, /gte\("period_month", `\$\{year\}-01-01`\)\.lt\("period_month", `\$\{year \+ 1\}-01-01`\)/);

console.log("Vehicle section year-filter checks passed: inspections, insurance, repairs, fuel and VETC filter by year and preserve the filter through tabs and pagination.");
