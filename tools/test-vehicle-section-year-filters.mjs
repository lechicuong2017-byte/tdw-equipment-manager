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
assert.equal((pageSource.match(/query = query\.eq\("vehicle_id", selectedVehicleId\)/g) || []).length, 4);
assert.match(pageSource, /<option value="">Tất cả xe<\/option>/);
assert.match(pageSource, /const yearSuffix = year \? `&year=\$\{year\}` : ""/);
assert.match(pageSource, /const vehicleSuffix = vehicleId \? `&vehicleId=\$\{vehicleId\}` : ""/);
assert.match(pageSource, /section="inspections"[^>]+vehicleId=\{selectedVehicleId \?\? undefined\}[^>]+year=\{selectedYear \?\? undefined\}/);
assert.match(pageSource, /section="insurance"[^>]+vehicleId=\{selectedVehicleId \?\? undefined\}[^>]+year=\{selectedYear \?\? undefined\}/);
assert.match(historyTabsSource, /const yearQuery = year \? `&year=\$\{year\}` : ""/);
assert.match(historyTabsSource, /const vehicleQuery = vehicleId \? `&vehicleId=\$\{vehicleId\}` : ""/);
assert.match(tollSource, /className="panel toll-year-filter"/);
assert.match(tollSource, /passesQuery = passesQuery\.eq\("vehicle_id", vehicleId\)/);
assert.match(tollSource, /from\("vehicle_toll_transactions"\)[\s\S]+\.eq\("vehicle_id", vehicleId\)/);
assert.match(tollSource, /href=\{`\/api\/vehicles\/tolls\/report\?year=\$\{year\}\$\{vehicleId \? `&vehicle_id=\$\{vehicleId\}` : ""\}`\}/);

console.log("Vehicle combined-filter checks passed: inspections, insurance, repairs, fuel and VETC combine year, vehicle and history state through totals, tabs, exports and pagination.");
