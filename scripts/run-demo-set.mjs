#!/usr/bin/env node
/**
 * Upload the five demo syllabi in parallel and score the merged result
 * against the hand-written answer key in the corpus README.
 *
 * This is the real end-to-end test: five model calls, roughly $0.80. It is a
 * script rather than a browser click-through so the numbers get *asserted*
 * instead of eyeballed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeResults } from "../web/src/lib/merge.ts";

const DIR = "demo_syllabi_corpus";
const APP = "http://localhost:3000/api/ingest";

// From the corpus README, written by hand before any extraction ran.
const EXPECTED = {
  perCourse: { "CHEM 201": 445, "COMM 310": 240, "ENGL 215": 0, "MATH 240": 73, "ARTD 250": 97 },
  naiveRequired: 855,
  dedupedRequired: 820,
  sharedItem: "iClicker",
  sharedBy: ["CHEM 201", "MATH 240"],
  crunchWeek: "2026-10-19",
  crunchCourses: 3,
  crunchPoints: 70,
  gradedPerCourse: 5,
};

/*
 * Sign in first if the gate is on. Node's fetch keeps no cookie jar, so the
 * session cookie is captured and echoed manually. Nice side effect: this
 * exercises the real auth path rather than bypassing it.
 */
let cookie = "";
const password = (readFileSync("web/.env.local", "utf8").match(/^APP_PASSWORD=(.+)$/m) ?? [])[1]?.trim();

if (password) {
  const res = await fetch("http://localhost:3000/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const setCookie = res.headers.get("set-cookie");
  if (!res.ok || !setCookie) {
    console.error("Could not sign in — check APP_PASSWORD in web/.env.local");
    process.exit(1);
  }
  cookie = setCookie.split(";")[0];
  console.log("Signed in.\n");
}

const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));
console.log(`Uploading ${files.length} syllabi in parallel...\n`);

const started = Date.now();
const settled = await Promise.all(
  files.map(async (name) => {
    const body = new FormData();
    body.append("syllabus", new Blob([readFileSync(join(DIR, name))], { type: "application/pdf" }), name);
    const t0 = Date.now();
    try {
      const res = await fetch(APP, {
        method: "POST",
        body,
        headers: cookie ? { cookie } : {},
      });
      const data = await res.json();
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      if (!res.ok || !data.ok) {
        console.log(`  FAIL  ${name}  (${secs}s)  ${data.error ?? res.status}`);
        return null;
      }
      console.log(
        `  ok    ${name}  (${secs}s)  ${data.course.code} · ${data.events.length} deadlines · ${data.costs.length} costs`,
      );
      return data;
    } catch (err) {
      console.log(`  FAIL  ${name}  ${err.message}`);
      return null;
    }
  }),
);

const results = settled.filter(Boolean);
console.log(`\nAll five in ${((Date.now() - started) / 1000).toFixed(0)}s wall clock.\n`);

if (results.length === 0) process.exit(1);

const m = mergeResults(results);
const ok = (label, cond, extra = "") =>
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);

console.log("=".repeat(62));
console.log("SCORED AGAINST THE ANSWER KEY");
console.log("=".repeat(62));

ok("all five parsed", results.length === 5, `${results.length}/5`);

// Per-course required cost.
for (const [code, expected] of Object.entries(EXPECTED.perCourse)) {
  const row = m.perCourse.find((p) => p.code.replace(/\s+/g, " ").trim() === code);
  if (!row) {
    ok(`${code} present`, false, "course not found");
    continue;
  }
  const mandatory = m.costs
    .filter((c) => c.courseKey === row.courseKey && c.isMandatory && c.amount !== null)
    .reduce((s, c) => s + c.amount, 0);
  ok(`${code} required cost = $${expected}`, Math.abs(mandatory - expected) < 0.01, `got $${mandatory.toFixed(2)}`);
}

// The zero-cost course is the precision test: any price here is invented.
const engl = m.perCourse.find((p) => p.code.includes("ENGL"));
ok("ENGL 215 has no cost at all (hallucination check)", engl && engl.costTotal === 0, `$${engl?.costTotal}`);

// Dedupe.
const dupe = m.duplicates.find((d) => d.label.toLowerCase().includes("iclicker"));
ok("iClicker detected as shared", Boolean(dupe), m.duplicates.map((d) => d.label).join(" / ") || "none found");
ok("shared by exactly two courses", dupe?.courseKeys.length === 2, dupe?.courseKeys.join(" + "));

const totalRequired = Object.values(m.totals).reduce((s, t) => s + t.mandatory, 0);
ok(
  `deduped required total = $${EXPECTED.dedupedRequired}`,
  Math.abs(totalRequired - EXPECTED.dedupedRequired) < 0.01,
  `got $${totalRequired.toFixed(2)} (naive would be $${EXPECTED.naiveRequired})`,
);

// Crunch week.
const cluster = m.clusters.find((c) => c.weekStart === EXPECTED.crunchWeek);
ok("crunch week found at Oct 19", Boolean(cluster), m.clusters.map((c) => c.weekStart).join(", ") || "none");
ok("three courses in it", cluster?.courseKeys.length === EXPECTED.crunchCourses, `${cluster?.courseKeys.length}`);
ok(
  `share of term = ${Math.round((EXPECTED.crunchPoints / 500) * 100)}%`,
  cluster ? Math.abs(cluster.shareOfTerm - EXPECTED.crunchPoints / 500) < 0.02 : false,
  cluster ? `${Math.round(cluster.shareOfTerm * 100)}%` : "",
);

// Every course should have found its graded items.
for (const p of m.perCourse) {
  ok(`${p.code} has ${EXPECTED.gradedPerCourse} graded items`, p.eventCount === EXPECTED.gradedPerCourse, `${p.eventCount}`);
}

// Nothing may reach the calendar without a real date and title.
ok("every event has a usable date and title", m.events.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.summary));

const models = [...new Set(results.map((r) => r.stats.model))];
const inTok = results.reduce((s, r) => s + (r.stats.inputTokens ?? 0), 0);
const outTok = results.reduce((s, r) => s + (r.stats.outputTokens ?? 0), 0);
console.log(`\nmodel : ${models.join(", ")}`);
console.log(`tokens: in ${inTok.toLocaleString()}  out ${outTok.toLocaleString()}`);
console.log(`cost  : $${(inTok / 1e6 * 3 + outTok / 1e6 * 15).toFixed(3)} at sonnet rates`);
console.log(`calendar: ${m.calendar.created}/${m.calendar.attempted} events created`);
