"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";
import { getSupabaseEnv } from "@/lib/env";

const changePasswordSchema = z
  .object({
    current_password: z.string().min(1),
    new_password: z
      .string()
      .min(12, "Mật khẩu mới phải có ít nhất 12 ký tự.")
      .max(128, "Mật khẩu mới không được dài quá 128 ký tự."),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Hai mật khẩu mới chưa trùng nhau.",
    path: ["confirm_password"],
  })
  .refine((data) => data.current_password !== data.new_password, {
    message: "Mật khẩu mới phải khác mật khẩu hiện tại.",
    path: ["new_password"],
  });

function accountError(message: string): never {
  redirect(`/account?error=${encodeURIComponent(message)}`);
}

export async function changeOwnPassword(formData: FormData) {
  const parsed = changePasswordSchema.safeParse({
    current_password: formData.get("current_password"),
    new_password: formData.get("new_password"),
    confirm_password: formData.get("confirm_password"),
  });
  if (!parsed.success) {
    accountError(
      parsed.error.issues[0]?.message ?? "Thông tin mật khẩu chưa hợp lệ.",
    );
  }

  const { supabase, access } = await requireAccess();
  const { url, publishableKey } = getSupabaseEnv();
  const verificationClient = createSupabaseClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  let verificationError: { status?: number } | null = null;
  try {
    const result = await verificationClient.auth.signInWithPassword({
      email: access.email,
      password: parsed.data.current_password,
    });
    verificationError = result.error;
    if (result.data.session) {
      await verificationClient.auth.signOut({ scope: "local" });
    }
  } catch {
    accountError("Không thể xác minh mật khẩu lúc này. Vui lòng thử lại.");
  }
  if (verificationError?.status === 429) {
    accountError("Bạn đã thử quá nhiều lần. Vui lòng chờ một lúc rồi thử lại.");
  }
  if (verificationError) {
    accountError("Mật khẩu hiện tại không đúng.");
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.new_password,
  });
  if (updateError) {
    accountError("Không thể đổi mật khẩu lúc này. Vui lòng thử lại.");
  }

  revalidatePath("/account");
  redirect("/account?ok=password-changed");
}

export async function sendOwnPasswordRecovery() {
  const { supabase, access } = await requireAccess();
  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!appUrl) {
    accountError("Hệ thống chưa cấu hình địa chỉ nhận email đặt lại mật khẩu.");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(access.email, {
    redirectTo: `${appUrl}/auth/set-password`,
  });
  if (error) {
    accountError("Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại sau.");
  }

  redirect("/account?ok=recovery-sent");
}
