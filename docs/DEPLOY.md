# Deploying

## Google Cloud setup (needed either way)

1. Create a project at <https://console.cloud.google.com>.
2. **APIs & Services → Library** — enable **Google Calendar API** and
   **Google Drive API**.
3. **OAuth consent screen** — External, add yourself as a test user. You do
   not need verification while it's in testing.
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   Add the redirect URI:

   ```
   http://localhost:5678/rest/oauth2-credential/callback
   ```

5. In n8n, create **Google Calendar OAuth2** and **Google Drive OAuth2**
   credentials with that client ID and secret, then click **Connect**.

Request the narrowest scopes that work:

| Credential | Scope | Why |
|---|---|---|
| Calendar | `calendar.events` | Create events. Not `calendar`, which also allows deleting calendars. |
| Drive | `drive.readonly` | Read dropped syllabi. The pipeline never writes to Drive. |

---

## Local

Covered in the main [README](../README.md). Short version:

```bash
npm run gen:secrets
npm --prefix web install
npm run n8n:up
npm run web:dev
```

---

## Render

`render.yaml` at the repo root defines two services:

- **`syllabus-web`** — public Next.js app.
- **`syllabus-n8n`** — a **private service**. No public URL; only the web app
  can reach it, over Render's internal network.

### Steps

1. Push to GitHub, then **New → Blueprint** in Render and point it at the repo.
2. Render generates `INGEST_TOKEN` and `N8N_ENCRYPTION_KEY` automatically.
   Copy the generated `INGEST_TOKEN` into the n8n **Header Auth** credential
   (header name `X-Ingest-Token`) — the two must match or every import fails
   with a 401.
3. Set `ELEVENLABS_API_KEY` if you want the spoken briefing. Skip it and the
   button hides itself.

### The OAuth chicken-and-egg

Google needs to redirect a browser back to n8n to complete OAuth — but a
private service has no public URL. Two ways around it:

**Option A — authorise locally, then migrate (recommended).**
Connect both Google credentials against `http://localhost:5678` on your
machine, then export and re-import them into the deployed instance. Set
`N8N_ENCRYPTION_KEY` identically in both places, or the imported credentials
will not decrypt.

**Option B — temporarily go public.**
Change `type: pserv` to `type: web` for `syllabus-n8n`, deploy, add the
Render URL as an authorised redirect URI in Google Cloud, complete OAuth, then
switch it back to `pserv` and redeploy. Don't leave it public — n8n holds every
credential.

### Before you call it production

`docs/SECURITY.md` lists the known gaps. The two that matter most on a public
URL:

- **Add auth to the web app.** As built, anyone with the link can import to
  your calendar.
- **Add rate limiting to `/api/ingest`.** Otherwise anyone can burn your
  Anthropic credits by uploading in a loop.
