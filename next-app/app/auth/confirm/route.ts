import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const supportedTypes = new Set<EmailOtpType>([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

function safeNextPath(value: string | null, type: EmailOtpType) {
  if (value?.startsWith("/") && !value.startsWith("//")) return value;
  return type === "invite" || type === "recovery"
    ? "/set-password"
    : "/dashboard";
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const rawType = request.nextUrl.searchParams.get("type");
  const type =
    rawType && supportedTypes.has(rawType as EmailOtpType)
      ? (rawType as EmailOtpType)
      : null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      return NextResponse.redirect(
        new URL(
          safeNextPath(request.nextUrl.searchParams.get("next"), type),
          request.url,
        ),
      );
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=confirmation", request.url),
  );
}
