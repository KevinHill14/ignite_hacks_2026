"use client";

import type { IngestResult } from "@/lib/types";

/**
 * Per-file progress for a multi-syllabus import.
 *
 * The point of showing each file separately is that they genuinely succeed and
 * fail independently. Five files behind one spinner means a single bad PDF
 * looks like total failure, and the user has no idea which one to fix.
 */

export type SlotStatus = "queued" | "parsing" | "done" | "failed";

export interface UploadSlot {
  id: string;
  file: File;
  status: SlotStatus;
  result?: IngestResult;
  error?: string;
}

const STATUS_LABEL: Record<SlotStatus, string> = {
  queued: "Waiting",
  parsing: "Reading",
  done: "Done",
  failed: "Failed",
};

export function UploadQueue({
  slots,
  onRetry,
  onRemove,
  busy,
}: {
  slots: UploadSlot[];
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  busy: boolean;
}) {
  if (slots.length === 0) return null;

  const done = slots.filter((s) => s.status === "done").length;
  const failed = slots.filter((s) => s.status === "failed").length;

  return (
    <div className="queue">
      <div className="queue__head">
        <p className="eyebrow">
          {slots.length} {slots.length === 1 ? "syllabus" : "syllabi"}
        </p>
        {busy && (
          <p className="queue__count">
            {done} of {slots.length} read
          </p>
        )}
        {!busy && failed > 0 && (
          <p className="queue__count is-bad">
            {failed} failed — the rest still worked
          </p>
        )}
      </div>

      <ul className="queue__list">
        {slots.map((s) => (
          <li key={s.id} className={`queue__item is-${s.status}`}>
            <span className="queue__dot" aria-hidden="true" />
            <span className="queue__name">
              {s.file.name}
              {s.status === "done" && s.result && (
                <span className="queue__detail">
                  {s.result.course.code || s.result.course.title} ·{" "}
                  {s.result.events.length} deadlines · {s.result.costs.length} costs
                </span>
              )}
              {s.status === "failed" && s.error && (
                <span className="queue__detail is-bad">{s.error}</span>
              )}
            </span>
            <span className="queue__status">{STATUS_LABEL[s.status]}</span>
            {!busy && s.status === "failed" && (
              // Retry only the file that failed. Re-running all five would
              // cost five more model calls to fix one.
              <button className="queue__action" onClick={() => onRetry(s.id)}>
                Retry
              </button>
            )}
            {!busy && s.status !== "parsing" && (
              <button
                className="queue__action"
                onClick={() => onRemove(s.id)}
                aria-label={`Remove ${s.file.name}`}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
