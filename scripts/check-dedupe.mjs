// The exact labels the real run produced, plus over-matching guards.
import { mergeResults } from "../web/src/lib/merge.ts";

const ok = (l, c, e = "") => console.log(`${c ? "PASS" : "FAIL"}  ${l}${e ? "  " + e : ""}`);

const cost = (label, amount) => ({
  label, category: "other", amount, currency: "CAD", isMandatory: true,
  neededBy: "2026-09-08", month: "2026-09", notes: "", sourceQuote: "", confidence: 0.9,
});
const course = (code, costs) => ({
  ok: true, course: { code, title: code, term: "F2026", institution: "L" },
  sourceName: `${code}.pdf`, timezone: "America/Toronto",
  calendar: { created: 0, attempted: 0, failed: [] },
  events: [], costs, timeline: [], totals: {},
  stats: { eventCount: 0, costCount: costs.length, pricedCount: 0, unpricedCount: 0, mixedCurrency: false, inputTokens: 0, outputTokens: 0 },
  warnings: [],
});

// The real case from the demo corpus.
const m = mergeResults([
  course("CHEM 201", [cost("iClicker Cloud subscription", 35), cost("Organic Chemistry textbook", 350), cost("Lab safety kit", 60)]),
  course("MATH 240", [cost("iClicker Cloud (1-term licence)", 35), cost("Course pack", 38)]),
]);
ok("iClicker matched across differing wording", m.duplicates.some((d) => d.label.toLowerCase().includes("iclicker")),
   m.duplicates.map((d) => d.label).join(" / ") || "none");
ok("counted once: 483 not 518", Math.abs(m.totals.CAD.all - 483) < 0.01, `$${m.totals.CAD.all}`);

// Over-matching guards — these must NOT be treated as the same product.
const g1 = mergeResults([
  course("A", [cost("Textbook", 50)]),
  course("B", [cost("Textbook and workbook bundle", 90)]),
]);
ok("single-word label does not swallow a longer one", g1.duplicates.length === 0,
   g1.duplicates.map((d) => d.label).join());

const g2 = mergeResults([
  course("A", [cost("Studio Kit 1", 55)]),
  course("B", [cost("Studio Kit 2", 42)]),
]);
ok("Studio Kit 1 and 2 stay separate", g2.duplicates.length === 0, g2.duplicates.map((d) => d.label).join());
ok("and both are counted", Math.abs(g2.totals.CAD.all - 97) < 0.01, `$${g2.totals.CAD.all}`);

const g3 = mergeResults([
  course("A", [cost("Organic Chemistry textbook", 350)]),
  course("B", [cost("Physical Chemistry textbook", 280)]),
]);
ok("different books are not merged", g3.duplicates.length === 0, g3.duplicates.map((d) => d.label).join());
ok("both books counted: 630", Math.abs(g3.totals.CAD.all - 630) < 0.01, `$${g3.totals.CAD.all}`);
