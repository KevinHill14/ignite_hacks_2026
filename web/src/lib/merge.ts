/**
 * Combine several parsed syllabi into one term.
 *
 * A single syllabus is a toy. Nobody takes one course — a full load is five,
 * and the things that actually hurt a student only become visible when all
 * five are on the same axis: the week three midterms collide, the month four
 * textbooks come due at once, the lab manual two courses both told you to buy.
 * None of that is derivable from any one file.
 */

import type { CourseInfo, IngestResult, PlannedCost, PlannedEvent } from "./types";

/** Distinct, colour-blind-safe hues for up to five courses. */
export const COURSE_COLORS = [
  "#4a3f8c", // violet
  "#b8403a", // stamp
  "#2f6b5f", // pine
  "#a8651c", // ochre
  "#6b3f6e", // plum
] as const;

export interface CourseRef {
  key: string;
  code: string;
  title: string;
  color: string;
  sourceName: string;
}

export type MergedEvent = PlannedEvent & { courseKey: string };
export type MergedCost = PlannedCost & { courseKey: string };

export interface ClusterWeek {
  /** Monday of the week, "YYYY-MM-DD". */
  weekStart: string;
  weekEnd: string;
  courseKeys: string[];
  events: MergedEvent[];
  /**
   * Raw sum of per-course weights. Kept for reference but NOT for display:
   * each course's weights are a share of that course's own grade, so adding
   * 25% of chemistry to 30% of maths gives 55% of nothing. With five courses
   * it can exceed 100%, which is plainly nonsense on screen.
   */
  totalWeight: number;
  /**
   * The figure worth showing. A full load of N courses offers N x 100 grade
   * points in total, so this week's share of the entire term is
   * totalWeight / (N * 100). Bounded by definition, and it answers the
   * question a student is actually asking: how much of my term is riding on
   * this one week?
   */
  shareOfTerm: number;
}

export interface DuplicateCost {
  label: string;
  courseKeys: string[];
  amount: number | null;
  currency: string | null;
}

export interface MergedResult {
  courses: CourseRef[];
  events: MergedEvent[];
  costs: MergedCost[];
  clusters: ClusterWeek[];
  duplicates: DuplicateCost[];
  totals: Record<string, { mandatory: number; optional: number; all: number }>;
  perCourse: {
    courseKey: string;
    code: string;
    title: string;
    color: string;
    eventCount: number;
    costTotal: number;
    currency: string | null;
  }[];
  calendar: { created: number; attempted: number; failed: { summary: string; reason: string }[] };
  warnings: string[];
  timezone: string;
  stats: { courseCount: number; eventCount: number; costCount: number; unpricedCount: number };
}

/** Monday of the ISO week containing `iso`. */
export function weekStartOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Normalise a cost label for comparison.
 *
 * Two syllabi rarely name the same item identically — "Openintro Statistics,
 * 4th ed." against "OpenIntro Statistics (4th edition)". Stripping case,
 * punctuation, and edition noise catches most real duplicates without
 * collapsing genuinely different items.
 */
function costKey(label: string): string {
  return (
    label
      .toLowerCase()
      // Parenthetical asides carry edition noise in one syllabus and not the
      // other, so they go first.
      .replace(/\(.*?\)/g, " ")
      // Drop the ordinal entirely rather than reducing "4th" to "4". Keeping
      // the digit meant "…, 4th ed." and "… (4th edition)" normalised
      // differently — one kept a stray 4, the other lost it with the bracket.
      // Ordinals in a course-materials list are almost always edition markers.
      .replace(/\b\d+(st|nd|rd|th)\b/g, " ")
      .replace(/\b(ed|edn|edition|cdn|canadian|intl|international|vol|volume)\b/g, " ")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function courseKeyFor(course: CourseInfo, sourceName: string, index: number): string {
  return course.code?.trim() || course.title?.trim() || sourceName || `course-${index + 1}`;
}

export function mergeResults(results: IngestResult[]): MergedResult {
  const courses: CourseRef[] = [];
  const events: MergedEvent[] = [];
  const costs: MergedCost[] = [];
  const warnings: string[] = [];
  let created = 0;
  let attempted = 0;
  const failed: { summary: string; reason: string }[] = [];

  results.forEach((r, i) => {
    const key = courseKeyFor(r.course, r.sourceName, i);
    courses.push({
      key,
      code: r.course.code || "",
      title: r.course.title || r.sourceName,
      color: COURSE_COLORS[i % COURSE_COLORS.length],
      sourceName: r.sourceName,
    });

    for (const e of r.events) events.push({ ...e, courseKey: key });
    for (const c of r.costs) costs.push({ ...c, courseKey: key });

    created += r.calendar.created;
    attempted += r.calendar.attempted;
    failed.push(...r.calendar.failed);

    // Prefix warnings so it stays obvious which syllabus raised them.
    for (const w of r.warnings) warnings.push(`${key}: ${w}`);
  });

  events.sort((a, b) => a.start.localeCompare(b.start));

  /* ------------------------------------------------------------- clusters */

  const byWeek = new Map<string, MergedEvent[]>();
  for (const e of events) {
    const wk = weekStartOf(e.date);
    byWeek.set(wk, [...(byWeek.get(wk) ?? []), e]);
  }

  const clusters: ClusterWeek[] = [];
  for (const [weekStart, weekEvents] of byWeek) {
    const keys = [...new Set(weekEvents.map((e) => e.courseKey))];
    // Three courses converging is the threshold where a week stops being busy
    // and starts being a problem. Two is a normal Tuesday.
    if (keys.length < 3) continue;
    const totalWeight = weekEvents.reduce((s, e) => s + (e.weightPercent ?? 0), 0);
    clusters.push({
      weekStart,
      weekEnd: addDays(weekStart, 6),
      courseKeys: keys,
      events: weekEvents.slice().sort((a, b) => a.start.localeCompare(b.start)),
      totalWeight,
      // Denominator is every course in the load, not just the ones colliding:
      // the question is what share of the whole term lands here.
      shareOfTerm: courses.length > 0 ? totalWeight / (courses.length * 100) : 0,
    });
  }
  clusters.sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  /* ----------------------------------------------------------- duplicates */

  const byCost = new Map<string, MergedCost[]>();
  for (const c of costs) {
    const k = costKey(c.label);
    if (!k) continue;
    byCost.set(k, [...(byCost.get(k) ?? []), c]);
  }

  const duplicates: DuplicateCost[] = [];
  for (const group of byCost.values()) {
    const keys = [...new Set(group.map((c) => c.courseKey))];
    if (keys.length < 2) continue;
    duplicates.push({
      label: group[0].label,
      courseKeys: keys,
      amount: group[0].amount,
      currency: group[0].currency,
    });
  }

  /* --------------------------------------------------------------- totals */

  const totals: MergedResult["totals"] = {};
  let unpricedCount = 0;

  // A duplicate is counted once. Charging a student twice for one lab manual
  // on a screen that claims to be their real cost would be a lie.
  const countedDuplicates = new Set<string>();

  for (const c of costs) {
    if (c.amount === null) {
      unpricedCount++;
      continue;
    }
    const k = costKey(c.label);
    if (duplicates.some((d) => costKey(d.label) === k)) {
      if (countedDuplicates.has(k)) continue;
      countedDuplicates.add(k);
    }
    const cur = c.currency || "UNKNOWN";
    totals[cur] = totals[cur] ?? { mandatory: 0, optional: 0, all: 0 };
    totals[cur][c.isMandatory ? "mandatory" : "optional"] += c.amount;
    totals[cur].all += c.amount;
  }
  for (const t of Object.values(totals)) {
    t.mandatory = Math.round(t.mandatory * 100) / 100;
    t.optional = Math.round(t.optional * 100) / 100;
    t.all = Math.round(t.all * 100) / 100;
  }

  /* ------------------------------------------------------------ per course */

  const perCourse = courses.map((c) => {
    const own = costs.filter((x) => x.courseKey === c.key && x.amount !== null);
    const currency = own.find((x) => x.currency)?.currency ?? null;
    return {
      courseKey: c.key,
      code: c.code,
      title: c.title,
      color: c.color,
      eventCount: events.filter((e) => e.courseKey === c.key).length,
      costTotal: Math.round(own.reduce((s, x) => s + (x.amount ?? 0), 0) * 100) / 100,
      currency,
    };
  });
  perCourse.sort((a, b) => b.costTotal - a.costTotal);

  /* ------------------------------------------------------------- warnings */

  for (const d of duplicates) {
    warnings.push(
      `"${d.label}" appears in ${d.courseKeys.length} syllabi (${d.courseKeys.join(", ")}). ` +
        `Counted once — check whether you actually need two.`,
    );
  }
  for (const c of clusters) {
    warnings.push(
      `Week of ${c.weekStart}: ${c.courseKeys.length} of your ${courses.length} courses have deadlines` +
        (c.shareOfTerm > 0
          ? `, carrying ${Math.round(c.shareOfTerm * 100)}% of everything you are graded on this term`
          : "") +
        `. Expect to spend more that week and work fewer shifts.`,
    );
  }

  return {
    courses,
    events,
    costs,
    clusters,
    duplicates,
    totals,
    perCourse,
    calendar: { created, attempted, failed },
    warnings,
    timezone: results[0]?.timezone ?? "America/Toronto",
    stats: {
      courseCount: courses.length,
      eventCount: events.length,
      costCount: costs.length,
      unpricedCount,
    },
  };
}
