#!/usr/bin/env node
/**
 * Wires n8n up from .env in one command.
 *
 * Does the three things that are easy to get wrong by hand:
 *   1. imports the workflow
 *   2. creates the Anthropic + Header Auth credentials, already attached to
 *      the right nodes (the workflow references them by a fixed id)
 *   3. publishes and activates it
 *
 * The Header Auth value is taken from the same INGEST_TOKEN the web app uses,
 * so the two cannot drift — a mismatch there is a 401 on every upload and is
 * the single most common setup failure.
 *
 *   npm run n8n:up      # start the container first
 *   npm run n8n:setup   # then this
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = "syllabus-n8n";
const WORKFLOW_ID = "syllabusCalendar01";

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function die(message, hint) {
  console.error(`\n${red("✗")} ${message}`);
  if (hint) console.error(`  ${dim(hint)}`);
  process.exit(1);
}

function docker(args, { quiet = true } = {}) {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

// --- preflight ---------------------------------------------------------------

const envPath = join(root, ".env");
if (!existsSync(envPath)) {
  die("No .env file found.", "Run `npm run gen:secrets` first.");
}

const env = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
}

if (!env.INGEST_TOKEN) {
  die("INGEST_TOKEN is empty in .env.", "Run `npm run gen:secrets`.");
}
if (!env.ANTHROPIC_API_KEY) {
  die(
    "ANTHROPIC_API_KEY is empty in .env.",
    "Paste your key from https://console.anthropic.com into that line.",
  );
}

try {
  const state = docker([
    "inspect", "-f", "{{.State.Running}}", CONTAINER,
  ]).trim();
  if (state !== "true") throw new Error("not running");
} catch {
  die(
    `The ${CONTAINER} container is not running.`,
    "Start it with `npm run n8n:up` (Docker Desktop must be open).",
  );
}

console.log(`${green("✓")} .env looks complete, n8n container is up`);

// --- credentials -------------------------------------------------------------

// The ids here match the ones the workflow references, so importing them
// attaches them to the right nodes with no clicking.
const credentials = [
  {
    id: "ANTHROPIC_API",
    name: "Anthropic account",
    type: "anthropicApi",
    data: {
      apiKey: env.ANTHROPIC_API_KEY,
      url: "https://api.anthropic.com",
      header: false,
    },
  },
  {
    id: "INGEST_HEADER_AUTH",
    name: "Ingest Token (X-Ingest-Token)",
    type: "httpHeaderAuth",
    data: { name: "X-Ingest-Token", value: env.INGEST_TOKEN },
  },
];

// Google is optional, so only build the credential if the OAuth client is in
// .env. We can create the credential but not authorise it — OAuth needs a
// human at a browser — so this gets the client id/secret in place and leaves
// exactly one click ("Connect") to do by hand.
const hasGoogleClient = Boolean(
  env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET,
);

if (hasGoogleClient) {
  credentials.push({
    id: "GOOGLE_CALENDAR_OAUTH",
    name: "Google Calendar account",
    type: "googleCalendarOAuth2Api",
    data: {
      clientId: env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      // Narrowest scope that can still create events. Deliberately not
      // `calendar`, which would also allow deleting entire calendars.
      scope: "https://www.googleapis.com/auth/calendar.events",
    },
  });
}

// Written to the OS temp dir, never inside the repo, and deleted in `finally`.
const localCreds = join(tmpdir(), `n8n-creds-${process.pid}.json`);
const remoteCreds = "/tmp/setup-creds.json";
const remoteWorkflow = "/tmp/setup-workflow.json";

try {
  // No BOM: n8n's JSON.parse rejects one.
  writeFileSync(localCreds, JSON.stringify(credentials, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });

  docker(["cp", localCreds, `${CONTAINER}:${remoteCreds}`]);
  docker(["exec", CONTAINER, "n8n", "import:credentials", `--input=${remoteCreds}`]);
  console.log(
    `${green("✓")} credentials imported (Anthropic + ingest token` +
      (hasGoogleClient ? " + Google Calendar client)" : ")"),
  );

  const workflowPath = join(root, "n8n", "syllabus-to-calendar.workflow.json");
  docker(["cp", workflowPath, `${CONTAINER}:${remoteWorkflow}`]);
  docker(["exec", CONTAINER, "n8n", "import:workflow", `--input=${remoteWorkflow}`]);
  console.log(`${green("✓")} workflow imported`);

  docker(["exec", CONTAINER, "n8n", "publish:workflow", `--id=${WORKFLOW_ID}`]);
  console.log(`${green("✓")} workflow published and activated`);
} catch (err) {
  const detail = (err.stderr || err.stdout || err.message || "").toString().trim();
  die("n8n rejected the import.", detail.split("\n").slice(-3).join("\n  "));
} finally {
  // Remove every plaintext copy of the key, on both sides.
  try {
    unlinkSync(localCreds);
  } catch {}
  try {
    docker(["exec", "-u", "root", CONTAINER, "rm", "-f", remoteCreds, remoteWorkflow]);
  } catch {}
}

// n8n only picks up an activation after a restart.
console.log(dim("  restarting n8n so the change takes effect..."));
docker(["restart", CONTAINER]);

// Wait for the webhook to actually answer rather than guessing at a sleep.
const deadline = Date.now() + 90_000;
let live = false;
while (Date.now() < deadline) {
  try {
    const code = docker([
      "exec", CONTAINER, "wget", "-q", "-O", "/dev/null",
      "--server-response", "http://127.0.0.1:5678/healthz",
    ]);
    void code;
    live = true;
    break;
  } catch {
    execFileSync(process.execPath, ["-e", "setTimeout(()=>{},3000)"], {
      stdio: "ignore",
    });
  }
}

console.log(
  live
    ? `\n${green("All set.")} Start the app with ${dim("npm run web:dev")} and open http://localhost:3000`
    : `\n${green("Imported.")} n8n is still starting — give it a moment, then run ${dim("npm run web:dev")}`,
);
const calendarTarget = env.GOOGLE_CALENDAR_ID || "primary";

if (hasGoogleClient) {
  console.log(
    `\n${green("One step left to turn on Google Calendar.")}\n` +
      "  OAuth needs a browser, so this part cannot be scripted:\n\n" +
      "    1. open http://localhost:5678\n" +
      '    2. Settings -> Credentials -> "Google Calendar account"\n' +
      '    3. click Connect and pick your Google account\n\n' +
      `  Events will be written to: ${calendarTarget}` +
      (calendarTarget === "primary"
        ? `\n  ${red("This is your REAL calendar.")} Set GOOGLE_CALENDAR_ID in .env to a\n` +
          "  throwaway calendar until you trust the extraction."
        : ""),
  );
} else {
  console.log(
    dim(
      "\n  Google Calendar is off. Without it the pipeline still extracts\n" +
        "  everything; only the calendar writes report as failed.\n" +
        "  To turn it on: put GOOGLE_OAUTH_CLIENT_ID / _SECRET in .env and\n" +
        "  re-run this script. See docs/DEPLOY.md for the Google Cloud steps.",
    ),
  );
}
