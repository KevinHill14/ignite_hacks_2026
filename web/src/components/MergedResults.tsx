"use client";

import { useMemo } from "react";
import type { IngestResult } from "@/lib/types";
import { mergeResults } from "@/lib/merge";
import { RunwayForecast } from "@/components/RunwayForecast";

/**
 * A whole course load on one axis.
 *
 * Everything here is a fact you cannot get from any single syllabus: the week
 * four courses all want something, the textbook two of them share, which
 * course is quietly the expensive one. That is the argument for importing five
 * at once rather than one at a time.
 */

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function day(iso: string) {
  return new Date(`${iso}T12:00:00`);
}

function shortDate(iso: string) {
  const d = day(iso);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function money(amount: number, currency: string | null) {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: currency || "CAD",
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function MergedResults({
  results,
  onReset,
}: {
  results: IngestResult[];
  onReset: () => void;
}) {
  const merged = useMemo(() => mergeResults(results), [results]);
  const colorOf = useMemo(
    () => new Map(merged.courses.map((c) => [c.key, c.color])),
    [merged.courses],
  );

  const primary = Object.entries(merged.totals).sort((a, b) => b[1].all - a[1].all)[0];
  const currency = primary?.[0] ?? "CAD";

  return (
    <div className="reveal">
      {/* ------------------------------------------------------- receipt */}
      <section className="receipt">
        <div>
          <h2 className="receipt__course">
            {merged.courses.length} courses, one term
          </h2>
          <p className="receipt__meta">
            {merged.courses.map((c) => c.code || c.title).join("  ·  ")}
          </p>
        </div>
        <span className="receipt__calendar">
          {merged.calendar.created} of {merged.calendar.attempted} on your calendar
        </span>
      </section>

      {/* --------------------------------------------------- crunch weeks */}
      {merged.clusters.length > 0 && (
        <section className="clusters">
          <p className="eyebrow">Weeks where everything lands at once</p>
          <p className="clusters__lede">
            No single syllabus can tell you this. It only shows up once the
            whole load is on one axis — and these are usually the weeks you
            spend more and work fewer shifts.
          </p>
          {merged.clusters.map((c) => (
            <div className="cluster" key={c.weekStart}>
              <div className="cluster__head">
                <span className="cluster__week">
                  {shortDate(c.weekStart)} – {shortDate(c.weekEnd)}
                </span>
                <span className="cluster__weight">
                  {c.courseKeys.length} courses
                  {c.totalWeight > 0 && ` · ${Math.round(c.totalWeight)}% of your grades`}
                </span>
              </div>
              <ul className="cluster__list">
                {c.events.map((e, i) => (
                  <li key={`${e.date}-${i}`}>
                    <span
                      className="cluster__chip"
                      style={{ background: colorOf.get(e.courseKey) }}
                    />
                    <span className="cluster__date">{shortDate(e.date)}</span>
                    <span>{e.summary}</span>
                    {e.weightPercent !== null && (
                      <strong>{e.weightPercent}%</strong>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* ------------------------------------------------- per-course cost */}
      <section className="breakdown">
        <div className="col__head">
          <h3 className="col__title">Which course costs what</h3>
          {primary && (
            <span className="col__count">
              {money(primary[1].all, currency)} total
            </span>
          )}
        </div>
        {merged.perCourse.map((p) => (
          <div className="breakdown__row" key={p.courseKey}>
            <span className="breakdown__swatch" style={{ background: p.color }} />
            <span className="breakdown__name">
              {p.code || p.title}
              <span className="breakdown__sub">{p.eventCount} deadlines</span>
            </span>
            <span className="breakdown__amount">
              {p.costTotal > 0 ? money(p.costTotal, p.currency) : "no cost listed"}
            </span>
          </div>
        ))}
        {merged.duplicates.length > 0 && (
          <p className="breakdown__note">
            Per-course figures include items shared between courses, so they add
            up to more than the term total. The total counts each shared item
            once.
          </p>
        )}
      </section>

      {/* ------------------------------------------------------ duplicates */}
      {merged.duplicates.length > 0 && (
        <section className="dupes">
          <p className="eyebrow">Counted once, not twice</p>
          {merged.duplicates.map((d) => (
            <div className="dupes__row" key={d.label}>
              <span>{d.label}</span>
              <span className="dupes__where">
                required by {d.courseKeys.join(" and ")}
                {d.amount !== null && ` · ${money(d.amount, d.currency)}`}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* ---------------------------------------------------------- runway */}
      <RunwayForecast
        costs={merged.costs}
        events={merged.events}
        currency={currency}
      />

      {/* --------------------------------------------------------- warnings */}
      {merged.warnings.length > 0 && (
        <section className="flags">
          <p className="eyebrow">Worth checking by hand</p>
          <ul>
            {merged.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <button className="btn" onClick={onReset} style={{ marginBottom: 56 }}>
        Start over
      </button>
    </div>
  );
}
