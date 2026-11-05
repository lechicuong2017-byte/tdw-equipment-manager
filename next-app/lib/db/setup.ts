import "server-only";
// Khởi tạo CSDL lần đầu trên hosting: chạy các file db/*.sql và tạo tài khoản quản trị đầu tiên.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { getPool, query, withTransaction, execute } from "@/lib/db/pool";
import { createUser, setPassword } from "@/lib/db/auth-core";

export async function databaseState() {
  try {
    const tables = await query<{ n: number }>(getPool(), "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()");
    const count = Number(tables[0]?.n ?? 0);
    if (count === 0) return { connected: true, initialized: false, hasAdmin: false } as const;
    const admins = await query<{ n: number }>(
      getPool(),
      `SELECT COUNT(*) AS n FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       JOIN auth_users u ON u.id = ur.user_id WHERE r.code = 'admin' AND u.password_hash IS NOT NULL`,
    ).catch(() => [{ n: 0 }]);
    return { connected: true, initialized: true, hasAdmin: Number(admins[0]?.n ?? 0) > 0 } as const;
  } catch (error) {
    return { connected: false, initialized: false, hasAdmin: false, error: (error as Error).message } as const;
  }
}

function splitStatements(sql: string) {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      cur += ch;
      if (ch === "\\") { cur += sql[++i] ?? ""; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; cur += ch; continue; }
    if (ch === "-" && sql[i + 1] === "-") { while (i < sql.length && sql[i] !== "\n") i++; cur += "\n"; continue; }
    if (ch === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export async function initializeSchema() {
  const dir = path.join(process.cwd(), "db");
  const files = (await readdir(dir)).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  // Một kết nối duy nhất: các lệnh SET (FOREIGN_KEY_CHECKS...) có hiệu lực theo phiên
  const conn = await getPool().getConnection();
  let statements = 0;
  try {
    for (const file of files) {
      const sql = await readFile(path.join(dir, file), "utf8");
      for (const stmt of splitStatements(sql)) {
        await execute(conn, stmt);
        statements++;
      }
    }
  } finally {
    conn.release();
  }
  return { files: files.length, statements };
}

/**
 * Tài khoản đã chuyển từ Supabase (không mang theo mật khẩu): đặt mật khẩu mới cho quản trị viên có sẵn.
 * Chưa có tài khoản: tạo quản trị viên mới.
 */
export async function createFirstAdmin(email: string, fullName: string, password: string) {
  const [existing] = await query<{ id: string; is_admin: number }>(
    getPool(),
    `SELECT u.id, EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = 'admin') AS is_admin
     FROM auth_users u WHERE u.email = ?`,
    [email],
  );
  if (existing) {
    if (!Number(existing.is_admin)) throw new Error("Email này không phải quản trị viên trong dữ liệu đã chuyển.");
    await setPassword(existing.id, password);
    return existing.id;
  }
  const userId = await createUser(email, fullName);
  await setPassword(userId, password);
  await withTransaction(async (conn) => {
    await execute(conn, "DELETE FROM user_roles WHERE user_id = ?", [userId]);
    await execute(conn, "INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'admin'", [userId]);
    for (const module of ["equipment", "vehicles", "supplies", "telecom", "surveys", "it_costs"]) {
      await execute(conn, "INSERT IGNORE INTO user_module_access (user_id, module, created_by) VALUES (?, ?, ?)", [userId, module, userId]);
    }
  });
  return userId;
}
