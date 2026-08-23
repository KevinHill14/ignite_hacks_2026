# Bringing it back up on Render

The services were deleted after IgniteHacks to stop the billing. This is how to
put them back when someone actually wants to use it.

Budget 25 minutes, most of it waiting for builds. `docs/RENDER-DEPLOY.md` is the
long version with screenshots-in-prose; this is the short one written by someone
who has already done it once and only needs the order and the traps.

---

## Decide what you actually need

**Just showing people the product?** Deploy `syllabus-web` alone and skip n8n
entirely. Both worked examples run client-side and render the full results view,
spine, crunch weeks, dedup, forecast. No API key, no calendar, nothing to break,
and it costs about $7/month or nothing at all on the free tier. Uploading returns
a clean error, which is correct, because there is no pipeline behind it.

**Someone wants to process real syllabi?** You need both services and the whole
list below.

---

## What you need in hand

- [ ] Anthropic API key (rotate it if the old one was ever shared)
- [ ] Google OAuth client ID and secret
- [ ] A throwaway Google Calendar's ID, the `...@group.calendar.google.com` form
- [ ] A password for the gate, if the site should not be open

---

## The one thing that bites on a rebuild

**n8n's public hostname will be different this time.** `syllabus-n8n` is taken
globally, so Render appends a random suffix. It was `syllabus-n8n-wnw8` before;
it will be something else now.

`render.yaml` hardcodes that hostname in **three places**. Deploy first so Render
tells you the real hostname, then fix all three and sync again:

```bash
grep -n onrender.com render.yaml
```

1. `syllabus-web` → `N8N_WEBHOOK_URL` (where the app posts uploads)
2. `syllabus-n8n` → `N8N_WEBHOOK_URL` (what n8n believes it is)
3. `syllabus-n8n` → `N8N_EDITOR_BASE_URL` (same, for the editor and OAuth)

Get 1 wrong and every upload fails. Get 2 or 3 wrong and Google OAuth dies with
`The OAuth callback state is invalid`, which reads like a Google problem and is
not.

---

## Steps

### 1. Create the blueprint

Render dashboard → **New +** → **Blueprint** → pick `KevinHill14/ignite_hacks_2026`.
It finds `render.yaml` on its own.

It will prompt for the values marked `sync: false`:

| Key | Service | Value |
|---|---|---|
| `APP_PASSWORD` | syllabus-web | your gate password, or blank for no gate |
| `GOOGLE_CALENDAR_ID` | syllabus-n8n | the throwaway calendar ID, **never `primary`** |

`primary` fails because the n8n Calendar node validates the ID against an
email-shaped pattern and rejects it.

### 2. Fix the hostnames

Once both services exist, copy n8n's real URL from the top of its service page,
update the three lines from the section above, push, and **sync the blueprint**.

A plain redeploy does not pick up new blueprint environment variables. Only a
Blueprint → Sync does. This cost real time the first go.

### 3. Google Cloud redirect URI

APIs & Services → Credentials → your OAuth client → **Authorized redirect URIs**:

```
https://<new-n8n-hostname>/rest/oauth2-credential/callback
```

Keep `http://localhost:5678/rest/oauth2-credential/callback` alongside it so
local development still works. Confirm your account is under OAuth consent
screen → Test users, or Connect refuses with `access_blocked`.

### 4. Set up n8n

Open n8n's URL and create the owner account. It is a fresh disk, so nothing
carries over from last time.

**Workflows → Import from File** → `n8n/syllabus-to-calendar.workflow.json`

Then three credentials:

| Node | Credential | Value |
|---|---|---|
| Claude: Extract Schedule + Costs | Anthropic | your API key |
| Webhook: Manual Upload | Header Auth | name `X-Ingest-Token`, value = `INGEST_TOKEN` from **syllabus-web** → Environment |
| Google Calendar: Create Event | Google Calendar OAuth2 | client ID + secret, then **Connect** |

### 5. Publish

Hit **Publish**, top right.

If it is greyed out, hover it for the reason. n8n refuses to publish while any
node has an unresolved credential, **including nodes that never run**. The Google
Drive download node hangs off a disabled trigger and still counts. Right-click it
→ **Deactivate**, then publish.

### 6. Verify before telling anyone

```bash
H=https://<new-n8n-hostname>
curl -s $H/healthz                                   # {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" -X POST $H/webhook/syllabus-ingest
```

That POST should return **403**, meaning the webhook exists and is demanding its
auth header. **404 means the workflow is not published** and every upload will
fail with "the pipeline is not listening".

Then upload one real PDF through the site and confirm an event lands on the
calendar. Do not trust it until you have seen that end to end.

---

## Before sharing the link publicly

**Set a spend limit in the Anthropic console.** The per-IP rate limit is 6/minute
and 25/day, which does nothing against many different IPs. A hard cap is the only
real backstop, and roughly $0.03 per syllabus adds up faster than you would think
if the link travels.

**Consider unsetting `GOOGLE_CALENDAR_ID`.** It points at one single calendar, so
every user's events land on *yours*. For anything beyond your own use, let people
take the `.ics` download instead, which is per-user by nature and imports into
Google, Apple and Outlook alike.

**The password is public the moment you post it.** That is fine as a bot filter.
It is not access control.

---

## Tearing it down again

Render → each service → Settings → **Delete**. Deleting `syllabus-n8n` takes its
1 GB disk with it, which is the only thing still billing while a service is
merely suspended.

Suspending instead costs about a penny a day and keeps the credentials and the
published workflow intact, which is worth it if you expect to be back within a
few weeks. Deleting is the right call if you do not.

Nothing is lost either way. The workflow JSON, the blueprint and the setup script
all live in this repo, and `npm run setup` rebuilds the whole thing locally in a
couple of minutes.
