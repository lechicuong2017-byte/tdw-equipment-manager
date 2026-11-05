import "server-only";
import mysql from "mysql2/promise";
import type { Pool, PoolConnection } from "mysql2/promise";
import { mapMysqlError } from "@/lib/db/sql";

declare global {
  // Giữ một pool duy nhất khi Next.js nạp lại module (dev) hoặc chạy nhiều route.
  var __tdwPool: Pool | undefined;
}

export { hasDatabaseEnv } from "@/lib/db/env";

function createPool() {
  const common = {
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 8),
    maxIdle: 4,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    timezone: "Z" as const,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    charset: "utf8mb4_unicode_ci",
    multipleStatements: false,
  };
  if (process.env.DATABASE_URL?.trim()) {
    return mysql.createPool({ uri: process.env.DATABASE_URL.trim(), ...common });
  }
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ...common,
  });
}

export function getPool(): Pool {
  if (!globalThis.__tdwPool) {
    const pool = createPool();
    pool.on("connection", (conn) => {
      // Lưu và so sánh thời gian theo UTC; chế độ SQL chặt như PostgreSQL.
      conn.query("SET time_zone = '+00:00', sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    });
    globalThis.__tdwPool = pool;
  }
  return globalThis.__tdwPool;
}

export type Queryable = Pool | PoolConnection;

export async function query<T = Record<string, unknown>>(
  db: Queryable,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  try {
    const [rows] = await db.query(sql, params);
    return rows as T[];
  } catch (error) {
    throw mapMysqlError(error);
  }
}

export async function execute(db: Queryable, sql: string, params: unknown[] = []) {
  try {
    const [result] = await db.query(sql, params);
    return result as mysql.ResultSetHeader;
  } catch (error) {
    throw mapMysqlError(error);
  }
}

/** Chạy hàm trong một giao dịch; tự rollback khi lỗi. Lồng nhau thì dùng lại kết nối hiện tại. */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>, existing?: PoolConnection): Promise<T> {
  if (existing) return fn(existing);
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // bỏ qua lỗi rollback, trả lỗi gốc
    }
    throw mapMysqlError(error);
  } finally {
    conn.release();
  }
}
