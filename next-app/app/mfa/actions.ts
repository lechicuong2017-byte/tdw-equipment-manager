"use server";

import { cookies } from "next/headers";
import QRCode from "qrcode";
import { requireAccess } from "@/lib/auth";
import { getPool, query, execute } from "@/lib/db/pool";
import { SESSION_COOKIE, decryptSecret, encryptSecret, newTotpSecret, setSessionAal, verifyTotp, hitRateLimit } from "@/lib/db/auth-core";

export type MfaPrepareResult =
  | { kind: "enroll"; factorId: string; qrCode: string; secret: string }
  | { kind: "challenge"; factorId: string }
  | { kind: "error"; message: string };

/** Có factor đã xác minh -> yêu cầu nhập mã; chưa có -> tạo factor mới kèm QR */
export async function prepareMfa(): Promise<MfaPrepareResult> {
  const { access } = await requireAccess({ allowAal1: true });
  const pool = getPool();
  const [verified] = await query<{ id: string }>(pool, "SELECT id FROM auth_mfa_factors WHERE user_id = ? AND status = 'verified' ORDER BY created_at LIMIT 1", [access.user_id]);
  if (verified) return { kind: "challenge", factorId: verified.id };
  await execute(pool, "DELETE FROM auth_mfa_factors WHERE user_id = ? AND status <> 'verified'", [access.user_id]);
  const secret = newTotpSecret();
  const factorId = crypto.randomUUID();
  await execute(pool, "INSERT INTO auth_mfa_factors (id, user_id, friendly_name, secret_encrypted) VALUES (?, ?, ?, ?)", [
    factorId, access.user_id, "TDW Equipment Manager", encryptSecret(secret),
  ]);
  const issuer = "TDW Quản lý";
  const uri = `otpauth://totp/${encodeURIComponent(`${issuer}:${access.email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  const qrCode = await QRCode.toDataURL(uri, { margin: 1, width: 210 });
  return { kind: "enroll", factorId, qrCode, secret };
}

export async function verifyMfa(factorId: string, code: string): Promise<{ error?: string }> {
  const { access } = await requireAccess({ allowAal1: true });
  if (!/^\d{6}$/.test(code)) return { error: "Mã xác thực phải gồm 6 chữ số." };
  if (!(await hitRateLimit(`mfa:${access.user_id}`, 8, 10))) return { error: "Bạn đã thử quá nhiều lần. Vui lòng chờ ít phút." };
  const pool = getPool();
  const [factor] = await query<{ id: string; secret_encrypted: string; status: string; last_used_step: string | null }>(
    pool,
    "SELECT id, secret_encrypted, status, last_used_step FROM auth_mfa_factors WHERE id = ? AND user_id = ?",
    [factorId, access.user_id],
  );
  if (!factor) return { error: "Không tìm thấy cấu hình xác thực." };
  const step = verifyTotp(decryptSecret(factor.secret_encrypted), code, factor.last_used_step === null ? null : Number(factor.last_used_step));
  if (step === null) return { error: "Mã không đúng hoặc đã hết hạn." };
  await execute(pool, "UPDATE auth_mfa_factors SET status = 'verified', last_used_step = ? WHERE id = ?", [step, factor.id]);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await setSessionAal(token, "aal2");
  return {};
}
