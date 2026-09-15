import { limits, PromptError, type Snapshot, type StoredEntry } from "./model.ts";
import { encode } from "./storage/codec.ts";

export function addDraft(current: Snapshot, incoming: StoredEntry) {
  if (current.access !== "writable")
    throw new PromptError(
      "Drafts are in recovery or read-only; additions are disabled. Back up and repair with sessions stopped, or delete recoverable occurrences."
    );
  if (!incoming.text.trim()) throw new PromptError("Draft text is blank.");
  if (Buffer.byteLength(incoming.text) > limits.draftText)
    throw new PromptError("Draft exceeds 256 KiB; nothing was saved.");
  const document = { ...current.document, entries: [incoming, ...current.document.entries] };

  if (
    document.entries.length > limits.draftCount ||
    Buffer.byteLength(encode(document)) > limits.draftFile
  )
    throw new PromptError(
      "Draft capacity reached (1,000 entries / 16 MiB). Remove drafts before saving more; existing drafts were not changed."
    );

  return document;
}
