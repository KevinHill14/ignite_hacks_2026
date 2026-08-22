/**
 * Shared-password gate.
 *
 * Not a user system — there are no accounts. It is one password handed to
 * judges so a public URL is not an open invitation to spend someone's API
 * credits. That is the whole threat model, and it is worth being honest that
 * anyone who has the password can do anything the app can do.
 *
 * Uses Web Crypto rather than node:crypto because this runs in `proxy.ts`,
 * which executes on the Edge runtime where node builtins are unavailable.
 * Web Crypto exists in both places, so one module serves the proxy and the
 * login route alike.
 */

export const AUTH_COOKIE = "syl_session";

/** Eight hours: long enough for a judging session, short enough to expire. */
const SESSION_MS = 8 * 60 * 60 * 1000;

const encoder = new TextEncoder();

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compare without leaking length or position through timing.
 *
 * `a === b` on a secret short-circuits at the first differing byte, which is
 * measurable over enough requests. Web Crypto has no timingSafeEqual, so this
 * is the manual equivalent: always walk the full length, accumulate
 * differences, and only branch at the end.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `<expiry>.<signature>` — the expiry is readable, the signature is not forgeable. */
export async function issueSession(password: string): Promise<string> {
  const expiry = String(Date.now() + SESSION_MS);
  return `${expiry}.${await hmac(password, expiry)}`;
}

export async function isValidSession(
  token: string | undefined,
  password: string,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;

  const expiry = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  // Check the signature before trusting the expiry it carries.
  if (!safeEqual(signature, await hmac(password, expiry))) return false;

  const expiresAt = Number(expiry);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export const SESSION_MAX_AGE_SECONDS = SESSION_MS / 1000;
