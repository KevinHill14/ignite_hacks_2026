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
git clone https://github.com/KevinHill14/ignitehacks.git
cd ignitehacks

npm run gen:secrets      # writes .env with a fresh encryption key + ingest token
npm --prefix web install
npm run n8n:up           # starts n8n on http://localhost:5678
```

Then, in the n8n UI at `http://localhost:5678`:

1. Create your owner account (local only).
2. **Import** `n8n/syllabus-to-calendar.workflow.json`.
3. Add three credentials:
   - **Anthropic** — your API key.
   - **Google Calendar OAuth2** and **Google Drive OAuth2** — see
     [docs/DEPLOY.md](docs/DEPLOY.md) for the Google Cloud setup.
   - **Header Auth** named `Ingest Token`, header `X-Ingest-Token`, value =
     the `INGEST_TOKEN` from your `.env`.
4. Point the Drive trigger at a folder, and the Calendar node at a calendar.
   Use a *throwaway* calendar first — a bad extraction then pollutes something
   disposable instead of your real schedule.
5. **Activate** the workflow.

Finally:

```bash
npm run web:dev          # http://localhost:3000
```

Don't have Google connected yet? Click **See a worked example** to walk the
whole results view with realistic data and no credentials.

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
