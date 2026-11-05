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
      "SELECT COUNT(*) AS n FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = 'admin'",
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
  const pool = getPool();
  let statements = 0;
  for (const file of files) {
    const sql = await readFile(path.join(dir, file), "utf8");
    for (const stmt of splitStatements(sql)) {
      await execute(pool, stmt);
      statements++;
    }
  }
  return { files: files.length, statements };
}

export async function createFirstAdmin(email: string, fullName: string, password: string) {
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
