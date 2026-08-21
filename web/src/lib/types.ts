/** Shapes returned by the n8n pipeline. Mirrors "Build Response". */

export type DeadlineKind =
  | "assignment"
  | "exam"
  | "quiz"
  | "project"
  | "lab"
  | "presentation"
  | "reading"
  | "other";

export type CostCategory =
  | "textbook"
  | "courseware"
  | "lab_materials"
  | "software"
  | "exam_fee"
  | "field_trip"
  | "studio_fee"
  | "other";

export interface CourseInfo {
  code: string;
  title: string;
  term: string;
  institution: string;
}

export interface PlannedEvent {
  summary: string;
  start: string;
  end: string;
  timezone: string;
  description: string;
  kind: DeadlineKind;
  date: string;
  weightPercent: number | null;
  confidence: number | null;
}

export interface PlannedCost {
  label: string;
  category: CostCategory;
  amount: number | null;
  currency: string | null;
  isMandatory: boolean;
  neededBy: string | null;
  month: string | null;
  notes: string;
  sourceQuote: string;
  confidence: number | null;
}

export interface CurrencyTotal {
  mandatory: number;
  optional: number;
  all: number;
}

export interface IngestResult {
  ok: true;
  course: CourseInfo;
  sourceName: string;
  timezone: string;
  calendar: {
    created: number;
    attempted: number;
    failed: { summary: string; reason: string }[];
  };
  events: PlannedEvent[];
  costs: PlannedCost[];
  timeline: { month: string; total: number; items: string[] }[];
  totals: Record<string, CurrencyTotal>;
  stats: {
    eventCount: number;
    costCount: number;
    pricedCount: number;
    unpricedCount: number;
    mixedCurrency: boolean;
    inputTokens: number | null;
    outputTokens: number | null;
  };
  warnings: string[];
}

export interface IngestError {
  ok: false;
  error: string;
}

export type IngestResponse = IngestResult | IngestError;
