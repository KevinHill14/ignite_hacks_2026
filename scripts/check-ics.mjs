// Validates the generated .ics against the parts of RFC 5545 that clients
// actually reject files over: CRLF endings, 75-octet folding, escaping, and
// correct UTC conversion across a DST boundary.
import { buildIcs } from "../web/src/lib/ics.ts";

const ok = (label, cond, extra = "") =>
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);

const events = [
  {
    summary: "COMM 201: Midterm; with a comma, a \\ backslash",
    start: "2026-10-21T18:00:00",
    end: "2026-10-21T19:00:00",
    timezone: "America/Toronto",
    description: "Line one\nLine two — a very long description that exists purely to push this content line past the seventy-five octet limit so folding has to happen.",
    kind: "exam",
    date: "2026-10-21",
    weightPercent: 25,
    confidence: 0.9,
  },
  {
    // January: after the DST change, so the offset differs from October's.
    summary: "COMM 201: Final Exam",
    start: "2027-01-14T14:00:00",
    end: "2027-01-14T15:00:00",
    timezone: "America/Toronto",
    description: "",
    kind: "exam",
    date: "2027-01-14",
    weightPercent: 35,
    confidence: 0.9,
  },
];

const costs = [
  {
    label: "Textbook, 7th ed.",
    category: "textbook",
    amount: 184.95,
    currency: "CAD",
    isMandatory: true,
    neededBy: "2026-09-14",
    month: "2026-09",
    notes: "",
    sourceQuote: 'Required text: "Fundamentals" ($184.95)',
    confidence: 0.95,
  },
  { label: "Undated item", category: "other", amount: null, currency: null,
    isMandatory: false, neededBy: null, month: null, notes: "", sourceQuote: "", confidence: 0.5 },
];

const ics = buildIcs({
  events, costs,
  courseCode: "COMM 201",
  courseTitle: "Intro Accounting",
  timezone: "America/Toronto",
});

const lines = ics.split("\r\n");

ok("uses CRLF line endings", ics.includes("\r\n") && !/[^\r]\n/.test(ics));
ok("wrapped in VCALENDAR", lines[0] === "BEGIN:VCALENDAR" && ics.trimEnd().endsWith("END:VCALENDAR"));
ok("declares VERSION:2.0", lines.includes("VERSION:2.0"));

const begins = (ics.match(/BEGIN:VEVENT/g) || []).length;
const ends = (ics.match(/END:VEVENT/g) || []).length;
ok("VEVENT blocks balanced", begins === ends && begins === 3, `${begins} events (2 deadlines + 1 dated cost)`);
ok("undated cost is skipped", !ics.includes("Undated item"));

// Folding: every line must be <= 75 octets.
const enc = new TextEncoder();
const tooLong = lines.filter((l) => enc.encode(l).length > 75);
ok("all lines within 75 octets", tooLong.length === 0, tooLong.length ? `${tooLong.length} over` : "");
ok("continuation lines start with a space", lines.some((l) => l.startsWith(" ")));

// Escaping: literal commas/semicolons must be backslash-escaped in values.
const summaryLine = lines.find((l) => l.startsWith("SUMMARY:") && l.includes("Midterm"));
ok("comma escaped in SUMMARY", summaryLine.includes("\\,"), summaryLine.slice(0, 60));
ok("semicolon escaped in SUMMARY", summaryLine.includes("\\;"));
ok("backslash escaped", summaryLine.includes("\\\\"));
ok("newline encoded as \\n not a real break", ics.includes("\\nLine two"));

// DST correctness. Toronto is UTC-4 in October (EDT) and UTC-5 in January
// (EST), so identical wall times must produce different UTC offsets.
const oct = lines.find((l) => l.startsWith("DTSTART:2026"));
const jan = lines.find((l) => l.startsWith("DTSTART:2027"));
ok("October 18:00 EDT -> 22:00Z", oct === "DTSTART:20261021T220000Z", oct);
ok("January 14:00 EST -> 19:00Z", jan === "DTSTART:20270114T190000Z", jan);

// All-day cost event: DTEND is exclusive, so the day after.
ok("cost is an all-day event", ics.includes("DTSTART;VALUE=DATE:20260914"));
ok("all-day DTEND is exclusive", ics.includes("DTEND;VALUE=DATE:20260915"));

ok("every event has a UID", (ics.match(/UID:/g) || []).length === 3);
ok("UIDs are unique", new Set((ics.match(/^UID:.*$/gm) || [])).size === 3);
ok("reminders included", (ics.match(/BEGIN:VALARM/g) || []).length === 4);

// Stability: same input must produce the same UIDs, so re-importing updates
// existing entries instead of creating duplicates.
const again = buildIcs({ events, costs, courseCode: "COMM 201", courseTitle: "Intro Accounting", timezone: "America/Toronto" });
const uids = (s) => (s.match(/^UID:.*$/gm) || []).join("|");
ok("UIDs stable across runs (re-import updates, not duplicates)", uids(ics) === uids(again));

console.log(`\n--- first 14 lines ---\n${lines.slice(0, 14).join("\n")}`);
