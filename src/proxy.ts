import { NextResponse, type NextRequest } from "next/server";
import { isCurrentPreviewSessionToken } from "@/lib/auth/preview-auth";
import { PREVIEW_SESSION_COOKIE, requiresPreviewAuthentication } from "@/lib/auth/session-core";

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/create";
  try {
    const destination = new URL(value, "https://scorvik.invalid");
    if (destination.origin !== "https://scorvik.invalid" || destination.pathname === "/login") return "/create";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/create";
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname.length > 1 ? request.nextUrl.pathname.replace(/\/+$/, "") : request.nextUrl.pathname;
  const authenticated = await isCurrentPreviewSessionToken(
    request.cookies.get(PREVIEW_SESSION_COOKIE)?.value,
    process.env.SCORVIK_AUTH_SECRET,
  );

  if (pathname === "/login") {
    if (authenticated) return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get("next")), request.url));
    return NextResponse.next();
  }

  if (!requiresPreviewAuthentication(pathname) || authenticated) return NextResponse.next();
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/).*)"],
};