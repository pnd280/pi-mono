import { OutputBuffer } from "@pi-mono/libs/output-buffer";
import { expect, it } from "vite-plus/test";

import { liveOutputOptions } from "./output-policy.ts";
const LIVE_OUTPUT_BYTES = liveOutputOptions.maxBytes;
it("switches after exactly one MiB and bounds long lines with head/tail counts", () => {
  const buffer = new OutputBuffer(liveOutputOptions);
  buffer.append(Buffer.alloc(LIVE_OUTPUT_BYTES, 97));
  expect(buffer.snapshot().text.length).toBe(LIVE_OUTPUT_BYTES);
  buffer.append(Buffer.from("界\r"));
  buffer.append(Buffer.from("\n"));
  for (let line = 0; line < 180; line++) buffer.append(Buffer.from(`line ${line}\r\n`));
  buffer.append(Buffer.from("last"));
  buffer.finish();
  const snapshot = buffer.snapshot();
  const lines = snapshot.text.split("\n");
  expect(lines).toHaveLength(102);
  expect(lines[1]).toBe("line 0");
  expect(lines[49]).toBe("line 48");
  expect(lines[50]).toBe("… 81 lines omitted …");
  expect(lines[51]).toBe("line 130");
  expect(snapshot.text.length).toBeLessThan(20_000);
  expect(snapshot.text).toContain("bytes omitted");
  expect(snapshot.text).toContain("81 lines omitted");
  expect(snapshot.omissions?.map((range) => snapshot.text.slice(range.start, range.end))).toEqual([
    expect.stringMatching(/^… \d+ bytes omitted …$/),
    "… 81 lines omitted …"
  ]);
  expect(snapshot.text).toContain("界\n");
  expect(snapshot.text.endsWith("line 179\nlast")).toBe(true);
  expect(snapshot.text).not.toContain("�");
});
