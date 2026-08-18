import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/env";

export async function updateSession(
  request: NextRequest,
  requestHeaders: Headers,
  contentSecurityPolicy: string,
) {
  const nextResponse = () => {
    const next = NextResponse.next({ request: { headers: requestHeaders } });
    next.headers.set("Content-Security-Policy", contentSecurityPolicy);
    return next;
  };
  const redirectResponse = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    // `getClaims()` can refresh or clear the Supabase session. Preserve those
    // cookie mutations when this request is redirected, otherwise the browser
    // keeps a stale refresh token and the next login in the same session fails.
    response.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie);
    });
    ["cache-control", "expires", "pragma"].forEach((name) => {
      const value = response.headers.get(name);
      if (value) redirect.headers.set(name, value);
    });
    if (!redirect.headers.has("cache-control")) {
      redirect.headers.set(
        "Cache-Control",
        "private, no-cache, no-store, must-revalidate, max-age=0",
      );
    }
    redirect.headers.set("Content-Security-Policy", contentSecurityPolicy);
    return redirect;
  };
  let response = nextResponse();
  const { url, publishableKey } = getSupabaseEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = nextResponse();
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);
  const pathname = request.nextUrl.pathname;
  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/setup" ||
    pathname.startsWith("/auth/") ||
    pathname === "/api/jobs/maintenance-reminders";

  if (!isAuthenticated && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return redirectResponse(loginUrl);
  }

  if (isAuthenticated && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return redirectResponse(dashboardUrl);
  }

  return response;
}
