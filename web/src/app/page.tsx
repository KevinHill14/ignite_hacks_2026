"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type {
  IngestResponse,
  IngestResult,
  PlannedCost,
  PlannedEvent,
} from "@/lib/types";
import { DEMO_RESULT } from "@/lib/demo";

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
function TermSpine({ events, costs }: { events: PlannedEvent[]; costs: PlannedCost[] }) {
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
          <g key={`${e.date}-${e.summary}-${i}`} className="pop" style={{ animationDelay: `${450 + i * 26}ms` }}>
            <title>{`${shortDate(e.date)} — ${e.summary}${weight ? ` (${weight}%)` : ""}`}</title>
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
          <g key={d.date} className="grow" style={{ animationDelay: `${700 + i * 60}ms` }}>
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
  );
}

/* ---------------------------------------------------------------- briefing */

/**
 * Plays a spoken summary of the term. Degrades quietly: if the server has no
 * ElevenLabs key the button reports that once and stops offering itself,
 * rather than failing repeatedly.
 */
function BriefingButton({ result }: { result: IngestResult }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "off">("idle");
  const [script, setScript] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (state === "off") return null;

  async function play() {
    if (audioRef.current) {
      void audioRef.current.play();
      setState("playing");
      return;
    }

    setState("loading");
    try {
      const response = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });

      if (response.status === 501) {
        setState("off");
        return;
      }
      if (!response.ok) {
        setState("idle");
        return;
      }

      const header = response.headers.get("X-Briefing-Script");
      if (header) setScript(decodeURIComponent(header));

      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audio.onended = () => setState("idle");
      audioRef.current = audio;
      await audio.play();
      setState("playing");
    } catch {
      setState("idle");
    }
  }

  return (
    <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
      <button className="btn" onClick={play} disabled={state === "loading"}>
        {state === "loading"
          ? "Preparing…"
          : state === "playing"
            ? "Playing briefing"
            : "Hear the 30-second briefing"}
      </button>
      {script && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)", maxWidth: "60ch" }}>
          {script}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ runway */

interface SpendLine {
  id: string;
  label: string;
  monthly: number;
  on: boolean;
}

const DEFAULT_SPEND: SpendLine[] = [
  { id: "groceries", label: "Groceries", monthly: 320, on: true },
  { id: "transit", label: "Transit and gas", monthly: 90, on: true },
  { id: "phone", label: "Phone", monthly: 55, on: true },
  { id: "eatingout", label: "Eating out", monthly: 120, on: false },
  { id: "subs", label: "Subscriptions", monthly: 25, on: false },
];

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${y}`;
}

/**
 * Projects a running balance across the term.
 *
 * Everything typed here stays in React state — the balance is never sent to
 * the server, never persisted, and never leaves the tab. That is a deliberate
 * design constraint, not an oversight: this app has no business holding
 * anyone's bank balance.
 */
function Runway({
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
  const [spend, setSpend] = useState<SpendLine[]>(DEFAULT_SPEND);

  const livingMonthly = spend
    .filter((s) => s.on)
    .reduce((sum, s) => sum + (Number.isFinite(s.monthly) ? s.monthly : 0), 0);

  const projection = useMemo(() => {
    const start = Number(balance);
    const perMonth = Number(income);
    if (!balance.trim() || !Number.isFinite(start)) return null;

    // Course costs bucketed by the month they come due.
    const dueByMonth = new Map<string, number>();
    for (const c of costs) {
      if (c.amount === null || !c.isMandatory) continue;
      const key = c.neededBy ? c.neededBy.slice(0, 7) : null;
      if (!key) continue;
      dueByMonth.set(key, (dueByMonth.get(key) ?? 0) + c.amount);
    }

    // Span the term: from the earliest dated thing to the latest.
    const allDates = [
      ...costs.filter((c) => c.neededBy).map((c) => c.neededBy as string),
      ...events.map((e) => e.date),
    ].sort();
    if (allDates.length === 0) return null;

    const first = new Date(`${allDates[0]}T12:00:00`);
    const last = new Date(`${allDates[allDates.length - 1]}T12:00:00`);

    const rows: {
      key: string;
      income: number;
      living: number;
      course: number;
      closing: number;
    }[] = [];

    let running = start;
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
    const endStop = new Date(last.getFullYear(), last.getMonth(), 1);

    for (let i = 0; i < 18 && cursor <= endStop; i++) {
      const key = monthKey(cursor);
      const course = dueByMonth.get(key) ?? 0;
      const inc = Number.isFinite(perMonth) ? perMonth : 0;
      running = running + inc - livingMonthly - course;
      rows.push({ key, income: inc, living: livingMonthly, course, closing: running });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const firstShort = rows.find((r) => r.closing < 0) ?? null;
    return { rows, ending: running, firstShort };
  }, [balance, income, livingMonthly, costs, events]);

  return (
    <section className="runway">
      <p className="eyebrow">Will it last?</p>
      <h3 className="col__title" style={{ marginTop: 6 }}>
        Run your balance to the end of term
      </h3>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: 14,
          color: "var(--ink-soft)",
          maxWidth: "62ch",
        }}
      >
        Add what you have now and what you expect to come in. The required
        course costs above get subtracted in the month they land. Nothing you
        type here is sent anywhere — it stays in this browser tab.
      </p>

      <div className="runway__grid">
        <div>
          <label className="field">
            <span className="field__label">Balance today</span>
            <input
              className="field__input"
              inputMode="decimal"
              placeholder="1200"
              value={balance}
              onChange={(e) => setBalance(e.target.value.replace(/[^\d.]/g, ""))}
            />
          </label>

          <label className="field">
            <span className="field__label">Income per month</span>
            <input
              className="field__input"
              inputMode="decimal"
              placeholder="850"
              value={income}
              onChange={(e) => setIncome(e.target.value.replace(/[^\d.]/g, ""))}
            />
          </label>

          <div className="spend">
            <span className="field__label">Monthly living costs</span>
            {spend.map((s) => (
              <div key={s.id} className={`spend__row${s.on ? "" : " is-off"}`}>
                <input
                  type="checkbox"
                  id={`spend-${s.id}`}
                  checked={s.on}
                  onChange={() =>
                    setSpend((prev) =>
                      prev.map((p) => (p.id === s.id ? { ...p, on: !p.on } : p)),
                    )
                  }
                />
                <label htmlFor={`spend-${s.id}`}>{s.label}</label>
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
          {!projection ? (
            <div className="verdict">
              <p className="total__label">Waiting on your balance</p>
              <p className="verdict__note">
                Enter what you have today to see how the term plays out.
              </p>
            </div>
          ) : (
            <>
              <div
                className={`verdict ${projection.firstShort ? "is-short" : "is-clear"}`}
              >
                <p className="total__label">
                  {projection.firstShort ? "You run short" : "Left at end of term"}
                </p>
                <p className="verdict__figure">
                  {projection.firstShort
                    ? monthLabel(projection.firstShort.key)
                    : money(projection.ending, currency)}
                </p>
                <p className="verdict__note">
                  {projection.firstShort
                    ? `Your balance goes negative in ${monthLabel(
                        projection.firstShort.key,
                      )}, ending the term at ${money(projection.ending, currency)}. Buying the optional items would push that earlier.`
                    : `You stay in the black the whole term, finishing with ${money(
                        projection.ending,
                        currency,
                      )}. Only required course costs are counted here.`}
                </p>
              </div>

              <table className="months">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>In</th>
                    <th>Living</th>
                    <th>Course</th>
                    <th>Left</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.rows.map((r) => (
                    <tr key={r.key} className={r.closing < 0 ? "is-negative" : ""}>
                      <td>{monthLabel(r.key)}</td>
                      <td>{r.income ? money(r.income, currency) : "—"}</td>
                      <td>{r.living ? `−${money(r.living, currency)}` : "—"}</td>
                      <td>{r.course ? `−${money(r.course, currency)}` : "—"}</td>
                      <td className="closing">{money(r.closing, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- the page */

type Phase = "idle" | "working" | "done" | "error";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    setFileName(file.name);
    setPhase("working");
    setMessage(null);
    setResult(null);

    const body = new FormData();
    body.append("syllabus", file);

    try {
      const response = await fetch("/api/ingest", { method: "POST", body });
      const data: IngestResponse = await response.json();

      if (!response.ok || !data.ok) {
        setMessage("error" in data ? data.error : "That import did not go through.");
        setPhase("error");
        return;
      }

      setResult(data);
      setPhase("done");
    } catch {
      setMessage("Could not reach the server. Check that the app is still running.");
      setPhase("error");
    }
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void upload(file);
    },
    [upload],
  );

  const busy = phase === "working";

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
            <span className="masthead__form-no">Form SYL-1 · Term cost &amp; schedule</span>
            <span className="masthead__form-no">Powered by n8n + Claude</span>
          </div>
          <hr className="rule-heavy" />

          <h1 className="masthead__title">
            Your syllabus is <em>a bill</em> nobody itemized.
          </h1>
          <p className="masthead__lede">
            Drop in the PDF. Every deadline goes straight onto your Google
            Calendar, and every textbook, lab kit, access code, and exam fee
            gets laid out on one timeline — so you find out what the term costs
            now, not one surprise at a time.
          </p>
        </header>

        {/* -------------------------------------------------------- intake */}
        <section className="intake">
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
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            {busy ? (
              <>
                <p className="dropzone__headline">Reading it now</p>
                <p className="dropzone__hint">
                  Resolving dates · pricing the term
                </p>
              </>
            ) : (
              <>
                <p className="dropzone__headline">Drop your syllabus here</p>
                <p className="dropzone__hint">PDF · or click to choose a file</p>
              </>
            )}
            {fileName && !busy && <p className="dropzone__file">{fileName}</p>}
          </label>

          <aside className="aside-card">
            <h2 className="aside-card__title">Or never touch this page again</h2>
            <p>
              Connect Google Drive once in n8n and point the pipeline at a
              folder. Anything you drop in it imports on its own — no upload, no
              clicking.
            </p>
            <ol className="aside-card__steps">
              <li>Open n8n and connect Google Drive and Google Calendar.</li>
              <li>Set the watched folder on the Drive trigger.</li>
              <li>Activate the workflow. Drop syllabi in the folder.</li>
            </ol>
            <button
              className="btn"
              style={{ alignSelf: "flex-start", marginTop: 4 }}
              onClick={() => {
                setResult(DEMO_RESULT);
                setFileName(DEMO_RESULT.sourceName);
                setMessage(null);
                setPhase("done");
              }}
            >
              See a worked example
            </button>
          </aside>
        </section>

        {/* -------------------------------------------------------- status */}
        {busy && (
          <div className="progress" style={{ marginBottom: 40 }}>
            <span>Working</span>
            <span className="progress__bar">
              <span />
            </span>
          </div>
        )}

        {phase === "error" && message && (
          <div className="notice reveal">
            <span className="notice__label">Import stopped</span>
            {message}
          </div>
        )}

        {/* ------------------------------------------------------- results */}
        {phase === "done" && result && (
          <Results result={result} primaryCurrency={primaryCurrency} onReset={() => {
            setPhase("idle");
            setResult(null);
            setFileName(null);
            if (inputRef.current) inputRef.current.value = "";
          }} />
        )}

        <footer className="footer">
          <span>Syllabus → Calendar + Cost Timeline</span>
          <span>Your file is parsed locally, then discarded</span>
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
        <span className="receipt__calendar">
          {calendar.created} of {calendar.attempted} on your calendar
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
      <Runway
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
            {calendar.failed.map((f, i) => (
              <li key={`f-${i}`}>
                Could not add “{f.summary}” to your calendar.
              </li>
            ))}
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
        <BriefingButton result={result} />
      </div>
    </div>
  );
}
