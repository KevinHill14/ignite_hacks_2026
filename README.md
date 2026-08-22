# What This Term Costs

**Drop in a course syllabus. Every deadline lands on your Google Calendar, and
every textbook, lab kit, access code, and exam fee lands on one timeline —
before it lands on your card.**

A syllabus is a bill nobody itemizes. Students find out what a semester
actually costs one surprise at a time: $185 for the text in week one, $89 for
the access code you can't submit homework without, $42 for the calculator the
midterm requires. This takes the PDF and turns it into two things you can
actually act on — a schedule and a cash-flow plan.

Built for IgniteHacks, fintech track.

---

## What it does

1. **Reads the syllabus.** PDF in, structured data out, via Claude Opus 5 with
   a strict JSON schema. Every extracted item carries a verbatim
   `source_quote` and a confidence score — if the model can't quote it, it
   doesn't emit it.
2. **Fills your calendar.** Deadlines go straight to Google Calendar with the
   grade weight and the supporting quote in the event description.
3. **Prices the term.** Costs are grouped by month, split into required vs.
   optional, and totalled per currency.
4. **Projects your balance.** Enter what you have and what's coming in; the
   required costs get subtracted in the month they land, and the tool tells
   you the month you run short — if you do.

The signature view is the **term spine**: one shared time axis with deadlines
ticking above the line and cost bars hanging below it. Reading straight down
from a busy week shows what that same week costs you.

---

## Architecture

```
          Web upload                     Google Drive folder
               |                                  |
               v                                  v
     Next.js /api/ingest  ──────────►  n8n Webhook      Drive Trigger
     (holds the token,                      |                |
      never the browser)                    └────────┬───────┘
                                                     v
                                          Extract text from PDF
                                                     v
                                          Sanitize + guard  ← strips hidden
                                                     v         instruction text
                                          Claude Opus 5
                                          (json_schema output)
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

Two entry points, one pipeline. The Drive trigger is the zero-effort path:
connect Drive once, point it at a folder, and anything dropped in imports on
its own — no upload, no clicking.

**Everything between ingest and calendar runs in n8n.** The workflow is
`n8n/syllabus-to-calendar.workflow.json` — 13 nodes, importable as-is.

---

## Stack

| Piece | What it does |
|---|---|
| **n8n** | The whole pipeline. Triggers, PDF extraction, model call, validation, calendar writes. |
| **Claude Opus 5** | Structured extraction with a strict JSON schema and adaptive thinking. |
| **Next.js 16** | The UI, and a server-side proxy that keeps the pipeline token out of the browser. |
| **Google Calendar / Drive** | Where deadlines land, and the hands-off way syllabi arrive. |
| **ElevenLabs** | Optional spoken term briefing. Script is templated from the figures, never model-written. |
| **Render** | Deploy target. `render.yaml` runs the web app public and n8n private. |

---

## Run it locally

Needs Node 20+, Docker, and an Anthropic API key.

```bash
git clone https://github.com/KevinHill14/ignite_hacks_2026.git
cd ignite_hacks_2026

npm run gen:secrets      # writes .env with a fresh encryption key + ingest token
# paste your Anthropic key into the ANTHROPIC_API_KEY line in .env
npm --prefix web install
npm run n8n:up           # starts n8n on http://localhost:5678
npm run n8n:setup        # imports the workflow, creates credentials, activates
npm run web:dev          # http://localhost:3000
```

`n8n:setup` handles the error-prone part — it creates both credentials from
your `.env`, so the ingest token the web app sends and the one n8n checks
cannot drift apart, and it publishes and activates the workflow. New to any of
this? [docs/TEAMMATE-SETUP.md](docs/TEAMMATE-SETUP.md) walks it slowly.

<details>
<summary>Setting it up by hand in the n8n UI instead</summary>

At `http://localhost:5678`:

1. Create your owner account (local only).
2. **Import** `n8n/syllabus-to-calendar.workflow.json`.
3. Add the two credentials the upload path needs:
   - **Anthropic** — your API key, on the *Claude: Extract Schedule + Costs*
     node.
   - **Header Auth** — on the *Webhook: Manual Upload* node. Header name
     `X-Ingest-Token`, value = the `INGEST_TOKEN` from your `.env`. These two
     must match exactly or every upload returns 401.
4. **Activate** the workflow with the toggle in the top-right.

   Until it's Active, n8n serves only a one-shot *test* URL and the app gets a
   404 — that's the "pipeline is not listening" error.

5. Restart n8n so the activation takes effect.

</details>

### Google (optional, either route)

Neither is required. Without them the pipeline still extracts everything and
still returns the full cost breakdown; only the calendar writes report as
failed.

- **Google Calendar OAuth2** — put `GOOGLE_OAUTH_CLIENT_ID` and
  `GOOGLE_OAUTH_CLIENT_SECRET` in `.env` and `npm run n8n:setup` builds the
  credential; you just click **Connect** in the n8n UI. Set
  `GOOGLE_CALENDAR_ID` to a **throwaway calendar** first, so a bad extraction
  pollutes something disposable rather than your real schedule. Deadlines
  arrive in violet with popup reminders a day and an hour ahead.
- **Google Drive OAuth2** — set the folder on the *Drive: New Syllabus
  Dropped* node, then **enable** that node. It ships disabled because n8n
  refuses to activate a workflow whose trigger has no credential, which would
  block the upload path too.

See [docs/DEPLOY.md](docs/DEPLOY.md) for the Google Cloud setup.

No Google account connected? Click **See a worked example** to walk the whole
results view with realistic data and no credentials.

---

## Security

The threat model and every mitigation is written up in
[docs/SECURITY.md](docs/SECURITY.md). The short version:

- **Secrets live in exactly one place.** Google and Anthropic credentials sit
  in n8n's AES-encrypted credential store. The browser never sees the pipeline
  token; a server route holds it.
- **The syllabus is untrusted input.** Zero-width and bidi characters — the
  standard carrier for instructions hidden invisibly in a PDF — are stripped
  before the text reaches the model, and the system prompt tells it not to
  follow instructions found inside the document.
- **Uploads are validated by content, not by name.** A file has to actually
  start with `%PDF-`.
- **Your balance never leaves the tab.** The runway projection is pure client
  state: not sent, not stored, not logged.
- **Nothing is retained.** n8n keeps no execution data on success, so parsed
  syllabus text doesn't linger in the database.

---

## Repo layout

```
web/                    Next.js app (UI + server proxy routes)
n8n/
  docker-compose.yml    Hardened n8n container
  syllabus-to-calendar.workflow.json
scripts/gen-secrets.mjs Generates .env secrets, never overwrites existing ones
docs/SECURITY.md        Threat model and mitigations
docs/DEPLOY.md          Google OAuth + Render deployment
render.yaml             Two-service Render blueprint
```
