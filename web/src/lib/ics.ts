/**
 * iCalendar (RFC 5545) export.
 *
 * The Google Calendar path needs an OAuth app that Google has verified, and
 * until then it is capped at a hand-maintained allowlist of 100 test users.
 * That is fine for the person who owns the deployment and useless for anyone
 * else who lands on the site.
 *
 * A .ics file has none of that: no sign-in, no allowlist, no stored tokens,
 * and it imports into Google Calendar, Apple Calendar, and Outlook alike. It
 * is the path that actually works for every visitor.
 */

import type { PlannedCost, PlannedEvent } from "./types";

/**
 * Escape per RFC 5545 §3.3.11. Backslash first, or it double-escapes the
 * escapes it just inserted.
 */
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold to 75 octets per line (§3.1). Not cosmetic — some parsers reject or
 * truncate longer lines, and descriptions here carry a full source quote.
 * Counts UTF-8 bytes rather than characters so accented text folds correctly.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fold(line: string): string {
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let start = 0;
  let limit = 75;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never split a multi-byte character: back off over continuation bytes.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(decoder.decode(bytes.subarray(start, end)));
    start = end;
    limit = 74; // continuation lines start with a space
  }
  return out.join("\r\n ");
}

/** Minutes that `timeZone` is offset from UTC at a given instant. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const p: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asIfUtc - instant.getTime();
}

/**
 * Turn a local wall-clock time in `timeZone` into the true UTC instant.
 *
 * Emitting UTC rather than TZID sidesteps having to ship a VTIMEZONE block,
 * which is where hand-rolled .ics files usually go wrong. Two passes because
 * the offset depends on the instant, and near a DST boundary the first guess
 * can land on the wrong side of the change.
 */
function wallTimeToUtc(localISO: string, timeZone: string): Date {
  const naive = Date.parse(`${localISO}Z`);
  if (Number.isNaN(naive)) return new Date(NaN);
  let utc = naive - offsetMs(new Date(naive), timeZone);
  utc = naive - offsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

function stamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/** Stable per-event id so re-importing updates rather than duplicates. */
function uid(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${(h >>> 0).toString(36)}-syllabus@whatthistermcosts`;
}

export interface IcsInput {
  events: PlannedEvent[];
  costs: PlannedCost[];
  courseCode: string;
  courseTitle: string;
  timezone: string;
  /** Include cost items as all-day reminders on the day they are due. */
  includeCosts?: boolean;
}

export function buildIcs({
  events,
  costs,
  courseCode,
  courseTitle,
  timezone,
  includeCosts = true,
}: IcsInput): string {
  const now = stamp(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//What This Term Costs//Syllabus Import//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`${courseCode || courseTitle} deadlines`)}`,
    `X-WR-TIMEZONE:${esc(timezone)}`,
  ];

  for (const e of events) {
    const start = wallTimeToUtc(e.start, timezone);
    const end = wallTimeToUtc(e.end, timezone);
    if (Number.isNaN(start.getTime())) continue;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid(`${e.date}|${e.summary}`)}`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(Number.isNaN(end.getTime()) ? new Date(start.getTime() + 3600000) : end)}`,
      `SUMMARY:${esc(e.summary)}`,
      `DESCRIPTION:${esc(e.description || "")}`,
      // Mirrors the reminders the Google path sets: a day before, and an hour.
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-P1D",
      `DESCRIPTION:${esc(`Tomorrow: ${e.summary}`)}`,
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT1H",
      `DESCRIPTION:${esc(e.summary)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }

  if (includeCosts) {
    for (const c of costs) {
      if (!c.neededBy) continue;
      const day = c.neededBy.replace(/-/g, "");
      // All-day: DTEND is exclusive, so it is the following day.
      const next = new Date(`${c.neededBy}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const amount =
        c.amount === null
          ? "price not listed"
          : `${c.currency ?? ""} ${c.amount.toFixed(2)}`.trim();

      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid(`cost|${c.neededBy}|${c.label}`)}`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${day}`,
        `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`,
        `SUMMARY:${esc(`Pay: ${c.label} (${amount})`)}`,
        `DESCRIPTION:${esc(
          [
            c.isMandatory ? "Required for this course." : "Optional.",
            c.notes,
            c.sourceQuote ? `From the syllabus: "${c.sourceQuote}"` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        )}`,
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      );
    }
  }

  lines.push("END:VCALENDAR");

  // CRLF line endings are mandatory (§3.1); LF-only files are rejected by
  // some clients and silently mis-parsed by others.
  return lines.map(fold).join("\r\n") + "\r\n";
}
