"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createFirstAdmin, databaseState, initializeSchema } from "@/lib/db/setup";
import { hitRateLimit } from "@/lib/db/auth-core";

const schema = z.object({
  token: z.string().min(1),
  email: z.email().transform((v) => v.trim().toLowerCase()),
  full_name: z.string().trim().min(2).max(120),
  password: z.string().min(12, "Mật khẩu tối thiểu 12 ký tự").max(128),
});

function tokenOk(token: string) {
  const expected = process.env.SETUP_TOKEN || "";
  if (expected.length < 16) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function runSetup(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/setup?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ")}`);
  if (!tokenOk(parsed.data.token)) redirect(`/setup?error=${encodeURIComponent("Mã khởi tạo (SETUP_TOKEN) không đúng")}`);
  let state = await databaseState();
  if (!state.connected) redirect(`/setup?error=${encodeURIComponent("Không kết nối được MariaDB")}`);
  if (state.hasAdmin) redirect("/login");
  if (!state.initialized) await initializeSchema();
  else if (!(await hitRateLimit("setup", 5, 60))) redirect(`/setup?error=${encodeURIComponent("Thử quá nhiều lần")}`);
  state = await databaseState();
  if (!state.hasAdmin) await createFirstAdmin(parsed.data.email, parsed.data.full_name, parsed.data.password);
  redirect("/login?status=setup-complete");
}
