// Verifies the session token cannot be forged or replayed, and that the rate
// limiter actually limits.
import { issueSession, isValidSession, safeEqual } from "../web/src/lib/auth.ts";
import { rateLimit, clientKey } from "../web/src/lib/rate-limit.ts";

const ok = (label, cond, extra = "") =>
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);

/* ------------------------------------------------------------- sessions */

const PW = "correct horse battery staple";
const token = await issueSession(PW);

ok("a freshly issued session is valid", await isValidSession(token, PW));
ok("wrong password rejects a valid token", !(await isValidSession(token, "wrong")));
ok("missing token rejected", !(await isValidSession(undefined, PW)));
ok("garbage token rejected", !(await isValidSession("nonsense", PW)));
ok("token without a signature rejected", !(await isValidSession("123456789", PW)));

// Forgery: an attacker who knows the format but not the password cannot mint
// a token, and cannot extend one by editing the expiry they can plainly read.
const [expiry, signature] = token.split(".");
ok("expiry is readable but tamper-evident", /^\d+$/.test(expiry));
const extended = `${Number(expiry) + 86_400_000}.${signature}`;
ok("editing the expiry invalidates the signature", !(await isValidSession(extended, PW)));
ok("signature alone cannot be reused with a new expiry",
   !(await isValidSession(`${Date.now() + 1000}.${signature}`, PW)));

// Expiry is enforced, not merely stated.
const stale = await issueSession(PW);
const staleExpired = `${Date.now() - 1000}.${stale.split(".")[1]}`;
ok("an expired token is rejected", !(await isValidSession(staleExpired, PW)));

// Same password must produce a verifiable token every time (no random salt
// that would break verification across processes).
ok("tokens verify across separate issuances",
   await isValidSession(await issueSession(PW), PW));

/* --------------------------------------------------------- safe compare */

ok("safeEqual matches identical strings", safeEqual("abc123", "abc123"));
ok("safeEqual rejects different strings", !safeEqual("abc123", "abc124"));
ok("safeEqual rejects different lengths", !safeEqual("abc", "abcd"));
ok("safeEqual rejects empty vs non-empty", !safeEqual("", "x"));

/* ------------------------------------------------------- rate limiting */

const opts = { limit: 3, windowMs: 60_000 };
const results = [1, 2, 3, 4, 5].map(() => rateLimit("tester", opts));
ok("first 3 allowed", results.slice(0, 3).every((r) => r.allowed));
ok("4th and 5th blocked", !results[3].allowed && !results[4].allowed);
ok("remaining counts down", results[0].remaining === 2 && results[2].remaining === 0);
ok("blocked response says when to retry", results[3].retryAfter > 0 && results[3].retryAfter <= 60,
   `${results[3].retryAfter}s`);

// Buckets are per key, so one client cannot exhaust another's allowance.
ok("a different client is unaffected", rateLimit("someone-else", opts).allowed);

// The window slides: an old hit should not count forever.
const short = { limit: 1, windowMs: 50 };
ok("first hit in a short window allowed", rateLimit("slide", short).allowed);
ok("immediate second hit blocked", !rateLimit("slide", short).allowed);
await new Promise((r) => setTimeout(r, 70));
ok("allowed again once the window slides past", rateLimit("slide", short).allowed);

/* ------------------------------------------------------------ identity */

const h = (o) => new Headers(o);
ok("uses the first x-forwarded-for entry",
   clientKey(h({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })) === "203.0.113.9");
ok("falls back to x-real-ip", clientKey(h({ "x-real-ip": "198.51.100.4" })) === "198.51.100.4");
ok("degrades to a shared bucket, never to none", clientKey(h({})) === "unknown");

console.log("\nNote: the limiter is in-memory. It resets on redeploy and is not");
console.log("shared across instances — fine for one Render service, not for scale.");
