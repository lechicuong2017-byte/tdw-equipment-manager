"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email("Email không hợp lệ").transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự"),
  next: z.string().optional(),
});

export type LoginState = {
  error?: string;
};

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Thông tin đăng nhập chưa hợp lệ" };
  }

  const supabase = await createClient();
  let signInError: { status?: number } | null = null;

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    signInError = error;
  } catch {
    return {
      error: "Không thể kết nối dịch vụ đăng nhập. Vui lòng thử lại.",
    };
  }

  if (signInError?.status === 429) {
    return {
      error: "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ một lúc rồi thử lại.",
    };
  }

  if (signInError) {
    return { error: "Email hoặc mật khẩu không đúng." };
  }

  // Let a possible token refresh finish before the access RPC uses the token.
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      error: "Không thể tạo phiên đăng nhập an toàn. Vui lòng thử lại.",
    };
  }

  const accessResult = await supabase.rpc("get_my_access");
  if (accessResult.error || !accessResult.data) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      error: "Tài khoản chưa được kích hoạt hoặc đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.",
    };
  }

  const destination =
    parsed.data.next?.startsWith("/") && !parsed.data.next.startsWith("//")
      ? parsed.data.next
      : "/modules";
  redirect(destination);
}
