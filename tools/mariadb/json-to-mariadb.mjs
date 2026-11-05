#!/usr/bin/env node
// Nạp gói dữ liệu JSON xuất từ Supabase (SQL Editor) vào một MariaDB đã có schema,
// sau đó (tuỳ chọn) xuất ra file SQL để trang /setup nạp trên Hostinger.
//
//   MYSQL_URL=mysql://tdw:pass@localhost/tdw_import node json-to-mariadb.mjs data.json.gz [--sql out.sql]
//
// Gói JSON: { "<bảng public>": [rows...], "auth_users": [...], "storage_objects": [...] }

import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import mysql from "mysql2/promise";

const [, , input, ...rest] = process.argv;
const sqlOut = rest.includes("--sql") ? rest[rest.indexOf("--sql") + 1] : null;
if (!input || !process.env.MYSQL_URL) {
  console.error("Cách dùng: MYSQL_URL=... node json-to-mariadb.mjs data.json[.gz] [--sql out.sql]");
  process.exit(1);
}
const raw = readFileSync(input);
const data = JSON.parse((input.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8"));

const my = await mysql.createConnection({ uri: process.env.MYSQL_URL, timezone: "Z", dateStrings: true, charset: "utf8mb4_unicode_ci" });
await my.query("SET time_zone = '+00:00', FOREIGN_KEY_CHECKS = 0");

const [cols] = await my.query(
  `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, DATA_TYPE AS dt, EXTRA AS extra FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`,
);
const target = new Map();
for (const r of cols) {
  if (/GENERATED|VIRTUAL|STORED/i.test(r.extra) || r.c.startsWith("_u_")) continue;
  if (!target.has(r.t)) target.set(r.t, []);
  target.get(r.t).push({ name: r.c, type: r.dt });
}

function convert(value, type) {
  if (value === null || value === undefined) return null;
  if (type === "datetime" || type === "timestamp") {
    const s = String(value);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    const frac = s.match(/T\d\d:\d\d:\d\d\.(\d+)/)?.[1] ?? "";
    return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "") + (frac ? `.${frac.padEnd(6, "0").slice(0, 6)}` : "");
  }
  if (type === "date") return String(value).slice(0, 10);
  if (type === "tinyint") return value === true ? 1 : value === false ? 0 : value;
  // Cột JSON (MariaDB báo là longtext): giá trị đã được parse từ JSON nguồn -> ghi lại dạng JSON
  if (type === "longtext" || type === "json") return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

const report = [];
let failed = 0;
for (const [key, rows] of Object.entries(data)) {
  const table = key;
  if (!Array.isArray(rows) || !rows.length) continue;
  const columns = target.get(table);
  if (!columns) {
    console.log(`- bỏ qua ${table}: không có ở MariaDB`);
    continue;
  }
  const present = columns.filter((c) => rows.some((r) => c.name in r));
  const missing = Object.keys(rows[0]).filter((k) => !columns.some((c) => c.name === k));
  await my.query(`DELETE FROM \`${table}\``);
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const params = batch.flatMap((r) => present.map((c) => convert(r[c.name], c.type)));
    await my.query(
      `INSERT INTO \`${table}\` (${present.map((c) => `\`${c.name}\``).join(",")}) VALUES ${batch.map(() => `(${present.map(() => "?").join(",")})`).join(",")}`,
      params,
    );
  }
  const [[{ n }]] = await my.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
  const ok = Number(n) === rows.length;
  if (!ok) failed++;
  report.push(`${ok ? "✓" : "✗"} ${table.padEnd(38)} ${String(rows.length).padStart(5)} -> ${String(n).padStart(5)}${missing.length ? `  (bỏ cột nguồn: ${missing.join(", ")})` : ""}`);
}
await my.query("SET FOREIGN_KEY_CHECKS = 1");

// Kiểm tra khoá ngoại sau khi nạp (dữ liệu mồ côi)
const [fks] = await my.query(
  `SELECT k.TABLE_NAME t, k.COLUMN_NAME c, k.REFERENCED_TABLE_NAME rt, k.REFERENCED_COLUMN_NAME rc
   FROM information_schema.KEY_COLUMN_USAGE k WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
);
const orphans = [];
for (const fk of fks) {
  const [[{ n }]] = await my.query(
    `SELECT COUNT(*) AS n FROM \`${fk.t}\` x WHERE x.\`${fk.c}\` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM \`${fk.rt}\` y WHERE y.\`${fk.rc}\` = x.\`${fk.c}\`)`,
  );
  if (Number(n)) orphans.push(`${fk.t}.${fk.c} -> ${fk.rt}: ${n}`);
}
console.log(report.join("\n"));
console.log(orphans.length ? `\nDữ liệu mồ côi:\n${orphans.join("\n")}` : "\nKhoá ngoại: không có dữ liệu mồ côi.");

if (sqlOut) {
  const lines = ["-- Dữ liệu chuyển từ Supabase. Nạp bởi /setup (một kết nối, tắt kiểm tra khoá ngoại).", "SET FOREIGN_KEY_CHECKS = 0;"];
  for (const [table, columns] of target) {
    const [rows] = await my.query(`SELECT ${columns.map((c) => `\`${c.name}\``).join(",")} FROM \`${table}\``);
    if (!rows.length || !Object.prototype.hasOwnProperty.call(data, table)) continue;
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const lit = (v) => my.escape(v !== null && typeof v === "object" && !Buffer.isBuffer(v) && !(v instanceof Date) ? JSON.stringify(v) : v);
      const values = batch.map((r) => `(${columns.map((c) => lit(r[c.name])).join(",")})`).join(",\n");
      lines.push(`REPLACE INTO \`${table}\` (${columns.map((c) => `\`${c.name}\``).join(",")}) VALUES\n${values};`);
    }
  }
  lines.push("SET FOREIGN_KEY_CHECKS = 1;");
  writeFileSync(sqlOut, lines.join("\n") + "\n");
  console.log(`Đã ghi ${sqlOut}`);
}
await my.end();
process.exit(failed ? 2 : 0);
