import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, issueSession, safeEqual, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exchange the shared password for a signed session cookie.
 *
 * Deliberately slow to brute-force: one wrong guess costs the caller a second.
 * With rate limiting on top, that puts an online attack out of reach without
 * needing an account lockout that a demo audience would trip over.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return NextResponse.json({ ok: true, gateDisabled: true });
  }

  let supplied = "";
  try {
    const body = await request.json();
    supplied = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  if (!safeEqual(supplied, expected)) {
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json(
      { ok: false, error: "That password is not right." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, await issueSession(expected), {
    httpOnly: true, // never readable from JavaScript
    sameSite: "lax", // survives a normal navigation, blocks cross-site POSTs
    secure: process.env.NODE_ENV === "production", // http on localhost, https on Render
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
