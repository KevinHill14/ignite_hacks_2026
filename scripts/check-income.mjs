// Verifies the student-account model, aid ordering, and probabilistic income.
import {
  settleAid,
  splitAcrossTerms,
  settlementToEvents,
  paychequesInMonth,
} from "../web/src/lib/income.ts";
import { runForecast, DEFAULT_SPEND } from "../web/src/lib/runway-sim.ts";

const ok = (label, cond, extra = "") =>
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);

const osap = (total, start, split = 0.5) =>
  splitAcrossTerms(
    { id: "osap", label: "OSAP", kind: "osap", toAccount: true, probability: 1 },
    total, start, 2, split,
  );

/* ------------------------------------------ the account absorbs tuition first */

const plain = settleAid(osap(12400, "2026-09"), 9100);
ok("two instalments", plain.ledger.length === 2);
ok("gross is the assessment", Math.abs(plain.gross - 12400) < 0.01, `${plain.gross}`);
ok("school paid in full", Math.abs(plain.toSchool - 9100) < 0.01, `${plain.toSchool}`);
ok("student gets the remainder", Math.abs(plain.toStudent - 3300) < 0.01, `${plain.toStudent}`);
ok("first instalment deposits nothing", plain.ledger[0].toStudent === 0, `sep ${plain.ledger[0].toStudent}`);
ok("january carries the whole refund", Math.abs(plain.ledger[1].toStudent - 3300) < 0.01);
ok("second instalment is four months later", plain.ledger[1].source.month === "2027-01", plain.ledger[1].source.month);

/* -------------------------- a scholarship frees up OSAP that would go to school */

const scholarship = splitAcrossTerms(
  { id: "sch", label: "Entrance scholarship", kind: "scholarship", toAccount: true, probability: 1 },
  6000, "2026-09", 2,
);
const stacked = settleAid([...osap(12400, "2026-09"), ...scholarship], 9100);

ok("total aid is the sum of both", Math.abs(stacked.gross - 18400) < 0.01, `${stacked.gross}`);
ok("school still only takes what it is owed", Math.abs(stacked.toSchool - 9100) < 0.01, `${stacked.toSchool}`);
// This is the interesting one: the scholarship does not add $6,000 of spending
// money, it converts OSAP that would have gone to the school into cash.
ok(
  "scholarship raises cash in hand by its full value",
  Math.abs(stacked.toStudent - (plain.toStudent + 6000)) < 0.01,
  `${plain.toStudent} -> ${stacked.toStudent}`,
);
ok("nothing left owing", stacked.stillOwed === 0);

/* ------------------------------------------------------------- edge cases */

const underwater = settleAid(osap(5000, "2026-09"), 9000);
ok("aid below tuition deposits nothing", underwater.toStudent === 0);
ok("and leaves a balance owing", Math.abs(underwater.stillOwed - 4000) < 0.01, `${underwater.stillOwed}`);
ok("no income events when nothing is refunded", settlementToEvents(underwater).length === 0);

const direct = settleAid(
  [{ id: "ext", label: "External award", amount: 2000, month: "2026-10", kind: "other", toAccount: false, probability: 1 }],
  9000,
);
ok("direct-pay awards bypass the account", direct.toStudent === 2000 && direct.toSchool === 0);

// Order matters: aid arriving earlier absorbs the debt.
const early = settleAid(
  [
    { id: "a", label: "Sep award", amount: 9000, month: "2026-09", kind: "other", toAccount: true, probability: 1 },
    { id: "b", label: "Jan award", amount: 9000, month: "2027-01", kind: "other", toAccount: true, probability: 1 },
  ],
  9000,
);
ok("earlier aid absorbs the debt", early.ledger[0].toStudent === 0 && early.ledger[1].toStudent === 9000);

/* ------------------------------------------------------------- paycheques */

const counts = Array.from({ length: 12 }, (_, i) =>
  paychequesInMonth(`2026-${String(i + 1).padStart(2, "0")}`, "biweekly", "2026-01-02"),
);
ok("biweekly gives 26 cheques a year", counts.reduce((a, b) => a + b, 0) === 26, counts.join(","));
ok("two months carry three cheques", counts.filter((c) => c === 3).length === 2);
ok("monthly is always one", paychequesInMonth("2026-03", "monthly", "2026-01-02") === 1);

/* --------------------------------------------- income events in the forecast */

const months = ["2026-09", "2026-10", "2026-11", "2026-12"];
const base = {
  startBalance: 500,
  monthlyIncome: 300,
  incomeVolatility: 0,
  spend: DEFAULT_SPEND.map((s) => ({ ...s, volatility: 0 })),
  courseCostByMonth: {},
  months,
  trials: 4000,
};

const noEvent = runForecast(base);
const certain = runForecast({
  ...base,
  incomeEvents: [{ id: "b", label: "Bursary", month: "2026-10", amount: 1000, probability: 1 }],
});
ok(
  "confirmed money adds exactly its amount",
  Math.abs(certain.endBalance.p50 - noEvent.endBalance.p50 - 1000) < 1,
);

const coinflip = runForecast({
  ...base,
  incomeEvents: [{ id: "b", label: "Maybe", month: "2026-10", amount: 1000, probability: 0.5 }],
});
const gap = coinflip.endBalance.p90 - coinflip.endBalance.p10;
ok("applied-for money splits the outcomes", Math.abs(gap - 1000) < 30, `spread ${gap.toFixed(0)}`);

const lumpy = runForecast({
  ...base,
  incomeByMonth: { "2026-09": 300, "2026-10": 450, "2026-11": 300, "2026-12": 300 },
});
ok(
  "per-month income overrides the flat figure",
  Math.abs(lumpy.endBalance.p50 - noEvent.endBalance.p50 - 150) < 1,
);

console.log("\n--- what the UI will show for OSAP + a $6,000 entrance scholarship ---");
console.log(`aid on paper   $${stacked.gross.toLocaleString()}`);
console.log(`to the school  $${stacked.toSchool.toLocaleString()}  (${Math.round(stacked.withheldShare * 100)}% of it)`);
console.log(`reaches you    $${stacked.toStudent.toLocaleString()}`);
for (const l of stacked.ledger) {
  console.log(`  ${l.source.month}  ${l.source.label.padEnd(22)} $${String(l.source.amount).padStart(7)} -> school $${String(l.toSchool).padStart(7)} -> you $${String(l.toStudent).padStart(7)}`);
}
console.log(`\nwithout the scholarship you would see $${plain.toStudent.toLocaleString()} instead.`);
