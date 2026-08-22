# Syllabus Test Corpus — Fall 2026

12 synthetic university syllabi for testing a syllabus-parsing pipeline, plus a hand-authored answer key.

**All 12 share one term calendar**, so they can be imported together as a single semester:

| | |
|---|---|
| Classes begin | Tue Sept 8, 2026 |
| Reading week | Oct 12–16, 2026 |
| Last day of classes | Mon Dec 7, 2026 |
| Exam period | Dec 9–18, 2026 |
| 100% refund drop deadline | Sept 21, 2026 |
| 50% refund drop deadline | Oct 2, 2026 |
| No refund after | Oct 16, 2026 |
| Drop without academic penalty | Nov 10, 2026 |

These are written from scratch — no real institution, instructor, or copyrighted syllabus is reproduced. Course codes and names are fictional but follow Ontario conventions. Prices are realistic for 2026 CAD.

---

## Set A — one student's course load (5 files)

Use these together to test **multi-file import, timeline merge, and cluster-week detection.** They are deliberately constructed as a plausible second-year schedule with no timetable conflicts.

| File | Format | What it stresses |
|---|---|---|
| `CHEM201_organic_chemistry_F2026.pdf` | PDF, 2pp | Clean cost table; one item with **three mutually exclusive prices** (new/used/rental); refundable deposit billed to student account; recurring weekly labs |
| `BUS301_corporate_finance_F2026.pdf` | PDF, 2pp | **No cost table at all** — every price is buried in prose; **USD amount** with an approximate CAD conversion; explicitly optional item that must not be counted |
| `ENG150_intro_literature_F2026.docx` | DOCX | DOCX parsing; **7 separate small book costs**; five say "any edition" so a library copy is $0 (avoidable cost); **course has zero exams** |
| `CPS209_computer_science_F2026.txt` | TXT | Ugly LMS export formatting; **"a quiz every Friday"** must expand to 10 dated events skipping reading week; textbook explicitly free |
| `ARTH110_art_history_F2026.pdf` | PDF, 1p | Very sparse; **final exam is "TBD"** within a known window — must surface as unscheduled, not guessed |

### Engineered cluster week: **Oct 19–23**

| Date | Course | Event |
|---|---|---|
| Tue Oct 20 | ENG 150 | Essay 1 |
| Wed Oct 21 | CHM 201 | Midterm 1 |
| Thu Oct 22 | BUS 301 | Midterm |
| Fri Oct 23 | CPS 209 | Midterm |

Four assessments in four days. Your cluster-week detector and exam-window collision warnings should both fire here. A second, softer cluster sits in the week of Nov 16.

---

## Set B — edge cases and stress tests (7 files)

| File | Format | What it stresses |
|---|---|---|
| `NURS240_scanned_ocr.txt` | TXT (garbled) | **Simulated bad OCR**: `S`→`5`, `l`→`1`, `O`→`0`, words split mid-token, stray spaces inside amounts (`$120 .00`). Also a vague "budget approximately $200 over the term" |
| `ENGR305_thermofluids_long_F2026.pdf` | PDF, **8pp** | Costs are in section 7 **on page 5**, behind pages of policy boilerplate. Field-study cost appears **three times** in the document — total is $325, not $650 or $975. Two-instalment payment |
| `PHIL101_minimal.txt` | TXT | **One paragraph.** No costs, no dates. Tests graceful degradation — the correct output is nearly empty with an "insufficient detail" signal, *not* invented data |
| `MATH240_linear_algebra_F2026.pdf` | PDF, 2pp | Complete, well-formed syllabus with **genuinely zero costs** (open textbook, free software, no clicker). **The most important precision test in the corpus** — any price extracted here is a hallucination |
| `FASH220_studio_supplies_F2026.pdf` | PDF, 2pp | **17 itemized small costs** in one table; a refundable deposit hidden inside that list; a vague `$250–$400` range that should be *spread across the term*, not booked as one spike; two separate student-account fees |
| `HIST280_relative_dates.txt` | TXT | **No absolute assessment dates.** Everything is "Week 4" or "the class immediately following reading week" — requires resolving against the term start and skipping reading week |
| `PSYC202_table_heavy_F2026.pdf` | PDF, 2pp | Main extraction target is a **14-row schedule grid**; midterm date hides in a grid cell rather than the evaluation table; free research-participation requirement that must not be priced |

---

## Cross-file traps

**Duplicate cost.** The **$35.00 iClicker subscription appears in both `CHEM201` and `PSYC202`**. PSYC202 states explicitly that one subscription covers all courses. A parser that double-counts produces $70.00 and is wrong. This is the test for your dedupe prompt.

**Zero-cost traps.** Four documents state that something is free (`CPS209` textbook, `MATH240` everything, `ENGR305` MATLAB, `PSYC202` SPSS and research participation). Each is an opportunity to hallucinate a price.

**Avoidable vs. unavoidable.** `ENG150` has five novels marked "any edition" (library copy = $0) and one that requires a specific Broadview edition. A good extractor distinguishes these; a naive one reports $98.18 as if it were mandatory.

---

## `ground_truth.json`

Hand-authored answer key covering every file: expected costs (with amounts, due dates, required/optional flags, refundability), expected key dates with recurrence expansion counts, the cluster weeks, and the duplicate-cost case. Use it to score precision and recall automatically rather than eyeballing output.

Verified totals you can assert against:

| Check | Value |
|---|---|
| ENG150 — all 7 novels | `$98.18` |
| FASH220 — kit, 17 items | `$271.54` |
| CHEM201 — required, used textbook | `$315.50` |
| ENGR305 — required, used textbook | `$601.00` |
| PSYC202 — used textbook | `$167.00` |
| MATH240 — total | `$0.00` |
| PHIL101 — total | `$0.00` |
| CPS209 — total | `$25.00` |
| ARTH110 — total | `$63.00` |

---

## Suggested testing order

1. **`CHEM201`** first — cleanest document, gets your happy path working.
2. **`MATH240`** and **`PHIL101`** next — if these produce any costs, fix precision before adding features.
3. **`BUS301`** — proves you can find costs without a table to anchor on.
4. **`CPS209`** and **`HIST280`** — recurrence expansion and relative-date resolution.
5. **All of Set A at once** — merge, dedupe, cluster-week detection.
6. **`ENGR305`** and **`NURS240`** last — long-document retrieval and OCR noise are the hardest cases and the most likely to need a prompt change rather than a code change.
