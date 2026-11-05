import "server-only";
import type { PoolConnection } from "mysql2/promise";
import { QueryBuilder, type Session } from "@/lib/db/builder";
import { execute, getPool, query, withTransaction, type Queryable } from "@/lib/db/pool";
import { DbError, escapeLiteral } from "@/lib/db/sql";
import { convertRow } from "@/lib/db/convert";

export type RpcContext = { session: Session };
export type RpcHandler = (args: Record<string, any>, ctx: RpcContext) => Promise<unknown>;

/** Lỗi giống RAISE EXCEPTION ... USING errcode */
export function raise(message: string, code = "P0001"): never {
  throw new DbError(message, code);
}

export function uid(ctx: RpcContext) {
  return ctx.session.userId;
}

export function requireUid(ctx: RpcContext) {
  if (!ctx.session.userId) raise("Authentication required", "42501");
  return ctx.session.userId!;
}

const isService = (ctx: RpcContext) => ctx.session.mode === "service";

export function isAdmin(ctx: RpcContext) {
  return isService(ctx) || Boolean(ctx.session.fragments?.isAdminBool);
}

export function hasPermission(ctx: RpcContext, permission: string) {
  return isService(ctx) || Boolean(ctx.session.fragments?.hasPermissionBool(permission));
}

export function hasRole(ctx: RpcContext, role: string) {
  return Boolean(ctx.session.fragments?.hasRole(role));
}

export function hasModule(ctx: RpcContext, module: string) {
  return isService(ctx) || Boolean(ctx.session.fragments?.hasModuleBool(module));
}

async function evalBool(db: Queryable, sql: string) {
  if (sql === "1") return true;
  if (sql === "0") return false;
  const rows = await query<{ ok: number }>(db, `SELECT (${sql}) AS ok`);
  return Boolean(Number(rows[0]?.ok));
}

export async function canAccessAsset(ctx: RpcContext, db: Queryable, assetId: unknown, module: string, permission: string) {
  if (isService(ctx)) return true;
  const f = ctx.session.fragments;
  if (!f || !assetId) return false;
  return evalBool(db, f.canAccessAsset(escapeLiteral(String(assetId)), module, permission));
}

export async function canAccessVehicle(ctx: RpcContext, db: Queryable, vehicleId: unknown, permission: string) {
  if (isService(ctx)) return true;
  const f = ctx.session.fragments;
  if (!f || !vehicleId) return false;
  return evalBool(db, f.canAccessVehicle(escapeLiteral(String(vehicleId)), permission));
}

export async function canAccessSoftwareLicense(ctx: RpcContext, db: Queryable, licenseId: unknown, permission: string) {
  if (isService(ctx)) return true;
  const f = ctx.session.fragments;
  if (!f || !licenseId) return false;
  return evalBool(db, f.canAccessSoftwareLicense(escapeLiteral(String(licenseId)), permission));
}

export async function assetScopeMatches(ctx: RpcContext, db: Queryable, assetId: unknown, module: string) {
  if (isService(ctx)) return true;
  const f = ctx.session.fragments;
  if (!f || !assetId) return false;
  return evalBool(db, f.assetScopeMatches(escapeLiteral(String(assetId)), module));
}

export async function canCreateForDepartment(ctx: RpcContext, db: Queryable, departmentId: unknown, module: string, permission: string) {
  if (isService(ctx)) return true;
  const f = ctx.session.fragments;
  if (!f) return false;
  return evalBool(db, f.canCreateForDepartment(departmentId ? escapeLiteral(String(departmentId)) : "NULL", module, permission));
}

export async function supplyRequestScopeMatches(ctx: RpcContext, db: Queryable, requestId: unknown) {
  if (isService(ctx)) return true;
  const f = ctx.session.fragments;
  if (!f) return false;
  return evalBool(db, f.supplyRequestScopeMatches(escapeLiteral(String(requestId))));
}

/**
 * Bảng "nhìn thấy được" theo RLS — dùng cho hàm SQL không SECURITY DEFINER
 * (chạy với quyền người gọi). Trả về biểu thức FROM: `(SELECT * FROM t WHERE policy)`.
 */
export function visible(ctx: RpcContext, table: string) {
  if (isService(ctx)) return `\`${table}\``;
  const qb = new QueryBuilder({ ...ctx.session }, table) as unknown as { policy(kind: "select"): string };
  return `(SELECT * FROM \`${table}\` WHERE ${qb.policy("select")})`;
}

/** Giao dịch với các hàm tiện ích; ghi qua builder chế độ service để chạy hook + nhật ký */
export async function tx<T>(ctx: RpcContext, fn: (t: Tx) => Promise<T>): Promise<T> {
  return withTransaction(async (conn) => fn(new Tx(conn, ctx)));
}

export class Tx {
  constructor(public readonly conn: PoolConnection, public readonly ctx: RpcContext) {}

  get session(): Session {
    return { mode: "service", userId: this.ctx.session.userId, fragments: null, conn: this.conn };
  }

  table<Row = any>(name: string) {
    return new QueryBuilder<Row[]>(this.session, name);
  }

  async rows<T = Record<string, unknown>>(sql: string, params: unknown[] = [], table?: string): Promise<T[]> {
    const rows = await query(this.conn, sql, params);
    return (table ? rows.map((r) => convertRow(table, r)) : rows) as T[];
  }

  async one<T = Record<string, unknown>>(sql: string, params: unknown[] = [], table?: string): Promise<T | null> {
    return (await this.rows<T>(sql, params, table))[0] ?? null;
  }

  exec(sql: string, params: unknown[] = []) {
    return execute(this.conn, sql, params);
  }

  /** Chèn qua builder (hook + audit); trả về bản ghi đầy đủ */
  async insert<T = Record<string, any>>(table: string, row: Record<string, unknown>): Promise<T> {
    const r = await this.table(table).insert(row).select("*").single();
    if (r.error) throw r.error;
    return r.data as T;
  }

  async insertMany(table: string, rows: Record<string, unknown>[]) {
    if (!rows.length) return [];
    const r = await this.table(table).insert(rows).select("*");
    if (r.error) throw r.error;
    return r.data as Record<string, any>[];
  }

  /** Cập nhật theo điều kiện bằng (cột = giá trị); trả về số dòng */
  async update(table: string, values: Record<string, unknown>, match: Record<string, unknown>, extra?: (q: QueryBuilder) => QueryBuilder) {
    let q = this.table(table).update(values).match(match);
    if (extra) q = extra(q);
    const r = await q.select("*");
    if (r.error) throw r.error;
    return (r.data as unknown[]).length;
  }

  async delete(table: string, match: Record<string, unknown>) {
    const r = await this.table(table).delete().match(match).select("*");
    if (r.error) throw r.error;
    return (r.data as unknown[]).length;
  }
}

export async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return query<T>(getPool(), sql, params);
}

/** btrim(coalesce(x, '')) */
export function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function vnToday() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function num(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
