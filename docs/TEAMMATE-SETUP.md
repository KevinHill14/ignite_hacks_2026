# Setup, for people joining the project

Written assuming you have never touched an API key or a `.env` file. Nothing
here is hard; it is mostly waiting for things to install.

---

## First: do you actually need an API key?

Probably not. Find yourself below.

| What you're working on | Need a key? | What to read |
|---|---|---|
| Design, UI, mobile, accessibility | **No** | [Path A](#path-a--no-key-needed) |
| Pitch deck, demo video, docs | **No** | [Path A](#path-a--no-key-needed) |
| Collecting test syllabi | **No** | [Path A](#path-a--no-key-needed) |
| Rate limiting, password gate | **No** | [Path A](#path-a--no-key-needed) |
| The extraction pipeline itself | **Yes** | [Path B](#path-b--youre-working-on-extraction) |
| OCR for scanned PDFs | **Yes** | [Path B](#path-b--youre-working-on-extraction) |

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

Everything from Path A, plus your own Anthropic key and the n8n pipeline.

### 1. Get your own API key

1. Go to **https://console.anthropic.com** and sign up.
2. **API Keys → Create Key.** Copy it — it starts with `sk-ant-`.
3. New accounts usually get trial credit, which is plenty for testing.

**Get your own rather than reusing Kevin's.** One shared key means one shared
bill with no way to tell who spent what, and if it leaks everybody has to
rotate at the same time. Separate keys also mean the Console shows you your
own usage.

### 2. Put it in your `.env`

Open `.env` in any text editor. Find this line:

```
ANTHROPIC_API_KEY=
```

Paste your key immediately after the `=`. No quotes, no spaces:

```
ANTHROPIC_API_KEY=sk-ant-api03-your-actual-key-here
```

Save. Done — that file never leaves your machine.

### 3. Start n8n

Docker Desktop must be running first.

```bash
npm run n8n:up      # first run pulls the image, give it a few minutes
```

Open **http://localhost:5678** and create an owner account. It's local only —
any email and password works, and it never leaves your machine.

### 4. Load the pipeline

In n8n: **Workflows → Import from File** →
`n8n/syllabus-to-calendar.workflow.json`

Then add two credentials:

**Anthropic** — click the *Claude: Extract Schedule + Costs* node →
*Create new credential* → paste your key → Save.

**Header Auth** — click the *Webhook: Manual Upload* node →
*Create new credential*:
- Name: `X-Ingest-Token`
- Value: copy the `INGEST_TOKEN` line out of your `.env`

> These two must match **exactly**. A mismatch gives you `401` on every
> upload. This is a password between the web app and the pipeline, so that
> nobody who finds port 5678 can shove events into your calendar.

### 5. Activate

Toggle **Inactive → Active**, top-right.

This one matters. Until it's Active, n8n only serves a one-shot *test* URL
and the app gets a 404 that reads `The pipeline is not listening`. If you see
that error, this toggle is almost always why.

### 6. Test

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
