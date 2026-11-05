#!/usr/bin/env node
// Chuyển dữ liệu từ PostgreSQL (Supabase / bản sao Docker) sang MariaDB.
//
//   PG_URL=postgres://user:pass@host:5432/postgres \
//   MYSQL_URL=mysql://user:pass@host:3306/dbname \
//   node migrate-data.mjs [--truncate] [--only=table1,table2] [--dry-run]
//
// - Chép mọi bảng trong schema public theo đúng cột của MariaDB (bỏ cột sinh / cột _u_*).
// - auth.users -> auth_users (giữ hash mật khẩu bcrypt để người dùng đăng nhập bằng mật khẩu cũ).
// - auth.mfa_factors (TOTP đã xác minh) -> auth_mfa_factors.
// - storage.objects -> storage_objects (chỉ metadata; file thật chép bằng script tải file riêng).
// - Đối soát số dòng từng bảng sau khi chép.

import pg from "pg";
import mysql from "mysql2/promise";

const args = new Set(process.argv.slice(2));
const only = [...args].find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? null;
const truncate = args.has("--truncate");
const dryRun = args.has("--dry-run");
const BATCH = 500;

const PG_URL = process.env.PG_URL;
const MYSQL_URL = process.env.MYSQL_URL;
if (!PG_URL || !MYSQL_URL) {
  console.error("Cần PG_URL và MYSQL_URL");
  process.exit(1);
}

const pgClient = new pg.Client({ connectionString: PG_URL, ssl: /sslmode=require|supabase\.co/.test(PG_URL) ? { rejectUnauthorized: false } : undefined });
await pgClient.connect();
// Đọc timestamptz dưới dạng chuỗi ISO UTC
await pgClient.query("SET TIME ZONE 'UTC'");
pg.types.setTypeParser(1184, (v) => v); // timestamptz -> chuỗi
pg.types.setTypeParser(1114, (v) => v); // timestamp
pg.types.setTypeParser(1082, (v) => v); // date
pg.types.setTypeParser(1700, (v) => v); // numeric giữ nguyên chuỗi (không mất chính xác)
pg.types.setTypeParser(20, (v) => v); // bigint

const my = await mysql.createConnection({ uri: MYSQL_URL, timezone: "Z", dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, charset: "utf8mb4_unicode_ci" });
await my.query("SET time_zone = '+00:00', FOREIGN_KEY_CHECKS = 0, UNIQUE_CHECKS = 0");

const [mysqlCols] = await my.query(
  `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, DATA_TYPE AS dt, EXTRA AS extra FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`,
);
const targetColumns = new Map();
for (const r of mysqlCols) {
  if (/GENERATED|VIRTUAL|STORED/i.test(r.extra) || r.c.startsWith("_u_")) continue;
  if (!targetColumns.has(r.t)) targetColumns.set(r.t, []);
  targetColumns.get(r.t).push({ name: r.c, type: r.dt });
}

function toMysql(value, type) {
  if (value === null || value === undefined) return null;
  if (type === "datetime" || type === "timestamp") {
    // "2026-11-05 01:02:03.123456+00" -> "2026-11-05 01:02:03.123456"
    const d = new Date(String(value).replace(" ", "T").replace(/\+00$/, "Z"));
    if (Number.isNaN(d.getTime())) return String(value).replace(/\+00(:00)?$/, "");
    const iso = String(value).match(/\.(\d+)/)?.[1] ?? "";
    return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "") + (iso ? `.${iso.padEnd(6, "0").slice(0, 6)}` : "");
  }
  if (type === "json" || type === "longtext") {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  if (type === "tinyint") return value === true || value === "t" ? 1 : value === false || value === "f" ? 0 : value;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) return JSON.stringify(value);
  return value;
}

async function copy(label, pgSql, target, map = (r) => r) {
  const cols = targetColumns.get(target);
  if (!cols) throw new Error(`MariaDB thiếu bảng ${target}`);
  if (truncate && !dryRun) await my.query(`DELETE FROM \`${target}\``);
  const cursorName = `c_${target}`;
  await pgClient.query("BEGIN");
  await pgClient.query(`DECLARE ${cursorName} NO SCROLL CURSOR FOR ${pgSql}`);
  let total = 0;
  for (;;) {
    const { rows } = await pgClient.query(`FETCH ${BATCH} FROM ${cursorName}`);
    if (!rows.length) break;
    const mapped = rows.map(map).filter(Boolean);
    const present = cols.filter((c) => mapped.some((r) => c.name in r));
    if (!dryRun && mapped.length) {
      const placeholders = mapped.map(() => `(${present.map(() => "?").join(",")})`).join(",");
      const params = mapped.flatMap((r) => present.map((c) => toMysql(r[c.name], c.type)));
      await my.query(
        `INSERT INTO \`${target}\` (${present.map((c) => `\`${c.name}\``).join(",")}) VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE ${present.map((c) => `\`${c.name}\` = VALUES(\`${c.name}\`)`).join(",")}`,
        params,
      );
    }
    total += mapped.length;
  }
  await pgClient.query(`CLOSE ${cursorName}`);
  await pgClient.query("COMMIT");
  const [[{ n }]] = await my.query(`SELECT COUNT(*) AS n FROM \`${target}\``);
  const ok = dryRun || Number(n) >= total;
  console.log(`${ok ? "✓" : "✗"} ${label.padEnd(40)} nguồn ${String(total).padStart(7)}  đích ${String(n).padStart(7)}`);
  return { label, source: total, target: Number(n), ok };
}

const report = [];
const want = (t) => !only || only.includes(t);

// 1) Tài khoản đăng nhập (trước các bảng tham chiếu auth_users)
if (want("auth_users")) {
  report.push(await copy(
    "auth.users -> auth_users",
    `SELECT id, lower(email) AS email, encrypted_password AS password_hash, email_confirmed_at, last_sign_in_at, banned_until,
            coalesce(raw_user_meta_data, '{}'::jsonb) AS raw_user_meta_data, created_at, coalesce(updated_at, created_at) AS updated_at
     FROM auth.users WHERE email IS NOT NULL`,
    "auth_users",
    (r) => ({ ...r, password_hash: r.password_hash || null }),
  ));
}
if (want("auth_mfa_factors")) {
  const hasMfa = await pgClient.query("SELECT to_regclass('auth.mfa_factors') AS t");
  if (hasMfa.rows[0].t) {
    report.push(await copy(
      "auth.mfa_factors -> auth_mfa_factors",
      `SELECT id, user_id, 'totp' AS factor_type, friendly_name, secret AS secret_encrypted, status::text AS status, created_at, updated_at
       FROM auth.mfa_factors WHERE factor_type::text = 'totp' AND status::text = 'verified' AND secret IS NOT NULL`,
      "auth_mfa_factors",
    ));
  }
}

// 2) Bảng nghiệp vụ theo thứ tự khoá ngoại không quan trọng (đã tắt FOREIGN_KEY_CHECKS)
const { rows: pgTables } = await pgClient.query(
  "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
);
for (const { tablename } of pgTables) {
  if (!want(tablename) || !targetColumns.has(tablename)) {
    if (!targetColumns.has(tablename)) console.log(`- bỏ qua ${tablename} (không có ở MariaDB)`);
    continue;
  }
  const cols = targetColumns.get(tablename).map((c) => c.name);
  const { rows: pgCols } = await pgClient.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND is_generated <> 'ALWAYS'",
    [tablename],
  );
  const shared = cols.filter((c) => pgCols.some((p) => p.column_name === c));
  report.push(await copy(tablename, `SELECT ${shared.map((c) => `"${c}"`).join(", ")} FROM public."${tablename}"`, tablename));
}

// 3) Metadata file
if (want("storage_objects")) {
  report.push(await copy(
    "storage.objects -> storage_objects",
    `SELECT bucket_id, name, owner, metadata->>'mimetype' AS mime_type, nullif(metadata->>'size','')::bigint AS size, created_at, coalesce(updated_at, created_at) AS updated_at
     FROM storage.objects WHERE bucket_id IN ('asset-media','asset-documents','vehicle-documents','it-cost-documents')`,
    "storage_objects",
  ));
}

await my.query("SET FOREIGN_KEY_CHECKS = 1, UNIQUE_CHECKS = 1");
const failed = report.filter((r) => !r.ok);
console.log(`\n${report.length} bảng, ${report.reduce((s, r) => s + r.source, 0)} dòng nguồn. ${failed.length ? `LỖI: ${failed.map((f) => f.label).join(", ")}` : "Đối soát khớp."}`);
await pgClient.end();
await my.end();
process.exit(failed.length ? 2 : 0);
