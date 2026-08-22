"use client";

import { useState } from "react";
import type { PlannedCost, PlannedEvent } from "@/lib/types";

/* ---------------------------------------------------------------- helpers */

/** Parse a YYYY-MM-DD as local noon so timezone never shifts the day. */
function day(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: string): string {
  const d = day(iso);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function money(amount: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: currency || "CAD",
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency ?? ""} ${amount.toFixed(2)}`.trim();
  }
}

const KIND_LABEL: Record<string, string> = {
  assignment: "Assignment",
  exam: "Exam",
  quiz: "Quiz",
  project: "Project",
  lab: "Lab",
  presentation: "Presentation",
  reading: "Reading",
  other: "Due",
};

/* ------------------------------------------------------------- term spine */

/**
 * The signature graphic: one shared time axis. Deadlines tick upward, costs
 * hang downward as bars scaled by amount. Reading straight down from a
 * cluster of deadlines shows what that same week costs.
 */
type SpineSelection =
  | { kind: "event"; event: PlannedEvent }
  | { kind: "costs"; date: string; items: (PlannedCost & { amount: number })[] };

export function TermSpine({ events, costs }: { events: PlannedEvent[]; costs: PlannedCost[] }) {
  // Before the early return below — hooks cannot sit after a conditional exit.
  const [selected, setSelected] = useState<SpineSelection | null>(null);

  const datedCosts = costs.filter(
    (c): c is PlannedCost & { neededBy: string; amount: number } =>
      Boolean(c.neededBy) && typeof c.amount === "number",
  );

  const stamps = [
    ...events.map((e) => day(e.date).getTime()),
    ...datedCosts.map((c) => day(c.neededBy).getTime()),
  ];

  if (stamps.length === 0) {
    return (
      <p className="spine__empty">
        No dated items to plot
      </p>
    );
  }

  const W = 1000;
  const H = 250;
  const PAD_X = 46;
  const AXIS_Y = 142;
  const MAX_TICK = 74; // tallest deadline tick
  const MAX_BAR = 78; // deepest cost bar

  let min = Math.min(...stamps);
  let max = Math.max(...stamps);
  // A single-day term would divide by zero; give it a week of breathing room.
  if (max - min < 86_400_000) {
    min -= 3 * 86_400_000;
    max += 3 * 86_400_000;
  }
  const span = max - min;
  const plotW = W - PAD_X * 2;
  const x = (t: number) => PAD_X + ((t - min) / span) * plotW;

  // Costs landing on the same day must stack, not overlap. Stacking also
  // reads better: one bar per date is what actually leaves your account.
  const byDate = new Map<string, { total: number; items: typeof datedCosts }>();
  for (const c of datedCosts) {
    const slot = byDate.get(c.neededBy) ?? { total: 0, items: [] };
    slot.total += c.amount;
    slot.items.push(c);
    byDate.set(c.neededBy, slot);
  }
  const costDays = [...byDate.entries()].map(([date, v]) => ({ date, ...v }));
  const biggestDay = Math.max(...costDays.map((d) => d.total), 1);

  // Month boundaries inside the span, for the ruled backdrop.
  const months: { label: string; at: number }[] = [];
  const cursor = new Date(day(new Date(min).toISOString().slice(0, 10)));
  cursor.setDate(1);
  for (let i = 0; i < 24; i++) {
    const t = cursor.getTime();
    if (t > max) break;
    if (t >= min) {
      months.push({ label: `${MONTH_SHORT[cursor.getMonth()]}`, at: x(t) });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Label only the three heaviest days; the rest stay as unlabelled bars.
  const labelled = new Set(
    [...costDays].sort((a, b) => b.total - a.total).slice(0, 3).map((d) => d.date),
  );

  return (
    <>
    <svg
      className="spine__canvas"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Term timeline: ${events.length} deadlines above the line, ${datedCosts.length} dated costs below it.`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* month gridlines */}
      {months.map((m) => (
        <g key={`${m.label}-${m.at}`}>
          <line
            x1={m.at}
            y1={26}
            x2={m.at}
            y2={H - 22}
            stroke="var(--rule)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
          <text
            x={m.at + 5}
            y={H - 8}
            fontFamily="var(--font-mono)"
            fontSize="11"
            fill="var(--ink-faint)"
            letterSpacing="1"
          >
            {m.label.toUpperCase()}
          </text>
        </g>
      ))}

      {/* the spine itself */}
      <line
        className="draw"
        style={{ ["--len" as string]: String(W) }}
        x1={PAD_X}
        y1={AXIS_Y}
        x2={W - PAD_X}
        y2={AXIS_Y}
        stroke="var(--ink)"
        strokeWidth="2"
      />

      {/* deadlines, above */}
      {events.map((e, i) => {
        const cx = x(day(e.date).getTime());
        const weight = e.weightPercent ?? 0;
        // Heavier assignments get taller ticks; unweighted get a base height.
        const h = 22 + Math.min(weight / 40, 1) * (MAX_TICK - 22);
        const unsure = (e.confidence ?? 1) < 0.6;
        return (
          <g
            key={`${e.date}-${e.summary}-${i}`}
            className="pop spine__hit"
            style={{ animationDelay: `${450 + i * 26}ms` }}
            onClick={() => setSelected({ kind: "event", event: e })}
            role="button"
            tabIndex={0}
            onKeyDown={(k) => {
              if (k.key === "Enter" || k.key === " ") {
                k.preventDefault();
                setSelected({ kind: "event", event: e });
              }
            }}
            aria-label={`${shortDate(e.date)} — ${e.summary}. Show details.`}
          >
            <title>{`${shortDate(e.date)} — ${e.summary}${weight ? ` (${weight}%)` : ""}`}</title>
            {/* Invisible wide target: a 2px tick is not clickable in practice. */}
            <rect
              x={cx - 9}
              y={AXIS_Y - h - 8}
              width={18}
              height={h + 12}
              fill="transparent"
            />
            <line
              x1={cx}
              y1={AXIS_Y}
              x2={cx}
              y2={AXIS_Y - h}
              stroke="var(--violet)"
              strokeWidth={weight >= 20 ? 3 : 1.75}
              strokeDasharray={unsure ? "3 3" : undefined}
            />
            <circle cx={cx} cy={AXIS_Y - h} r={weight >= 20 ? 4 : 2.75} fill="var(--violet)" />
          </g>
        );
      })}

      {/* costs, below — one stacked bar per date */}
      {costDays.map((d, i) => {
        const cx = x(day(d.date).getTime());
        const fullH = 14 + (d.total / biggestDay) * (MAX_BAR - 14);
        let offset = 0;
        return (
          <g
            key={d.date}
            className="grow spine__hit"
            style={{ animationDelay: `${700 + i * 60}ms` }}
            onClick={() => setSelected({ kind: "costs", date: d.date, items: d.items })}
            role="button"
            tabIndex={0}
            onKeyDown={(k) => {
              if (k.key === "Enter" || k.key === " ") {
                k.preventDefault();
                setSelected({ kind: "costs", date: d.date, items: d.items });
              }
            }}
            aria-label={`${shortDate(d.date)} — ${money(d.total, d.items[0].currency)} of costs. Show details.`}
          >
            <rect x={cx - 9} y={AXIS_Y} width={18} height={fullH + 8} fill="transparent" />
            <title>
              {`${shortDate(d.date)} — ${money(d.total, d.items[0].currency)}\n` +
                d.items.map((c) => `· ${c.label}: ${money(c.amount, c.currency)}`).join("\n")}
            </title>
            {d.items.map((c, j) => {
              const segH = (c.amount / d.total) * fullH;
              const y = AXIS_Y + offset;
              offset += segH;
              return (
                <rect
                  key={`${c.label}-${j}`}
                  x={cx - 7}
                  y={y}
                  width={14}
                  height={Math.max(segH - (d.items.length > 1 ? 1 : 0), 1)}
                  fill={c.isMandatory ? "var(--stamp)" : "var(--stamp-soft)"}
                />
              );
            })}
            {labelled.has(d.date) && (
              <text
                x={cx}
                y={AXIS_Y + fullH + 15}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize="11"
                fontWeight="600"
                fill="var(--stamp)"
              >
                {money(d.total, d.items[0].currency)}
              </text>
            )}
          </g>
        );
      })}
    </svg>

    {/*
      Detail on demand. The spine answers "when is it heavy"; this answers
      "heavy with what", without cluttering the graphic for the 90% of the
      time nobody is asking.
    */}
    {selected && (
      <div className="spine__detail reveal">
        <button
          className="spine__close"
          onClick={() => setSelected(null)}
          aria-label="Close details"
        >
          ×
        </button>

        {selected.kind === "event" ? (
          <>
            <p className="spine__detail-date">{shortDate(selected.event.date)}</p>
            <p className="spine__detail-title">{selected.event.summary}</p>
            <p className="spine__detail-meta">
              <span className="tag">{KIND_LABEL[selected.event.kind] ?? "Due"}</span>
              {selected.event.weightPercent !== null &&
                `${selected.event.weightPercent}% of your final grade`}
              {(selected.event.confidence ?? 1) < 0.6 && (
                <span className="tag is-unsure" style={{ marginLeft: 6 }}>
                  Date inferred — verify it
                </span>
              )}
            </p>
            {selected.event.description && (
              <p className="spine__detail-body">{selected.event.description}</p>
            )}
          </>
        ) : (
          <>
            <p className="spine__detail-date">{shortDate(selected.date)}</p>
            <p className="spine__detail-title">
              {money(
                selected.items.reduce((s, c) => s + c.amount, 0),
                selected.items[0].currency,
              )}{" "}
              due
            </p>
            <ul className="spine__detail-list">
              {selected.items.map((c, i) => (
                <li key={`${c.label}-${i}`}>
                  <span>
                    <span className={`tag${c.isMandatory ? "" : " is-optional"}`}>
                      {c.isMandatory ? "Required" : "Optional"}
                    </span>
                    {c.label}
                  </span>
                  <strong>{money(c.amount, c.currency)}</strong>
                </li>
              ))}
            </ul>
            {selected.items[0].sourceQuote && (
              <p className="spine__detail-body">
                From the syllabus: “{selected.items[0].sourceQuote}”
              </p>
            )}
          </>
        )}
      </div>
    )}
    </>
  );
}
