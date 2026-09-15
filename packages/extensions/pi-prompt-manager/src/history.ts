import { historyTextSchema, type Occurrence } from "./model.ts";

export function captureText(source: string): string | undefined {
  const text = source.trim();

  return historyTextSchema.safeParse(text).data;
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
