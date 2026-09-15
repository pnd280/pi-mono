import { randomUUID } from "node:crypto";

import { layoutPreview } from "../src/browser/preview.ts";
import { prepareItems, searchItems } from "../src/search.ts";
import { snapshot } from "../src/storage/codec.ts";

const samples = [
  { name: "large-record", count: 1, text: "word ".repeat(1_600_000) },
  { name: "large-collection", count: 8, text: "word ".repeat(1_600_000) },
  { name: "maximum-record-count", count: 5000, text: "small prompt for search and navigation" },
  { name: "newline-dense-record", count: 1, text: "\n".repeat(4_000_000) + "end" }
];

for (const sample of samples) {
  const entries = Array.from({ length: sample.count }, () => ({
    id: randomUUID(),
    text: sample.text,
    recordedAt: "2026-01-01T00:00:00Z"
  }));
  const collection = snapshot(
    "drafts",
    { version: 1, cwd: "/fixture", entries },
    sample.count * Buffer.byteLength(sample.text) + 100 * sample.count
  );
  let last = performance.now();
  let maximumStallMs = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    maximumStallMs = Math.max(maximumStallMs, now - last - 10);
    last = now;
  }, 10);

  try {
    const start = performance.now();
    const items = await prepareItems(collection);
    const prepared = performance.now();
    await searchItems(items, "zzzz");
    const searched = performance.now();
    const lines = await layoutPreview(items[0]!.display, 40, () => true);
    const previewed = performance.now();
    console.log(
      JSON.stringify({
        sample: sample.name,
        prepareMs: prepared - start,
        searchMs: searched - prepared,
        previewMs: previewed - searched,
        maximumStallMs,
        previewLines: lines.length
      })
    );
  } finally {
    clearInterval(timer);
  }
}
