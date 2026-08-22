/**
 * Student income modelling: aid, and the student account it lands in.
 *
 * The thing worth getting right is that financial aid is not money. OSAP,
 * entrance scholarships, and bursaries are almost always *credited to your
 * student account*, where tuition and fees come off the top. Only the surplus
 * is refunded to you, and only once there is a surplus.
 *
 * So a student holding a $12,400 OSAP assessment and a $6,000 entrance
 * scholarship against $9,100 of tuition does not have $18,400 to live on —
 * and, less obviously, the scholarship's real effect on their cash flow is to
 * free up OSAP that would otherwise have gone to the school. Modelling the
 * account rather than each award in isolation is what makes that visible.
 *
 * Sources: Ontario universities credit entrance scholarships to the student
 * account before the tuition deadline (U of T, Ontario Tech), often in two
 * instalments across September and January (uOttawa); a resulting credit
 * balance is refunded to the student.
 */

export type AidKind = "osap" | "scholarship" | "bursary" | "other";

export interface AidSource {
  id: string;
  label: string;
  /** Face value of this instalment. */
  amount: number;
  /** "YYYY-MM" it is credited. */
  month: string;
  kind: AidKind;
  /**
   * True for anything credited to the student account, which is nearly all
   * institutional aid. False for an external award that pays you directly.
   */
  toAccount: boolean;
  /** 1 for confirmed money; lower for something applied for but not awarded. */
  probability: number;
}

export interface SettledAid {
  source: AidSource;
  /** Absorbed by outstanding tuition and fees. */
  toSchool: number;
  /** Refunded to the student's own account this month. */
  toStudent: number;
}

export interface AidSettlement {
  ledger: SettledAid[];
  gross: number;
  toSchool: number;
  toStudent: number;
  /** Tuition still owing after every award is applied. */
  stillOwed: number;
  /** Share of all aid the student never touches. */
  withheldShare: number;
}

function monthKeyToOrder(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + m;
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Run every award through the student account in date order.
 *
 * Order matters and is not cosmetic: aid arriving first absorbs the tuition
 * debt, so a September scholarship can mean a January OSAP instalment lands in
 * the student's hands almost intact. Sorting by month is what produces that.
 */
export function settleAid(sources: AidSource[], tuitionOwed: number): AidSettlement {
  const ordered = [...sources]
    .filter((s) => s.amount > 0)
    .sort((a, b) => monthKeyToOrder(a.month) - monthKeyToOrder(b.month));

  let owing = Math.max(0, tuitionOwed);
  const ledger: SettledAid[] = [];

  for (const source of ordered) {
    // Money paid directly to the student bypasses the account entirely.
    if (!source.toAccount) {
      ledger.push({ source, toSchool: 0, toStudent: source.amount });
      continue;
    }
    const toSchool = Math.min(source.amount, owing);
    owing -= toSchool;
    ledger.push({
      source,
      toSchool: round2(toSchool),
      toStudent: round2(source.amount - toSchool),
    });
  }

  const gross = ledger.reduce((s, l) => s + l.source.amount, 0);
  const toSchool = ledger.reduce((s, l) => s + l.toSchool, 0);
  const toStudent = ledger.reduce((s, l) => s + l.toStudent, 0);

  return {
    ledger,
    gross: round2(gross),
    toSchool: round2(toSchool),
    toStudent: round2(toStudent),
    stillOwed: round2(owing),
    withheldShare: gross > 0 ? toSchool / gross : 0,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Expand a lump award into the instalments a school actually pays.
 *
 * Two-term aid is paid twice, four months apart — OSAP works this way and so
 * do most entrance scholarships.
 */
export function splitAcrossTerms(
  base: Omit<AidSource, "month" | "amount">,
  total: number,
  startMonth: string,
  terms: 1 | 2,
  splitFirst = 0.5,
): AidSource[] {
  if (!(total > 0)) return [];
  if (terms === 1) {
    return [{ ...base, amount: round2(total), month: startMonth }];
  }
  const first = round2(total * splitFirst);
  return [
    { ...base, id: `${base.id}-1`, amount: first, month: startMonth },
    { ...base, id: `${base.id}-2`, amount: round2(total - first), month: addMonths(startMonth, 4) },
  ];
}

/** Only refunded money is income; the rest never reaches the student. */
export function settlementToEvents(settlement: AidSettlement) {
  return settlement.ledger
    .filter((l) => l.toStudent > 0)
    .map((l) => ({
      id: l.source.id,
      label: l.source.label,
      month: l.source.month,
      amount: l.toStudent,
      probability: l.source.probability,
    }));
}

/* ------------------------------------------------------------- paycheques */

export type PayFrequency = "monthly" | "biweekly" | "weekly";

/**
 * How many paycheques land in a given month.
 *
 * Biweekly pay is 26 cheques a year against 12 months, so two months a year
 * carry three cheques and the rest carry two. Rent does not care. Averaging
 * pay into a flat monthly figure hides both the windfall months and the lean
 * ones, and it is the lean ones that catch people out.
 */
export function paychequesInMonth(
  month: string,
  frequency: PayFrequency,
  anchorISO: string,
): number {
  if (frequency === "monthly") return 1;

  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  // End of the last day, not its midnight. Paydays are stamped at noon, so a
  // midnight bound silently drops any payday falling on the final day of the
  // month — which cost a whole cheque a year.
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  const anchor = new Date(`${anchorISO}T12:00:00`);
  if (Number.isNaN(anchor.getTime())) return frequency === "biweekly" ? 2 : 4;

  const stepMs = (frequency === "biweekly" ? 14 : 7) * 86_400_000;

  let t = anchor.getTime();
  while (t > start.getTime()) t -= stepMs;
  while (t < start.getTime()) t += stepMs;

  let count = 0;
  while (t <= end.getTime()) {
    count++;
    t += stepMs;
  }
  return count;
}

/** Expected income for a month, keeping three-cheque months as real spikes. */
export function monthlyFromPay(
  month: string,
  perCheque: number,
  frequency: PayFrequency,
  anchorISO: string,
): number {
  return perCheque * paychequesInMonth(month, frequency, anchorISO);
}
