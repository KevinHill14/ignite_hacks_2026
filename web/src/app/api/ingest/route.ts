import { NextRequest, NextResponse } from "next/server";
import type { IngestResponse } from "@/lib/types";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * Server-side proxy between the browser and the n8n pipeline.
 *
 * This route exists specifically so the browser never learns the ingest token
 * or the n8n address. The client uploads here; only this handler, running on
 * the server, holds the credential that lets it call n8n.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PDF_MAGIC = "%PDF-";
const DEFAULT_MAX_MB = 10;

/** Fail closed: a missing variable is a configuration error, not a default. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function fail(message: string, status: number) {
  return NextResponse.json<IngestResponse>(
    { ok: false, error: message },
    { status },
  );
}

export async function POST(request: NextRequest) {
  /*
   * Rate limit before anything else, and certainly before reading the body —
   * a limiter that first buffers a 10 MB upload still lets an attacker cost
   * you bandwidth and memory.
   *
   * The defaults suit a demo: a handful of uploads a minute is far more than
   * a person needs and far less than a stuck refresh loop would manage. The
   * daily cap is the real budget guard.
   */
  const key = clientKey(request.headers);
  const perMinute = rateLimit(`${key}:min`, {
    /*
     * Six, not three. A full course load is five files uploaded at once, which
     * is one user action producing five requests — a limit of three would
     * reject two of them and make the product's headline feature fail against
     * its own guard. Six leaves room for one retry on a failed file.
     *
     * The daily cap is the real budget protection; this one exists to stop a
     * stuck refresh, and a refresh loop trips six just as surely as three.
     */
    limit: Number(process.env.RATE_LIMIT_PER_MINUTE) || 6,
    windowMs: 60_000,
  });
  const perDay = rateLimit(`${key}:day`, {
    limit: Number(process.env.RATE_LIMIT_PER_DAY) || 25,
    windowMs: 24 * 60 * 60 * 1000,
  });

  const blocked = !perMinute.allowed ? perMinute : !perDay.allowed ? perDay : null;
  if (blocked) {
    const minutes = Math.ceil(blocked.retryAfter / 60);
    return NextResponse.json<IngestResponse>(
      {
        ok: false,
        error:
          blocked === perMinute
            ? `That's ${blocked.limit} uploads in a minute. Wait ${blocked.retryAfter}s and try again.`
            : `You've used today's ${blocked.limit} uploads. Each one is a real API call, so there's a daily cap. Try again in ${minutes > 60 ? `${Math.ceil(minutes / 60)}h` : `${minutes}m`}.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(blocked.retryAfter),
          "X-RateLimit-Limit": String(blocked.limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  let webhookUrl: string;
  let ingestToken: string;

  try {
    webhookUrl = requireEnv("N8N_WEBHOOK_URL");
    ingestToken = requireEnv("INGEST_TOKEN");
  } catch (err) {
    // Log server-side; tell the client nothing about our configuration.
    console.error("[ingest] configuration error:", err);
    return fail(
      "The import service is not configured yet. Check the server logs.",
      503,
    );
  }

  const maxBytes =
    (Number(process.env.MAX_UPLOAD_MB) || DEFAULT_MAX_MB) * 1024 * 1024;

  // --- Read and validate the upload ----------------------------------------
  let file: File | null = null;
  try {
    const form = await request.formData();
    const entry = form.get("syllabus");
    if (entry instanceof File) file = entry;
  } catch {
    return fail("That upload could not be read. Try the file again.", 400);
  }

  if (!file) return fail("No file received. Choose a syllabus to upload.", 400);

  if (file.size === 0) return fail("That file is empty.", 400);

  if (file.size > maxBytes) {
    const mb = (maxBytes / 1024 / 1024).toFixed(0);
    return fail(`That file is larger than ${mb} MB. Upload a smaller PDF.`, 413);
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Trust the file's contents, not its name or its declared MIME type — both
  // are attacker-controlled. A real PDF starts with %PDF-.
  if (bytes.subarray(0, 5).toString("latin1") !== PDF_MAGIC) {
    return fail("That file is not a PDF. Export your syllabus as a PDF first.", 415);
  }

  // --- Hand off to the n8n pipeline ----------------------------------------
  const outbound = new FormData();
  outbound.append(
    "syllabus",
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    // Strip any path components a crafted filename might carry.
    file.name.replace(/[/\\]/g, "_").slice(0, 200) || "syllabus.pdf",
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "X-Ingest-Token": ingestToken },
      body: outbound,
      signal: controller.signal,
      cache: "no-store",
    });

    const raw = await response.text();

    if (!response.ok) {
      // n8n error bodies can quote the syllabus and name internal nodes.
      // Keep them in the server log; give the browser a plain summary.
      console.error(
        `[ingest] n8n returned ${response.status}:`,
        raw.slice(0, 2000),
      );
      if (response.status === 401 || response.status === 403) {
        return fail("The import service rejected our credentials.", 502);
      }
      if (response.status === 404) {
        return fail(
          "The pipeline is not listening. Open the workflow in n8n and activate it.",
          502,
        );
      }
      return fail("The pipeline could not process that syllabus.", 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[ingest] non-JSON body from n8n:", raw.slice(0, 2000));
      return fail("The pipeline returned an unreadable response.", 502);
    }

    return NextResponse.json(parsed, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return fail(
        "The pipeline took too long to answer. Try a shorter syllabus.",
        504,
      );
    }
    console.error("[ingest] transport failure:", err);
    return fail("Could not reach the import service.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
