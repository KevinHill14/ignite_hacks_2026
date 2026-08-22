# Demo syllabus set — answer key

Five short, realistic Fall 2026 syllabi from a fictional institution
("Lakemount University"), built for testing an extraction tool that pulls
graded deadlines and out-of-pocket costs from PDFs and merges them into one
term view. All dates use the shared term calendar below and are written out
in full (never "Week 6").

**Shared term calendar:** Classes begin Tuesday, September 8, 2026 · Reading
week (no classes) Monday, October 12 – Friday, October 16, 2026 · Last day of
class Friday, December 4, 2026 · Final exam period Wednesday, December 9 –
Friday, December 18, 2026.

| File | Course | Total required cost | Graded items | iClicker? |
|---|---|---|---|---|
| `CHEM201_organic_F2026.pdf` | CHEM 201 — Organic Chemistry I | **$445.00** | 5 | Yes |
| `COMM310_financial_accounting_F2026.pdf` | COMM 310 — Financial Accounting | **$240.00** | 5 | No |
| `ENGL215_20th_century_literature_F2026.pdf` | ENGL 215 — Twentieth-Century Literature | **$0.00** | 5 | No |
| `MATH240_linear_algebra_2_F2026.pdf` | MATH 240 — Linear Algebra II | **$73.00** | 5 | Yes |
| `ARTD250_digital_design_studio_F2026.pdf` | ARTD 250 — Digital Design Studio | **$97.00** required (+ $59.99 optional) | 5 | No |

**Shared cost to catch:** CHEM 201 and MATH 240 both require an iClicker
subscription at $35.00 CAD, worded differently in each ("iClicker Cloud
subscription" vs. "iClicker Cloud (1-term licence)"). MATH 240 additionally
notes that a single subscription covers all courses that use it — a correct
extraction should merge these into one $35.00 line item, not double-count it.

**Crunch week to catch:** the week of Monday, October 19 – Friday, October
23, 2026 carries three major graded items in three different courses, on
three different days:
- Monday, October 19, 2026 — COMM 310 Midterm Exam (25%)
- Wednesday, October 21, 2026 — ENGL 215 Essay 1 (20%)
- Friday, October 23, 2026 — ARTD 250 Project 1: Brand Identity (25%)

**Genuinely free course:** ENGL 215 uses an open-access anthology and has
**zero** out-of-pocket cost — stated explicitly and positively in the course
materials section, with no price shown.

**Cost tiers (the other four courses):**
- Expensive (~$400+): CHEM 201 — textbook + lab kit/safety equipment + iClicker = $445.00
- Mid-range: COMM 310 — textbook + online access code = $240.00
- Cheap, non-zero: MATH 240 — iClicker + course pack = $73.00
- Cheap, non-zero, with a second-half item: ARTD 250 — Studio Kit 1 due
  Tuesday, September 8, 2026 ($55.00) + Studio Kit 2 due mid-term on Tuesday,
  November 3, 2026 ($42.00) = $97.00 required, plus one $59.99 OPTIONAL
  software item.

Every evaluation table sums to 100%, and every material is explicitly marked
REQUIRED or OPTIONAL with a CAD price (or, for the one free item, explicitly
$0.00 with no price to confuse an extractor).
