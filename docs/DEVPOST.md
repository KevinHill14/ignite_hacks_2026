# Termsheet, Devpost / HackerHub submission

Copy the sections below into the submission form. Written to be pasted, but
change anything that does not sound like you.

The headed sections map onto what the form asks for. If the form uses different
labels, the content still fits; just move it.

---

## Tagline (one line)

**The real terms of your semester: every deadline and every dollar, pulled out
of your syllabi before they hit your card.**

---

## Category

**Fintech.**

Termsheet is a personal cash-flow tool. It takes a document students already
have and cannot read financially, extracts the money out of it, and answers the
question that actually matters: can I afford this term, and when will it hurt.
The scheduling side is real, and the reason it exists is that deadlines and
spending land in the same weeks.

## Tracks

**Primary: fintech.**

Sponsor tools used in the build:

- **n8n** runs the entire extraction pipeline. Not a peripheral integration.
  Every step between the upload and the calendar write is an n8n node, and the
  workflow JSON ships in the repo as a single importable file.
- **Render** hosts both services from a blueprint in the repo, one public web
  app and one n8n instance.

> Check this section against the official track list before submitting. Fintech
> is confirmed as the category. If the organizers run separate sponsor prizes
> for n8n or Render, both apply here on substance rather than as a token
> mention.

---

## Inspiration

Honestly, it was how confusing all of it is.

You get five syllabi at the start of term. Each one is twenty pages, each one
is laid out differently, and the things you actually need are scattered through
them. Due dates in one table, grade weights in another, required textbooks
somewhere near the bottom, a lab fee mentioned once in a paragraph. Nothing is
hidden. It is all written down. It is just spread across five documents written
by five people who never talked to each other, and there is no version of it
anywhere that shows you the term as one thing.

So you read them once, you get the general shape, and you spend the next four
months finding out the specifics at the worst possible moment. That is not a
you problem. The format is the problem.

### What it solves

Termsheet turns those five PDFs into the two answers nobody currently has:

**What is my term actually going to cost?** Every textbook, access code, lab
kit and fee, totalled, with shared items counted once instead of twice. There
is no single number for this anywhere right now, and it is the number that
decides whether you can afford the semester.

**When is it going to hurt?** Deadlines and costs on one timeline, so the weeks
where several courses all want something show up before you are in them. Those
are the same weeks you spend more and work fewer shifts, and no calendar or
banking app knows that.

Then it goes one step further and answers the question those two lead to: given
what I have and what is coming in, am I going to make it. Not as a single date,
which would be a guess, but as a probability across two thousand simulated
terms.

## What the project does

You drop in up to five syllabi, a full course load. Termsheet reads them and
gives you two things.

**Your deadlines**, on your Google Calendar or as a calendar file that works
anywhere, with the grade weight and the exact line from the syllabus attached
to each one.

**Your term, priced.** Every textbook, lab kit, access code, studio fee and
exam fee, on a timeline showing when each comes due.

Then it does the part no single syllabus can:

- **Crunch weeks.** The week several courses all want something is also the
  week you spend more and work fewer shifts. That only shows up with the whole
  load on one axis.
- **Shared costs, counted once.** Two courses both require the same $35 clicker
  subscription. One subscription covers both. A tool that adds them up returns
  a number that is simply wrong.
- **What the term actually costs you**, rather than what it costs on paper.
- **Whether you will make it**, as a probability rather than a single date.
- **What dropping a course would change.** Toggle one off and the total, the
  crunch weeks and the forecast all recalculate.

## The problem it addresses

A syllabus is a bill nobody itemizes.

You get five of them in September. Somewhere in each one, usually buried
between the academic integrity policy and the office hours, is a list of things
you have to buy. $185 for the textbook. $89 for the access code you cannot
submit homework without. $42 for the calculator the midterm requires. Nobody
adds them up. You find out one surprise at a time, in the bookstore line, in
the first week, when you have the least money you will have all term.

Three specific problems fall out of that:

**Nobody totals the term.** The costs are spread across five documents written
by five people who never spoke to each other. There is no single number
anywhere, and the number is what determines whether you can afford the
semester.

**Financial aid does not arrive as money.** OSAP and entrance scholarships are
credited to your student account, tuition comes off the top, and only the
surplus reaches your bank. A student assessed $12,400 against $9,100 of tuition
sees **$0 deposited in September**, the month they are actually buying
textbooks, and the whole $3,300 in January. Most students learn this by
experiencing it.

**Academic pressure and financial pressure arrive together.** The week three
courses want midterms is the week you work fewer shifts and spend more. Neither
your calendar nor your bank app knows about the other one.

## How the solution works

```
          Web upload                     Google Drive folder
               |                                  |
               v                                  v
     Next.js /api/ingest  ─────────►   n8n Webhook      Drive Trigger
     (holds the token,                      |                |
      never the browser)                    └───────┬────────┘
                                                    v
                                         Extract text from PDF
                                                    v
                                         Sanitize + guard   (strips hidden
                                                    v        instruction text)
                                         Claude, json_schema output
                                                    v
                                         Validate + build plan
                                                    v
                                       ┌────────────┴────────────┐
                                       v                         v
                             Google Calendar events      Cost timeline JSON
                                       └────────────┬────────────┘
                                                    v
                                           Response to the UI
```

**1. Ingest.** A file arrives either from the web upload or from a watched
Google Drive folder. Both entry points feed the same pipeline. The web app
proxies the upload through a server route so the pipeline credential never
reaches the browser.

**2. Extract and sanitize.** Text comes out of the PDF locally. Zero-width and
bidirectional characters get stripped before the text reaches the model,
because those are the standard carrier for instructions hidden invisibly inside
a document.

**3. Model call.** Claude reads the text against a strict JSON schema. Every
item it returns must carry a **verbatim quote** from the syllabus and a
confidence score. If it cannot quote the source, it does not emit the item.

**4. Validate.** The pipeline throws on a missing or unresolvable date rather
than substituting a plausible one. Anything it cannot resolve becomes a visible
warning instead of a silent guess.

**5. Write and return.** Deadlines go to Google Calendar one event at a time.
The full cost timeline returns to the UI, where merging, deduplication and the
forecast all run client-side.

**6. Merge, when there is more than one.** Five separate results become one
term: costs deduplicated across courses, deadlines clustered into crunch weeks,
per-course totals computed so you can see which course is expensive.

## Tools and technologies used

| Tool | Role |
|---|---|
| **n8n** | The entire pipeline, 14 nodes. Triggers, PDF extraction, sanitization, model call, validation, calendar writes. |
| **Claude Sonnet 5** | Structured extraction against a strict JSON schema, with adaptive thinking. |
| **Next.js 16 / TypeScript** | Interface, plus the server route that keeps the pipeline token out of the browser. |
| **Google Calendar API** | Where deadlines land. |
| **Google Drive API** | The hands-off ingest path. |
| **Render** | Deployment, defined as a blueprint in the repo. |
| **Docker** | Local n8n, hardened compose file. |
| **iCalendar, RFC 5545** | The `.ics` export that works without any Google account. |

Everything numerical is plain TypeScript in `web/src/lib/`, each module paired
with an assertion suite in `scripts/check-*.mjs`: the merge, the
deduplication, the Monte Carlo simulation, the income model and the calendar
file builder.

## Notable features and technical decisions

**Extraction has to cite its source.** Every cost and every deadline carries a
verbatim quote from the syllabus, surfaced in the UI when you click the item.
An extractor that cannot show you where a number came from is asking you to
trust it, and there is no reason to.

**Refusing to answer is a feature.** When a final exam is "scheduled by the
Registrar in March", the honest output is a warning, not a date. The pipeline
drops what it cannot resolve and says so.

**The forecast is a distribution, not a date.** "You run out on November 24" is
a guess wearing the costume of a fact, because nobody spends exactly $320 on
groceries every month. Instead it runs the term 2,000 times with each spending
category drawn from a **lognormal** distribution, chosen because spending
cannot be negative and is right-skewed, so a normal distribution would produce
negative groceries.

**Course costs are held fixed inside the simulation.** Those we actually know,
so varying them would be inventing uncertainty. That asymmetry is the whole
shape of the chart: a widening cone for living costs, punctuated by hard
vertical steps where the textbook lands.

**Every number can be interrogated.** "19% risk" is written as "you went below
$0 in 384 of 2,000 simulated terms", and every assumption behind it is visible
and editable. A figure you cannot take apart reads as invented, however sound
the maths.

**Deduplication with a guard against itself.** Matching shared items across
courses uses token-subset matching rather than exact strings, with a two-token
floor. Over-matching would silently delete real costs from a total, which is
worse than the miss it repairs, so there is a test asserting "Studio Kit 1" and
"Studio Kit 2" stay separate.

**Five files in parallel.** Each is a model call of roughly 90 seconds. Five in
sequence is seven and a half minutes of watching a spinner. They run
concurrently and settle independently, so one bad PDF cannot take the others
down.

**The `.ics` path needs no account.** Per-user Google Calendar requires app
verification, which caps an unverified app at a hand-listed set of test users.
The calendar file is built in the browser from data already on the page, and
imports into Google, Apple and Outlook alike.

**The syllabus is treated as untrusted input throughout**, and your balance
never leaves the tab. The forecast is pure client state: not sent, not stored,
not logged.

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
stayed invisible until something external contradicted it.

### The deployment, which was worse

Getting it working locally took a fraction of the time that getting it onto
Render did, and the failures were memorable for the same reason as the bugs
above: each one described itself inaccurately.

**n8n crash-looped on 512 MB, and the symptom was a missing URL.** Render's
Starter plan produced `FATAL ERROR: Ineffective mark-compacts near heap limit`
at around 245 MB, which is the ceiling Node picks for itself inside a 512 MB
container. A crash-looping service never reaches a healthy state, so Render
never routed it a public hostname. We spent a while investigating "why is there
no URL" before realising the dashboard and the logs were describing one failure
in two vocabularies.

**"The OAuth callback state is invalid" was not a Google problem.** n8n issues
an OAuth state token and validates it on the callback, building both halves
from its own configured base URL. With `N8N_WEBHOOK_URL` and
`N8N_EDITOR_BASE_URL` unset it believes it lives at `localhost:5678`, and
announces this in the boot log under a heading that reads like reassurance:
`Editor is now accessible via: http://localhost:5678`. State gets issued
against one origin and checked against another. The error points squarely at
Google, and Google is not involved.

**A node that never runs still blocked publishing.** The Google Drive trigger
ships disabled by design, so its download node never executes. n8n's publish
step validates every node regardless and refused, with the reason visible only
as a tooltip on the greyed-out button: "1 node has issues, fix them before
publishing."

**We chased a theory that was wrong, and said so.** When uploads still failed
after all that, the evidence looked damning: the public URL returned 403,
meaning the webhook existed and auth was enforced, while the app's internal
call got a 404 saying the workflow was not registered. Same instance, seconds
apart. We concluded Render's private networking was at fault and routed around
it. That turned out not to be the cause, and the real fix was mundane: a
process restart clearing stale pooled connections to a container that no longer
existed after the plan change. The commit adding the workaround is still in the
history with a comment explaining what it assumed and why that assumption did
not hold.

## Accomplishments we're proud of

Five syllabi score **18/18** against a hand-written answer key: every
per-course total exact, the shared subscription counted once, the crunch week
correctly identified, 25 of 25 events on a real calendar. Five files in **17
seconds**.

The result we point at first is a course that returns **exactly $0.00**. It is
genuinely free, open textbook and no clicker, and a weaker extractor invents a
price there. Correctly finding nothing is harder than finding something.

## What we learned

Refusing to answer is a feature, and a range is less satisfying and more true
than a date.

The deployment taught its own version of the same lesson. An error message is a
claim, not a diagnosis. "No URL", "invalid OAuth state" and "webhook not
registered" were all technically accurate and all pointed away from their
actual causes. The fastest debugging came from checking the thing the message
was *not* talking about.

## What's next

Per-user Google accounts, which needs Google's app verification. Until that
lands, the calendar file is the path that works for everyone. OCR for scanned
syllabi. Bookstore price lookups, so a textbook named without a price still
gets one.

Longer term, the interesting direction is comparative: given enough syllabi, it
could tell you what a course costs *before* you enrol.

## Built with

`n8n` · `Claude Sonnet 5` · `Next.js` · `TypeScript` · `Google Calendar API` ·
`Google Drive API` · `Docker` · `Render` · `iCalendar (RFC 5545)` ·
`Monte Carlo simulation`

## Try it

Live: **https://syllabus-web.onrender.com**

Password provided with the submission.

There are two worked examples on the page that need no account and no upload,
if you would rather not hunt for a syllabus. They are under the upload box,
labelled "See an example first".
