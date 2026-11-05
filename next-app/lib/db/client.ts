import "server-only";
// Đối tượng thay thế client Supabase: { from, rpc, auth, storage } chạy trên MariaDB.

import { cookies, headers } from "next/headers";
import { QueryBuilder, type DbResult, type Session } from "@/lib/db/builder";
import { RpcQuery } from "@/lib/db/rpc-query";
import { getPool, query, withTransaction } from "@/lib/db/pool";
import { DbError } from "@/lib/db/sql";
import { PolicyFragments, type AccessContext, type ScopeRow } from "@/lib/db/policy-fragments";
import { storageClient } from "@/lib/db/storage";
import * as core from "@/lib/db/auth-core";
import { sendAuthEmail } from "@/lib/db/mailer";
import { callRpc } from "@/lib/db/rpc";

const ALL_MODULES = ["equipment", "vehicles", "supplies", "telecom", "surveys", "it_costs"];

export async function loadAccessContext(userId: string, aal: "aal1" | "aal2"): Promise<AccessContext> {
  const pool = getPool();
  const [profile] = await query<{ active: number }>(pool, "SELECT active FROM profiles WHERE id = ?", [userId]);
  const roles = await query<{ code: string; id: string }>(
    pool,
    "SELECT r.code, r.id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?",
    [userId],
  );
  const nonAdminRoleIds = roles.filter((r) => r.code !== "admin").map((r) => r.id);
  const perms = nonAdminRoleIds.length
    ? await query<{ permission_code: string }>(
        pool,
        `SELECT DISTINCT permission_code FROM role_permissions WHERE role_id IN (${nonAdminRoleIds.map(() => "?").join(",")})`,
        nonAdminRoleIds,
      )
    : [];
  const modules = await query<{ module: string }>(pool, "SELECT module FROM user_module_access WHERE user_id = ? ORDER BY module", [userId]);
  const scopes = await query<ScopeRow>(pool, "SELECT module, scope_type, department_id FROM data_access_scopes WHERE user_id = ?", [userId]);
  return {
    userId,
    aal,
    active: Boolean(Number(profile?.active ?? 0)),
    roles: roles.map((r) => r.code),
    rolePermissions: perms.map((p) => p.permission_code),
    modules: modules.map((m) => m.module),
    scopes,
  };
}

/** Quyền đầy đủ của tài khoản như RPC get_my_access cũ */
export async function getMyAccess(ctx: AccessContext) {
  const pool = getPool();
  const [p] = await query<{ id: string; email: string; full_name: string; active: number; must_enroll_mfa: number }>(
    pool,
    "SELECT id, email, full_name, active, must_enroll_mfa FROM profiles WHERE id = ? AND active",
    [ctx.userId],
  );
  if (!p) return null;
  const isAdminRole = ctx.roles.includes("admin");
  let permissions: string[];
  if (isAdminRole) {
    const all = await query<{ permission_code: string }>(
      pool,
      `SELECT DISTINCT rp.permission_code FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id WHERE ur.user_id = ?`,
      [ctx.userId],
    );
    permissions = all.map((r) => r.permission_code);
  } else {
    const { permissionSystemModule } = await import("@/lib/db/policy-fragments");
    permissions = [...new Set(ctx.rolePermissions.filter((perm) => ctx.modules.includes(permissionSystemModule(perm))))];
  }
  return {
    user_id: p.id,
    email: p.email,
    full_name: p.full_name,
    active: Boolean(Number(p.active)),
    must_enroll_mfa: Boolean(Number(p.must_enroll_mfa)),
    roles: [...new Set(ctx.roles)],
    modules: isAdminRole ? ALL_MODULES : ctx.modules,
    permissions,
  };
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

function ok<T>(data: T) {
  return { data, error: null };
}
function fail(message: string, status = 400, code = "auth_error") {
  const error = new DbError(message, code) as DbError & { status: number };
  error.status = status;
  return { data: null, error };
}

export type DbClient = ReturnType<typeof makeClient>;

function makeClient(session: Session, cookieStore: CookieStore | null, sessionToken: string | null) {
  /** Sau khi đăng nhập trong cùng request, nâng client lên phiên người dùng mới */
  const adopt = async (userId: string, token: string) => {
    const ctx = await loadAccessContext(userId, "aal1");
    Object.assign(session, { mode: "user", userId, fragments: new PolicyFragments(ctx), aal: "aal1", access: ctx });
    sessionToken = token;
  };
  const client = {
    session,
    from<Row = any>(table: string) {
      return new QueryBuilder<Row[]>(session, table);
    },
    rpc<T = any>(name: string, args: Record<string, unknown> = {}) {
      const run = async (): Promise<DbResult<unknown>> => {
        try {
          const data = await callRpc(name, args, { session, client });
          return { data, error: null, count: null, status: 200, statusText: "OK" };
        } catch (error) {
          const e = error instanceof DbError ? error : new DbError(String((error as Error)?.message ?? error), "P0001");
          console.error(`[rpc] ${name}: ${e.code} ${e.message}`);
          return { data: null, error: e, count: null, status: 400, statusText: "Bad Request" };
        }
      };
      return new RpcQuery<T>(run());
    },
    storage: storageClient(session),
    auth: {
      async getClaims() {
        if (!session.userId) return { data: null, error: null };
        const [u] = await query<{ email: string }>(getPool(), "SELECT email FROM auth_users WHERE id = ?", [session.userId]);
        return {
          data: { claims: { sub: session.userId, email: u?.email ?? "", aal: session.fragments ? (session as Session & { aal?: string }).aal ?? "aal1" : "aal1", role: "authenticated" } },
          error: null,
        };
      },
      async getUser() {
        if (!session.userId) return { data: { user: null }, error: null };
        const [u] = await query<{ id: string; email: string }>(getPool(), "SELECT id, email FROM auth_users WHERE id = ?", [session.userId]);
        return { data: { user: u ? { id: u.id, email: u.email } : null }, error: null };
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const h = await headers().catch(() => null);
        const ip = h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h?.get("x-real-ip") ?? "unknown";
        const normalized = String(email).trim().toLowerCase();
        if (!(await core.hitRateLimit(`login:${normalized}`, 10)) || !(await core.hitRateLimit(`login-ip:${ip}`, 30))) {
          return fail("Too many requests", 429, "over_request_rate_limit");
        }
        const user = await core.findUserByEmail(normalized);
        const valid = user && (await core.verifyPassword(password, user.password_hash));
        if (!user || !valid) return fail("Invalid login credentials", 400, "invalid_credentials");
        if (user.banned_until && new Date(user.banned_until.replace(" ", "T") + "Z") > new Date()) {
          return fail("User is banned", 400, "user_banned");
        }
        const { token, expires } = await core.createSession(user.id, { userAgent: h?.get("user-agent"), ip });
        cookieStore?.set(core.SESSION_COOKIE, token, cookieOptions(expires));
        await adopt(user.id, token);
        return ok({ user: { id: user.id, email: user.email }, session: { access_token: "", expires_at: expires.getTime() / 1000 } });
      },
      async signOut(options: { scope?: "local" | "global" | "others" } = {}) {
        await core.destroySession(sessionToken, options.scope === "global" ? "global" : "local");
        Object.assign(session, { mode: "anon", userId: null, fragments: null, aal: "aal1", access: undefined });
        try {
          cookieStore?.delete(core.SESSION_COOKIE);
        } catch {
          // Server Component không ghi cookie được; phiên đã bị xoá phía DB
        }
        return { error: null };
      },
      async updateUser(attrs: { password?: string; data?: Record<string, unknown> }) {
        if (!session.userId) return fail("Not authenticated", 401);
        if (attrs.password) {
          if (attrs.password.length < 8) return fail("Password should be at least 8 characters", 422, "weak_password");
          await core.setPassword(session.userId, attrs.password);
        }
        return ok({ user: { id: session.userId } });
      },
      async resetPasswordForEmail(email: string, options: { redirectTo?: string } = {}) {
        const user = await core.findUserByEmail(email);
        if (!(await core.hitRateLimit(`recovery:${String(email).toLowerCase()}`, 5, 60))) return fail("Too many requests", 429);
        if (!user) return ok({}); // không tiết lộ email có tồn tại hay không
        const token = await core.createOneTimeToken(user.id, "recovery");
        await sendAuthEmail("recovery", user.email, token, options.redirectTo);
        return ok({});
      },
      async verifyOtp({ token_hash, type }: { token_hash: string; type: string }) {
        const purpose = type === "invite" || type === "signup" ? "invite" : type === "recovery" ? "recovery" : null;
        if (!purpose) return fail("Unsupported OTP type");
        const userId = await core.consumeOneTimeToken(token_hash, purpose);
        if (!userId) return fail("Token has expired or is invalid", 403, "otp_expired");
        const { token, expires } = await core.createSession(userId);
        cookieStore?.set(core.SESSION_COOKIE, token, cookieOptions(expires));
        await adopt(userId, token);
        return ok({ user: { id: userId } });
      },
      async exchangeCodeForSession(code: string) {
        // Luồng PKCE của Supabase không còn dùng; coi mã như token_hash đặt lại mật khẩu
        return client.auth.verifyOtp({ token_hash: code, type: "recovery" });
      },
      mfa: {
        async getAuthenticatorAssuranceLevel() {
          const aal = (session as Session & { aal?: string }).aal ?? "aal1";
          const factors = session.userId
            ? await query(getPool(), "SELECT 1 FROM auth_mfa_factors WHERE user_id = ? AND status = 'verified' LIMIT 1", [session.userId])
            : [];
          return ok({ currentLevel: aal, nextLevel: factors.length ? "aal2" : aal });
        },
      },
      admin: {
        async inviteUserByEmail(email: string, options: { data?: { full_name?: string }; redirectTo?: string } = {}) {
          if (session.mode !== "service") return fail("Not allowed", 403);
          const normalized = String(email).trim().toLowerCase();
          let user = await core.findUserByEmail(normalized);
          if (user?.password_hash) return fail("A user with this email address has already been registered", 422, "email_exists");
          const userId = user?.id ?? (await core.createUser(normalized, options.data?.full_name ?? ""));
          const token = await core.createOneTimeToken(userId, "invite");
          const link = await sendAuthEmail("invite", normalized, token, options.redirectTo);
          user = user ?? (await core.findUserByEmail(normalized));
          return ok({ user: { id: userId, email: normalized }, link });
        },
      },
    },
  };
  return client;
}

/** Client theo người đăng nhập (đọc cookie phiên) — thay createClient() của @/lib/supabase/server */
export async function createUserDb() {
  const cookieStore = await cookies();
  const token = cookieStore.get(core.SESSION_COOKIE)?.value ?? null;
  const row = await core.readSession(token).catch(() => null);
  if (!row) {
    return makeClient({ mode: "anon", userId: null, fragments: null }, cookieStore, token);
  }
  const ctx = await loadAccessContext(row.user_id, row.aal);
  const session: Session & { aal: string; access: AccessContext } = {
    mode: "user",
    userId: row.user_id,
    fragments: new PolicyFragments(ctx),
    aal: row.aal,
    access: ctx,
  };
  return makeClient(session, cookieStore, token);
}

/** Bỏ qua RLS — thay createAdminClient() (service_role) */
export function createServiceDb(actorUserId: string | null = null) {
  return makeClient({ mode: "service", userId: actorUserId, fragments: null }, null, null);
}

/** Khách chưa đăng nhập (khảo sát công khai) */
export function createAnonDb() {
  return makeClient({ mode: "anon", userId: null, fragments: null }, null, null);
}

export { withTransaction };
