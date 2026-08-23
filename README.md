# Termsheet

**Drop in your syllabi. Every deadline lands on your calendar, and every
textbook, lab kit, access code and fee lands on one timeline, before any of it
lands on your card.**

A syllabus is a bill nobody itemizes. You get five of them in September, and
somewhere in each one, usually buried between the academic integrity policy and
the office hours, is a list of things you have to buy. $185 for the textbook.
$89 for the access code you need to submit homework. $42 for the calculator the
midterm requires. Nobody adds them up, so you find out one surprise at a time,
in the bookstore line, in the first week, when you have the least money you
will have all year.

Termsheet reads the PDFs and turns them into two things you can act on: a
schedule, and a cash-flow plan.

Built for IgniteHacks 2026, fintech track.

---

## Try it

> **The hosted deployment is currently down.** It was taken offline after
> IgniteHacks to stop the hosting bill. To bring it back, see
> [docs/REDEPLOY.md](docs/REDEPLOY.md), which takes about 25 minutes. To run it
> locally instead, see [Run it locally](#run-it-locally) below.

When it is up, the site is password gated, because it runs a real model and
writes to a real calendar.

You do not need a syllabus to see the whole product. On the landing page there
is a line under the upload box that reads "See an example first" with two
links, **one course** and **a full course load**. Both render the complete
results view instantly with no upload, no account and no API cost.

---

## What it does

**Reads the syllabus.** PDF in, structured data out, using Claude with a strict
JSON schema. Every item it returns carries a verbatim `source_quote` and a
confidence score. If the model cannot quote the syllabus for something, it does
not report it.

**Fills your calendar.** Deadlines go to Google Calendar with the grade weight
and the supporting quote in the description. There is also a `.ics` download
that works in Google, Apple and Outlook without connecting any account.

**Prices the term.** Costs are grouped by month, split into required and
optional, and totalled per currency.

**Forecasts your balance.** Enter what you have and what is coming in, and it
simulates the term 2,000 times to tell you your chance of running short, and
roughly when.

The signature view is the **term spine**: one shared time axis, deadlines
ticking above the line, cost bars hanging below it. Reading straight down from
a busy week shows what that same week costs you.

### The part one syllabus cannot tell you

Importing five at once is the point, because these facts only exist across
files:

- **Crunch weeks.** The week several courses all want something is also the
  week you spend more and work fewer shifts.
- **Shared costs, counted once.** Two courses requiring the same clicker
  subscription is one subscription. A tool that adds them up returns a number
  that is simply wrong.
- **Which course is quietly the expensive one**, and which one is genuinely
  free.
- **What dropping a course would change.** Toggle one off and the total, the
  crunch weeks and the forecast all recalculate.

---

## Architecture

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

Two entry points, one pipeline. Everything between ingest and calendar runs in
n8n. The workflow is `n8n/syllabus-to-calendar.workflow.json`, 14 nodes,
importable as-is.

The Drive trigger is the hands-off path: connect Drive once, point it at a
folder, and anything dropped in imports on its own. It ships **disabled**,
because n8n refuses to publish a workflow whose trigger has no credential, and
that would block the upload path too.

---

## Stack

| Piece | What it does |
|---|---|
| **n8n** | The entire pipeline. Triggers, PDF extraction, model call, validation, calendar writes. |
| **Claude** | Structured extraction against a strict JSON schema, with adaptive thinking. Runs `claude-sonnet-5` in production; set `EXTRACTION_MODEL` to swap it. |
| **Next.js 16** | The interface, plus a server route that keeps the pipeline token out of the browser. |
| **Google Calendar / Drive** | Where deadlines land, and the hands-off way syllabi arrive. |
| **Render** | Deploy target. `render.yaml` defines both services. |

The Monte Carlo forecast, the multi-syllabus merge, the deduplication and the
`.ics` builder are all plain TypeScript in `web/src/lib/`, each with a matching
`scripts/check-*.mjs` that asserts against known-good values.

---

## Run it locally

You need Node 20 or newer, Docker, and an Anthropic API key.

```bash
git clone https://github.com/KevinHill14/ignite_hacks_2026.git
cd ignite_hacks_2026

npm run gen:secrets    # writes .env with a fresh encryption key and ingest token
                       # then paste your key into ANTHROPIC_API_KEY in .env

npm run setup          # installs, starts n8n, imports the workflow, activates it
npm run web:dev        # http://localhost:3000
```

`npm run setup` is a shortcut for `gen:secrets`, the web install, `n8n:up` and
`n8n:setup`. That last step handles the error-prone part: it builds both
credentials from your `.env`, so the ingest token the web app sends and the one
n8n checks cannot drift apart, then publishes and activates the workflow.

New to any of this? [docs/TEAMMATE-SETUP.md](docs/TEAMMATE-SETUP.md) walks it
slowly.

<details>
<summary>Setting it up by hand in the n8n UI instead</summary>

At `http://localhost:5678`:

1. Create your owner account (local only).
2. **Import** `n8n/syllabus-to-calendar.workflow.json`.
3. Add the two credentials the upload path needs:
   - **Anthropic**, your API key, on the *Claude: Extract Schedule + Costs*
     node.
   - **Header Auth**, on the *Webhook: Manual Upload* node. Header name
     `X-Ingest-Token`, value is the `INGEST_TOKEN` from your `.env`. These two
     must match exactly or every upload returns 401.
4. **Publish** the workflow using the button in the top right.

   Until it is published, n8n serves only a one-shot *test* URL and the app
   gets a 404, which surfaces as "the pipeline is not listening". If the
   publish button is greyed out, hover it: n8n blocks publishing when any node
   has an unresolved credential, including nodes that never run.

</details>

### Google setup (optional)

Neither Google integration is required. Without them the pipeline still
extracts everything and still returns the full cost breakdown, and only the
calendar writes report as failed. The `.ics` download works regardless, because
it is built in the browser from data already on the page.

- **Google Calendar OAuth2.** Put `GOOGLE_OAUTH_CLIENT_ID` and
  `GOOGLE_OAUTH_CLIENT_SECRET` in `.env`, run `npm run n8n:setup`, then click
  **Connect** in the n8n UI. Point `GOOGLE_CALENDAR_ID` at a **throwaway
  calendar** first, so a bad extraction pollutes something disposable rather
  than your real schedule. Note that `primary` does not work here: the n8n node
  validates the calendar ID against an email-shaped pattern and rejects it.
- **Google Drive OAuth2.** Set the folder on the *Drive: New Syllabus Dropped*
  node, then enable that node.

Full walkthrough in [docs/GOOGLE-OAUTH.md](docs/GOOGLE-OAUTH.md).

---

## Deploying

`render.yaml` is a Render blueprint defining both services. The full guide,
including the failures worth knowing about in advance, is in
[docs/RENDER-DEPLOY.md](docs/RENDER-DEPLOY.md).

Two things that cost real time and are easy to avoid:

- **n8n needs more than 512 MB.** On Render's Starter plan it boots fine and
  then dies with a JavaScript heap out-of-memory crash the moment it processes
  an actual syllabus. Setting `NODE_OPTIONS=--max-old-space-size=320` gets it
  through boot, but the pipeline itself still needs the Standard plan.
- **Set `N8N_WEBHOOK_URL` and `N8N_EDITOR_BASE_URL` to the public hostname**
  before attempting Google OAuth. Without them n8n believes it lives at
  `localhost:5678`, issues the OAuth state against one origin, validates it
  against another, and fails with "The OAuth callback state is invalid" and no
  further detail.

---

## Security

Full threat model in [docs/SECURITY.md](docs/SECURITY.md). The short version:

- **Secrets live in exactly one place.** Google and Anthropic credentials sit
  in n8n's encrypted credential store. The browser never sees the pipeline
  token, because a server-side route holds it.
- **The syllabus is untrusted input.** Zero-width and bidi characters, the
  standard carrier for instructions hidden invisibly inside a PDF, are stripped
  before the text reaches the model, and the system prompt tells it to ignore
  instructions found in the document.
- **Uploads are validated by content, not filename.** A file has to actually
  begin with `%PDF-`.
- **Your balance never leaves the tab.** The runway forecast is pure client
  state. Not sent, not stored, not logged.
- **Nothing is retained.** n8n saves no execution data on success, so parsed
  syllabus text does not linger in the database.
- **Public deployments are gated** by a password and per-IP rate limiting, at 6
  requests a minute and 25 a day.

---

## Repo layout

```
web/                     Next.js app, UI and server proxy routes
  src/lib/               merge, dedupe, Monte Carlo, iCalendar, income model
n8n/
  docker-compose.yml     hardened n8n container
  syllabus-to-calendar.workflow.json
scripts/
  gen-secrets.mjs        generates .env secrets, never overwrites existing ones
  setup-n8n.mjs          imports the workflow and wires both credentials
  check-*.mjs            assertion suites for the pure-TypeScript logic
docs/
  SECURITY.md            threat model and mitigations
  REDEPLOY.md            putting it back on Render after teardown
  RENDER-DEPLOY.md       first-time deployment, with the failures called out
  GOOGLE-OAUTH.md        Google Cloud setup
  TEAMMATE-SETUP.md      slower onboarding walkthrough
  DEVPOST.md             submission writeup
demo_syllabi_corpus/     five generated syllabi used for end-to-end testing
render.yaml              two-service Render blueprint
```

## Tests

```bash
npm run check:merge      # multi-syllabus merge and crunch-week maths
npm run check:dedupe     # shared-item matching, and the over-matching guard
npm run check:sim        # Monte Carlo determinism and lever ordering
npm run check:income     # OSAP settlement and paycheque scheduling
npm run check:ics        # RFC 5545 output, folding, DST correctness
npm run check:auth       # session cookie signing
npm run check:demo       # worked examples stay internally consistent
```
