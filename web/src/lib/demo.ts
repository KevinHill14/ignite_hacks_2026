import type { IngestResult, PlannedCost, PlannedEvent } from "./types";

/* --------------------------------------------------------------- builders */

const TZ = "America/Toronto";

function ev(
  code: string,
  date: string,
  title: string,
  kind: PlannedEvent["kind"],
  weight: number | null,
  time = "23:59",
  // The line from the syllabus this was taken from. Not decoration: the
  // product's central claim is that nothing is reported without a quote
  // backing it, and a demo with empty quotes quietly contradicts that at
  // exactly the moment someone clicks an item to check.
  quote = "",
): PlannedEvent {
  const [h, m] = time.split(":").map(Number);
  const end = new Date(`${date}T${time}:00`);
  end.setHours(h + 1, m);
  return {
    summary: `${code}: ${title}`,
    start: `${date}T${time}:00`,
    end: `${date}T${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}:00`,
    timezone: TZ,
    description: quote,
    kind,
    date,
    weightPercent: weight,
    confidence: 0.92,
  };
}

function cost(
  label: string,
  amount: number | null,
  neededBy: string | null,
  mandatory = true,
  category: PlannedCost["category"] = "textbook",
  quote = "",
): PlannedCost {
  return {
    label,
    category,
    amount,
    currency: "CAD",
    isMandatory: mandatory,
    neededBy,
    month: neededBy ? neededBy.slice(0, 7) : null,
    notes: "",
    sourceQuote: quote,
    confidence: 0.9,
  };
}

function course(
  code: string,
  title: string,
  events: PlannedEvent[],
  costs: PlannedCost[],
): IngestResult {
  const priced = costs.filter((c) => c.amount !== null);
  const all = priced.reduce((s, c) => s + (c.amount ?? 0), 0);
  const mandatory = priced
    .filter((c) => c.isMandatory)
    .reduce((s, c) => s + (c.amount ?? 0), 0);
  return {
    ok: true,
    sourceName: `${code.replace(/\s+/g, "")}-fall-syllabus.pdf`,
    timezone: TZ,
    course: { code, title, term: "Fall 2026", institution: "Queen's University" },
    calendar: { created: 0, attempted: events.length, failed: [] },
    events,
    costs,
    timeline: [],
    totals: {
      CAD: {
        mandatory: Math.round(mandatory * 100) / 100,
        optional: Math.round((all - mandatory) * 100) / 100,
        all: Math.round(all * 100) / 100,
      },
    },
    stats: {
      eventCount: events.length,
      costCount: costs.length,
      pricedCount: priced.length,
      unpricedCount: costs.length - priced.length,
      mixedCurrency: false,
      model: "claude-sonnet-5",
      inputTokens: 0,
      outputTokens: 0,
    },
    warnings: [],
  };
}

/**
 * A worked example, shaped like a real second-year course at Queen's.
 *
 * It exists so the interface can be demonstrated without connecting Google
 * OAuth, and so the results view can be developed without burning API calls.
 * Nothing here touches the pipeline — `calendar.created` is 0 because no
 * events were actually written anywhere.
 */
export const DEMO_RESULT: IngestResult = {
  ok: true,
  sourceName: "COMM-201-fall-syllabus.pdf",
  timezone: "America/Toronto",
  course: {
    code: "COMM 201",
    title: "Introduction to Financial Accounting",
    term: "Fall 2026",
    institution: "Queen's University",
  },
  calendar: { created: 0, attempted: 9, failed: [] },
  events: [
    { summary: "COMM 201: Problem Set 1", start: "2026-09-18T23:59:00", end: "2026-09-19T00:59:00", timezone: "America/Toronto", description: "", kind: "assignment", date: "2026-09-18", weightPercent: 5, confidence: 0.95 },
    { summary: "COMM 201: Quiz 1 (Ch. 1-3)", start: "2026-09-29T09:30:00", end: "2026-09-29T10:30:00", timezone: "America/Toronto", description: "", kind: "quiz", date: "2026-09-29", weightPercent: 5, confidence: 0.92 },
    { summary: "COMM 201: Problem Set 2", start: "2026-10-09T23:59:00", end: "2026-10-10T00:59:00", timezone: "America/Toronto", description: "", kind: "assignment", date: "2026-10-09", weightPercent: 5, confidence: 0.95 },
    { summary: "COMM 201: Midterm Exam", start: "2026-10-21T18:00:00", end: "2026-10-21T19:00:00", timezone: "America/Toronto", description: "", kind: "exam", date: "2026-10-21", weightPercent: 25, confidence: 0.98 },
    { summary: "COMM 201: Case Analysis draft", start: "2026-11-04T23:59:00", end: "2026-11-05T00:59:00", timezone: "America/Toronto", description: "", kind: "project", date: "2026-11-04", weightPercent: 10, confidence: 0.72 },
    { summary: "COMM 201: Quiz 2 (Ch. 7-9)", start: "2026-11-10T09:30:00", end: "2026-11-10T10:30:00", timezone: "America/Toronto", description: "", kind: "quiz", date: "2026-11-10", weightPercent: 5, confidence: 0.9 },
    { summary: "COMM 201: Group presentation", start: "2026-11-24T13:00:00", end: "2026-11-24T14:00:00", timezone: "America/Toronto", description: "", kind: "presentation", date: "2026-11-24", weightPercent: 10, confidence: 0.55 },
    { summary: "COMM 201: Case Analysis final", start: "2026-12-01T23:59:00", end: "2026-12-02T00:59:00", timezone: "America/Toronto", description: "", kind: "project", date: "2026-12-01", weightPercent: 15, confidence: 0.94 },
    { summary: "COMM 201: Final Exam", start: "2026-12-14T14:00:00", end: "2026-12-14T15:00:00", timezone: "America/Toronto", description: "", kind: "exam", date: "2026-12-14", weightPercent: 35, confidence: 0.88 },
  ],
  costs: [
    { label: "Fundamentals of Financial Accounting, 7th Cdn ed.", category: "textbook", amount: 184.95, currency: "CAD", isMandatory: true, neededBy: "2026-09-14", month: "2026-09", notes: "Bundled with the online homework code.", sourceQuote: "Required text: Fundamentals of Financial Accounting, 7th Canadian edition ($184.95 new at the Campus Bookstore).", confidence: 0.96 },
    { label: "Connect online homework access code", category: "courseware", amount: 89.0, currency: "CAD", isMandatory: true, neededBy: "2026-09-14", month: "2026-09", notes: "Problem sets are submitted through Connect.", sourceQuote: "All problem sets are submitted via Connect. An access code ($89) is required.", confidence: 0.94 },
    { label: "Non-programmable financial calculator", category: "lab_materials", amount: 42.5, currency: "CAD", isMandatory: true, neededBy: "2026-09-29", month: "2026-09", notes: "Required for quizzes and both exams.", sourceQuote: "Students must bring an approved non-programmable financial calculator to all quizzes and exams.", confidence: 0.89 },
    { label: "Deloitte case pack (course reader)", category: "other", amount: 34.0, currency: "CAD", isMandatory: true, neededBy: "2026-10-26", month: "2026-10", notes: "", sourceQuote: "The case pack is available from the bookstore for $34.", confidence: 0.91 },
    { label: "CPA Canada student membership", category: "other", amount: 25.0, currency: "CAD", isMandatory: false, neededBy: null, month: null, notes: "Recommended, not required.", sourceQuote: "Students are encouraged to join CPA Canada as a student member ($25/year).", confidence: 0.85 },
    { label: "Study guide / solutions manual", category: "textbook", amount: null, currency: "CAD", isMandatory: false, neededBy: null, month: null, notes: "Price not stated in the syllabus.", sourceQuote: "An optional study guide is available at the bookstore.", confidence: 0.8 },
  ],
  timeline: [
    { month: "2026-09", total: 316.45, items: ["Textbook", "Access code", "Calculator"] },
    { month: "2026-10", total: 34.0, items: ["Case pack"] },
  ],
  totals: { CAD: { mandatory: 350.45, optional: 25.0, all: 375.45 } },
  stats: {
    eventCount: 9,
    costCount: 6,
    pricedCount: 5,
    unpricedCount: 1,
    mixedCurrency: false,
    inputTokens: 8420,
    outputTokens: 2130,
  },
  warnings: [
    "1 cost item had no price in the syllabus and is excluded from the total.",
    "The group presentation date was inferred from “week 12” rather than stated outright — confirm it with your instructor.",
  ],
};

/* ------------------------------------------------------ multi-course demo */

/**
 * Three courses from one term, so the merged view can be shown without
 * spending three model calls.
 *
 * Built to exercise the things that only exist across files:
 *   - a crunch week (Oct 20-23) where three courses all want something,
 *     mirroring the engineered cluster in the test corpus
 *   - the same iClicker subscription required by two courses, which must be
 *     counted once and not twice
 *   - a clearly expensive course versus a nearly free one
 */
export const DEMO_MULTI: IngestResult[] = [
  course(
    "CHEM 201",
    "Organic Chemistry I",
    [
      ev("CHEM 201", "2026-09-25", "Lab report 1", "lab", 5, "23:59",
        "Lab Report 1 is due Friday, September 25 by 11:59 p.m. and is worth 5% of the final grade."),
      ev("CHEM 201", "2026-10-21", "Midterm 1", "exam", 20, "19:00",
        "Midterm 1: Wednesday, October 21, 7:00-9:00 p.m. Worth 20% of the final grade."),
      ev("CHEM 201", "2026-11-18", "Midterm 2", "exam", 20, "19:00",
        "Midterm 2: Wednesday, November 18, 7:00-9:00 p.m. Worth 20% of the final grade."),
      ev("CHEM 201", "2026-12-04", "Lab practical", "lab", 15, "23:59",
        "The laboratory practical will be held during the final lab period, December 4 (15%)."),
    ],
    [
      cost("Organic Chemistry, 9th ed. (used)", 315.5, "2026-09-14", true, "textbook",
        "Required: Organic Chemistry, 9th edition. New $412.00, used copies $315.50 at the Campus Bookstore."),
      cost("iClicker Cloud subscription", 35, "2026-09-14", true, "courseware",
        "An iClicker Cloud subscription ($35) is required for in-class participation marks."),
      cost("Lab goggles and coat", 48, "2026-09-18", true, "lab_materials",
        "Students must supply their own splash goggles and lab coat (approx. $48 from the Chemistry Store) before the first lab."),
      cost("Refundable locker deposit", 25, "2026-09-18", true, "other",
        "A $25 refundable deposit is charged for your lab locker key and returned at the end of term."),
    ],
  ),
  course(
    "PSYC 202",
    "Research Methods",
    [
      ev("PSYC 202", "2026-10-02", "Method critique", "assignment", 10, "23:59",
        "Method Critique (10%) due October 2 by 11:59 p.m. via onQ."),
      ev("PSYC 202", "2026-10-22", "Midterm", "exam", 25, "10:00",
        "Midterm examination: Thursday, October 22, 10:00-11:20 a.m., worth 25%."),
      ev("PSYC 202", "2026-11-20", "Final paper", "project", 30, "23:59",
        "The final research paper (30%) is due November 20 at 11:59 p.m."),
    ],
    [
      cost("Research Methods in Psychology (used)", 167, "2026-09-14", true, "textbook",
        "Textbook: Research Methods in Psychology, 5th ed. Used copies from $167.00."),
      // Same subscription as CHEM 201. One covers both courses. The two
      // syllabi word it differently, which is the case the matcher has to
      // get right, so the quotes here are deliberately not identical.
      cost("iClicker Cloud subscription", 35, "2026-09-14", true, "courseware",
        "Participation is recorded through iClicker Cloud. If you are already subscribed for another course, that subscription covers this one."),
    ],
  ),
  course(
    "MATH 240",
    "Linear Algebra",
    [
      ev("MATH 240", "2026-10-09", "Problem set 3", "assignment", 5, "23:59",
        "Problem Set 3 due Friday, October 9 (5%). Submit through Crowdmark."),
      ev("MATH 240", "2026-10-23", "Midterm", "exam", 30, "18:30",
        "Midterm: Friday, October 23, 6:30-8:30 p.m. Worth 30% of the final grade."),
      ev("MATH 240", "2026-11-27", "Problem set 6", "assignment", 5, "23:59",
        "Problem Set 6 due Friday, November 27 (5%). Submit through Crowdmark."),
    ],
    // Deliberately free: open textbook, free software, no clicker.
    [],
  ),
];
