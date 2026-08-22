# Google Calendar OAuth — full walkthrough

One person does Part 1 (about 15 minutes). Everyone else does Part 3 (about
two minutes). Part 2 is how that one person lets everyone else in.

Nothing here is optional-in-a-hurry: if you skip the test-user step, your
teammates get a hard "Access blocked" wall and there is nothing they can do
from their own machine to get past it.

---

## Before you start: which mode are you in?

This decides whether you need a test-user list at all.

**Internal** allows everyone in *one* Google Workspace organisation with no
test-user list and no 7-day token expiry. It only works if every single
person is in that same org.

**This team is mixed** — Waterloo and Western are two separate Workspace
orgs, so Internal would let in exactly one school and lock out the other.
**Use External and add everyone to the test-user list** (Part 2).

### Build it on a personal Gmail, not a school account

Create the Cloud project signed in to a **personal Gmail account**, not
`@uwaterloo.ca` or `@uwo.ca`.

University Workspace accounts are centrally administered, and admins
routinely restrict two things that would stop you cold: creating Google Cloud
projects at all, and consenting to unverified third-party OAuth apps. You do
not want to discover either the night before a deadline.

The same restriction can bite on the *consenting* side: if a teammate's
`@uwo.ca` account refuses at the consent screen with a message about the
administrator, that's IT policy and there is no way around it. Have them
connect a personal Gmail instead.

---

## Part 1 — One person sets up the Google Cloud project

### 1. Create a project

<https://console.cloud.google.com> → project dropdown in the top bar →
**New Project** → name it (`syllabus-calendar`) → **Create**. Make sure that
new project is selected before continuing — nearly every "I can't find the
button" problem is being in the wrong project.

### 2. Enable the APIs

**APIs & Services → Library**, then search for and **Enable**:

- **Google Calendar API** — required.
- **Google Drive API** — only if you want the drop-a-file-in-a-folder path.

Enabling an API and creating credentials are two separate things. Doing only
one of them fails later with a confusing 403.

### 3. Configure the consent screen

**APIs & Services → OAuth consent screen.** Google has been rebranding this
area to **Google Auth Platform**, so it may be labelled either way.

- **User type**: `External` (see above — a mixed-school team can't use
  `Internal`).
- **App name**: anything — your teammates will see it on the consent screen.
- **User support email** and **Developer contact email**: your own.
- Save through to the end.

You do not need to submit anything for verification. Verification is only
required to go public, and you are not going public.

### 4. Add the scope

In the **Scopes** step, **Add or remove scopes**, and add:

```
https://www.googleapis.com/auth/calendar.events
```

Deliberately **not** `.../auth/calendar`, which would also let the app delete
entire calendars. We only ever create events.

### 5. Create the OAuth client

**APIs & Services → Credentials → + Create Credentials → OAuth client ID.**

- **Application type**: `Web application`
- **Name**: anything.
- **Authorised redirect URIs → + Add URI**, exactly this:

  ```
  http://localhost:5678/rest/oauth2-credential/callback
  ```

  It has to match character for character — `http` not `https`, no trailing
  slash. A mismatch here is the `redirect_uri_mismatch` error, and it is the
  single most common thing to get wrong.

**Create**, then copy the **Client ID** and **Client secret**.

Because everyone runs n8n locally on the same port, this one redirect URI
works for the whole team. You do not need a client per person.

---

## Part 2 — Letting everyone else test

On **External**, only accounts on the test-user list can connect. Everyone
else — including people who have the client ID and secret — is refused.

**APIs & Services → OAuth consent screen → Audience → Test users →
+ Add users.**

Add the **Google account email each teammate will actually click "Connect"
with**. If someone signs in with a different account than the one you
listed, they are blocked. Ask people for the exact address rather than
guessing; a personal Gmail and a school address are different accounts.

The cap is 100 users, so a hackathon team is nowhere near it.

The error your teammates hit if you forget:

> Access blocked: this app has not completed the Google verification process

That message is misleading — it sounds like *you* need Google's approval.
You don't. It just means that account isn't on the list.

### Then send the team

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Send those the same careful way you'd send any other secret — not in a public
channel. A client secret is not as dangerous as an API key with a bill
attached, but it isn't public information either.

---

## Part 3 — What each teammate does

Once you're on the test-user list and have the client ID and secret:

1. Put them in your `.env`:

   ```
   GOOGLE_OAUTH_CLIENT_ID=....apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=....
   GOOGLE_CALENDAR_ID=primary
   ```

   See "Which calendar?" below before leaving that last line as `primary`.

2. Build the credential and start n8n:

   ```bash
   npm run n8n:up
   npm run n8n:setup
   ```

   That creates the **Google Calendar account** credential with the client ID
   and secret already filled in, attached to the right node.

3. Open <http://localhost:5678> → **Settings → Credentials → Google Calendar
   account** → **Connect**. Pick your Google account and accept.

   OAuth needs a real browser and a real human, which is the one part of this
   that can't be scripted.

4. Upload a syllabus at <http://localhost:3000> and check the events land.

---

## Which calendar?

`GOOGLE_CALENDAR_ID` decides where events are written. It defaults to
`primary`, which is **your real calendar**.

Until the extraction is trusted, don't point it there. Two better options:

**A throwaway of your own** — Google Calendar → **+** beside "Other
calendars" → **Create new calendar** → then open its **Settings → Integrate
calendar** and copy the **Calendar ID**. It looks like:

```
GOOGLE_CALENDAR_ID=c_a1b2c3d4e5f6@group.calendar.google.com
```

**One shared team calendar** — better for the demo. One person creates it and
shares it with everyone at **"Make changes to events"**, then the whole team
puts that same ID in their `.env`. Everyone writes to one place and everyone
sees the same events when you present.

⚠️ **A calendar ID is not portable on its own.** If someone sends you their
`.env` with their calendar ID in it and that calendar was never shared with
you, every write fails with a 404 — your Google account genuinely cannot see
it. Either swap in your own ID or ask to be given access.

Restart n8n after changing this (`npm run n8n:up`); the workflow reads it
from the environment at run time.

---

## ⚠️ The 7-day expiry, if you're on External

While the consent screen's publishing status is **Testing**, Google expires
refresh tokens after **7 days**. Everything works, then a week later every
calendar write starts failing with `invalid_grant` and nothing in the app
explains why.

For a hackathon this usually doesn't bite, but it does if you set OAuth up
early and demo weeks later.

It does **not** affect a demo recorded within a week of connecting.

Your options if you're past that:

- **Just reconnect.** Click **Connect** again in n8n. Takes ten seconds. Do
  it the morning of a demo, not the night before, and you'll never think
  about this again.
- **Publish the app** (consent screen → *Publish app*). Without verification
  you get a "Google hasn't verified this app" interstitial that you click
  through via *Advanced → Go to (unsafe)*. Fine for a throwaway calendar,
  ugly to do live on stage.

**Rehearse the demo the same day you present it.** That catches this and
everything else.

---

## When it goes wrong

| What you see | What it means |
|---|---|
| `redirect_uri_mismatch` | The URI in Google Cloud isn't exactly `http://localhost:5678/rest/oauth2-credential/callback`. |
| "Access blocked: … verification process" | That Google account isn't on the test-user list. Part 2. |
| `invalid_grant`, worked before | The 7-day Testing expiry. Reconnect. |
| 404 on every event write | `GOOGLE_CALENDAR_ID` points at a calendar your account can't see. |
| 403 `insufficientPermissions` | Calendar shared read-only. Needs "Make changes to events". |
| 403, never worked | Google Calendar API not enabled on the project. Step 2. |
| Events created, no reminders | The `remindersUi` block on the Calendar node. Untested — delete it to fall back to calendar defaults. |

The calendar node is set to keep going when a write fails, so a broken
credential shows up as *"N events could not be added"* in the results rather
than killing the run. The rest of the extraction and the whole cost
breakdown still work — which is also why nobody noticed calendar writes had
never succeeded.
