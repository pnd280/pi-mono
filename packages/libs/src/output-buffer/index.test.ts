import { outputOmission, type OutputOmission } from "@pi-mono/utils/output-text";
import { expect, it } from "vite-plus/test";

import { OutputBuffer, type OutputBufferOptions } from "./index.ts";

const options = {
  maxBytes: 8,
  edgeLines: 1,
  lineBytes: 5,
  formatOmission: ({ count, unit }) => outputOmission(`[${count} ${unit}]`)
} satisfies OutputBufferOptions;

it("decodes split UTF-8 and CRLF once, and ignores chunks after finish", () => {
  const buffer = new OutputBuffer({ ...options, maxBytes: 100 });
  const bytes = Buffer.from("界😀\r\nlast\r");
  for (const byte of bytes) buffer.append(Buffer.from([byte]));
  buffer.finish();
  const finished = buffer.snapshot();
  expect(finished).toEqual({ text: "界😀\r\nlast\r" });
  buffer.finish();
  buffer.append(Buffer.from("ignored"));
  expect(buffer.snapshot()).toEqual(finished);
});

it("keeps caller-selected line edges and marks only generated omissions", () => {
  const buffer = new OutputBuffer(options);
  buffer.append(Buffer.from("one\ntwo\nthree\nfour\n"));
  buffer.finish();
  const output = buffer.snapshot();
  expect(output.text).toBe("one\n[2 lines]\nfour");
  expect(output.omissions?.map(({ start, end }) => output.text.slice(start, end))).toEqual([
    "[2 lines]"
  ]);
});

it("handles odd and sub-character line budgets without reordering later chunks", () => {
  const notices: OutputOmission[] = [];
  const buffer = new OutputBuffer({
    ...options,
    maxBytes: 1,
    lineBytes: 1,
    formatOmission: (omission) => {
      notices.push(omission);

      return outputOmission("[omitted]");
    }
  });
  buffer.append(Buffer.from("界"));
  buffer.append(Buffer.from("later"));
  buffer.finish();
  expect(buffer.snapshot().text).toBe("[omitted]");
  expect(notices.at(-1)).toEqual({ count: 8, unit: "bytes" });
  const odd = new OutputBuffer({ ...options, maxBytes: 1 });
  odd.append(Buffer.from("abcdefghi"));
  odd.finish();
  expect(odd.snapshot().text).toBe("abc[4 bytes]hi");
});

it("preserves chunk order when a character crosses the line-head budget without filling the line", () => {
  const buffer = new OutputBuffer({ ...options, maxBytes: 16, lineBytes: 8 });
  buffer.append(Buffer.from("xxx"));
  buffer.append(Buffer.from("界"));
  buffer.append(Buffer.from("a\n"));
  buffer.append(Buffer.alloc(16, 122));
  buffer.finish();
  expect(buffer.snapshot().text.split("\n")[0]).toBe("xxx界a");
});

it.each([
  { chunks: ["a界"], complete: "a界", clipped: "a[6 bytes]ef" },
  { chunks: ["a", "界"], complete: "a界", clipped: "a[6 bytes]ef" },
  { chunks: ["😀"], complete: "😀", clipped: "[7 bytes]ef" }
])(
  "retains short Unicode lines until the line budget is exceeded: $chunks",
  ({ chunks, complete, clipped }) => {
    const buffer = new OutputBuffer({ ...options, maxBytes: 1 });
    for (const chunk of chunks) buffer.append(Buffer.from(chunk));
    expect(buffer.snapshot()).toEqual({ text: complete, omissions: [] });
    buffer.append(Buffer.from("bcdef"));
    buffer.finish();
    expect(buffer.snapshot().text).toBe(clipped);
  }
);

it("keeps incomplete UTF-8 until finish, retains exact full-byte limits, and validates budgets", () => {
  const buffer = new OutputBuffer(options);
  buffer.append(Buffer.from("12345678"));
  expect(buffer.snapshot()).toEqual({ text: "12345678" });
  buffer.append(Buffer.from("9"));
  buffer.finish();
  expect(buffer.snapshot().text).toBe("123[4 bytes]89");
  const incomplete = new OutputBuffer(options);
  incomplete.append(Buffer.from([0xe7]));
  expect(incomplete.snapshot()).toEqual({ text: "" });
  incomplete.finish();
  expect(incomplete.snapshot()).toEqual({ text: "�" });
  expect(() => new OutputBuffer({ ...options, edgeLines: 0 })).toThrow(RangeError);
});
