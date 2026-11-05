import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { hasDatabaseEnv } from "@/lib/db/env";

const SESSION_COOKIE = "tdw_session";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDevelopment = process.env.NODE_ENV === "development";
  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  if (!hasDatabaseEnv()) {
    const response = request.nextUrl.pathname === "/setup"
      ? NextResponse.next({ request: { headers: requestHeaders } })
      : NextResponse.redirect(new URL("/setup", request.url));
    response.headers.set("Content-Security-Policy", contentSecurityPolicy);
    return response;
  }

  const next = () => {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", contentSecurityPolicy);
    return response;
  };
  const redirect = (url: URL) => {
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
    response.headers.set("Content-Security-Policy", contentSecurityPolicy);
    return response;
  };

  const pathname = request.nextUrl.pathname;
  // Khảo sát công khai và file ký sẵn không cần phiên đăng nhập
  if (/^\/s\/[0-9a-f-]{36}\/?$/i.test(pathname) || pathname.startsWith("/api/storage/")) return next();

  // Chỉ kiểm tra có cookie phiên; phiên thật được xác thực với CSDL trong requireAccess().
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  const hasSession = token.length >= 20;
  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/setup" ||
    pathname.startsWith("/auth/") ||
    pathname === "/api/jobs/maintenance-reminders" ||
    pathname === "/api/health";

  if (!hasSession && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname);
    return redirect(loginUrl);
  }
  return next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
