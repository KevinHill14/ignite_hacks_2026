# Termsheet — Devpost / HackerHub submission

Copy the sections below into the submission form. Written to be pasted, not
rewritten — but change anything that doesn't sound like you.

---

## Tagline (one line)

**The real terms of your semester — every deadline and every dollar, pulled out of your syllabi before they hit your card.**

---

## Inspiration

A syllabus is a bill nobody itemizes.

You get five of them in September. Somewhere in each one, usually buried
between the academic integrity policy and the office hours, is a list of
things you have to buy. $185 for the textbook. $89 for the access code you
can't submit homework without. $42 for the calculator the midterm requires.
Nobody adds them up. You find out one surprise at a time, in the bookstore
line, in the first week, when you have the least money you'll have all term.

The scheduling problem is the obvious one. The money problem is the one that
actually hurts, and it's completely invisible until it isn't.

## What it does

You drop in up to five syllabi — a full course load. Termsheet reads them and
gives you two things:

**Your deadlines**, on your Google Calendar or as a calendar file that works
anywhere, with the grade weight and the exact line from the syllabus attached
to each one.

**Your term, priced.** Every textbook, lab kit, access code, studio fee and
exam fee, laid out on a timeline showing when each one comes due.

Then it does the part no single syllabus can:

- **Crunch weeks.** The week three courses all want something is also the week
  you spend more and work fewer shifts. You can only see it with the whole
  load on one axis.
- **Shared costs, counted once.** Two courses both require the same $35
  clicker subscription. One subscription covers both. A tool that adds them up
  gives you a number that is simply wrong.
- **What the term actually costs you**, not what it costs on paper. OSAP and
  entrance scholarships don't arrive as money — they're credited to your
  student account, tuition comes off the top, and only the surplus reaches
  your bank. We model that, and the result surprises people: a student
  assessed $12,400 against $9,100 of tuition sees **$0 deposited in September**
  and the whole $3,300 in January.
- **Whether you'll make it.** Enter your balance and income and it simulates
  the term 2,000 times, varying each spending category realistically, and
  tells you your chance of running short and roughly when.
- **What dropping a course would change.** Toggle one off and the total, the
  crunch weeks, and the forecast all recalculate.

## How we built it

**n8n** runs the whole pipeline: a webhook or a watched Google Drive folder
takes the file, extracts the text locally, sanitises it, calls the model,
validates the result, and writes the calendar events.

**Claude Sonnet 5** does the extraction, constrained to a strict JSON schema.
Every item it returns must carry a **verbatim quote** from the syllabus and a
confidence score. If it can't quote the source, it doesn't emit the item.

**Next.js** is the interface and a server-side proxy that keeps the pipeline
credential out of the browser.

The forecast is a **Monte Carlo simulation** in the browser: 2,000 runs of the
term, each spending category drawn from a lognormal distribution — spending
can't be negative and is right-skewed, so a normal distribution would produce
negative groceries. Course costs are held **fixed**, because those we actually
know. That asymmetry is the whole picture: a widening cone of uncertainty for
living costs, punctuated by hard vertical steps where the textbook lands.

## Challenges we ran into

The interesting bugs all had the same shape: **something was missing, and code
quietly substituted a plausible value instead of failing.**

- n8n blocks environment access unless a variable is *literally* the string
  `"false"`. Unset means blocked. Every calendar write failed — and the model
  setting silently fell back, so every run went to a more expensive model for
  hours without a single error anywhere.
- `moment.tz(undefined, tz)` returns **now** rather than throwing. A field
  mismatch meant 18 events were created untitled, on the current date, and the
  pipeline reported **18/18 success**.
- Cost matching compared exact strings, so "iClicker Cloud subscription" and
  "iClicker Cloud (1-term licence)" never matched. The shared item was billed
  twice and the term total was wrong by $35, silently.

Every one produced a *confident wrong answer* rather than an error, and each
was invisible until something external contradicted it. So the pipeline now
throws on a missing date rather than guessing, and reports which model
actually answered.

The fix for the last one introduced its own risk worth naming: fuzzy matching
that over-matches would silently **delete** real costs from a total — worse
than the miss it repairs. There's a test asserting that "Studio Kit 1" and
"Studio Kit 2" stay separate.

## Accomplishments we're proud of

Five syllabi score **18/18** against a hand-written answer key: every
per-course total exact, the shared subscription counted once, the crunch week
correctly identified, 25/25 events on a real calendar. Five files in **17
seconds** — they're processed in parallel, because five sequential model calls
is 90 seconds of staring at a spinner.

The result we point at first is a course that returns **exactly $0.00**. It's
genuinely free — open textbook, no clicker — and a weaker extractor invents a
price there. Correctly finding nothing is harder than finding something.

## What we learned

Refusing to answer is a feature. The extractor drops any date it can't
resolve rather than guessing, and says so. When a final exam is "scheduled by
the Registrar in March", the honest output is a warning, not a date.

The same principle drove the forecast. A single date — "you run out on
November 24" — is a guess wearing the costume of a fact. Nobody spends exactly
$320 on groceries every month. A range is less satisfying and more true.

And a number you can't interrogate reads as invented, however sound the maths.
"19% risk" became "you went below $0 in 384 of 2,000 simulated terms", and
every assumption is visible and editable.

## What's next

Per-user Google accounts, which needs Google's app verification — until then
the calendar file is the path that works for everyone. OCR for scanned
syllabi. Bookstore price lookups, so a textbook named without a price still
gets one.

Longer term the interesting direction is comparative: if this reads enough
syllabi, it can tell you what a course costs *before* you enrol.

## Built with

`n8n` · `Claude Sonnet 5` · `Next.js` · `TypeScript` · `Google Calendar API` ·
`Docker` · `Render` · `iCalendar (RFC 5545)` · `Monte Carlo simulation`

## Try it

Live: **[your Render URL]** — password provided with the submission.

There are two worked examples on the page that need no account and no upload,
if you'd rather not hunt for a syllabus.
