import "server-only";
// Hệ thống đăng nhập thay Supabase Auth: mật khẩu, phiên cookie, MFA TOTP, mã mời/đặt lại mật khẩu.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";
import { execute, getPool, query, withTransaction } from "@/lib/db/pool";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

export const SESSION_COOKIE = "tdw_session";
export const SESSION_TTL_DAYS = 7;

export type AuthUser = {
  id: string;
  email: string;
  password_hash: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  raw_user_meta_data: string | Record<string, unknown>;
};

export type SessionRow = { id: string; user_id: string; aal: "aal1" | "aal2"; expires_at: string; email: string };

// ------------------------------- mật khẩu -------------------------------

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const hash = await scryptAsync(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  if (stored.startsWith("scrypt$")) {
    const [, N, r, p, salt, hash] = stored.split("$");
    const expected = Buffer.from(hash, "base64");
    const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    return timingSafeEqual(expected, actual);
  }
  if (/^\$2[aby]\$/.test(stored)) return bcrypt.compare(password, stored); // hash chuyển từ Supabase Auth
  return false;
}

// ------------------------------- phiên -------------------------------

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function createSession(userId: string, meta: { userAgent?: string | null; ip?: string | null } = {}) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000);
  await execute(
    getPool(),
    "INSERT INTO auth_sessions (id, user_id, aal, expires_at, user_agent, ip) VALUES (?, ?, 'aal1', ?, ?, ?)",
    [sha256(token), userId, expires.toISOString().replace("T", " ").replace("Z", ""), meta.userAgent?.slice(0, 500) ?? null, meta.ip ?? null],
  );
  await execute(getPool(), "UPDATE auth_users SET last_sign_in_at = UTC_TIMESTAMP(6) WHERE id = ?", [userId]);
  // dọn phiên hết hạn
  await execute(getPool(), "DELETE FROM auth_sessions WHERE expires_at < UTC_TIMESTAMP(6) LIMIT 200");
  return { token, expires };
}

export async function readSession(token: string | undefined | null): Promise<SessionRow | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const rows = await query<SessionRow>(
    getPool(),
    `SELECT s.id, s.user_id, s.aal, s.expires_at, u.email FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > UTC_TIMESTAMP(6) AND (u.banned_until IS NULL OR u.banned_until < UTC_TIMESTAMP(6))`,
    [sha256(token)],
  );
  const session = rows[0] ?? null;
  if (session) {
    // gia hạn trượt: chỉ ghi khi đã qua 1 giờ để giảm tải
    await execute(
      getPool(),
      `UPDATE auth_sessions SET last_seen_at = UTC_TIMESTAMP(6), expires_at = UTC_TIMESTAMP(6) + INTERVAL ${SESSION_TTL_DAYS} DAY
       WHERE id = ? AND last_seen_at < UTC_TIMESTAMP(6) - INTERVAL 1 HOUR`,
      [session.id],
    );
  }
  return session;
}

export async function destroySession(token: string | undefined | null, scope: "local" | "global" = "local") {
  if (!token) return;
  if (scope === "global") {
    const [s] = await query<{ user_id: string }>(getPool(), "SELECT user_id FROM auth_sessions WHERE id = ?", [sha256(token)]);
    if (s) await execute(getPool(), "DELETE FROM auth_sessions WHERE user_id = ?", [s.user_id]);
    return;
  }
  await execute(getPool(), "DELETE FROM auth_sessions WHERE id = ?", [sha256(token)]);
}

export async function setSessionAal(token: string, aal: "aal1" | "aal2") {
  await execute(getPool(), "UPDATE auth_sessions SET aal = ? WHERE id = ?", [aal, sha256(token)]);
}

// ------------------------------- giới hạn thử -------------------------------

/** true nếu còn được phép; mặc định 10 lần / 15 phút cho mỗi khoá */
export async function hitRateLimit(bucket: string, max = 10, windowMinutes = 15) {
  const pool = getPool();
  await execute(
    pool,
    `INSERT INTO auth_rate_limits (bucket, window_start, hits) VALUES (?, UTC_TIMESTAMP(6), 1)
     ON DUPLICATE KEY UPDATE
       hits = IF(window_start < UTC_TIMESTAMP(6) - INTERVAL ${windowMinutes} MINUTE, 1, hits + 1),
       window_start = IF(window_start < UTC_TIMESTAMP(6) - INTERVAL ${windowMinutes} MINUTE, UTC_TIMESTAMP(6), window_start)`,
    [bucket.slice(0, 255)],
  );
  const [row] = await query<{ hits: number }>(pool, "SELECT hits FROM auth_rate_limits WHERE bucket = ?", [bucket.slice(0, 255)]);
  return Number(row?.hits ?? 0) <= max;
}

// ------------------------------- người dùng -------------------------------

export async function findUserByEmail(email: string) {
  const rows = await query<AuthUser>(getPool(), "SELECT * FROM auth_users WHERE email = ?", [email.trim().toLowerCase()]);
  return rows[0] ?? null;
}

/** Tạo tài khoản + hồ sơ + vai trò viewer (handle_new_auth_user) */
export async function createUser(email: string, fullName: string) {
  const id = randomUUID();
  const normalized = email.trim().toLowerCase();
  await withTransaction(async (conn) => {
    await execute(conn, "INSERT INTO auth_users (id, email, raw_user_meta_data) VALUES (?, ?, ?)", [
      id, normalized, JSON.stringify({ full_name: fullName }),
    ]);
    await execute(conn, "INSERT INTO profiles (id, email, full_name) VALUES (?, ?, ?)", [id, normalized, fullName]);
    const [viewer] = await query<{ id: string }>(conn, "SELECT id FROM roles WHERE code = 'viewer'");
    if (viewer) await execute(conn, "INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)", [id, viewer.id]);
  });
  return id;
}

export async function setPassword(userId: string, password: string) {
  await execute(getPool(), "UPDATE auth_users SET password_hash = ?, email_confirmed_at = COALESCE(email_confirmed_at, UTC_TIMESTAMP(6)) WHERE id = ?", [
    await hashPassword(password),
    userId,
  ]);
}

export async function createOneTimeToken(userId: string, purpose: "invite" | "recovery", hours = purpose === "invite" ? 72 : 2) {
  const token = randomBytes(32).toString("base64url");
  await execute(getPool(), "DELETE FROM auth_one_time_tokens WHERE user_id = ? AND purpose = ? AND used_at IS NULL", [userId, purpose]);
  await execute(
    getPool(),
    `INSERT INTO auth_one_time_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, UTC_TIMESTAMP(6) + INTERVAL ${hours} HOUR)`,
    [sha256(token), userId, purpose],
  );
  return token;
}

export async function consumeOneTimeToken(token: string, purpose: string) {
  return withTransaction(async (conn) => {
    const [row] = await query<{ user_id: string }>(
      conn,
      "SELECT user_id FROM auth_one_time_tokens WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP(6) FOR UPDATE",
      [sha256(token), purpose],
    );
    if (!row) return null;
    await execute(conn, "UPDATE auth_one_time_tokens SET used_at = UTC_TIMESTAMP(6) WHERE token_hash = ?", [sha256(token)]);
    await execute(conn, "UPDATE auth_users SET email_confirmed_at = COALESCE(email_confirmed_at, UTC_TIMESTAMP(6)) WHERE id = ?", [row.user_id]);
    return row.user_id;
  });
}

// ------------------------------- TOTP (MFA) -------------------------------

function encryptionKey() {
  const raw = process.env.AUTH_ENCRYPTION_KEY || process.env.SOFTWARE_LICENSE_ENCRYPTION_KEY || "";
  if (raw.length < 32) throw new Error("AUTH_ENCRYPTION_KEY chưa được cấu hình (tối thiểu 32 ký tự).");
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${data.toString("base64")}`;
}

export function decryptSecret(stored: string) {
  if (!stored.startsWith("v1.")) return stored; // secret chuyển từ Supabase (chưa mã hoá)
  const [, iv, tag, data] = stored.split(".");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string) {
  const clean = text.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpCode(secretBase32: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const bin = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

/** Trả về bước thời gian khớp (để chống dùng lại), hoặc null */
export function verifyTotp(secretBase32: string, code: string, lastUsedStep: number | null) {
  if (!/^\d{6}$/.test(code)) return null;
  const now = Math.floor(Date.now() / 30_000);
  for (const delta of [0, -1, 1]) {
    const step = now + delta;
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = totpCode(secretBase32, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return step;
  }
  return null;
}

export function newTotpSecret() {
  return base32Encode(randomBytes(20));
}
