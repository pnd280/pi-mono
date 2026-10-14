import type { SelectedSource } from "@pi-mono/utils/source-selection";

export function selectionPreview(source: SelectedSource): string {
  if (!source.lines.some((line) => line.text.length > 0))
    return source.partial
      ? "The selection contains no text in this read window. Adjust offset and limit to include it."
      : "The selection contains no text: its lines are empty or its columns are past the line end.";
  const selected = source.lines.map((line) => line.text);
  let truncated = selected.length > 5;
  const excerpt = truncated ? [...selected.slice(0, 2), "…", ...selected.slice(-2)] : selected;
  const bounded = excerpt.map((line) => {
    const points = Array.from(line);
    if (points.length <= 500) return line;
    truncated = true;

    return points.slice(0, 250).join("") + "…" + points.slice(-249).join("");
  });
  const qualifiers = [source.partial ? "partial" : "", truncated ? "truncated" : ""].filter(
    Boolean
  );
  const suffix = qualifiers.length > 0 ? ` (${qualifiers.join(", ")})` : "";

  return `Selected source preview${suffix}:\n${bounded.join("\n")}`;
}
