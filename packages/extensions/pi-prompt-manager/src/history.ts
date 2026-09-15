import { limits, PromptError, type Document, type StoredEntry, type Occurrence } from "./model.ts";
import { encode } from "./storage/codec.ts";

export function captureText(source: string): string | undefined {
  const text = source.trim();

  return text && Buffer.byteLength(text) <= limits.historyText ? text : undefined;
}

/** Prefix only: never skip a large newer record to fit an older one. */
export function retainHistory(
  document: Document,
  incoming: StoredEntry,
  retention: number
): Document | undefined {
  if (document.entries[0]?.text.trim() === incoming.text.trim()) return undefined;
  const candidates = [incoming, ...document.entries].slice(0, retention);
  let low = 0;
  let high = candidates.length;

  while (low < high) {
    const count = Math.ceil((low + high) / 2);

    if (
      Buffer.byteLength(encode({ ...document, entries: candidates.slice(0, count) })) <=
      limits.historyFile
    )
      low = count;
    else high = count - 1;
  }

  if (low === 0)
    throw new PromptError(
      "History metadata exceeds collection capacity; manually reduce the file with sessions stopped."
    );

  return { ...document, entries: candidates.slice(0, low) };
}

export function historyRows(entries: Occurrence[]): Occurrence[] {
  const seen = new Set<string>();

  return entries.filter((entry) => {
    const equality = entry.source.text.trim();

    if (seen.has(equality)) return false;
    seen.add(equality);

    return true;
  });
}
