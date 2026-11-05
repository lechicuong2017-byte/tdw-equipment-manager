"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createFirstAdmin, databaseState, initializeSchema, runSqlText } from "@/lib/db/setup";
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
  const dataFile = formData.get("data_file");
  formData.delete("data_file");
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/setup?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ")}`);
  if (!tokenOk(parsed.data.token)) redirect(`/setup?error=${encodeURIComponent("Mã khởi tạo (SETUP_TOKEN) không đúng")}`);
  let state = await databaseState();
  if (!state.connected) redirect(`/setup?error=${encodeURIComponent("Không kết nối được MariaDB")}`);
  if (state.hasAdmin) redirect("/login");
  if (!state.initialized) await initializeSchema();
  // Dữ liệu chuyển từ Supabase (tệp 05_data.sql tạo bởi tools/mariadb/json-to-mariadb.mjs)
  if (dataFile instanceof File && dataFile.size > 0) {
    const text = await dataFile.text();
    if (!text.includes("REPLACE INTO") || !text.startsWith("-- Dữ liệu chuyển từ Supabase")) {
      redirect(`/setup?error=${encodeURIComponent("Tệp dữ liệu không đúng định dạng 05_data.sql")}`);
    }
    try {
      await runSqlText(text);
    } catch (error) {
      redirect(`/setup?error=${encodeURIComponent(`Nạp dữ liệu lỗi: ${(error as Error).message.slice(0, 200)}`)}`);
    }
  }
  else if (!(await hitRateLimit("setup", 5, 60))) redirect(`/setup?error=${encodeURIComponent("Thử quá nhiều lần")}`);
  state = await databaseState();
  if (!state.hasAdmin) {
    try {
      await createFirstAdmin(parsed.data.email, parsed.data.full_name, parsed.data.password);
    } catch (error) {
      redirect(`/setup?error=${encodeURIComponent((error as Error).message)}`);
    }
  }
  redirect("/login?status=setup-complete");
}
