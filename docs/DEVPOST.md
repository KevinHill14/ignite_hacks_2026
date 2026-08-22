# Termsheet, Devpost / HackerHub submission

Copy the sections below into the submission form. Written to be pasted, but
change anything that does not sound like you.

---

## Tagline (one line)

**The real terms of your semester: every deadline and every dollar, pulled out
of your syllabi before they hit your card.**

---

## Inspiration

A syllabus is a bill nobody itemizes.

You get five of them in September. Somewhere in each one, usually buried
between the academic integrity policy and the office hours, is a list of things
you have to buy. $185 for the textbook. $89 for the access code you cannot
submit homework without. $42 for the calculator the midterm requires. Nobody
adds them up. You find out one surprise at a time, in the bookstore line, in
the first week, when you have the least money you will have all term.

The scheduling problem is the obvious one. The money problem is the one that
actually hurts, and it stays completely invisible until it isn't.

## What it does

You drop in up to five syllabi, a full course load. Termsheet reads them and
gives you two things.

**Your deadlines**, on your Google Calendar or as a calendar file that works
anywhere, with the grade weight and the exact line from the syllabus attached
to each one.

**Your term, priced.** Every textbook, lab kit, access code, studio fee and
exam fee, on a timeline showing when each one comes due.

Then it does the part no single syllabus can:

- **Crunch weeks.** The week three courses all want something is also the week
  you spend more and work fewer shifts. That only shows up with the whole load
  on one axis.
- **Shared costs, counted once.** Two courses both require the same $35 clicker
  subscription. One subscription covers both. A tool that adds them up returns
  a number that is simply wrong.
- **What the term actually costs you**, rather than what it costs on paper.
  OSAP and entrance scholarships do not arrive as money. They are credited to
  your student account, tuition comes off the top, and only the surplus reaches
  your bank. We model that, and the result surprises people: a student assessed
  $12,400 against $9,100 of tuition sees **$0 deposited in September** and the
  whole $3,300 in January.
- **Whether you will make it.** Enter your balance and income and it simulates
  the term 2,000 times, varying each spending category realistically, then
  tells you your chance of running short and roughly when.
- **What dropping a course would change.** Toggle one off and the total, the
  crunch weeks and the forecast all recalculate.

## How we built it

**n8n** runs the whole pipeline. A webhook or a watched Google Drive folder
takes the file, extracts the text locally, sanitises it, calls the model,
validates the result, and writes the calendar events. Fourteen nodes, and the
workflow JSON is in the repo.

**Claude Sonnet 5** does the extraction, constrained to a strict JSON schema.
Every item it returns must carry a **verbatim quote** from the syllabus and a
confidence score. If it cannot quote the source, it does not emit the item.

**Next.js** is the interface, plus a server-side route that keeps the pipeline
credential out of the browser.

The forecast is a **Monte Carlo simulation** running in the browser: 2,000 runs
of the term, each spending category drawn from a lognormal distribution,
because spending cannot be negative and is right-skewed, so a normal
distribution would produce negative groceries. Course costs are held **fixed**,
because those we actually know. That asymmetry is the whole picture: a widening
cone of uncertainty for living costs, punctuated by hard vertical steps where
the textbook lands.

## Challenges we ran into

### The bugs that lied to us

The interesting bugs all had the same shape. **Something was missing, and code
quietly substituted a plausible value instead of failing.**

- n8n blocks environment access unless a variable is *literally* the string
  `"false"`. Unset means blocked. Every calendar write failed, and the model
  setting silently fell back, so every run went to a more expensive model for
  hours without a single error appearing anywhere.
- `moment.tz(undefined, tz)` returns **now** rather than throwing. A field
  mismatch meant 18 events were created untitled, on the current date, and the
  pipeline reported **18/18 success**.
- Cost matching compared exact strings, so "iClicker Cloud subscription" and
  "iClicker Cloud (1-term licence)" never matched. The shared item was billed
  twice and the term total was wrong by $35, silently.

Every one produced a *confident wrong answer* rather than an error, and each
stayed invisible until something external contradicted it. The pipeline now
throws on a missing date rather than guessing, and reports which model actually
answered.

The fix for the last one introduced its own risk worth naming: fuzzy matching
that over-matches would silently **delete** real costs from a total, which is
worse than the miss it repairs. There is a test asserting that "Studio Kit 1"
and "Studio Kit 2" stay separate.

### The deployment, which was worse

Getting it working locally took a fraction of the time that getting it onto
Render did, and the failures were memorable for the same reason as the bugs
above: each one described itself inaccurately.

**n8n crash-looped on 512 MB, and the symptom was a missing URL.** Render's
Starter plan gave us `FATAL ERROR: Ineffective mark-compacts near heap limit`
at around 245 MB, which is the ceiling Node picks for itself inside a 512 MB
container. A crash-looping service never reaches a healthy state, so Render
never routed it a public hostname. We spent a while investigating "why is there
no URL" before realising the dashboard and the logs were describing the same
failure in two different vocabularies. Setting `NODE_OPTIONS` explicitly got it
through boot. The pipeline itself still needed a bigger instance, and we only
established that by watching it survive idle and then die under real load.

**"The OAuth callback state is invalid" was not a Google problem.** n8n issues
an OAuth state token and validates it on the callback, building both halves
from its own configured base URL. With `N8N_WEBHOOK_URL` and
`N8N_EDITOR_BASE_URL` unset, it believes it lives at `localhost:5678`, and it
announces this in the boot log under a heading that reads like reassurance:
`Editor is now accessible via: http://localhost:5678`. State gets issued
against one origin and checked against another. The error message points
squarely at Google, and Google is not involved.

**A node that never runs still blocked publishing.** Our Google Drive trigger
ships disabled by design, so its download node never executes. n8n's publish
step validates every node in the workflow regardless, and refused to publish
with no visible explanation. The reason only appears as a tooltip on the
disabled button: "1 node has issues, fix them before publishing." Deactivating
that one node fixed it immediately.

**We chased a theory that was wrong, and said so.** When uploads still failed
after all that, the evidence looked damning: the public URL returned 403,
meaning the webhook existed and auth was enforced, while the app's internal
call got a 404 saying the workflow was not registered. Same instance, seconds
apart. We concluded Render's private networking was at fault and routed around
it. That turned out not to be the cause, and the actual fix was mundane, a
process restart clearing stale pooled connections to a container that no longer
existed after the plan change. The commit that added the workaround is still in
the history with a comment explaining what it assumed and why that assumption
did not hold.

## Accomplishments we're proud of

Five syllabi score **18/18** against a hand-written answer key: every
per-course total exact, the shared subscription counted once, the crunch week
correctly identified, 25 of 25 events on a real calendar. Five files in **17
seconds**, processed in parallel, because five sequential model calls is 90
seconds of watching a spinner.

The result we point at first is a course that returns **exactly $0.00**. It is
genuinely free, open textbook and no clicker, and a weaker extractor invents a
price there. Correctly finding nothing is harder than finding something.

## What we learned

Refusing to answer is a feature. The extractor drops any date it cannot resolve
rather than guessing, and says so. When a final exam is "scheduled by the
Registrar in March", the honest output is a warning, not a date.

The same principle drove the forecast. A single date, "you run out on November
24", is a guess wearing the costume of a fact. Nobody spends exactly $320 on
groceries every month. A range is less satisfying and more true.

A number you cannot interrogate reads as invented, however sound the maths
behind it. "19% risk" became "you went below $0 in 384 of 2,000 simulated
terms", and every assumption is visible and editable.

And the deployment taught its own version of the same lesson. An error message
is a claim, not a diagnosis. "No URL", "invalid OAuth state" and "webhook not
registered" were all technically accurate and all pointed away from their
actual causes. The fastest debugging we did came from checking the thing the
message was *not* talking about.

## What's next

Per-user Google accounts, which needs Google's app verification. Until that
lands, the calendar file is the path that works for everyone. OCR for scanned
syllabi. Bookstore price lookups, so a textbook named without a price still
gets one.

Longer term, the interesting direction is comparative: given enough syllabi, it
could tell you what a course costs *before* you enrol.

## Built with

`n8n` · `Claude Sonnet 5` · `Next.js` · `TypeScript` · `Google Calendar API` ·
`Docker` · `Render` · `iCalendar (RFC 5545)` · `Monte Carlo simulation`

## Try it

Live: **https://syllabus-web.onrender.com**

Password provided with the submission.

There are two worked examples on the page that need no account and no upload,
if you would rather not hunt for a syllabus. They are under the upload box,
labelled "See an example first".
