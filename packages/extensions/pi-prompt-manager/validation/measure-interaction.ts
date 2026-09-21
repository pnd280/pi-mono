import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { searchText } from "@pi-mono/libs/text-search";
import { layoutPreview } from "@pi-mono/libs/tui/text-layout";

import { prepareItems } from "../src/search.ts";
import { readCollectionAsync, updateCollectionAsync } from "../src/storage/processing.ts";

const samples = [
  { name: "large-record", count: 1, text: "word ".repeat(1_600_000) },
  { name: "large-collection", count: 8, text: "word ".repeat(1_600_000) },
  { name: "maximum-record-count", count: 5000, text: "small prompt for search and navigation" },
  { name: "newline-dense-record", count: 1, text: "\n".repeat(4_000_000) + "end" },
  {
    name: "large-record-multi-term-fuzzy",
    count: 1,
    text: "x".repeat(7_999_800) + "a-b-c d-e-f g-h-i j-k-l m-n-o p-q-r s-t-u v-w-z",
    query: "abc def ghi jkl mno pqr stu vwz"
  }
];

for (const sample of samples) {
  const entries = Array.from({ length: sample.count }, () => ({
    id: randomUUID(),
    text: sample.text,
    recordedAt: "2026-01-01T00:00:00Z"
  }));
  const raw = Buffer.from(JSON.stringify({ version: 1, cwd: "/fixture", entries }));
  let last = performance.now();
  let maximumStallMs = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    maximumStallMs = Math.max(maximumStallMs, now - last - 10);
    last = now;
  }, 10);

  try {
    const start = performance.now();
    const collection = await readCollectionAsync({ collection: "drafts", cwd: "/fixture", raw });
    const loaded = performance.now();
    const items = await prepareItems(collection);
    const prepared = performance.now();
    await searchText(items, sample.query ?? "zzzz");
    const searched = performance.now();
    const first = items[0];
    if (!first) throw new Error(`Sample ${sample.name} produced no items.`);
    const lines = await layoutPreview(first.display, 40, () => true);
    const previewed = performance.now();
    await delay(20);
    console.log(
      JSON.stringify({
        sample: sample.name,
        readMs: loaded - start,
        prepareMs: prepared - loaded,
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

for (const [count, size] of [
  [250, 33000],
  [5000, 1500]
] as const) {
  const entries = Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    text: `${index}:` + "x".repeat(size),
    recordedAt: "2026-01-01T00:00:00Z"
  }));
  const raw = Buffer.from(JSON.stringify({ version: 1, cwd: "/fixture", entries }));
  let last = performance.now();
  let maximumStallMs = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    maximumStallMs = Math.max(maximumStallMs, now - last - 10);
    last = now;
  }, 10);

  try {
    const start = performance.now();
    await updateCollectionAsync({
      collection: "history",
      cwd: "/fixture",
      raw,
      retention: count,
      operation: { kind: "add", text: "new incoming", recordedAt: "2026-01-02T00:00:00Z" }
    });
    const updateMs = performance.now() - start;
    await delay(20);
    console.log(JSON.stringify({ sample: `history-${count}`, updateMs, maximumStallMs }));
  } finally {
    clearInterval(timer);
  }
}
