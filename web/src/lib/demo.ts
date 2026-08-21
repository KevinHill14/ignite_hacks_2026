import type { IngestResult } from "./types";

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
