// Kết quả RPC trả về tập bản ghi có thể lọc/sắp xếp tiếp như PostgREST:
// supabase.rpc("x").order("a").range(0, 19). Thao tác được áp trong bộ nhớ.

import type { DbResult } from "@/lib/db/builder";

type Row = Record<string, unknown>;
type Op = (rows: Row[]) => Row[];

function compare(a: unknown, b: unknown) {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export class RpcQuery<T = any> implements PromiseLike<DbResult<T>> {
  private ops: Op[] = [];
  private window: { from: number; to: number | null } | null = null;
  private orders: { column: string; ascending: boolean }[] = [];
  private mode: "single" | "maybe" | null = null;
  private countRequested = false;

  constructor(private readonly source: Promise<DbResult<unknown>>) {}

  select(_columns?: string, options: { count?: string } = {}) {
    if (options.count) this.countRequested = true;
    return this;
  }
  private filter(fn: (r: Row) => boolean) {
    this.ops.push((rows) => rows.filter(fn));
    return this;
  }
  eq(c: string, v: unknown) { return this.filter((r) => r[c] === v); }
  neq(c: string, v: unknown) { return this.filter((r) => r[c] !== v); }
  gt(c: string, v: unknown) { return this.filter((r) => compare(r[c], v) > 0); }
  gte(c: string, v: unknown) { return this.filter((r) => compare(r[c], v) >= 0); }
  lt(c: string, v: unknown) { return this.filter((r) => compare(r[c], v) < 0); }
  lte(c: string, v: unknown) { return this.filter((r) => compare(r[c], v) <= 0); }
  in(c: string, values: readonly unknown[]) { const set = new Set(values); return this.filter((r) => set.has(r[c])); }
  is(c: string, v: unknown) { return this.filter((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); }
  ilike(c: string, pattern: string) {
    const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "i");
    return this.filter((r) => re.test(String(r[c] ?? "")));
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.window = { from: this.window?.from ?? 0, to: (this.window?.from ?? 0) + n - 1 };
    return this;
  }
  range(from: number, to: number) {
    this.window = { from, to };
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  private async run(): Promise<DbResult<T>> {
    const result = await this.source;
    if (result.error || !Array.isArray(result.data)) return result as DbResult<T>;
    let rows = result.data as Row[];
    for (const op of this.ops) rows = op(rows);
    const count = rows.length;
    if (this.orders.length) {
      rows = [...rows].sort((a, b) => {
        for (const o of this.orders) {
          const d = compare(a[o.column], b[o.column]);
          if (d !== 0) return o.ascending ? d : -d;
        }
        return 0;
      });
    }
    if (this.window) rows = rows.slice(this.window.from, this.window.to === null ? undefined : this.window.to + 1);
    const base = { error: null, count: this.countRequested ? count : null, status: 200, statusText: "OK" } as const;
    if (this.mode) {
      if (rows.length === 1) return { ...base, data: rows[0] as T };
      if (rows.length === 0 && this.mode === "maybe") return { ...base, data: null as T };
      return result.data.length === 0 && this.mode === "maybe"
        ? { ...base, data: null as T }
        : ({ data: null, error: Object.assign(new Error("JSON object requested, multiple (or no) rows returned"), { code: "PGRST116", details: null, hint: null }), count: null, status: 406, statusText: "Not Acceptable" } as unknown as DbResult<T>);
    }
    return { ...base, data: rows as T };
  }

  then<R1 = DbResult<T>, R2 = never>(
    onfulfilled?: ((value: DbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }
}
