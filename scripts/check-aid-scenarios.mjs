// Walks the aid model through scenarios a real student would actually be in,
// checking the numbers are not just internally consistent but *sensible*.
import { settleAid, splitAcrossTerms, settlementToEvents } from "../web/src/lib/income.ts";

const money = (n) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2 })}`;
const ok = (l, c, e = "") => console.log(`${c ? "PASS" : "FAIL"}  ${l}${e ? "  " + e : ""}`);

const aid = (id, label, kind, total, start, terms = 2, probability = 1) =>
  splitAcrossTerms({ id, label, kind, toAccount: true, probability }, total, start, terms);

function show(title, sources, tuition) {
  const s = settleAid(sources, tuition);
  console.log(`\n--- ${title} ---`);
  console.log(`tuition owed ${money(tuition)}   aid on paper ${money(s.gross)}`);
  for (const l of s.ledger) {
    console.log(
      `  ${l.source.month}  ${l.source.label.padEnd(24)} ${money(l.source.amount).padStart(11)}` +
        ` -> school ${money(l.toSchool).padStart(11)} -> you ${money(l.toStudent).padStart(11)}`,
    );
  }
  console.log(`  reaches you ${money(s.toStudent)}   still owing ${money(s.stillOwed)}`);
  return s;
}

/* 1. The headline case. Assessment looks huge, September deposits nothing. */
const a = show("OSAP only, tuition eats the first instalment",
  aid("osap", "OSAP", "osap", 12400, "2026-09"), 9100);
ok("nothing lands in September", a.ledger[0].toStudent === 0);
ok("the full refund arrives in January", Math.abs(a.ledger[1].toStudent - 3300) < 0.01);
ok("school gets exactly what it is owed", Math.abs(a.toSchool - 9100) < 0.01);
ok("nothing owing afterwards", a.stillOwed === 0);

/* 2. Scholarship stacked on top — the non-obvious interaction. */
const b = show("OSAP + $6,000 entrance scholarship",
  [...aid("osap", "OSAP", "osap", 12400, "2026-09"),
   ...aid("sch", "Entrance scholarship", "scholarship", 6000, "2026-09")], 9100);
ok("scholarship converts to cash, dollar for dollar",
   Math.abs(b.toStudent - (a.toStudent + 6000)) < 0.01,
   `${money(a.toStudent)} -> ${money(b.toStudent)}`);
ok("school still takes only its $9,100", Math.abs(b.toSchool - 9100) < 0.01);

/* 3. Aid short of tuition — the student still owes money. */
const c = show("Aid below tuition", aid("osap", "OSAP", "osap", 5000, "2026-09"), 9000);
ok("nothing is deposited", c.toStudent === 0);
ok("$4,000 still owing", Math.abs(c.stillOwed - 4000) < 0.01);
ok("no income events generated", settlementToEvents(c).length === 0);

/* 4. No tuition owed at all (already paid) — everything should flow through. */
const d = show("Tuition already paid", aid("osap", "OSAP", "osap", 8000, "2026-09"), 0);
ok("all of it reaches the student", Math.abs(d.toStudent - 8000) < 0.01);
ok("school takes nothing", d.toSchool === 0);

/* 5. Single-term student. */
const e = show("One-term program", aid("osap", "OSAP", "osap", 6000, "2026-09", 1), 4000);
ok("one instalment only", e.ledger.length === 1);
ok("student gets the $2,000 surplus", Math.abs(e.toStudent - 2000) < 0.01);

/* 6. A bursary applied for but not yet awarded. */
const f = show("Confirmed OSAP + a maybe bursary",
  [...aid("osap", "OSAP", "osap", 9000, "2026-09"),
   ...aid("bur", "Bursary (applied)", "bursary", 1500, "2026-11", 1, 0.5)], 6000);
const events = settlementToEvents(f);
// The bursary is entirely swallowed by outstanding tuition, so none of it is
// refunded and it correctly produces no income event at all. Only money that
// reaches the bank counts as income.
ok("a fully-absorbed bursary produces no income event",
   !events.some((x) => x.label.includes("Bursary")));
ok("confirmed money stays certain",
   events.filter((x) => x.label.includes("OSAP")).every((x) => x.probability === 1));

/*
 * KNOWN LIMITATION, worth stating rather than hiding.
 *
 * Settlement treats every award as certain when paying down tuition, and
 * attaches probability only to the refunded remainder. So an uncertain
 * bursary that goes entirely to the school still frees up a later instalment
 * with certainty — when in reality, if it never arrives, that tuition stays
 * owing and the later instalment is consumed instead.
 *
 * Modelling it properly means running the settlement inside the simulation
 * rather than before it. The error only appears when uncertain aid lands
 * while tuition is still outstanding, and it understates risk slightly rather
 * than overstating it.
 */
const uncertainAbsorbed = f.ledger.find((l) => l.source.label.includes("Bursary"));
ok("(documented) uncertain aid is settled as if certain",
   uncertainAbsorbed?.toSchool === 1500,
   "understates risk in the narrow case where unconfirmed aid pays tuition");

/* 7. Zero and negative guards. */
ok("zero assessment yields no instalments", settleAid(aid("x", "None", "osap", 0, "2026-09"), 5000).ledger.length === 0);
const g = settleAid(aid("osap", "OSAP", "osap", 10000, "2026-09"), -500);
ok("negative tuition is treated as zero owing", Math.abs(g.toStudent - 10000) < 0.01, money(g.toStudent));
