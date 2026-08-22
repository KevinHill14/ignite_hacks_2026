# Setup, for people joining the project

Written assuming you have never touched an API key or a `.env` file. Nothing
here is hard; it is mostly waiting for things to install.

---

## First: do you actually need an API key?

Probably not. Find yourself below.

| What you're working on | Need the pipeline? | What to read |
|---|---|---|
| Design, UI, mobile, accessibility | **No** | [Path A](#path-a--no-key-needed) |
| Pitch deck, demo video, docs | **No** | [Path A](#path-a--no-key-needed) |
| Collecting test syllabi | **No** | [Path A](#path-a--no-key-needed) |
| Rate limiting, password gate | **No** | [Path A](#path-a--no-key-needed) |
| The extraction pipeline itself | **Yes** | [Path B](#path-b--youre-working-on-extraction) |
| OCR for scanned PDFs | **Yes** | [Path B](#path-b--youre-working-on-extraction) |

Path A is three commands and needs no Docker, no Google account, and no API
key. Take it if you can — it's faster to work against and costs nothing.

The app has a **"See a worked example"** button that renders the entire
product — the timeline, the cost ledger, the budget projection — using
built-in sample data. No key, no cost, no Google account. For anything
visual, it is genuinely better than a live run because it is instant and
identical every time.

---

## Path A — no key needed

You need [Node.js 20+](https://nodejs.org) and
[Docker Desktop](https://www.docker.com/products/docker-desktop/) installed
and running.

```bash
git clone https://github.com/KevinHill14/ignite_hacks_2026.git
cd ignite_hacks_2026

npm run gen:secrets        # creates your .env — see "What just happened" below
npm --prefix web install   # installs the web app (takes a minute)
npm run web:dev            # starts it
```

Open **http://localhost:3000** and click **See a worked example**.

That's it. You can design, restyle, and rebuild against that. You do not need
Docker running for Path A, and you do not need n8n.

### What just happened

`npm run gen:secrets` copied `.env.example` to `.env` and generated two random
passwords inside it. A `.env` file is just a list of `NAME=value` lines that
programs read at startup — a place to keep keys and passwords out of the code.

It is listed in `.gitignore`, which means **git will refuse to commit it**.
That is deliberate and you should never override it. `.env.example` is the
blank template that *is* committed, so everyone knows which values exist
without anyone sharing the real ones.

---

## Path B — you're working on extraction

Everything from Path A, plus an Anthropic key and the n8n pipeline.

### 1. Get the `.env` contents

Kevin will send you a block of text that starts with
`# ignite_hacks_2026 - .env`. That is the whole configuration, shared API key
included.

In the root of the repo (same folder as `package.json`), create a file named
exactly **`.env`** and paste it in.

> **Windows:** the filename is `.env` — nothing before the dot, no `.txt`
> after it. File Explorer hides extensions by default, so you can easily end
> up with `.env.txt`, which silently does nothing. In Notepad's Save dialog,
> set *Save as type* to **All Files** and type `.env` yourself. To check:
> `dir .env*` should list `.env` and nothing else.

`.env` is gitignored, so it stays on your machine.

*Prefer your own key?* Get one free at **https://console.anthropic.com** →
API Keys → Create Key, and replace just the `ANTHROPIC_API_KEY=` line. New
accounts usually come with trial credit.

### 2. Start n8n and wire it up

Docker Desktop must be running first.

```bash
npm run gen:secrets   # creates web/.env.local; won't touch what you pasted
npm run n8n:up        # first run pulls the image, give it a few minutes
npm run n8n:setup     # imports the workflow, creates both credentials, activates
```

`n8n:setup` does the fiddly part for you: it imports the workflow, creates the
Anthropic and Header Auth credentials already attached to the right nodes,
publishes the workflow, and restarts n8n. It reads everything from your `.env`,
so the ingest token used by the web app and the one inside n8n cannot drift
apart — a mismatch there is a `401` on every upload and is the most common way
this setup breaks.

You should see:

```
✓ .env looks complete, n8n container is up
✓ credentials imported (Anthropic + ingest token)
✓ workflow imported
✓ workflow published and activated
```

Then open **http://localhost:5678** and create an owner account when prompted.
It's local only — any email and password works, and it never leaves your
machine.

<details>
<summary>Doing it by hand instead</summary>

In n8n: **Workflows → Import from File** →
`n8n/syllabus-to-calendar.workflow.json`, then add two credentials —
**Anthropic** on the *Claude: Extract Schedule + Costs* node, and **Header
Auth** on the *Webhook: Manual Upload* node with name `X-Ingest-Token` and the
`INGEST_TOKEN` value from your `.env`. Finally hit **Publish**, top right.

Until it is published, n8n serves only a one-shot *test* URL and the app gets a
404 reading `The pipeline is not listening`.

If **Publish** is greyed out, hover it. n8n refuses to publish while any node
has an unresolved credential, and it counts nodes that never run, including the
disabled Google Drive ones. The tooltip is the only place it tells you.
</details>

### 3. Test

```bash
npm run web:dev
```

http://localhost:3000 → drop in
`syllabus_examples/CS1026-Online-Section-Winter-2026.pdf`.

Takes 40–75 seconds and costs about $0.05. You should get 18 deadlines and a
handful of costs.

---

## Google Calendar (optional)

You do not need this to work on the project. Without it the pipeline extracts
everything normally and only the calendar writes report as failed.

If you do want it, `docs/DEPLOY.md` has the Google Cloud walkthrough. **Point
it at a throwaway calendar, not your real one** — a bad extraction should
pollute something disposable.

### If you were sent a shared `.env`

Two things in it are *not* portable, and both fail in confusing ways:

- **`GOOGLE_CALENDAR_ID`** is whoever's calendar the sender was testing
  against. If you connect your own Google account and leave their ID in
  place, every calendar write fails with a 404 — your account cannot see
  their calendar. Either replace it with your own calendar ID, set it to
  `primary`, or ask them to share that calendar with you with **"Make
  changes to events"** permission.
- **Your Google account must be added as a test user** on the OAuth consent
  screen by whoever created the Google Cloud project. If it isn't, the
  Connect button fails with *"Access blocked: this app has not completed the
  Google verification process."* That is not something you can fix on your
  end — ask them to add you.

For a demo where everyone should see the same events, the simplest setup is
one shared demo calendar the whole team can write to, rather than a throwaway
each.

---

## Rules about secrets

1. **Never commit `.env`.** git already blocks it. Don't fight it.
2. **Never paste a key into chat, email, or Discord.** Those are permanent and
   forwardable. If you ever do it by accident, rotate the key immediately —
   Console → API Keys → delete, then make a new one. Takes ten seconds.
3. **Never put a key in code**, even temporarily. It ends up in git history,
   and history is very hard to scrub.
4. **A key in a screenshot is a leaked key.** Crop before you share.

If a key does leak, it is not a disaster — rotate it and move on. The only
real mistake is leaving a leaked key active.

---

## When something breaks

| Symptom | Cause |
|---|---|
| `The pipeline is not listening` | Workflow isn't Active in n8n. Step 5. |
| `401` on upload | `INGEST_TOKEN` in `.env` ≠ the Header Auth value in n8n. |
| `The item has no binary field` | Re-import the workflow; yours is out of date. |
| `credit balance is too low` | Your key is out of credit. Add some or use Path A. |
| Docker errors on `n8n:up` | Docker Desktop isn't running. |
| Port already in use | Something else is on 3000 or 5678. Close it. |

Still stuck? Grab the error text and ask in the group chat — but **check it
doesn't contain your key first**.
