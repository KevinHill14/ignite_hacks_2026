"use client";

import { useMemo, useState } from "react";
import type { PlannedCost, PlannedEvent } from "@/lib/types";
import {
  runForecast,
  DEFAULT_SPEND,
  INCOME_STEADINESS,
  type SpendLine,
} from "@/lib/runway-sim";

/* ------------------------------------------------------------------ helpers */

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(key: string, withYear = false) {
  const [y, m] = key.split("-").map(Number);
  return withYear ? `${MONTH_SHORT[m - 1]} ${y}` : MONTH_SHORT[m - 1];
}

function money(amount: number, currency: string, compact = false) {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: currency || "CAD",
      maximumFractionDigits: 0,
      notation: compact ? "compact" : "standard",
    }).format(amount);
  } catch {
    return `$${Math.round(amount)}`;
  }
}

/* --------------------------------------------------------------- fan chart */

interface FanProps {
  bands: ReturnType<typeof runForecast>["bands"];
  currency: string;
  startBalance: number;
}

/**
 * The signature graphic.
 *
 * A widening cone of uncertainty for living costs, stepped down by the hard,
 * certain drops where syllabus costs land. Where the cone crosses zero is the
 * answer — and its width there is the honesty.
 */
function FanChart({ bands, currency, startBalance }: FanProps) {
  const W = 1000;
  const H = 300;
  const PAD = { top: 18, right: 24, bottom: 42, left: 68 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const lows = bands.map((b) => b.p10);
  const highs = bands.map((b) => b.p90);
  const rawMin = Math.min(0, ...lows);
  const rawMax = Math.max(startBalance, ...highs);
  const pad = (rawMax - rawMin) * 0.08 || 100;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;

  // Month 0 is the first *projected* month; index -1 is today's balance, so
  // the fan visibly starts from a single known point rather than mid-air.
  const n = bands.length;
  const x = (i: number) => PAD.left + ((i + 1) / n) * plotW;
  const x0 = PAD.left;
  const y = (v: number) => PAD.top + ((yMax - v) / (yMax - yMin)) * plotH;

  // Out along the upper bound, back along the lower, closing at today's
  // known balance so the cone converges to a point rather than a blunt edge.
  const areaPath = (lo: (i: number) => number, hi: (i: number) => number) => {
    const out = bands.map((_, i) => `L${x(i)},${y(hi(i))}`).join("");
    const back = bands
      .map((_, i) => n - 1 - i)
      .map((i) => `L${x(i)},${y(lo(i))}`)
      .join("");
    return `M${x0},${y(startBalance)}${out}${back}Z`;
  };

  const line = (pick: (i: number) => number) =>
    `M${x0},${y(startBalance)}` + bands.map((_, i) => `L${x(i)},${y(pick(i))}`).join("");

  const zeroY = y(0);
  const showZero = 0 >= yMin && 0 <= yMax;

  // Gridlines at round numbers.
  const ticks: number[] = [];
  const step = Math.max(250, Math.ceil((yMax - yMin) / 4 / 250) * 250);
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) ticks.push(v);

  return (
    <svg
      className="fan"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Projected balance over ${n} months, showing a widening range of outcomes.`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* the region where you are overdrawn */}
      {showZero && (
        <rect
          x={PAD.left}
          y={zeroY}
          width={plotW}
          height={Math.max(0, PAD.top + plotH - zeroY)}
          fill="var(--stamp)"
          opacity="0.06"
        />
      )}

      {ticks.map((v) => (
        <g key={v}>
          <line
            x1={PAD.left}
            y1={y(v)}
            x2={W - PAD.right}
            y2={y(v)}
            stroke="var(--rule)"
            strokeWidth="1"
            strokeDasharray={v === 0 ? undefined : "2 4"}
          />
          <text
            x={PAD.left - 10}
            y={y(v) + 4}
            textAnchor="end"
            fontFamily="var(--font-mono)"
            fontSize="11"
            fill="var(--ink-faint)"
          >
            {money(v, currency, true)}
          </text>
        </g>
      ))}

      {/* p10-p90 then p25-p75: two nested bands read as one cone */}
      <path className="fan__band" d={areaPath((i) => bands[i].p10, (i) => bands[i].p90)} fill="var(--violet)" opacity="0.14" />
      <path className="fan__band" d={areaPath((i) => bands[i].p25, (i) => bands[i].p75)} fill="var(--violet)" opacity="0.22" />

      <path d={line((i) => bands[i].p50)} fill="none" stroke="var(--violet)" strokeWidth="2.5" />

      {showZero && (
        <line
          x1={PAD.left}
          y1={zeroY}
          x2={W - PAD.right}
          y2={zeroY}
          stroke="var(--stamp)"
          strokeWidth="1.75"
          strokeDasharray="6 4"
        />
      )}

      {/* where the known syllabus costs land */}
      {bands.map((b, i) =>
        b.courseCost > 0 ? (
          <g key={`c-${b.month}`}>
            <line
              x1={x(i)}
              y1={PAD.top}
              x2={x(i)}
              y2={PAD.top + plotH}
              stroke="var(--stamp)"
              strokeWidth="1"
              opacity="0.45"
            />
            <text
              x={x(i)}
              y={PAD.top + 12}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="10.5"
              fontWeight="600"
              fill="var(--stamp)"
            >
              −{money(b.courseCost, currency)}
            </text>
          </g>
        ) : null,
      )}

      <circle cx={x0} cy={y(startBalance)} r="4" fill="var(--ink)" />

      {bands.map((b, i) => (
        <text
          key={`m-${b.month}`}
          x={x(i)}
          y={H - 14}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="11"
          fill="var(--ink-faint)"
          letterSpacing="0.06em"
        >
          {monthLabel(b.month).toUpperCase()}
        </text>
      ))}
      <text
        x={x0}
        y={H - 14}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="11"
        fill="var(--ink-faint)"
        letterSpacing="0.06em"
      >
        NOW
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------ the component */

export function RunwayForecast({
  costs,
  events,
  currency,
}: {
  costs: PlannedCost[];
  events: PlannedEvent[];
  currency: string;
}) {
  const [balance, setBalance] = useState("");
  const [income, setIncome] = useState("");
  const [steadiness, setSteadiness] = useState<string>("shifts");
  const [spend, setSpend] = useState<SpendLine[]>(() => DEFAULT_SPEND.map((s) => ({ ...s })));

  const forecast = useMemo(() => {
    const start = Number(balance);
    if (!balance.trim() || !Number.isFinite(start)) return null;

    const courseCostByMonth: Record<string, number> = {};
    for (const c of costs) {
      if (c.amount === null || !c.isMandatory || !c.neededBy) continue;
      const key = c.neededBy.slice(0, 7);
      courseCostByMonth[key] = (courseCostByMonth[key] ?? 0) + c.amount;
    }

    const dates = [
      ...costs.filter((c) => c.neededBy).map((c) => c.neededBy as string),
      ...events.map((e) => e.date),
    ].sort();
    if (dates.length === 0) return null;

    const months: string[] = [];
    const cursor = new Date(`${dates[0]}T12:00:00`);
    cursor.setDate(1);
    const stop = new Date(`${dates[dates.length - 1]}T12:00:00`);
    stop.setDate(1);
    for (let i = 0; i < 18 && cursor <= stop; i++) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (months.length === 0) return null;

    return runForecast({
      startBalance: start,
      monthlyIncome: Number(income) || 0,
      incomeVolatility:
        INCOME_STEADINESS.find((s) => s.id === steadiness)?.volatility ?? 0.25,
      spend,
      courseCostByMonth,
      months,
    });
  }, [balance, income, steadiness, spend, costs, events]);

  const risk = forecast ? Math.round(forecast.probBroke * 100) : 0;
  const riskTone = risk >= 50 ? "is-high" : risk >= 15 ? "is-medium" : "is-low";

  return (
    <section className="runway">
      <p className="eyebrow">Will it last?</p>
      <h3 className="col__title" style={{ marginTop: 6 }}>
        Your term, simulated {forecast ? forecast.trials.toLocaleString() : "2,000"} times
      </h3>
      <p className="runway__blurb">
        A single date would be a guess dressed up as a fact — nobody spends
        exactly the same amount every month. So each category gets a realistic
        spread and the whole term runs a few thousand times. The course costs
        pulled from your syllabus stay fixed, because those are the one part we
        actually know. Nothing you type here leaves this tab.
      </p>

      <div className="runway__grid">
        <div>
          <label className="field">
            <span className="field__label">Balance today</span>
            <input
              className="field__input"
              inputMode="decimal"
              placeholder="1400"
              value={balance}
              onChange={(e) => setBalance(e.target.value.replace(/[^\d.]/g, ""))}
            />
          </label>

          <label className="field">
            <span className="field__label">Income per month</span>
            <input
              className="field__input"
              inputMode="decimal"
              placeholder="400"
              value={income}
              onChange={(e) => setIncome(e.target.value.replace(/[^\d.]/g, ""))}
            />
          </label>

          <label className="field">
            <span className="field__label">How steady is it?</span>
            <select
              className="field__input"
              value={steadiness}
              onChange={(e) => setSteadiness(e.target.value)}
            >
              {INCOME_STEADINESS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <div className="spend">
            <span className="field__label">Monthly living costs</span>
            {spend.map((s) => (
              <div key={s.id} className={`spend__row${s.on ? "" : " is-off"}`}>
                <input
                  type="checkbox"
                  id={`sp-${s.id}`}
                  checked={s.on}
                  onChange={() =>
                    setSpend((prev) =>
                      prev.map((p) => (p.id === s.id ? { ...p, on: !p.on } : p)),
                    )
                  }
                />
                <label htmlFor={`sp-${s.id}`}>
                  {s.label}
                  <span className="spend__vol" title="How much this swings month to month">
                    ±{Math.round(s.volatility * 100)}%
                  </span>
                </label>
                <input
                  className="spend__amount"
                  inputMode="decimal"
                  aria-label={`${s.label} per month`}
                  value={s.monthly}
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(/[^\d.]/g, ""));
                    setSpend((prev) =>
                      prev.map((p) =>
                        p.id === s.id ? { ...p, monthly: Number.isFinite(v) ? v : 0 } : p,
                      ),
                    );
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          {!forecast ? (
            <div className="verdict">
              <p className="total__label">Waiting on your balance</p>
              <p className="verdict__note">
                Enter what you have today and the term gets simulated against
                the costs above.
              </p>
            </div>
          ) : (
            <>
              <div className={`verdict verdict--risk ${riskTone}`}>
                <div>
                  <p className="total__label">Chance you run short this term</p>
                  <p className="verdict__figure">{risk}%</p>
                </div>
                <div className="outcomes">
                  <div className="outcome">
                    <span className="outcome__label">If things go badly</span>
                    <span className="outcome__value is-bad">
                      {forecast.worstCase
                        ? `broke by ${monthLabel(forecast.worstCase, true)}`
                        : `finish with ${money(forecast.endBalance.p10, currency)}`}
                    </span>
                  </div>
                  <div className="outcome">
                    <span className="outcome__label">Most likely</span>
                    <span className="outcome__value">
                      {forecast.expected
                        ? `broke by ${monthLabel(forecast.expected, true)}`
                        : `finish with ${money(forecast.endBalance.p50, currency)}`}
                    </span>
                  </div>
                  <div className="outcome">
                    <span className="outcome__label">If things go well</span>
                    <span className="outcome__value is-good">
                      {forecast.bestCase
                        ? `broke by ${monthLabel(forecast.bestCase, true)}`
                        : `finish with ${money(forecast.endBalance.p90, currency)}`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="fan__wrap">
                <div className="fan__legend">
                  <span><i className="k-band" /> middle 80% of outcomes</span>
                  <span><i className="k-mid" /> most likely path</span>
                  <span><i className="k-shock" /> known course cost</span>
                </div>
                <FanChart
                  bands={forecast.bands}
                  currency={currency}
                  startBalance={Number(balance)}
                />
              </div>

              {forecast.levers.length > 0 && (
                <div className="levers">
                  <p className="eyebrow">What moves the needle most</p>
                  <ul>
                    {forecast.levers.slice(0, 3).map((l) => (
                      <li key={l.id}>
                        <span className="levers__name">Drop {l.label.toLowerCase()}</span>
                        <span className="levers__effect">
                          {l.deltaProbBroke >= 0.01
                            ? `−${Math.round(l.deltaProbBroke * 100)} pts of risk`
                            : "no real risk change"}
                          {" · "}
                          {money(l.deltaEndBalance, currency)} more by term end
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
