import { expect, it } from "vite-plus/test";

import { decodeUtf8, utf8Prefix, utf8Suffix } from "./utf8.ts";

it("clips every UTF-8 boundary without introducing replacement characters", () => {
  const text = "a界😀z";
  const bytes = Buffer.from(text);

  for (let limit = 0; limit <= bytes.length; limit++) {
    for (const clipped of [utf8Prefix(text, limit), utf8Suffix(text, limit)]) {
      expect(Buffer.byteLength(clipped)).toBeLessThanOrEqual(limit);
      expect(clipped).not.toContain("�");
    }

    expect(decodeUtf8(bytes.subarray(0, limit), "head")).toBe(utf8Prefix(text, limit));
    expect(decodeUtf8(bytes.subarray(bytes.length - limit), "tail")).toBe(utf8Suffix(text, limit));
  }
});

it("retains BOMs and literal replacement characters, and replaces interior invalid bytes", () => {
  const text = "\uFEFFa\uFFFD";
  for (const boundary of [undefined, "head", "tail"] as const)
    expect(decodeUtf8(Buffer.from(text), boundary)).toBe(text);
  expect(decodeUtf8(Buffer.from([0x61, 0xff, 0x62]))).toBe("a�b");
});
