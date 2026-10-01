import { historyTextSchema } from "./model.ts";

export function captureText(source: string): string | undefined {
  const text = source.trim();

  return historyTextSchema.safeParse(text).data;
}
