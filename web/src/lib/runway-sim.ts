/**
 * Monte Carlo cash-flow forecast for a single term.
 *
 * The deterministic version of this — one subtraction per month — produces a
 * single date, which reads as a promise the model cannot keep. Nobody spends
 * exactly $320 on groceries every month. This runs the term a few thousand
 * times with plausible variation and reports a band instead.
 *
 * The asymmetry that makes the picture worth looking at: costs pulled out of
 * the syllabus are *known* (a $184.95 textbook on a stated date, variance
 * zero), while living costs are not. So uncertainty widens smoothly over the
 * term and is punctuated by hard vertical steps where course costs land.
 */

export interface SpendLine {
  id: string;
  label: string;
  /** Expected spend per month, in the primary currency. */
  monthly: number;
  on: boolean;
  /**
   * Coefficient of variation (standard deviation / mean). 0.05 is a fixed
   * contract; 0.45 is a discretionary category that swings month to month.
   */
  volatility: number;
}

export interface SimConfig {
  startBalance: number;
  monthlyIncome: number;
  /** CV on income. 0 for salaried, ~0.25 for shift work. */
  incomeVolatility: number;
  spend: SpendLine[];
  /** Known, certain course costs keyed by "YYYY-MM". */
  courseCostByMonth: Record<string, number>;
  /** Ordered "YYYY-MM" keys covering the term. */
  months: string[];
  trials?: number;
  seed?: number;
}

export interface MonthBand {
  month: string;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  /** Certain course spend landing this month — drives the step in the chart. */
  courseCost: number;
}

export interface Lever {
  id: string;
  label: string;
  monthly: number;
  /** Percentage points of ruin risk removed by dropping this category. */
  deltaProbBroke: number;
  /** Extra dollars in hand at term end. */
  deltaEndBalance: number;
}

export interface SimResult {
  bands: MonthBand[];
  /** Share of trials that dip below zero at any point. The rigorous number. */
  probBroke: number;
  /** Month each band crosses zero, or null if it never does. */
  worstCase: string | null;
  expected: string | null;
  bestCase: string | null;
  endBalance: { p10: number; p50: number; p90: number };
  levers: Lever[];
  trials: number;
}

/* ----------------------------------------------------------------- randomness */

/**
 * Seeded PRNG (mulberry32). Deterministic on purpose: an unseeded simulation
 * would redraw the fan on every keystroke, making the chart shimmer and the
 * headline numbers jump while the user is still typing.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller. Returns one standard normal per call; the second is discarded. */
function standardNormal(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Draw from a lognormal with the given arithmetic mean and coefficient of
 * variation.
 *
 * Lognormal rather than normal for two reasons: spending cannot go negative,
 * and real spending is right-skewed — most months are ordinary, occasionally
 * one is far above average. A normal draw would produce negative groceries.
 *
 * Solving for the underlying normal's parameters so that E[X] lands on `mean`:
 *   sigma^2 = ln(1 + CV^2),  mu = ln(mean) - sigma^2 / 2
 */
function lognormalFrom(z: number, mean: number, cv: number): number {
  if (mean <= 0) return 0;
  if (cv <= 0) return mean;
  const sigmaSq = Math.log(1 + cv * cv);
  const sigma = Math.sqrt(sigmaSq);
  const mu = Math.log(mean) - sigmaSq / 2;
  return Math.exp(mu + sigma * z);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/* ------------------------------------------------------------------- the core */

interface RawRun {
  /** balances[month][trial] */
  balances: number[][];
  probBroke: number;
  endBalances: number[];
}

function simulate(config: SimConfig, trials: number, seed: number): RawRun {
  const { startBalance, monthlyIncome, incomeVolatility, months, courseCostByMonth } = config;

  /*
   * Common random numbers.
   *
   * The lever analysis compares this simulation against one with a category
   * switched off. If switching it off changed how many random draws happen,
   * every later draw would shift and the two runs would diverge for reasons
   * that have nothing to do with the category — noise would swamp the effect
   * being measured, and the ranking would be meaningless.
   *
   * So we draw for every category on every month regardless, and mask the
   * inactive ones after the fact. Both runs then walk an identical random
   * stream and the difference between them is attributable to the change
   * alone. Same trick as paired sampling.
   */
  const everyLine = config.spend;

  const rand = mulberry32(seed);
  const balances: number[][] = months.map(() => new Array<number>(trials));
  const endBalances = new Array<number>(trials);
  let brokeCount = 0;

  for (let t = 0; t < trials; t++) {
    let balance = startBalance;
    let wentBroke = false;

    for (let m = 0; m < months.length; m++) {
      const income = lognormalFrom(standardNormal(rand), monthlyIncome, incomeVolatility);

      let spent = 0;
      for (const line of everyLine) {
        // Draw unconditionally to keep the stream aligned, then mask.
        const z = standardNormal(rand);
        if (line.on && line.monthly > 0) {
          spent += lognormalFrom(z, line.monthly, line.volatility);
        }
      }

      // Course costs are extracted from the syllabus: a known amount on a
      // known date. No draw, no variance — that certainty is the point.
      const course = courseCostByMonth[months[m]] ?? 0;

      balance = balance + income - spent - course;
      balances[m][t] = balance;
      if (balance < 0) wentBroke = true;
    }

    endBalances[t] = balance;
    if (wentBroke) brokeCount++;
  }

  return { balances, probBroke: brokeCount / trials, endBalances };
}

/** First month whose band value drops below zero, or null if it never does. */
function crossing(bands: MonthBand[], pick: (b: MonthBand) => number): string | null {
  for (const band of bands) {
    if (pick(band) < 0) return band.month;
  }
  return null;
}

export function runForecast(config: SimConfig): SimResult {
  const trials = config.trials ?? 2000;
  const seed = config.seed ?? 20260821;

  const run = simulate(config, trials, seed);

  const bands: MonthBand[] = config.months.map((month, m) => {
    const sorted = [...run.balances[m]].sort((a, b) => a - b);
    return {
      month,
      p10: percentile(sorted, 0.1),
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
      courseCost: config.courseCostByMonth[month] ?? 0,
    };
  });

  const sortedEnd = [...run.endBalances].sort((a, b) => a - b);

  /*
   * Which category actually moves the needle. Re-runs the whole term with one
   * category switched off and measures how much ruin risk disappears.
   *
   * This is the part a student can act on: "eating out is costing you 14
   * points of risk" beats a list of numbers. Fewer trials here because it runs
   * once per category and the ranking is stable well before the headline
   * figure would be.
   */
  const leverTrials = Math.min(trials, 800);
  const baseline = simulate(config, leverTrials, seed);
  const baseEnd = percentile([...baseline.endBalances].sort((a, b) => a - b), 0.5);

  const levers: Lever[] = config.spend
    .filter((s) => s.on && s.monthly > 0)
    .map((line) => {
      const without = simulate(
        { ...config, spend: config.spend.map((s) => (s.id === line.id ? { ...s, on: false } : s)) },
        leverTrials,
        seed,
      );
      const withoutEnd = percentile([...without.endBalances].sort((a, b) => a - b), 0.5);
      return {
        id: line.id,
        label: line.label,
        monthly: line.monthly,
        deltaProbBroke: baseline.probBroke - without.probBroke,
        deltaEndBalance: withoutEnd - baseEnd,
      };
    })
    /*
     * Rank by risk removed, but treat near-ties as ties.
     *
     * A proportion estimated from `leverTrials` samples carries a standard
     * error around 1/(2*sqrt(n)) — roughly 1.8pp at 800 trials. Sorting on
     * raw differences would let pure sampling noise decide the order, and the
     * top recommendation would flip between renders. Below that threshold we
     * fall back to dollars at term end, which is far more stable.
     *
     * It also handles the common real case honestly: when the budget is only
     * slightly underwater, dropping *any* single category rescues it, so
     * every category removes almost the same risk and the meaningful question
     * becomes which one frees up the most money.
     */
    .sort((a, b) => {
      const noiseFloor = 1 / (2 * Math.sqrt(leverTrials));
      const riskGap = b.deltaProbBroke - a.deltaProbBroke;
      if (Math.abs(riskGap) > noiseFloor) return riskGap;
      return b.deltaEndBalance - a.deltaEndBalance;
    });

  return {
    bands,
    probBroke: run.probBroke,
    // The optimistic band crossing zero is the best case, and vice versa.
    bestCase: crossing(bands, (b) => b.p90),
    expected: crossing(bands, (b) => b.p50),
    worstCase: crossing(bands, (b) => b.p10),
    endBalance: {
      p10: percentile(sortedEnd, 0.1),
      p50: percentile(sortedEnd, 0.5),
      p90: percentile(sortedEnd, 0.9),
    },
    levers,
    trials,
  };
}

/* ------------------------------------------------------------------- defaults */

/**
 * Starting volatilities per category.
 *
 * These encode a claim worth stating out loud: not all spending is equally
 * predictable. A phone bill is a contract and barely moves. Eating out is
 * discretionary and swings hard. Treating them with one shared variance would
 * throw away the most interesting thing the simulation knows.
 */
export const DEFAULT_SPEND: SpendLine[] = [
  { id: "rent", label: "Rent", monthly: 0, on: false, volatility: 0.02 },
  { id: "groceries", label: "Groceries", monthly: 320, on: true, volatility: 0.18 },
  { id: "transit", label: "Transit and gas", monthly: 90, on: true, volatility: 0.28 },
  { id: "phone", label: "Phone", monthly: 55, on: true, volatility: 0.05 },
  { id: "eatingout", label: "Eating out", monthly: 120, on: false, volatility: 0.45 },
  { id: "subs", label: "Subscriptions", monthly: 25, on: false, volatility: 0.05 },
];

/** How steady the money coming in is. Shift work is the student default. */
export const INCOME_STEADINESS = [
  { id: "steady", label: "Same every month", volatility: 0.02 },
  { id: "shifts", label: "Varies with shifts", volatility: 0.25 },
  { id: "irregular", label: "Very irregular", volatility: 0.5 },
] as const;
