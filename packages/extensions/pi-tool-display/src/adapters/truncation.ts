import type { DisplayNotice } from "../contracts.ts";

/**
 * Compact-card notices for output that its producer truncated, with the saved file when
 * one exists. Expanded cards omit them, because the retained text carries the producer's
 * own warning and reference.
 */
export function truncationNotices(subject: string, path: string | undefined): DisplayNotice[] {
  return [
    { kind: "warning", text: `${subject} output truncated; expand to inspect retained output.` },
    ...(path ? [{ kind: "reference" as const, label: "Saved output", value: path }] : [])
  ];
}
