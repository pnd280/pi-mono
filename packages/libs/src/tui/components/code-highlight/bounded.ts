import { getLanguageFromPath, highlightCode } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

const limitsSchema = z.object({
  maxBytes: z.int().nonnegative(),
  maxLines: z.int().nonnegative(),
  maxLineBytes: z.int().nonnegative()
});

export type CodeHighlightOptions = z.infer<typeof limitsSchema> & {
  path?: string;
  language?: string;
};

/** Accept display-safe source; return it unchanged when language or budget prevents highlighting. */
export function highlightCodeBounded(text: string, options: CodeHighlightOptions): string {
  const { maxBytes, maxLines, maxLineBytes } = options;
  if (!limitsSchema.safeParse(options).success)
    throw new RangeError("Highlight limits must be nonnegative safe integers.");
  const language = options.language ?? getLanguageFromPath(options.path ?? "");
  if (!language || Buffer.byteLength(text) > maxBytes) return text;
  const lines = text.split("\n");
  if (lines.length > maxLines || lines.some((line) => Buffer.byteLength(line) > maxLineBytes))
    return text;

  return highlightCode(text, language).join("\n");
}
