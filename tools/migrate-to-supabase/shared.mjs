import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const projectRoot = resolve(import.meta.dirname, "../..");
export const importDirectory = resolve(
  projectRoot,
  "data/google_sheet_import",
);

export async function readCsv(fileName) {
  const text = await readFile(resolve(importDirectory, fileName), "utf8");
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!rows.length) return [];
  const [headers, ...dataRows] = rows;

  return dataRows
    .filter((row) => row.some((value) => String(value).trim() !== ""))
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [
          String(header).trim(),
          String(row[index] ?? "").trim(),
        ]),
      ),
    );
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (quoted) {
      if (character === '"' && nextCharacter === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

export function nullable(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function numberValue(value, fallback = 0) {
  const normalized = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function integerValue(value, fallback = null) {
  const normalized = nullable(value);
  if (normalized === null) return fallback;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function booleanValue(value, fallback = true) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return !["false", "0", "no", "inactive", "khong"].includes(normalized);
}

export function dateValue(value) {
  const normalized = nullable(value);
  if (!normalized) return null;
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const vietnameseMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vietnameseMatch) {
    return [
      vietnameseMatch[3],
      vietnameseMatch[2].padStart(2, "0"),
      vietnameseMatch[1].padStart(2, "0"),
    ].join("-");
  }
  return null;
}

export function timestampValue(value) {
  const normalized = nullable(value);
  if (!normalized) return undefined;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function requireMigrationEnv() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  ).trim();

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong môi trường local đã ignore.",
    );
  }

  return { url, serviceRoleKey };
}

export async function supabaseRest(path, options = {}) {
  const { url, serviceRoleKey } = requireMigrationEnv();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: options.prefer ?? "return=representation",
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message =
      data?.message || data?.hint || `Supabase trả HTTP ${response.status}`;
    throw new Error(message);
  }

  return { data, headers: response.headers, status: response.status };
}

export async function upsertBatches(table, rows, conflictColumns) {
  const batchSize = 200;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    await supabaseRest(
      `${table}?on_conflict=${encodeURIComponent(conflictColumns)}`,
      {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: batch,
      },
    );
  }
}

export function printSummary(summary) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
