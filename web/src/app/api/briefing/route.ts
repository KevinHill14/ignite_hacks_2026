import { NextRequest, NextResponse } from "next/server";
import type { IngestResult } from "@/lib/types";

/**
 * Spoken term briefing (ElevenLabs).
 *
 * The script is composed deterministically from the numbers the pipeline
 * already produced — no model writes it. That matters: this is money, and a
 * generated sentence could confidently misread a figure. Templating it means
 * the audio can only ever say what the ledger says.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rachel — a stock ElevenLabs voice available on every account.
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";
const MAX_SCRIPT_CHARS = 1200;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function spokenDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

function spokenMoney(amount: number): string {
  const whole = Math.round(amount);
  return `${whole} dollars`;
}

/** Build the script from the ledger. Every figure traces to a real field. */
function composeScript(r: IngestResult): string {
  const lines: string[] = [];
  const name = [r.course.code, r.course.title].filter(Boolean).join(", ");

  lines.push(`Here's your term briefing for ${name || "this course"}.`);

  if (r.events.length > 0) {
    lines.push(
      `${r.events.length} deadline${r.events.length === 1 ? "" : "s"} ${
        r.calendar.created > 0 ? "went onto your calendar" : "came out of the syllabus"
      }.`,
    );

    // The single heaviest graded item is the one worth naming aloud.
    const heaviest = [...r.events]
      .filter((e) => e.weightPercent !== null)
      .sort((a, b) => (b.weightPercent ?? 0) - (a.weightPercent ?? 0))[0];
    if (heaviest) {
      lines.push(
        `The biggest one is ${heaviest.summary.replace(/^[^:]*:\s*/, "")} on ${spokenDate(
          heaviest.date,
        )}, worth ${heaviest.weightPercent} percent of your grade.`,
      );
    }
  }

  const primary = Object.entries(r.totals).sort((a, b) => b[1].all - a[1].all)[0];
  if (primary) {
    const [, totals] = primary;
    lines.push(
      `Required course costs come to ${spokenMoney(totals.mandatory)} for the term.`,
    );

    // The first payment is what actually changes behaviour this week.
    const firstDated = r.costs
      .filter((c) => c.neededBy && c.amount !== null && c.isMandatory)
      .sort((a, b) => (a.neededBy as string).localeCompare(b.neededBy as string))[0];
    if (firstDated?.neededBy && firstDated.amount !== null) {
      lines.push(
        `Your first payment is ${spokenMoney(firstDated.amount)} by ${spokenDate(
          firstDated.neededBy,
        )}, for ${firstDated.label}.`,
      );
    }

    if (totals.optional > 0) {
      lines.push(
        `Optional extras would add another ${spokenMoney(totals.optional)}.`,
      );
    }
  } else {
    lines.push("No priced costs were listed in this syllabus.");
  }

  if (r.stats.unpricedCount > 0) {
    lines.push(
      `${r.stats.unpricedCount} item${
        r.stats.unpricedCount === 1 ? " was" : "s were"
      } named without a price, so the real total is higher.`,
    );
  }

  return lines.join(" ").slice(0, MAX_SCRIPT_CHARS);
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Audio briefings are not configured on this server." },
      { status: 501 },
    );
  }

  let payload: IngestResult;
  try {
    payload = (await request.json()) as IngestResult;
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.events)) {
      throw new Error("bad shape");
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not read that result." },
      { status: 400 },
    );
  }

  const script = composeScript(payload);

  try {
    const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: script,
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.45, similarity_boost: 0.75 },
        }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      console.error(
        "[briefing] ElevenLabs returned",
        response.status,
        (await response.text()).slice(0, 500),
      );
      return NextResponse.json(
        { ok: false, error: "The narrator service did not answer." },
        { status: 502 },
      );
    }

    const audio = Buffer.from(await response.arrayBuffer());
    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        // Lets the client show the text alongside the audio.
        "X-Briefing-Script": encodeURIComponent(script),
      },
    });
  } catch (err) {
    console.error("[briefing] transport failure:", err);
    return NextResponse.json(
      { ok: false, error: "Could not reach the narrator service." },
      { status: 502 },
    );
  }
}
