import { NextResponse, type NextRequest } from "next/server";
import { isCurrentPreviewSessionToken } from "@/lib/auth/preview-auth";
import { PREVIEW_SESSION_COOKIE, requiresPreviewAuthentication } from "@/lib/auth/session-core";

export async function proxy(request: NextRequest) {
  const rawPathname = request.nextUrl.pathname;
  const pathname = rawPathname.length > 1 ? rawPathname.replace(/\/+$/, "") : rawPathname;
  const authenticated = await isCurrentPreviewSessionToken(
    request.cookies.get(PREVIEW_SESSION_COOKIE)?.value,
    process.env.SCORVIK_AUTH_SECRET,
  );

  if (pathname === "/login") {
    return authenticated ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  if (!requiresPreviewAuthentication(pathname) || authenticated) return NextResponse.next();
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/).*)"],
};