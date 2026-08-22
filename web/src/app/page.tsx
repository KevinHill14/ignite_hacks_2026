"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  IngestResponse,
  IngestResult,
  PlannedCost,
  PlannedEvent,
} from "@/lib/types";
import { DEMO_RESULT, DEMO_MULTI } from "@/lib/demo";
import { buildIcs } from "@/lib/ics";
import { UploadQueue, type UploadSlot } from "@/components/UploadQueue";
import { MergedResults } from "@/components/MergedResults";
import { RunwayForecast } from "@/components/RunwayForecast";

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

const CATEGORY_LABEL: Record<string, string> = {
  textbook: "Textbook",
  courseware: "Access code",
  lab_materials: "Lab kit",
  software: "Software",
  exam_fee: "Exam fee",
  field_trip: "Field trip",
  studio_fee: "Studio fee",
  other: "Other",
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

function TermSpine({ events, costs }: { events: PlannedEvent[]; costs: PlannedCost[] }) {
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

/* ------------------------------------------------------- calendar download */

/**
 * Hands the user a .ics file.
 *
 * This is the path that works for everyone. The Google integration needs a
 * verified OAuth app; until Google approves one, it only works for a
 * hand-maintained allowlist of test users. A downloaded calendar file has no
 * such gate and imports into Google, Apple, and Outlook alike.
 *
 * Built in the browser from data already on the page, so nothing is uploaded
 * and no round trip is needed.
 */
function DownloadCalendarButton({ result }: { result: IngestResult }) {
  const [done, setDone] = useState(false);

  function download() {
    const ics = buildIcs({
      events: result.events,
      costs: result.costs,
      courseCode: result.course.code,
      courseTitle: result.course.title,
      timezone: result.timezone,
    });

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(result.course.code || "syllabus").replace(/[^\w-]+/g, "-")}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on the next tick; revoking immediately can cancel the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setDone(true);
    setTimeout(() => setDone(false), 4000);
  }

  const count = result.events.length + result.costs.filter((c) => c.neededBy).length;

  return (
    <button className="btn" onClick={download} disabled={count === 0}>
      {done ? "Downloaded — open it to import" : `Add ${count} to my calendar`}
    </button>
  );
}

/* -------------------------------------------------------------- the page */

type Phase = "idle" | "working" | "done" | "error";

/** A full course load is five courses in a term. Ten would need syllabi that
 *  do not exist yet in September, since they are published per term. */
const MAX_FILES = 5;

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [slots, setSlots] = useState<UploadSlot[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Send one file. Returns the outcome rather than setting state, so the
   *  caller can run several at once and reconcile them together. */
  const sendOne = useCallback(
    async (file: File): Promise<{ ok: true; result: IngestResult } | { ok: false; error: string }> => {
      const body = new FormData();
      body.append("syllabus", file);
      try {
        const response = await fetch("/api/ingest", { method: "POST", body });
        const data: IngestResponse = await response.json();
        if (!response.ok || !data.ok) {
          return { ok: false, error: "error" in data ? data.error : "That import did not go through." };
        }
        return { ok: true, result: data };
      } catch {
        return { ok: false, error: "Could not reach the server." };
      }
    },
    [],
  );

  const runAll = useCallback(
    async (toRun: UploadSlot[]) => {
      setPhase("working");
      setMessage(null);
      setResult(null);

      setSlots((prev) =>
        prev.map((s) => (toRun.some((t) => t.id === s.id) ? { ...s, status: "parsing" } : s)),
      );

      /*
       * All at once, not one after another. Each file is a ~90 second model
       * call; five in sequence is seven and a half minutes of staring at a
       * spinner, which is a terrible demo and a worse product. Run in
       * parallel and settle independently so one bad PDF cannot take the
       * others down with it.
       */
      await Promise.all(
        toRun.map(async (slot) => {
          const outcome = await sendOne(slot.file);
          setSlots((prev) =>
            prev.map((s) =>
              s.id === slot.id
                ? outcome.ok
                  ? { ...s, status: "done", result: outcome.result, error: undefined }
                  : { ...s, status: "failed", error: outcome.error, result: undefined }
                : s,
            ),
          );
        }),
      );

      setPhase("done");
    },
    [sendOne],
  );

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const picked = Array.from(incoming);
      if (picked.length === 0) return;

      setMessage(null);
      const existing = slots.length;
      const room = MAX_FILES - existing;
      if (room <= 0) {
        setMessage(`That's the limit of ${MAX_FILES}. Remove one first.`);
        return;
      }
      if (picked.length > room) {
        setMessage(
          `Only the first ${room} were added — ${MAX_FILES} syllabi is the limit, which is a full course load.`,
        );
      }

      const next: UploadSlot[] = picked.slice(0, room).map((file, i) => ({
        id: `${Date.now()}-${i}-${file.name}`,
        file,
        status: "queued",
      }));

      setSlots((prev) => [...prev, ...next]);
      void runAll(next);
    },
    [slots.length, runAll],
  );

  const retryOne = useCallback(
    (id: string) => {
      const slot = slots.find((s) => s.id === id);
      if (slot) void runAll([slot]);
    },
    [slots, runAll],
  );

  const removeOne = useCallback((id: string) => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
    },
    [addFiles],
  );

  const busy = phase === "working";
  const succeeded = slots.filter((s) => s.status === "done" && s.result).map((s) => s.result!);

  // Seconds since the run started, so a 90-second wait does not look frozen.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  const reset = useCallback(() => {
    setPhase("idle");
    setResult(null);
    setSlots([]);
    setMessage(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const primaryCurrency = useMemo(() => {
    if (!result) return null;
    const entries = Object.entries(result.totals);
    if (entries.length === 0) return null;
    return entries.sort((a, b) => b[1].all - a[1].all)[0];
  }, [result]);

  return (
    <main>
      <div className="shell">
        {/* ------------------------------------------------------ masthead */}
        <header className="masthead">
          <div className="masthead__stamp">
            <span className="wordmark">
              Termsheet
              <span className="wordmark__sub">the real terms of your semester</span>
            </span>
            <span className="masthead__form-no">Powered by n8n + Claude</span>
          </div>
          <hr className="rule-heavy" />

          <h1 className="masthead__title">
            Your syllabus is <em>a bill</em> nobody itemized.
          </h1>
          <p className="masthead__lede">
            Drop in up to 5 syllabi. Every deadline goes onto your calendar,
            including fees you will have to pay. So you find out what the
            term costs now, not one surprise at a time.
          </p>
        </header>

        {/* -------------------------------------------------------- intake */}
        <section className="intake">
          <div>
            <label
              className={`dropzone${dragging ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={busy ? (e) => e.preventDefault() : onDrop}
            >
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                disabled={busy || slots.length >= MAX_FILES}
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  // Clear it, or picking the same file twice does nothing.
                  e.target.value = "";
                }}
              />
              {busy ? (
                <>
                  <p className="dropzone__headline">
                    {slots.length > 1 ? `Reading all ${slots.length} at once` : "Reading it now"}
                  </p>
                  <p className="dropzone__hint">
                    Resolving dates · pricing the term
                  </p>
                </>
              ) : (
                <>
                  <p className="dropzone__headline">
                    {slots.length === 0
                      ? "Drop your syllabi here"
                      : slots.length >= MAX_FILES
                        ? "That's a full course load"
                        : `Add another (${MAX_FILES - slots.length} more)`}
                  </p>
                  <p className="dropzone__hint">
                    PDF · up to {MAX_FILES}, one per course
                  </p>
                </>
              )}
            </label>

            {/*
              Small and out of the way on purpose — this is a shortcut for
              the curious, not a second call to action competing with the
              dropzone above it.
            */}
            {!busy && slots.length === 0 && (
              <p className="example-links">
                See an example first:{" "}
                <button
                  type="button"
                  className="example-links__link"
                  onClick={() => {
                    setSlots([]);
                    setResult(DEMO_RESULT);
                    setMessage(null);
                    setPhase("done");
                  }}
                >
                  one course
                </button>{" "}
                ·{" "}
                <button
                  type="button"
                  className="example-links__link"
                  onClick={() => {
                    // Fake completed slots so the merged view renders from
                    // the same code path a real multi-upload takes.
                    setResult(null);
                    setSlots(
                      DEMO_MULTI.map((r, i) => ({
                        id: `demo-${i}`,
                        file: new File([], r.sourceName),
                        status: "done" as const,
                        result: r,
                      })),
                    );
                    setMessage(null);
                    setPhase("done");
                  }}
                >
                  a full course load
                </button>
              </p>
            )}
          </div>

          <aside className="aside-card">
            <h2 className="aside-card__title">How it works</h2>
            <p>
              Every syllabus goes to Claude, which reads it for deadlines and
              costs the way you would — just faster, and across all five at
              once.
            </p>
            <ol className="aside-card__steps">
              <li>Drop in your syllabi — one PDF per course, up to five.</li>
              <li>
                Claude reads each one for due dates, weights, textbooks, and
                fees.
              </li>
              <li>
                Deadlines land on your calendar; every cost lands on one
                timeline so you see the term's real total.
              </li>
            </ol>
          </aside>
        </section>

        {/* -------------------------------------------------------- status */}
        <UploadQueue
          slots={slots}
          onRetry={retryOne}
          onRemove={removeOne}
          busy={busy}
        />

        {busy && (
          <div className="progress" style={{ marginBottom: 40 }}>
            {/*
              Elapsed seconds rather than invented stage names. n8n reports no
              intermediate progress, so any "extracting… pricing…" sequence
              would be a timer pretending to be telemetry. A number that is
              visibly counting says the same reassuring thing — this is still
              running — without claiming to know something we do not.
            */}
            <span>Working · {elapsed}s</span>
            <span className="progress__bar">
              <span />
            </span>
            <span className="progress__note">
              {elapsed < 30
                ? "reading the document"
                : elapsed < 90
                  ? "usually about 90 seconds"
                  : "longer than usual — still going"}
            </span>
          </div>
        )}

        {message && (
          <div className="notice reveal">
            <span className="notice__label">
              {phase === "error" ? "Import stopped" : "Heads up"}
            </span>
            {message}
          </div>
        )}

        {/* ------------------------------------------------------- results */}
        {phase === "done" && (
          <>
            {/*
              Two views, one pipeline. A single syllabus keeps the detailed
              per-course layout; two or more get the merged one, because the
              interesting facts — crunch weeks, shared textbooks, which course
              is expensive — only exist across files.
            */}
            {succeeded.length > 1 ? (
              <MergedResults results={succeeded} onReset={reset} />
            ) : (
              (result ?? succeeded[0]) && (
                <Results
                  result={(result ?? succeeded[0])!}
                  primaryCurrency={primaryCurrency}
                  onReset={reset}
                />
              )
            )}
          </>
        )}

        <footer className="footer">
          <span>
            <strong>Termsheet</strong> — every deadline and every dollar, out
            of your syllabi
          </span>
          <span>Your file is read, then discarded. Nothing is stored.</span>
        </footer>
      </div>
    </main>
  );
}

/* ----------------------------------------------------------- results view */

function Results({
  result,
  primaryCurrency,
  onReset,
}: {
  result: IngestResult;
  primaryCurrency: [string, { mandatory: number; optional: number; all: number }] | null;
  onReset: () => void;
}) {
  const { course, events, costs, calendar, warnings, stats } = result;

  // When every event fails for the same reason it is one configuration
  // problem, not N problems. Listing it N times buries the real warnings.
  const failureReasons = new Set(calendar.failed.map((f) => f.reason));
  const collapseFailures = calendar.failed.length > 3 && failureReasons.size === 1;

  /*
   * The worked example never touches a calendar, so it reports 0 created and
   * 0 failed. Rendering that as "0 of 9 on your calendar" reads as a failure
   * and makes people think the app is broken. A real run that fails records a
   * reason for every event, so zero-created-with-zero-failures can only mean
   * nothing was attempted.
   */
  const nothingWritten =
    calendar.attempted > 0 && calendar.created === 0 && calendar.failed.length === 0;

  return (
    <div className="reveal">
      {/* receipt header */}
      <section className="receipt">
        <div>
          <h2 className="receipt__course">
            {course.code ? `${course.code} — ` : ""}
            {course.title}
          </h2>
          <p className="receipt__meta">
            {[course.institution, course.term, result.sourceName]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        </div>
        <span className={`receipt__calendar${nothingWritten ? " is-sample" : ""}`}>
          {nothingWritten
            ? "Worked example — nothing was written to a calendar"
            : `${calendar.created} of ${calendar.attempted} on your calendar`}
        </span>
      </section>

      {/* the spine */}
      <section className="spine">
        <div className="spine__head">
          <div>
            <p className="eyebrow">The term, end to end</p>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--ink-soft)", maxWidth: "48ch" }}>
              Deadlines above the line, money below it. Read straight down from
              a busy week to see what it also costs you.
            </p>
          </div>
          <div className="spine__legend">
            <span><i className="k-time" /> Deadline</span>
            <span><i className="k-money" /> Cost</span>
          </div>
        </div>
        <TermSpine events={events} costs={costs} />
        <p className="spine__hint">Click any mark for the detail behind it</p>
      </section>

      {/* two ledgers */}
      <section className="ledger-grid">
        <div>
          <div className="col__head">
            <h3 className="col__title">What&apos;s due</h3>
            <span className="col__count">{events.length} items</span>
          </div>
          {events.length === 0 ? (
            <p className="row__meta" style={{ paddingTop: 16 }}>
              No dated deadlines came out of this syllabus. If it has a schedule
              table, it may be a scanned image rather than real text.
            </p>
          ) : (
            events.map((e, i) => (
              <div className="row" key={`${e.date}-${i}`}>
                <span className="row__date">{shortDate(e.date)}</span>
                <div className="row__body">
                  <p className="row__title">{e.summary}</p>
                  <p className="row__meta">
                    <span className="tag">{KIND_LABEL[e.kind] ?? "Due"}</span>
                    {e.weightPercent !== null && `${e.weightPercent}% of grade`}
                    {(e.confidence ?? 1) < 0.6 && (
                      <span className="tag is-unsure" style={{ marginLeft: 6 }}>
                        Check this date
                      </span>
                    )}
                  </p>
                </div>
                <span />
              </div>
            ))
          )}
        </div>

        <div>
          <div className="col__head">
            <h3 className="col__title">What it costs</h3>
            <span className="col__count">{costs.length} items</span>
          </div>
          {costs.length === 0 ? (
            <p className="row__meta" style={{ paddingTop: 16 }}>
              No costs were listed in this syllabus. That does not always mean
              the course is free — check the bookstore listing too.
            </p>
          ) : (
            costs.map((c, i) => (
              <div className="row" key={`${c.label}-${i}`}>
                <span className={`row__date${c.neededBy ? "" : " is-undated"}`}>
                  {c.neededBy ? shortDate(c.neededBy) : "No date"}
                </span>
                <div className="row__body">
                  <p className="row__title">{c.label}</p>
                  <p className="row__meta">
                    <span className={`tag${c.isMandatory ? "" : " is-optional"}`}>
                      {c.isMandatory ? "Required" : "Optional"}
                    </span>
                    {CATEGORY_LABEL[c.category] ?? "Other"}
                  </p>
                </div>
                <span className={`row__amount${c.amount === null ? " is-unknown" : ""}`}>
                  {c.amount === null ? "No price listed" : money(c.amount, c.currency)}
                </span>
              </div>
            ))
          )}

          {primaryCurrency && (
            <div className="total">
              <div>
                <p className="total__label">Term total · {primaryCurrency[0]}</p>
                <p className="total__sub">
                  {money(primaryCurrency[1].mandatory, primaryCurrency[0])} required
                  {primaryCurrency[1].optional > 0 &&
                    ` · ${money(primaryCurrency[1].optional, primaryCurrency[0])} optional`}
                  {stats.unpricedCount > 0 &&
                    ` · ${stats.unpricedCount} item${stats.unpricedCount === 1 ? "" : "s"} unpriced`}
                </p>
              </div>
              <p className="total__figure">
                {money(primaryCurrency[1].all, primaryCurrency[0])}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* runway */}
      <RunwayForecast
        costs={costs}
        events={events}
        currency={primaryCurrency?.[0] ?? "CAD"}
      />

      {/* flags */}
      {(warnings.length > 0 || calendar.failed.length > 0) && (
        <section className="flags">
          <p className="eyebrow">Worth checking by hand</p>
          <ul>
            {warnings.map((w, i) => (
              <li key={`w-${i}`}>{w}</li>
            ))}
            {collapseFailures ? (
              <li key="f-all">
                None of the {calendar.failed.length} events reached your
                calendar. Everything above was still extracted.
              </li>
            ) : (
              calendar.failed.map((f, i) => (
                <li key={`f-${i}`}>
                  Could not add “{f.summary}” to your calendar.
                </li>
              ))
            )}
          </ul>
        </section>
      )}

      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "flex-start",
          flexWrap: "wrap",
          marginBottom: 56,
        }}
      >
        <button className="btn" onClick={onReset}>
          Import another syllabus
        </button>
        <DownloadCalendarButton result={result} />
      </div>
    </div>
  );
}
