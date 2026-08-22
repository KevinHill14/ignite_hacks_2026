import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, isValidSession } from "@/lib/auth";

/**
 * Gate the whole app behind one shared password.
 *
 * Named `proxy.ts` rather than `middleware.ts` — the middleware convention is
 * deprecated in Next 16 and renamed, though the behaviour is identical.
 *
 * If APP_PASSWORD is unset the gate is off entirely, so local development and
 * a teammate's first clone stay frictionless. It only engages once someone
 * deliberately sets a password, which is what a public deployment does.
 */
export async function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // The login page and its endpoint must stay reachable, or there is no way
  // in. Everything else, including /api/ingest, is behind the gate.
  if (pathname === "/login" || pathname === "/api/login") {
    return NextResponse.next();
  }

  if (await isValidSession(request.cookies.get(AUTH_COOKIE)?.value, password)) {
    return NextResponse.next();
  }

  // An unauthenticated API call gets a 401, not an HTML redirect — a fetch
  // following a redirect to a login page produces a confusing parse error
  // rather than a clear failure.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "Session expired. Reload the page and sign in again." },
      { status: 401 },
    );
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  return NextResponse.redirect(login);
}

export const config = {
  /*
   * Skip Next's own assets and the favicon. Gating those would block the
   * login page's own styling, so the user would face an unstyled form.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
