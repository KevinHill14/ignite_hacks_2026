"use client";

import { useMemo, useState } from "react";
import type { IngestResult } from "@/lib/types";
import { mergeResults } from "@/lib/merge";
import { buildIcs } from "@/lib/ics";
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

/**
 * Export the whole term as one calendar file.
 *
 * The merged export is the more useful one: a student importing five courses
 * wants a single file, not five downloads they then have to merge themselves.
 * Event titles already carry the course code, so everything stays legible
 * once it lands in a calendar app.
 */
function DownloadTermButton({ merged }: { merged: ReturnType<typeof mergeResults> }) {
  const [done, setDone] = useState(false);

  function download() {
    const ics = buildIcs({
      events: merged.events,
      costs: merged.costs,
      courseCode: `${merged.courses.length} courses`,
      courseTitle: "Full term",
      timezone: merged.timezone,
    });

    const url = URL.createObjectURL(
      new Blob([ics], { type: "text/calendar;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-term.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setDone(true);
    setTimeout(() => setDone(false), 4000);
  }

  const count =
    merged.events.length + merged.costs.filter((c) => c.neededBy).length;

  return (
    <button className="btn" onClick={download} disabled={count === 0}>
      {done ? "Downloaded — open it to import" : `Add all ${count} to my calendar`}
    </button>
  );
}

export function MergedResults({
  results,
  onReset,
}: {
  results: IngestResult[];
  onReset: () => void;
}) {
  /*
   * Dropping a course is a financial decision, and nothing else in a student's
   * life helps them make it. Toggling one off here recomputes the term total,
   * the crunch weeks, and the runway — so the question "can I afford to keep
   * this?" gets an actual answer rather than a shrug.
   *
   * Indices into `results` rather than course keys: two syllabi could plausibly
   * carry the same course code, and an index is unambiguous.
   */
  const [dropped, setDropped] = useState<Set<number>>(new Set());

  const kept = useMemo(
    () => results.filter((_, i) => !dropped.has(i)),
    [results, dropped],
  );

  // Everything renders from the kept set; `full` exists only to measure what
  // dropping actually changed.
  const merged = useMemo(() => mergeResults(kept), [kept]);
  const full = useMemo(() => mergeResults(results), [results]);

  const colorOf = useMemo(
    () => new Map(full.courses.map((c) => [c.key, c.color])),
    [full.courses],
  );

  const primary = Object.entries(merged.totals).sort((a, b) => b[1].all - a[1].all)[0];
  const fullPrimary = Object.entries(full.totals).sort((a, b) => b[1].all - a[1].all)[0];
  const currency = primary?.[0] ?? fullPrimary?.[0] ?? "CAD";

  const saved = (fullPrimary?.[1].all ?? 0) - (primary?.[1].all ?? 0);
  const clustersGone = full.clusters.length - merged.clusters.length;
  const deadlinesGone = full.events.length - merged.events.length;

  const toggle = (i: number) =>
    setDropped((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  /*
   * Same reasoning as the single-course view: a worked example never
   * touches a calendar, so it reports 0 created and 0 failed. Rendered as
   * "0 of 10 on your calendar" that reads as a failed run, not a demo.
   */
  const nothingWritten =
    merged.calendar.attempted > 0 &&
    merged.calendar.created === 0 &&
    merged.calendar.failed.length === 0;

  if (kept.length === 0) {
    return (
      <div className="reveal">
        <div className="verdict" style={{ marginBottom: 22 }}>
          <div>
            <p className="total__label">Every course dropped</p>
            <p className="verdict__note">
              Put one back to see the term again.
            </p>
          </div>
        </div>
        <button className="btn" onClick={() => setDropped(new Set())}>
          Undo
        </button>
      </div>
    );
  }

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
        <span className={`receipt__calendar${nothingWritten ? " is-sample" : ""}`}>
          {nothingWritten
            ? "Worked example — nothing was written to a calendar"
            : `${merged.calendar.created} of ${merged.calendar.attempted} on your calendar`}
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
                  {c.courseKeys.length} of {merged.courses.length} courses
                  {c.shareOfTerm > 0 &&
                    ` · ${Math.round(c.shareOfTerm * 100)}% of your term's grades`}
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
        <p className="breakdown__hint">
          Thinking of dropping one? Turn it off and everything below recalculates.
        </p>

        {results.map((r, i) => {
          const key = r.course.code || r.course.title || r.sourceName;
          const row = full.perCourse.find((p) => p.courseKey === key);
          const isDropped = dropped.has(i);
          return (
            <div
              className={`breakdown__row${isDropped ? " is-dropped" : ""}`}
              key={`${key}-${i}`}
            >
              <span
                className="breakdown__swatch"
                style={{ background: colorOf.get(key) }}
              />
              <span className="breakdown__name">
                {r.course.code || r.course.title}
                <span className="breakdown__sub">
                  {r.events.length} deadlines
                  {row && row.costTotal === 0 && " · nothing to buy"}
                </span>
              </span>
              <span className="breakdown__amount">
                {row && row.costTotal > 0
                  ? money(row.costTotal, row.currency)
                  : "no cost listed"}
              </span>
              <button
                className="breakdown__drop"
                onClick={() => toggle(i)}
                aria-pressed={isDropped}
              >
                {isDropped ? "Put back" : "Drop"}
              </button>
            </div>
          );
        })}

        {dropped.size > 0 && (
          <div className="whatif">
            <p className="whatif__label">
              Without {[...dropped]
                .map((i) => results[i].course.code || results[i].course.title)
                .join(" and ")}
            </p>
            <p className="whatif__figure">
              {saved > 0 ? `${money(saved, currency)} less to pay` : "No change to the total"}
            </p>
            <p className="whatif__detail">
              {deadlinesGone} fewer deadline{deadlinesGone === 1 ? "" : "s"}
              {clustersGone > 0 &&
                ` · ${clustersGone} crunch week${clustersGone === 1 ? "" : "s"} gone`}
              {clustersGone === 0 &&
                merged.clusters.length > 0 &&
                " · the crunch week stays"}
            </p>
          </div>
        )}
        {merged.duplicates.length > 0 && (
          /*
            Name the actual item when there is only one. "Shared items are
            counted for each course" is abstract; "the iClicker counts for
            both" is a thing the reader can picture and check.
          */
          <p className="breakdown__note">
            {merged.duplicates.length === 1
              ? `${merged.duplicates[0].label} counts toward both courses above, but only once in the total.`
              : "Shared items count toward each course above, but only once in the total."}
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

      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 56,
        }}
      >
        <button className="btn" onClick={onReset}>
          Start over
        </button>
        <DownloadTermButton merged={merged} />
      </div>
    </div>
  );
}
