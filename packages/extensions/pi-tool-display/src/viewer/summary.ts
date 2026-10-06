import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import { utf8Prefix } from "@pi-mono/utils/utf8";

import { segmentText } from "../rendering/summary-line.ts";
import type { RunSummary } from "../summary/model.ts";
import { parseTranscriptRecord, type RunRecord } from "../transcript/records.ts";
import type { TranscriptModel } from "./model.ts";

const plain = {
  fg: (_color: unknown, value: string) => value,
  bg: (_color: unknown, value: string) => value,
  bold: (value: string) => value,
  getBgAnsi: () => ""
};

export type ValidatedRun = { record: RunRecord; summary: RunSummary; text: string };

/** Live callers supply both identities from the current connection's runtime marker. */
export function summarizeRun(
  model: TranscriptModel,
  value: unknown,
  live?: { sessionId: string; generation: string }
): ValidatedRun | undefined {
  const record = parseTranscriptRecord(value);
  if (
    record?.kind !== "run" ||
    (live && (record.sessionId !== live.sessionId || record.generation !== live.generation))
  )
    return;
  const summary = model.summary(record);
  if (!summary) return;
  let text = compactDisplayText(
    summary.segments.map((segment, index) => segmentText(segment, plain, index === 0)).join(" · ")
  );
  const omitted = record.omittedSegments > 0 || Buffer.byteLength(text) > 2048;
  if (omitted)
    text = `${utf8Prefix(text, 2048 - Buffer.byteLength(" · … (incomplete)"))} · … (incomplete)`;

  return { record, summary, text };
}
