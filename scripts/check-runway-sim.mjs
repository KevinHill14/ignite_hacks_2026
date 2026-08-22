// Sanity-check the Monte Carlo against cases where the answer is known.
import { runForecast, DEFAULT_SPEND } from "../web/src/lib/runway-sim.ts";

const months = ["2026-09", "2026-10", "2026-11", "2026-12"];
const courseCostByMonth = { "2026-09": 316.45, "2026-10": 34 };

function base(over = {}) {
  return {
    startBalance: 1400,
    monthlyIncome: 400,
    incomeVolatility: 0.25,
    spend: DEFAULT_SPEND.map((s) => ({ ...s })),
    courseCostByMonth,
    months,
    ...over,
  };
}

const ok = (label, cond, extra = "") =>
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);

// 1. Zero volatility everywhere must reproduce the deterministic arithmetic.
const det = runForecast(
  base({
    incomeVolatility: 0,
    spend: DEFAULT_SPEND.map((s) => ({ ...s, volatility: 0 })),
    trials: 200,
  }),
);
// 1400 + 400 - 465 - 316.45 = 1018.55 ; then -465-34 ; then -465 ; then -465
const expected = [1018.55, 919.55, 854.55, 789.55];
const got = det.bands.map((b) => Math.round(b.p50 * 100) / 100);
ok("zero variance reproduces deterministic path", JSON.stringify(got) === JSON.stringify(expected), JSON.stringify(got));
ok("zero variance collapses the band", Math.abs(det.bands[2].p10 - det.bands[2].p90) < 0.01);

// 2. Lognormal draws must preserve the requested mean.
const meanCheck = runForecast(
  base({ monthlyIncome: 1000, incomeVolatility: 0.3, spend: [], courseCostByMonth: {}, trials: 20000 }),
);
const impliedMonthlyIncome = (meanCheck.bands[3].p50 - 1400) / 4;
ok(
  "lognormal preserves mean income (~1000)",
  Math.abs(impliedMonthlyIncome - 1000) < 25,
  `got ${impliedMonthlyIncome.toFixed(1)}`,
);

// 3. Bands must be ordered p10 <= p25 <= p50 <= p75 <= p90.
const spread = runForecast(base({ trials: 3000 }));
const ordered = spread.bands.every(
  (b) => b.p10 <= b.p25 && b.p25 <= b.p50 && b.p50 <= b.p75 && b.p75 <= b.p90,
);
ok("percentile bands are ordered", ordered);

// 4. Uncertainty must widen over time.
const w0 = spread.bands[0].p90 - spread.bands[0].p10;
const w3 = spread.bands[3].p90 - spread.bands[3].p10;
ok("uncertainty widens over the term", w3 > w0, `${w0.toFixed(0)} -> ${w3.toFixed(0)}`);

// 5. Same seed must give identical output.
const a = runForecast(base({ trials: 500 }));
const b = runForecast(base({ trials: 500 }));
ok("deterministic for a fixed seed", a.bands[3].p50 === b.bands[3].p50);

// 6. More income must reduce ruin risk.
const poor = runForecast(base({ monthlyIncome: 200, trials: 3000 }));
const rich = runForecast(base({ monthlyIncome: 900, trials: 3000 }));
ok("more income lowers P(broke)", rich.probBroke < poor.probBroke,
   `${(poor.probBroke * 100).toFixed(0)}% -> ${(rich.probBroke * 100).toFixed(0)}%`);

// 7. Worst case must never be later than best case.
const order =
  !spread.worstCase || !spread.bestCase || spread.worstCase <= spread.bestCase;
ok("worst case is not later than best case", order,
   `worst ${spread.worstCase} / expected ${spread.expected} / best ${spread.bestCase}`);

// 8. The biggest lever should be the biggest active cost by expected spend.
const withEatingOut = runForecast(
  base({ spend: DEFAULT_SPEND.map((s) => ({ ...s, on: s.on || s.id === "eatingout" })), trials: 3000 }),
);
ok("levers ranked, groceries top", withEatingOut.levers[0].id === "groceries",
   withEatingOut.levers.map((l) => `${l.id}:${(l.deltaProbBroke * 100).toFixed(0)}pp`).join(" "));

console.log("\n--- headline for the demo scenario ---");
console.log(`P(run short) = ${(spread.probBroke * 100).toFixed(0)}%`);
console.log(`worst ${spread.worstCase}  expected ${spread.expected}  best ${spread.bestCase}`);
console.log(
  `end balance  p10 ${spread.endBalance.p10.toFixed(0)}  p50 ${spread.endBalance.p50.toFixed(0)}  p90 ${spread.endBalance.p90.toFixed(0)}`,
);
