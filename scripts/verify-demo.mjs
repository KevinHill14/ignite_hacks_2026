// Checks the merged multi-course output against arithmetic done by hand.
import { DEMO_MULTI } from "../web/src/lib/demo.ts";
import { mergeResults } from "../web/src/lib/merge.ts";

const ok = (label, cond, extra = "") =>
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);

const m = mergeResults(DEMO_MULTI);

// Hand arithmetic:
//   CHEM 201  315.50 + 35 + 48 + 25 = 423.50
//   PSYC 202  167 + 35              = 202.00
//   MATH 240                        =   0.00
//   naive sum                       = 625.50
//   iClicker ($35) shared by two    = 590.50 after dedup
console.log("courses      :", m.courses.map((c) => c.code).join(", "));
console.log("term total   :", m.totals.CAD.all);
console.log("per course   :", m.perCourse.map((p) => `${p.code} $${p.costTotal}`).join("  "));

ok("three courses merged", m.courses.length === 3);
ok("events merged", m.events.length === 10, `${m.events.length}`);
ok("naive sum would be 625.50",
   Math.abs(DEMO_MULTI.flatMap((r) => r.costs).reduce((s, c) => s + (c.amount ?? 0), 0) - 625.5) < 0.01);
ok("iClicker deduped -> 590.50", Math.abs(m.totals.CAD.all - 590.5) < 0.01, `got ${m.totals.CAD.all}`);
ok("duplicate detected", m.duplicates.length === 1, m.duplicates.map((d) => d.label).join());
ok("duplicate names both courses",
   m.duplicates[0]?.courseKeys.length === 2, m.duplicates[0]?.courseKeys.join(" + "));

// Crunch week: CHEM Oct 21, PSYC Oct 22, MATH Oct 23 — all week of Oct 19.
ok("one crunch week", m.clusters.length === 1, `${m.clusters.length}`);
ok("crunch week is Oct 19", m.clusters[0]?.weekStart === "2026-10-19", m.clusters[0]?.weekStart);
ok("all three courses in it", m.clusters[0]?.courseKeys.length === 3);
ok("combined weight is 75%", m.clusters[0]?.totalWeight === 75, `${m.clusters[0]?.totalWeight}%`);

// MATH 240 is the precision case: genuinely free.
const math = m.perCourse.find((p) => p.code === "MATH 240");
ok("MATH 240 has zero cost", math.costTotal === 0, `$${math.costTotal}`);
ok("MATH 240 still has deadlines", math.eventCount === 3);

// CHEM is the expensive one and should sort first.
ok("most expensive course listed first", m.perCourse[0].code === "CHEM 201",
   m.perCourse.map((p) => p.code).join(" > "));

// Per-course sums exceed the deduped total, by exactly the shared item.
const perSum = m.perCourse.reduce((s, p) => s + p.costTotal, 0);
ok("per-course sum exceeds total by the shared $35",
   Math.abs(perSum - m.totals.CAD.all - 35) < 0.01, `${perSum} - ${m.totals.CAD.all} = ${(perSum - m.totals.CAD.all).toFixed(2)}`);

ok("warnings cover both findings",
   m.warnings.some((w) => w.includes("appears in 2 syllabi")) &&
   m.warnings.some((w) => w.includes("3 courses have deadlines")));

// Every event must carry a real date and title, or the calendar write repeats
// the untitled-on-today bug.
ok("every event has a usable date and title",
   m.events.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.summary && e.start));
