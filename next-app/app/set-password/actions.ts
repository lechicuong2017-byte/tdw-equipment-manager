"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(12, "Mật khẩu phải có ít nhất 12 ký tự.")
      .max(128, "Mật khẩu không được dài quá 128 ký tự."),
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Hai mật khẩu chưa trùng nhau.",
    path: ["confirm_password"],
  });

export type SetPasswordState = {
  error?: string;
};

export async function setPassword(
  _previousState: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirm_password: formData.get("confirm_password"),
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Mật khẩu chưa đáp ứng yêu cầu.",
    };
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    return { error: "Phiên mời đã hết hạn. Hãy yêu cầu gửi lại thư mời." };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { error: "Không thể đặt mật khẩu. Vui lòng thử lại." };
  }

  redirect("/mfa");
}
