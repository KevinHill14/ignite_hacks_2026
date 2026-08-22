"use client";

import { useMemo, useState } from "react";
import type { PlannedCost, PlannedEvent } from "@/lib/types";
import {
  runForecast,
  DEFAULT_SPEND,
  INCOME_STEADINESS,
  type SpendLine,
  type SimIncomeEvent,
} from "@/lib/runway-sim";
import {
  settleAid,
  splitAcrossTerms,
  settlementToEvents,
  monthlyFromPay,
  addMonths,
  type AidSource,
  type AidKind,
  type PayFrequency,
} from "@/lib/income";

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

      {/* money arriving — ink, following the ledger convention where credits
          are black and debits are red */}
      {bands.map((b, i) =>
        b.windfall > 0 ? (
          <g key={`w-${b.month}`}>
            <line
              x1={x(i)}
              y1={PAD.top}
              x2={x(i)}
              y2={PAD.top + plotH}
              stroke="var(--ink)"
              strokeWidth="1"
              opacity="0.35"
              strokeDasharray="3 3"
            />
            {/* Sits on its own row above the cost labels so the two never
                collide, and clear of the zero line wherever that lands. */}
            <text
              x={x(i)}
              y={PAD.top + 12}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="10.5"
              fontWeight="600"
              fill="var(--ink)"
            >
              +{money(b.windfall, currency)}
            </text>
          </g>
        ) : null,
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
              y={PAD.top + 26}
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

/* --------------------------------------------------------------- aid panel */

interface AidRow {
  id: string;
  label: string;
  kind: AidKind;
  amount: string;
  startMonth: string;
  splitTerms: boolean;
  confirmed: boolean;
  toAccount: boolean;
}

const AID_PRESETS: { kind: AidKind; label: string; splitTerms: boolean; toAccount: boolean }[] = [
  { kind: "osap", label: "OSAP", splitTerms: true, toAccount: true },
  { kind: "scholarship", label: "Entrance scholarship", splitTerms: true, toAccount: true },
  { kind: "bursary", label: "Bursary", splitTerms: false, toAccount: true },
];

function AidPanel({
  tuition,
  setTuition,
  rows,
  setRows,
  monthOptions,
  defaultMonth,
}: {
  tuition: string;
  setTuition: (v: string) => void;
  rows: AidRow[];
  setRows: React.Dispatch<React.SetStateAction<AidRow[]>>;
  monthOptions: string[];
  /** Term start. Earlier months are offered but are the wrong default. */
  defaultMonth: string;
}) {
  const update = (id: string, patch: Partial<AidRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="aid">
      <span className="field__label">Financial aid</span>

      <label className="field" style={{ marginTop: 6 }}>
        <span className="field__label">Tuition and fees you owe the school</span>
        <input
          className="field__input"
          inputMode="decimal"
          placeholder="9100"
          value={tuition}
          onChange={(e) => setTuition(e.target.value.replace(/[^\d.]/g, ""))}
        />
      </label>

      {rows.map((row) => (
        <div className="aid__row" key={row.id}>
          <div className="aid__head">
            <input
              className="aid__label"
              value={row.label}
              aria-label="Award name"
              onChange={(e) => update(row.id, { label: e.target.value })}
            />
            <button
              className="aid__remove"
              aria-label={`Remove ${row.label}`}
              onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
            >
              ×
            </button>
          </div>

          <div className="aid__fields">
            <label>
              <span>Total</span>
              <input
                inputMode="decimal"
                value={row.amount}
                onChange={(e) => update(row.id, { amount: e.target.value.replace(/[^\d.]/g, "") })}
              />
            </label>
            <label>
              <span>First paid</span>
              <select
                value={row.startMonth}
                onChange={(e) => update(row.id, { startMonth: e.target.value })}
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m, true)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="aid__toggles">
            <label>
              <input
                type="checkbox"
                checked={row.splitTerms}
                onChange={() => update(row.id, { splitTerms: !row.splitTerms })}
              />
              Split over two terms
            </label>
            <label>
              <input
                type="checkbox"
                checked={row.confirmed}
                onChange={() => update(row.id, { confirmed: !row.confirmed })}
              />
              Confirmed
            </label>
          </div>
          {!row.confirmed && (
            <p className="aid__note">
              Treated as a 50/50 chance, so the forecast shows both outcomes.
            </p>
          )}
        </div>
      ))}

      <div className="aid__add">
        {AID_PRESETS.map((p) => (
          <button
            key={p.kind}
            className="chip"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                {
                  id: `${p.kind}-${Date.now()}`,
                  label: p.label,
                  kind: p.kind,
                  amount: "",
                  startMonth: defaultMonth,
                  splitTerms: p.splitTerms,
                  confirmed: true,
                  toAccount: p.toAccount,
                },
              ])
            }
          >
            + {p.label}
          </button>
        ))}
      </div>
    </div>
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
  const [payFrequency, setPayFrequency] = useState<PayFrequency>("monthly");
  const [steadiness, setSteadiness] = useState<string>("shifts");
  const [spend, setSpend] = useState<SpendLine[]>(() => DEFAULT_SPEND.map((s) => ({ ...s })));
  const [tuition, setTuition] = useState("");
  const [aidRows, setAidRows] = useState<AidRow[]>([]);

  // The term window, derived from whatever the syllabus produced.
  const months = useMemo(() => {
    const dates = [
      ...costs.filter((c) => c.neededBy).map((c) => c.neededBy as string),
      ...events.map((e) => e.date),
    ].sort();
    if (dates.length === 0) return [];

    const out: string[] = [];
    const cursor = new Date(`${dates[0]}T12:00:00`);
    cursor.setDate(1);
    const stop = new Date(`${dates[dates.length - 1]}T12:00:00`);
    stop.setDate(1);
    for (let i = 0; i < 18 && cursor <= stop; i++) {
      out.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }, [costs, events]);

  // Aid can be paid before the term starts, so offer a few earlier months too.
  const monthOptions = useMemo(() => {
    if (months.length === 0) return [];
    return [addMonths(months[0], -4), addMonths(months[0], -3), addMonths(months[0], -2),
            addMonths(months[0], -1), ...months, addMonths(months[months.length - 1], 1)];
  }, [months]);

  /** Every award, expanded into instalments and run through the account. */
  const settlement = useMemo(() => {
    const sources: AidSource[] = [];
    for (const row of aidRows) {
      const total = Number(row.amount);
      if (!Number.isFinite(total) || total <= 0) continue;
      sources.push(
        ...splitAcrossTerms(
          {
            id: row.id,
            label: row.label,
            kind: row.kind,
            toAccount: row.toAccount,
            probability: row.confirmed ? 1 : 0.5,
          },
          total,
          row.startMonth,
          row.splitTerms ? 2 : 1,
        ),
      );
    }
    if (sources.length === 0) return null;
    return settleAid(sources, Number(tuition) || 0);
  }, [aidRows, tuition]);

  const forecast = useMemo(() => {
    const start = Number(balance);
    if (!balance.trim() || !Number.isFinite(start) || months.length === 0) return null;

    const courseCostByMonth: Record<string, number> = {};
    for (const c of costs) {
      if (c.amount === null || !c.isMandatory || !c.neededBy) continue;
      const key = c.neededBy.slice(0, 7);
      courseCostByMonth[key] = (courseCostByMonth[key] ?? 0) + c.amount;
    }

    const perCheque = Number(income) || 0;
    const incomeByMonth: Record<string, number> = {};
    for (const m of months) {
      incomeByMonth[m] = monthlyFromPay(m, perCheque, payFrequency, `${months[0]}-01`);
    }

    // Only money refunded during the term counts as income here. Anything paid
    // out before the window is already sitting in the balance they typed.
    const incomeEvents: SimIncomeEvent[] = settlement
      ? settlementToEvents(settlement).filter((e) => months.includes(e.month))
      : [];

    return runForecast({
      startBalance: start,
      monthlyIncome: perCheque,
      incomeByMonth,
      incomeVolatility:
        INCOME_STEADINESS.find((s) => s.id === steadiness)?.volatility ?? 0.25,
      spend,
      courseCostByMonth,
      incomeEvents,
      months,
    });
  }, [balance, income, payFrequency, steadiness, spend, costs, months, settlement]);

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
            <span className="field__label">
              {payFrequency === "monthly" ? "Income per month" : "Income per paycheque"}
            </span>
            <input
              className="field__input"
              inputMode="decimal"
              placeholder="400"
              value={income}
              onChange={(e) => setIncome(e.target.value.replace(/[^\d.]/g, ""))}
            />
          </label>

          <label className="field">
            <span className="field__label">Paid how often?</span>
            <select
              className="field__input"
              value={payFrequency}
              onChange={(e) => setPayFrequency(e.target.value as PayFrequency)}
            >
              <option value="monthly">Monthly</option>
              <option value="biweekly">Every two weeks</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          {payFrequency === "biweekly" && (
            <p className="field__hint">
              Two months a year carry three paycheques instead of two. Rent
              does not care, so those are modelled as real spikes.
            </p>
          )}

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
                  {/*
                    "±18%" is meaningless on its own. Spelling out the dollar
                    range it implies turns an opaque badge into a claim the
                    user can disagree with — and correct.
                  */}
                  <span
                    className="spend__vol"
                    title={
                      s.monthly > 0
                        ? `Most months fall between ${money(
                            Math.round(s.monthly * (1 - s.volatility)),
                            currency,
                          )} and ${money(
                            Math.round(s.monthly * (1 + s.volatility)),
                            currency,
                          )}. Adjust the amount if that looks wrong.`
                        : "How much this swings month to month."
                    }
                  >
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

          {monthOptions.length > 0 && (
            <AidPanel
              tuition={tuition}
              setTuition={setTuition}
              rows={aidRows}
              setRows={setAidRows}
              monthOptions={monthOptions}
              defaultMonth={months[0]}
            />
          )}
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
                  {/*
                    A bare percentage is unfalsifiable — it reads as a number
                    the app made up. The raw count is checkable: it says
                    exactly what was measured and how many times.
                  */}
                  <p className="verdict__basis">
                    You went below $0 in{" "}
                    <strong>
                      {Math.round(forecast.probBroke * forecast.trials).toLocaleString()}
                    </strong>{" "}
                    of {forecast.trials.toLocaleString()} simulated terms
                  </p>
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

              {settlement && settlement.gross > 0 && (
                <div className="aid-reveal">
                  <p className="total__label">Where your aid actually goes</p>
                  <div className="aid-reveal__flow">
                    <div>
                      <span className="aid-reveal__num">{money(settlement.gross, currency)}</span>
                      <span className="aid-reveal__cap">on paper</span>
                    </div>
                    <span className="aid-reveal__arrow">→</span>
                    <div>
                      <span className="aid-reveal__num is-out">
                        −{money(settlement.toSchool, currency)}
                      </span>
                      <span className="aid-reveal__cap">
                        straight to the school ({Math.round(settlement.withheldShare * 100)}%)
                      </span>
                    </div>
                    <span className="aid-reveal__arrow">→</span>
                    <div>
                      <span className="aid-reveal__num is-in">
                        {money(settlement.toStudent, currency)}
                      </span>
                      <span className="aid-reveal__cap">reaches your bank</span>
                    </div>
                  </div>

                  <table className="aid-reveal__table">
                    <tbody>
                      {settlement.ledger.map((l, i) => (
                        <tr key={`${l.source.id}-${i}`}>
                          <td>{monthLabel(l.source.month, true)}</td>
                          <td className="is-name">{l.source.label}</td>
                          <td>{money(l.source.amount, currency)}</td>
                          <td className="is-out">
                            {l.toSchool > 0 ? `−${money(l.toSchool, currency)}` : "—"}
                          </td>
                          <td className="is-in">
                            {l.toStudent > 0 ? money(l.toStudent, currency) : "nothing"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {settlement.stillOwed > 0 && (
                    <p className="aid-reveal__warn">
                      Your aid does not cover tuition — {money(settlement.stillOwed, currency)} is
                      still owed to the school and is not counted as a cost above.
                    </p>
                  )}
                  {(() => {
                    const outside = settlement.ledger.filter(
                      (l) => l.toStudent > 0 && !months.includes(l.source.month),
                    );
                    if (outside.length === 0) return null;
                    const total = outside.reduce((s, l) => s + l.toStudent, 0);
                    const early = outside.every((l) => l.source.month < months[0]);
                    return (
                      <p className="aid-reveal__warn">
                        {money(total, currency)} of this lands{" "}
                        {early ? "before your term starts" : "outside your term window"}
                        , so it is not counted as income in the forecast.{" "}
                        {early
                          ? "It should already be part of the balance you entered."
                          : "It arrives after the last date on your syllabus."}
                      </p>
                    );
                  })()}
                </div>
              )}

              <div className="fan__wrap">
                <div className="fan__legend">
                  <span><i className="k-band" /> middle 80% of outcomes</span>
                  <span><i className="k-mid" /> most likely path</span>
                  <span><i className="k-shock" /> known course cost</span>
                  <span><i className="k-in" /> money arriving</span>
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
