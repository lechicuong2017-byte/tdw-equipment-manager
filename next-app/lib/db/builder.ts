import "server-only";
// Bộ truy vấn tương thích API supabase-js (from().select().eq()...) chạy trên MariaDB.
// - Chế độ "user": áp chính sách RLS đã dịch (lib/db/generated/meta.ts) theo người đăng nhập.
// - Chế độ "service": bỏ qua RLS (tương đương service_role), dùng cho tác vụ hệ thống/RPC.
// - Trigger PostgreSQL được thay bằng hook trong lib/db/hooks.ts, chạy ở cả hai chế độ.

import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { CURRENT_USER_DEFAULTS, FOREIGN_KEYS, POLICIES, PRIMARY_KEYS, RLS_TABLES, TABLE_COLUMNS } from "@/lib/db/generated/meta";
import { convertRow, columnKind, toDb } from "@/lib/db/convert";
import { getPool, query, execute, withTransaction, type Queryable } from "@/lib/db/pool";
import { DbError, escapeLiteral, ident, mapMysqlError } from "@/lib/db/sql";
import type { PolicyFragments } from "@/lib/db/policy-fragments";
import { runHooks } from "@/lib/db/hooks";

// Giống PostgrestResponse: thành công -> data có giá trị, error null; lỗi -> data null.
export type DbResult<T = unknown> =
  | { data: T; error: null; count: number | null; status: number; statusText: string }
  | { data: null; error: DbError; count: number | null; status: number; statusText: string };

export type Session = {
  mode: "user" | "service" | "anon";
  userId: string | null;
  fragments: PolicyFragments | null;
  conn?: PoolConnection;
};

const VIEWS: Record<string, { pk: string[]; base?: string }> = {
  supply_inventory_balances: { pk: ["item_id"] },
  vehicle_toll_quarterly_records: { pk: ["id"], base: "vehicle_toll_quarterly_passes" },
};

const VIEW_COLUMN_KINDS: Record<string, Record<string, string>> = {
  supply_inventory_balances: {
    item_id: "uuid", category: "text", item_code: "text", item_name: "text", unit: "text", active: "bool",
    on_hand_quantity: "num", total_receipt_value: "num", last_movement_at: "ts",
  },
};

// Bổ sung kiểu cột của view vào bảng tra kiểu
for (const [view, kinds] of Object.entries(VIEW_COLUMN_KINDS)) {
  (TABLE_COLUMNS as Record<string, Record<string, string>>)[view] = kinds;
}
(TABLE_COLUMNS as Record<string, Record<string, string>>).vehicle_toll_quarterly_records = {
  ...TABLE_COLUMNS.vehicle_toll_quarterly_passes,
  is_current: "bool",
};

function tableExists(table: string) {
  return Boolean(TABLE_COLUMNS[table]);
}

function pkOf(table: string) {
  const pk = PRIMARY_KEYS[table] ?? VIEWS[table]?.pk;
  if (!pk?.length) throw new DbError(`Bảng ${table} không có khoá chính`, "42P01");
  return pk;
}

// ---------------------------------------------------------------------------
// Phân tích chuỗi select của PostgREST
// ---------------------------------------------------------------------------

type SelectItem =
  | { kind: "star" }
  | { kind: "column"; name: string; alias: string }
  | { kind: "embed"; table: string; alias: string; hint: string | null; inner: boolean; items: SelectItem[] };

function splitTop(input: string) {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      if (cur.trim()) parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

export function parseSelect(input: string): SelectItem[] {
  const text = (input || "*").replace(/\s+/g, " ").trim();
  return splitTop(text).map((raw) => {
    const part = raw.trim();
    if (part === "*") return { kind: "star" } as const;
    const embed = part.match(/^(?:([a-z_][a-z0-9_]*):)?([a-z_][a-z0-9_]*)(?:!([a-z_][a-z0-9_]*))?\s*\(([\s\S]*)\)$/);
    if (embed) {
      const [, alias, table, hint, inner] = embed;
      return {
        kind: "embed",
        table,
        alias: alias || table,
        hint: hint && hint !== "inner" && hint !== "left" ? hint : null,
        inner: hint === "inner",
        items: parseSelect(inner),
      } as const;
    }
    const col = part.match(/^(?:([a-z_][a-z0-9_]*):)?([a-z_][a-z0-9_]*)(?:::[a-z]+)?$/);
    if (!col) throw new DbError(`Cột select không hỗ trợ: ${part}`, "PGRST100");
    return { kind: "column", name: col[2], alias: col[1] || col[2] } as const;
  });
}

type Relation =
  | { type: "one"; localCols: string[]; remoteCols: string[] } // bảng hiện tại -> bảng nhúng (many-to-one)
  | { type: "many"; localCols: string[]; remoteCols: string[] }; // bảng nhúng -> bảng hiện tại (one-to-many)

function resolveRelation(table: string, embedTable: string, hint: string | null): Relation {
  const baseTable = VIEWS[table]?.base ?? table;
  const outgoing = FOREIGN_KEYS.filter((fk) => fk.table === baseTable && fk.refTable === embedTable);
  const incoming = FOREIGN_KEYS.filter((fk) => fk.table === embedTable && fk.refTable === baseTable);
  const pick = <T extends { columns: string[] }>(list: T[]) =>
    hint ? list.find((fk) => fk.columns.includes(hint)) ?? list[0] : list[0];
  if (outgoing.length && (!incoming.length || (hint && outgoing.some((fk) => fk.columns.includes(hint))))) {
    const fk = pick(outgoing)!;
    return { type: "one", localCols: fk.columns, remoteCols: fk.refColumns };
  }
  if (incoming.length) {
    const fk = pick(incoming)!;
    return { type: "many", localCols: fk.refColumns, remoteCols: fk.columns };
  }
  throw new DbError(`Không tìm thấy quan hệ giữa ${table} và ${embedTable}`, "PGRST200");
}

// ---------------------------------------------------------------------------
// Bộ lọc
// ---------------------------------------------------------------------------

type Filter = { sql: string; params: unknown[] } | { embedded: string; column: string; op: string; value: unknown; negate: boolean };

function colRef(table: string, column: string) {
  return `${ident(table)}.${ident(column)}`;
}

function valueParam(table: string, column: string, value: unknown) {
  return toDb(columnKind(table, column), value);
}

function buildOp(table: string, column: string, op: string, value: unknown): { sql: string; params: unknown[] } {
  const c = colRef(table, column);
  const kind = columnKind(table, column);
  switch (op) {
    case "eq":
      if (value === null) return { sql: `${c} IS NULL`, params: [] };
      if (kind === "json") return { sql: `JSON_EQUALS(${c}, ?)`, params: [JSON.stringify(value)] };
      return { sql: `${c} = ?`, params: [valueParam(table, column, value)] };
    case "neq":
      return { sql: `${c} <> ?`, params: [valueParam(table, column, value)] };
    case "gt":
      return { sql: `${c} > ?`, params: [valueParam(table, column, value)] };
    case "gte":
      return { sql: `${c} >= ?`, params: [valueParam(table, column, value)] };
    case "lt":
      return { sql: `${c} < ?`, params: [valueParam(table, column, value)] };
    case "lte":
      return { sql: `${c} <= ?`, params: [valueParam(table, column, value)] };
    case "like":
      return { sql: `${c} LIKE BINARY ?`, params: [String(value).replace(/\*/g, "%")] };
    case "ilike":
      return { sql: `${c} LIKE ?`, params: [String(value).replace(/\*/g, "%")] };
    case "is": {
      const v = value === "null" ? null : value === "true" ? true : value === "false" ? false : value;
      if (v === null) return { sql: `${c} IS NULL`, params: [] };
      return { sql: v ? `${c} IS TRUE` : `${c} IS FALSE`, params: [] };
    }
    case "in": {
      const list = Array.isArray(value) ? value : parseInList(String(value));
      if (!list.length) return { sql: "0", params: [] };
      return { sql: `${c} IN (${list.map(() => "?").join(", ")})`, params: list.map((v) => valueParam(table, column, v)) };
    }
    case "cs":
    case "contains": {
      const v = typeof value === "string" ? parseArrayLiteral(value) : value;
      return { sql: `JSON_CONTAINS(${c}, ?)`, params: [JSON.stringify(v)] };
    }
    case "ov":
    case "overlaps": {
      const v = typeof value === "string" ? parseArrayLiteral(value) : value;
      return { sql: `JSON_OVERLAPS(${c}, ?)`, params: [JSON.stringify(v)] };
    }
    default:
      throw new DbError(`Toán tử lọc chưa hỗ trợ: ${op}`, "PGRST100");
  }
}

function parseInList(text: string): string[] {
  const t = text.trim().replace(/^\(/, "").replace(/\)$/, "");
  if (!t) return [];
  return t.split(",").map((s) => s.trim().replace(/^"(.*)"$/, "$1"));
}

function parseArrayLiteral(text: string): unknown {
  const t = text.trim();
  if (t.startsWith("{") && t.endsWith("}")) return parseInList(t.slice(1, -1));
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

/** Phân tích biểu thức or()/and() kiểu PostgREST: "a.eq.1,b.lt.2,and(c.is.null,d.neq.x)" */
function parseLogic(table: string, text: string, joiner: "OR" | "AND"): { sql: string; params: unknown[] } {
  const parts = splitTop(text);
  const sqls: string[] = [];
  const params: unknown[] = [];
  for (const part of parts) {
    const nested = part.match(/^(not\.)?(and|or)\(([\s\S]*)\)$/);
    if (nested) {
      const inner = parseLogic(table, nested[3], nested[2] === "and" ? "AND" : "OR");
      sqls.push(nested[1] ? `NOT (${inner.sql})` : `(${inner.sql})`);
      params.push(...inner.params);
      continue;
    }
    const m = part.match(/^([a-z_][a-z0-9_]*)\.(not\.)?([a-z]+)\.([\s\S]*)$/);
    if (!m) throw new DbError(`Điều kiện lọc không hợp lệ: ${part}`, "PGRST100");
    const [, column, negate, op, rawValue] = m;
    let value: unknown = rawValue.replace(/^"([\s\S]*)"$/, "$1");
    if (op === "in") value = parseInList(rawValue);
    const built = buildOp(table, column, op, value);
    sqls.push(negate ? `NOT (${built.sql})` : built.sql);
    params.push(...built.params);
  }
  return { sql: sqls.length ? `(${sqls.join(` ${joiner} `)})` : "1", params };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

type Order = { column: string; ascending: boolean; nullsFirst?: boolean; referencedTable?: string };

type Operation =
  | { type: "select" }
  | { type: "insert"; rows: Record<string, unknown>[] }
  | { type: "update"; values: Record<string, unknown> }
  | { type: "upsert"; rows: Record<string, unknown>[]; onConflict: string[] | null; ignoreDuplicates: boolean }
  | { type: "delete" };

export class QueryBuilder<T = any[]> implements PromiseLike<DbResult<T>> {
  private op: Operation = { type: "select" };
  private selectText: string | null = null;
  private wantReturn = false;
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private embedLimits: Record<string, number> = {};
  private singleMode: "single" | "maybe" | null = null;
  private countMode: "exact" | null = null;
  private headOnly = false;

  constructor(private readonly session: Session, private readonly table: string) {
    if (!tableExists(table)) throw new DbError(`Bảng không tồn tại: ${table}`, "42P01");
  }

  // ----- khai báo thao tác -----
  select(columns = "*", options: { count?: "exact" | "planned" | "estimated"; head?: boolean } = {}) {
    if (this.op.type === "select") {
      this.selectText = columns;
      if (options.count) this.countMode = "exact";
      this.headOnly = Boolean(options.head);
    } else {
      this.selectText = columns;
      this.wantReturn = true;
    }
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[], options: { count?: string } = {}) {
    this.op = { type: "insert", rows: Array.isArray(values) ? values : [values] };
    if (options.count) this.countMode = "exact";
    return this;
  }

  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options: { onConflict?: string; ignoreDuplicates?: boolean; count?: string } = {},
  ) {
    this.op = {
      type: "upsert",
      rows: Array.isArray(values) ? values : [values],
      onConflict: options.onConflict ? options.onConflict.split(",").map((s) => s.trim()) : null,
      ignoreDuplicates: Boolean(options.ignoreDuplicates),
    };
    return this;
  }

  update(values: Record<string, unknown>, options: { count?: string } = {}) {
    this.op = { type: "update", values };
    if (options.count) this.countMode = "exact";
    return this;
  }

  delete(options: { count?: string } = {}) {
    this.op = { type: "delete" };
    if (options.count) this.countMode = "exact";
    return this;
  }

  // ----- bộ lọc -----
  private add(column: string, op: string, value: unknown, negate = false) {
    const dot = column.indexOf(".");
    if (dot > 0) {
      // lọc trên bảng nhúng: "vehicles.license_plate"
      const embedded = column.slice(0, dot);
      const inner = column.slice(dot + 1);
      this.filters.push({ embedded, column: inner, op, value, negate });
      return this;
    }
    const built = buildOp(this.table, column, op, value);
    this.filters.push(negate ? { sql: `NOT (${built.sql})`, params: built.params } : built);
    return this;
  }

  eq(column: string, value: unknown) { return this.add(column, "eq", value); }
  neq(column: string, value: unknown) { return this.add(column, "neq", value); }
  gt(column: string, value: unknown) { return this.add(column, "gt", value); }
  gte(column: string, value: unknown) { return this.add(column, "gte", value); }
  lt(column: string, value: unknown) { return this.add(column, "lt", value); }
  lte(column: string, value: unknown) { return this.add(column, "lte", value); }
  like(column: string, value: string) { return this.add(column, "like", value); }
  ilike(column: string, value: string) { return this.add(column, "ilike", value); }
  is(column: string, value: null | boolean) { return this.add(column, "is", value); }
  in(column: string, values: readonly unknown[]) { return this.add(column, "in", [...values]); }
  contains(column: string, value: unknown) { return this.add(column, "contains", value); }
  overlaps(column: string, value: unknown) { return this.add(column, "overlaps", value); }
  not(column: string, op: string, value: unknown) {
    const v = op === "in" && typeof value === "string" ? parseInList(value) : value;
    return this.add(column, op, v, true);
  }
  filter(column: string, op: string, value: unknown) {
    const v = op === "in" && typeof value === "string" ? parseInList(value) : value;
    if (op.startsWith("not.")) return this.add(column, op.slice(4), v, true);
    return this.add(column, op, v);
  }
  match(values: Record<string, unknown>) {
    for (const [k, v] of Object.entries(values)) this.eq(k, v);
    return this;
  }
  or(expression: string, options: { referencedTable?: string; foreignTable?: string } = {}) {
    if (options.referencedTable || options.foreignTable) {
      throw new DbError("or() trên bảng nhúng chưa được hỗ trợ", "PGRST100");
    }
    this.filters.push(parseLogic(this.table, expression, "OR"));
    return this;
  }
  textSearch(column: string, query: string) {
    return this.ilike(column, `%${query}%`);
  }

  // ----- sắp xếp / phân trang -----
  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string; foreignTable?: string } = {}) {
    this.orders.push({
      column,
      ascending: options.ascending !== false,
      nullsFirst: options.nullsFirst,
      referencedTable: options.referencedTable ?? options.foreignTable,
    });
    return this;
  }
  limit(n: number, options: { referencedTable?: string; foreignTable?: string } = {}) {
    const ref = options.referencedTable ?? options.foreignTable;
    if (ref) this.embedLimits[ref] = n;
    else this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.offsetN = from;
    this.limitN = Math.max(0, to - from + 1);
    return this;
  }
  single<U = T extends (infer R)[] ? R : any>() {
    this.singleMode = "single";
    return this as unknown as QueryBuilder<U>;
  }
  maybeSingle<U = T extends (infer R)[] ? R : any>() {
    this.singleMode = "maybe";
    return this as unknown as QueryBuilder<U | null>;
  }
  abortSignal() {
    return this;
  }
  returns<U>() {
    return this as unknown as QueryBuilder<U>;
  }
  overrideTypes<U>() {
    return this as unknown as QueryBuilder<U>;
  }
  throwOnError() {
    return this;
  }

  then<R1 = DbResult<T>, R2 = never>(
    onfulfilled?: ((value: DbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  // -------------------------------------------------------------------------
  // Thực thi
  // -------------------------------------------------------------------------

  async execute(): Promise<DbResult<T>> {
    try {
      switch (this.op.type) {
        case "select":
          return await this.runSelect();
        case "insert":
          return await this.runInsert(this.op.rows);
        case "upsert":
          return await this.runUpsert(this.op);
        case "update":
          return await this.runUpdate(this.op.values);
        case "delete":
          return await this.runDelete();
      }
    } catch (error) {
      const e = mapMysqlError(error);
      console.error(`[db] ${this.table}: ${e.code} ${e.message}`);
      return { data: null, error: e, count: null, status: 400, statusText: "Bad Request" };
    }
  }

  private db(): Queryable {
    return this.session.conn ?? getPool();
  }

  policy(kind: "select" | "delete"): string {
    if (this.session.mode === "service") return "1";
    const base = VIEWS[this.table]?.base ?? this.table;
    if (!RLS_TABLES.has(base) && !POLICIES[base]) return "1";
    const rules = POLICIES[base]?.[kind] ?? [];
    if (!rules.length || !this.session.fragments) return "0";
    const f = this.session.fragments;
    const sql = rules.map((rule) => `(${rule(f)})`).join(" OR ");
    // Chính sách viết theo tên bảng gốc; view dùng alias trùng tên view
    return VIEWS[this.table]?.base ? sql.replaceAll(`\`${base}\`.`, `\`${this.table}\`.`) : sql;
  }

  private updatePolicy(): { using: string; check: string } {
    if (this.session.mode === "service") return { using: "1", check: "1" };
    if (!RLS_TABLES.has(this.table)) return { using: "1", check: "1" };
    const rules = POLICIES[this.table]?.update ?? [];
    const f = this.session.fragments;
    if (!rules.length || !f) return { using: "0", check: "0" };
    return {
      using: rules.map((r) => `(${r.using(f)})`).join(" OR "),
      check: rules.map((r) => `(${r.check(f)})`).join(" OR "),
    };
  }

  private insertPolicy(): string {
    if (this.session.mode === "service") return "1";
    if (!RLS_TABLES.has(this.table)) return "1";
    const rules = POLICIES[this.table]?.insert ?? [];
    const f = this.session.fragments;
    if (!rules.length || !f) return "0";
    return rules.map((rule) => `(${rule(f)})`).join(" OR ");
  }

  private whereClause(policyKind: "select" | "delete" | null): { sql: string; params: unknown[] } {
    const parts: string[] = [];
    const params: unknown[] = [];
    for (const f of this.filters) {
      if ("embedded" in f) continue;
      parts.push(f.sql);
      params.push(...f.params);
    }
    // lọc theo bảng nhúng: EXISTS trên quan hệ
    for (const f of this.filters) {
      if (!("embedded" in f)) continue;
      const spec = f;
      const rel = resolveRelation(this.table, f.embedded, null);
      const built = buildOp(f.embedded, spec.column, spec.op, spec.value);
      const join = rel.localCols
        .map((c, i) => `${colRef(f.embedded, rel.remoteCols[i])} = ${colRef(this.table, c)}`)
        .join(" AND ");
      const cond = spec.negate ? `NOT (${built.sql})` : built.sql;
      parts.push(`EXISTS (SELECT 1 FROM ${ident(f.embedded)} WHERE ${join} AND ${cond})`);
      params.push(...built.params);
    }
    if (policyKind) parts.push(`(${this.policy(policyKind)})`);
    return { sql: parts.length ? parts.join(" AND ") : "1", params };
  }

  private orderClause(table: string, orders: Order[]) {
    const own = orders.filter((o) => !o.referencedTable);
    if (!own.length) return "";
    const parts = own.map((o) => {
      const c = colRef(table, o.column);
      // PostgreSQL: ASC -> NULL cuối, DESC -> NULL đầu (trừ khi chỉ định nullsFirst)
      const nullsFirst = o.nullsFirst ?? !o.ascending;
      return `(${c} IS NULL) ${nullsFirst ? "DESC" : "ASC"}, ${c} ${o.ascending ? "ASC" : "DESC"}`;
    });
    return ` ORDER BY ${parts.join(", ")}`;
  }

  private selectColumns(items: SelectItem[], table: string): { columns: string[]; embeds: Extract<SelectItem, { kind: "embed" }>[]; aliases: Map<string, string> } {
    const all = Object.keys(TABLE_COLUMNS[table] ?? {});
    const columns = new Set<string>();
    const aliases = new Map<string, string>();
    const embeds: Extract<SelectItem, { kind: "embed" }>[] = [];
    for (const item of items) {
      if (item.kind === "star") all.forEach((c) => columns.add(c));
      else if (item.kind === "column") {
        if (!all.includes(item.name)) throw new DbError(`column ${table}.${item.name} does not exist`, "42703");
        columns.add(item.name);
        aliases.set(item.name, item.alias);
      } else embeds.push(item);
    }
    return { columns: [...columns], embeds, aliases };
  }

  private async fetchRows(
    table: string,
    items: SelectItem[],
    where: { sql: string; params: unknown[] },
    orders: Order[],
    limit: number | null,
    offset: number | null,
    forUpdate = false,
  ): Promise<Record<string, unknown>[]> {
    const { columns, embeds, aliases } = this.selectColumns(items, table);
    const needed = new Set(columns);
    const relations = embeds.map((e) => ({ embed: e, rel: resolveRelation(table, e.table, e.hint) }));
    for (const { rel } of relations) rel.localCols.forEach((c) => needed.add(c));
    const list = [...needed];
    const colSql = list.length ? list.map((c) => colRef(table, c)).join(", ") : "1 AS `__one`";
    let sql = `SELECT ${colSql} FROM ${ident(table)} WHERE ${where.sql}${this.orderClause(table, orders)}`;
    if (limit !== null) sql += ` LIMIT ${Math.max(0, Math.floor(limit))}`;
    if (offset !== null) sql += `${limit === null ? " LIMIT 18446744073709551615" : ""} OFFSET ${Math.max(0, Math.floor(offset))}`;
    if (forUpdate) sql += " FOR UPDATE";
    const raw = await query(this.db(), sql, where.params);
    const rows = raw.map((r) => convertRow(table, r));

    for (const { embed, rel } of relations) {
      const keys = [...new Set(rows.map((r) => rel.localCols.map((c) => r[c]).join("\u0001")).filter((k) => !k.split("\u0001").includes("")))];
      const sub = new QueryBuilder(this.session, embed.table);
      // luôn lấy cột khoá để ghép; cột nào người dùng không yêu cầu sẽ bị bỏ sau khi ghép
      const requestedNames = new Set(embed.items.flatMap((i) => (i.kind === "column" ? [i.alias] : [])));
      const hasStar = embed.items.some((i) => i.kind === "star");
      const addedKeys = rel.remoteCols.filter((c) => !hasStar && !requestedNames.has(c));
      const keyItems: SelectItem[] = addedKeys.map((c) => ({ kind: "column", name: c, alias: c }));
      let matches: Record<string, unknown>[] = [];
      if (keys.length && rows.length) {
        const conds: string[] = [];
        const params: unknown[] = [];
        if (rel.remoteCols.length === 1) {
          const vals = rows.map((r) => r[rel.localCols[0]]).filter((v) => v !== null && v !== undefined);
          const uniq = [...new Set(vals)];
          if (uniq.length) {
            conds.push(`${colRef(embed.table, rel.remoteCols[0])} IN (${uniq.map(() => "?").join(", ")})`);
            params.push(...uniq);
          } else conds.push("0");
        } else {
          throw new DbError("Quan hệ nhiều cột chưa hỗ trợ", "PGRST200");
        }
        const policy = sub.policy("select");
        const embedOrders = this.orders.filter((o) => o.referencedTable === embed.alias || o.referencedTable === embed.table)
          .map((o) => ({ ...o, referencedTable: undefined }));
        matches = await sub.fetchRows(
          embed.table,
          [...embed.items, ...keyItems],
          { sql: `${conds.join(" AND ")} AND (${policy})`, params },
          embedOrders,
          null,
          null,
        );
      }
      const grouped = new Map<string, Record<string, unknown>[]>();
      for (const m of matches) {
        const key = rel.remoteCols.map((c) => m[c]).join("\u0001");
        for (const c of addedKeys) delete m[c];
        const arr = grouped.get(key) ?? [];
        arr.push(m);
        grouped.set(key, arr);
      }
      const embedLimit = this.embedLimits[embed.alias] ?? this.embedLimits[embed.table];
      for (const row of rows) {
        const key = rel.localCols.map((c) => row[c]).join("\u0001");
        const found = grouped.get(key) ?? [];
        row[embed.alias] = rel.type === "one" ? found[0] ?? null : embedLimit !== undefined ? found.slice(0, embedLimit) : found;
      }
      if (embed.inner) {
        for (let i = rows.length - 1; i >= 0; i--) {
          const v = rows[i][embed.alias];
          if (v === null || (Array.isArray(v) && v.length === 0)) rows.splice(i, 1);
        }
      }
    }

    // bỏ cột chỉ lấy để ghép và đổi tên alias
    const requested = new Set(columns);
    return rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (requested.has(k)) out[aliases.get(k) ?? k] = v;
        else if (embeds.some((e) => e.alias === k)) out[k] = v;
      }
      return out;
    });
  }

  private finish(rows: Record<string, unknown>[] | null, count: number | null, status = 200): DbResult<T> {
    if (this.singleMode && rows) {
      if (rows.length === 1) return { data: rows[0] as unknown as T, error: null, count, status, statusText: "OK" };
      if (rows.length === 0 && this.singleMode === "maybe") return { data: null as unknown as T, error: null, count, status, statusText: "OK" };
      return {
        data: null,
        error: new DbError(
          "JSON object requested, multiple (or no) rows returned",
          "PGRST116",
          `The result contains ${rows.length} rows`,
        ),
        count,
        status: 406,
        statusText: "Not Acceptable",
      };
    }
    return { data: rows as unknown as T, error: null, count, status, statusText: "OK" };
  }

  private async runSelect(): Promise<DbResult<T>> {
    const items = parseSelect(this.selectText ?? "*");
    const where = this.whereClause("select");
    let count: number | null = null;
    if (this.countMode) {
      const [row] = await query<{ n: string }>(this.db(), `SELECT COUNT(*) AS n FROM ${ident(this.table)} WHERE ${where.sql}`, where.params);
      count = Number(row?.n ?? 0);
    }
    if (this.headOnly) return { data: null as unknown as T, error: null, count, status: 200, statusText: "OK" };
    const rows = await this.fetchRows(this.table, items, where, this.orders, this.limitN, this.offsetN);
    return this.finish(rows, count);
  }

  private async returning(pks: Record<string, unknown>[], status: number): Promise<DbResult<T>> {
    if (!this.wantReturn) return { data: null as unknown as T, error: null, count: this.countMode ? pks.length : null, status, statusText: "OK" };
    if (!pks.length) return this.finish([], this.countMode ? 0 : null, status);
    const pk = pkOf(this.table);
    const params: unknown[] = [];
    const cond = pks
      .map((p) => `(${pk.map((c) => { params.push(p[c]); return `${colRef(this.table, c)} = ?`; }).join(" AND ")})`)
      .join(" OR ");
    const rows = await this.fetchRows(
      this.table,
      parseSelect(this.selectText ?? "*"),
      { sql: `(${cond}) AND (${this.policy("select")})`, params },
      this.orders,
      null,
      null,
    );
    // giữ thứ tự như dữ liệu truyền vào
    const keyOf = (r: Record<string, unknown>) => pk.map((c) => String(r[c])).join("\u0001");
    const order = new Map(pks.map((p, i) => [keyOf(p), i]));
    if (pk.every((c) => rows.every((r) => c in r))) rows.sort((a, b) => (order.get(keyOf(a)) ?? 0) - (order.get(keyOf(b)) ?? 0));
    return this.finish(rows, this.countMode ? pks.length : null, status);
  }

  private prepareRow(row: Record<string, unknown>) {
    const kinds = TABLE_COLUMNS[this.table];
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v === undefined) continue;
      if (!kinds[k]) throw new DbError(`Could not find the '${k}' column of '${this.table}'`, "PGRST204");
      out[k] = v;
    }
    // DEFAULT auth.uid()
    for (const c of CURRENT_USER_DEFAULTS[this.table] ?? []) {
      if (out[c] === undefined && this.session.userId) out[c] = this.session.userId;
    }
    const pk = pkOf(this.table);
    if (pk.length === 1 && kinds[pk[0]] === "uuid" && (out[pk[0]] === undefined || out[pk[0]] === null)) {
      out[pk[0]] = randomUUID();
    }
    return out;
  }

  private async checkRows(conn: PoolConnection, pks: Record<string, unknown>[], policySql: string, action: string) {
    if (policySql === "1" || !pks.length) return;
    const pk = pkOf(this.table);
    const params: unknown[] = [];
    const cond = pks.map((p) => `(${pk.map((c) => { params.push(p[c]); return `${colRef(this.table, c)} = ?`; }).join(" AND ")})`).join(" OR ");
    const [row] = await query<{ n: string }>(conn, `SELECT COUNT(*) AS n FROM ${ident(this.table)} WHERE (${cond}) AND (${policySql})`, params);
    if (Number(row?.n ?? 0) !== pks.length) {
      throw new DbError(`new row violates row-level security policy for table "${this.table}" (${action})`, "42501");
    }
  }

  private async insertRows(conn: PoolConnection, rows: Record<string, unknown>[]) {
    const pk = pkOf(this.table);
    const kinds = TABLE_COLUMNS[this.table];
    const prepared: Record<string, unknown>[] = [];
    for (const raw of rows) {
      let row = this.prepareRow(raw);
      row = await runHooks("beforeInsert", this.table, { row, old: null, session: this.session, conn });
      prepared.push(row);
    }
    if (!prepared.length) return [];
    const cols = [...new Set(prepared.flatMap((r) => Object.keys(r)))];
    const params: unknown[] = [];
    const values = prepared
      .map((r) => `(${cols.map((c) => {
        if (!(c in r)) return "DEFAULT";
        params.push(toDb(kinds[c], r[c]));
        return "?";
      }).join(", ")})`)
      .join(", ");
    const result = await execute(conn, `INSERT INTO ${ident(this.table)} (${cols.map(ident).join(", ")}) VALUES ${values}`, params);
    const pks = prepared.map((r, i) => {
      const key: Record<string, unknown> = {};
      for (const c of pk) key[c] = r[c] ?? (kinds[c] === "bigint" || kinds[c] === "int" ? Number(result.insertId) + i : null);
      return key;
    });
    await this.checkRows(conn, pks, this.insertPolicy(), "INSERT");
    const fresh = await this.loadFull(conn, pks);
    for (const row of fresh) await runHooks("afterInsert", this.table, { row, old: null, session: this.session, conn });
    return pks;
  }

  private async loadFull(conn: Queryable, pks: Record<string, unknown>[], forUpdate = false) {
    if (!pks.length) return [];
    const pk = pkOf(this.table);
    const params: unknown[] = [];
    const cond = pks.map((p) => `(${pk.map((c) => { params.push(p[c]); return `${colRef(this.table, c)} = ?`; }).join(" AND ")})`).join(" OR ");
    const rows = await query(conn, `SELECT * FROM ${ident(this.table)} WHERE ${cond}${forUpdate ? " FOR UPDATE" : ""}`, params);
    return rows.map((r) => convertRow(this.table, r));
  }

  private async runInsert(rows: Record<string, unknown>[]): Promise<DbResult<T>> {
    const pks = await withTransaction((conn) => this.insertRows(conn, rows), this.session.conn);
    return this.returning(pks, 201);
  }

  private async updateRows(conn: PoolConnection, olds: Record<string, unknown>[], values: Record<string, unknown>) {
    const pk = pkOf(this.table);
    const kinds = TABLE_COLUMNS[this.table];
    for (const k of Object.keys(values)) {
      if (values[k] !== undefined && !kinds[k]) throw new DbError(`Could not find the '${k}' column of '${this.table}'`, "PGRST204");
    }
    const pks: Record<string, unknown>[] = [];
    for (const old of olds) {
      let row: Record<string, unknown> = { ...old };
      for (const [k, v] of Object.entries(values)) if (v !== undefined) row[k] = v;
      if ("updated_at" in kinds && values.updated_at === undefined) row.updated_at = new Date().toISOString();
      row = await runHooks("beforeUpdate", this.table, { row, old, session: this.session, conn });
      const changed = Object.keys(row).filter((k) => kinds[k] && !k.startsWith("_u_") && JSON.stringify(row[k]) !== JSON.stringify(old[k]));
      const generated = new Set(["total_price", "search_text", "amount"].filter((c) => this.isGenerated(c)));
      const setCols = changed.filter((c) => !generated.has(c));
      const key: Record<string, unknown> = {};
      for (const c of pk) key[c] = old[c];
      pks.push(key);
      if (!setCols.length) continue;
      const params: unknown[] = setCols.map((c) => toDb(kinds[c], row[c]));
      params.push(...pk.map((c) => old[c]));
      await execute(
        conn,
        `UPDATE ${ident(this.table)} SET ${setCols.map((c) => `${ident(c)} = ?`).join(", ")} WHERE ${pk.map((c) => `${ident(c)} = ?`).join(" AND ")}`,
        params,
      );
    }
    await this.checkRows(conn, pks, this.updatePolicy().check, "UPDATE");
    const fresh = await this.loadFull(conn, pks);
    const byKey = new Map(olds.map((o) => [pk.map((c) => String(o[c])).join("\u0001"), o]));
    for (const row of fresh) {
      const old = byKey.get(pk.map((c) => String(row[c])).join("\u0001")) ?? null;
      await runHooks("afterUpdate", this.table, { row, old, session: this.session, conn });
    }
    return pks;
  }

  private isGenerated(column: string) {
    return (
      (this.table === "assets" && (column === "total_price" || column === "search_text")) ||
      (this.table === "supply_request_lines" && column === "amount")
    );
  }

  private async runUpdate(values: Record<string, unknown>): Promise<DbResult<T>> {
    const pks = await withTransaction(async (conn) => {
      const where = this.whereClause(null);
      const using = this.updatePolicy().using;
      const olds = (await query(conn, `SELECT * FROM ${ident(this.table)} WHERE ${where.sql} AND (${using}) FOR UPDATE`, where.params))
        .map((r) => convertRow(this.table, r));
      return this.updateRows(conn, olds, values);
    }, this.session.conn);
    return this.returning(pks, 200);
  }

  private async runDelete(): Promise<DbResult<T>> {
    const pk = pkOf(this.table);
    let returned: Record<string, unknown>[] | null = null;
    const pks = await withTransaction(async (conn) => {
      const where = this.whereClause("delete");
      const olds = (await query(conn, `SELECT * FROM ${ident(this.table)} WHERE ${where.sql} FOR UPDATE`, where.params))
        .map((r) => convertRow(this.table, r));
      if (this.wantReturn && olds.length) {
        returned = await this.fetchRows(this.table, parseSelect(this.selectText ?? "*"), {
          sql: olds.map((o) => `(${pk.map((c) => `${colRef(this.table, c)} = ${escapeLiteral(String(o[c]))}`).join(" AND ")})`).join(" OR "),
          params: [],
        }, [], null, null);
      }
      for (const old of olds) {
        await runHooks("beforeDelete", this.table, { row: old, old, session: this.session, conn });
        await execute(conn, `DELETE FROM ${ident(this.table)} WHERE ${pk.map((c) => `${ident(c)} = ?`).join(" AND ")}`, pk.map((c) => toDb(columnKind(this.table, c), old[c])));
        await runHooks("afterDelete", this.table, { row: null, old, session: this.session, conn });
      }
      return olds.map((o) => Object.fromEntries(pk.map((c) => [c, o[c]])));
    }, this.session.conn);
    if (this.wantReturn) return this.finish(returned ?? [], this.countMode ? pks.length : null);
    return { data: null as unknown as T, error: null, count: this.countMode ? pks.length : null, status: 204, statusText: "No Content" };
  }

  private async runUpsert(op: Extract<Operation, { type: "upsert" }>): Promise<DbResult<T>> {
    const conflict = op.onConflict ?? pkOf(this.table);
    const pks = await withTransaction(async (conn) => {
      const result: Record<string, unknown>[] = [];
      for (const raw of op.rows) {
        const params = conflict.map((c) => toDb(columnKind(this.table, c), raw[c]));
        const cond = conflict.map((c) => (raw[c] === null || raw[c] === undefined ? `${ident(c)} IS NULL` : `${ident(c)} = ?`)).join(" AND ");
        const existing = (await query(conn, `SELECT * FROM ${ident(this.table)} WHERE ${cond} FOR UPDATE`, params.filter((p) => p !== null && p !== undefined)))
          .map((r) => convertRow(this.table, r));
        if (existing.length) {
          if (op.ignoreDuplicates) continue;
          // UPDATE dùng chính sách update
          const using = this.updatePolicy().using;
          if (using !== "1") {
            const pk = pkOf(this.table);
            const ok = await query(conn, `SELECT 1 FROM ${ident(this.table)} WHERE ${pk.map((c) => `${ident(c)} = ?`).join(" AND ")} AND (${using})`, pk.map((c) => existing[0][c]));
            if (!ok.length) throw new DbError(`new row violates row-level security policy for table "${this.table}"`, "42501");
          }
          const values = { ...raw };
          result.push(...(await this.updateRows(conn, existing, values)));
        } else {
          result.push(...(await this.insertRows(conn, [raw])));
        }
      }
      return result;
    }, this.session.conn);
    return this.returning(pks, 201);
  }
}
