// Chuyển giá trị giữa MariaDB và định dạng JSON mà PostgREST/Supabase trả về,
// để code giao diện hiện tại không phải sửa: boolean thật, số thật, JSON đã parse,
// timestamptz dạng ISO "2026-11-05T01:02:03.123456+00:00", date dạng "YYYY-MM-DD".

import { TABLE_COLUMNS, type ColumnKind } from "@/lib/db/generated/meta";

export function columnKind(table: string, column: string): ColumnKind | undefined {
  return TABLE_COLUMNS[table]?.[column];
}

export function fromDb(kind: ColumnKind | undefined, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (kind) {
    case "bool":
      return value === 1 || value === "1" || value === true;
    case "int":
      return Number(value);
    case "bigint":
    case "num": {
      const n = Number(value);
      return Number.isFinite(n) ? n : value;
    }
    case "json":
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    case "ts": {
      const s = String(value);
      return s.includes("T") ? s : `${s.replace(" ", "T")}+00:00`;
    }
    case "date":
      return String(value).slice(0, 10);
    default:
      return value;
  }
}

/** Giá trị JS -> tham số MariaDB theo kiểu cột */
export function toDb(kind: ColumnKind | undefined, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  switch (kind) {
    case "json":
      return typeof value === "string" && kind === "json" && looksLikeJson(value) ? value : JSON.stringify(value);
    case "bool":
      return value === true || value === "true" || value === 1 || value === "1" || value === "t" ? 1 : 0;
    case "ts":
      return toUtcDateTime(value);
    case "date":
      return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    default:
      if (value instanceof Date) return toUtcDateTime(value);
      if (typeof value === "object") return JSON.stringify(value);
      return value;
  }
}

function looksLikeJson(s: string) {
  const t = s.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

/** "2026-11-05T08:00:00+07:00" -> "2026-11-05 01:00:00.000000" (UTC) */
export function toUtcDateTime(value: unknown): string {
  if (value === "now()" || value === "now") return new Date().toISOString().replace("T", " ").replace("Z", "");
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    // chuỗi chỉ có ngày: coi là 00:00 UTC
    return String(value);
  }
  return d.toISOString().replace("T", " ").replace("Z", "");
}

export function convertRow(table: string, row: Record<string, unknown>) {
  const kinds = TABLE_COLUMNS[table] ?? {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith("_u_")) continue; // cột sinh phục vụ chỉ mục duy nhất
    out[key] = fromDb(kinds[key], value);
  }
  return out;
}
