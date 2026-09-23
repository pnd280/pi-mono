import { expect, it } from "vite-plus/test";

import { decodeUtf8, utf8Prefix, utf8Suffix } from "./utf8.ts";

it("clips every UTF-8 boundary without introducing replacement characters", () => {
  const text = "a界😀z";
  const bytes = Buffer.from(text);

  for (const [limit, prefix, suffix] of [
    [0, "", ""],
    [1, "a", "z"],
    [2, "a", "z"],
    [3, "a", "z"],
    [4, "a界", "z"],
    [5, "a界", "😀z"],
    [6, "a界", "😀z"],
    [7, "a界", "😀z"],
    [8, "a界😀", "界😀z"],
    [9, "a界😀z", "a界😀z"]
  ] as const) {
    expect(utf8Prefix(text, limit), `prefix at ${limit} bytes`).toBe(prefix);
    expect(utf8Suffix(text, limit), `suffix at ${limit} bytes`).toBe(suffix);
    expect(decodeUtf8(bytes.subarray(0, limit), "head")).toBe(prefix);
    expect(decodeUtf8(bytes.subarray(bytes.length - limit), "tail")).toBe(suffix);
  }
});

it("rejects invalid byte limits instead of violating the requested bound", () => {
  for (const bytes of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Infinity]) {
    expect(() => utf8Prefix("abc", bytes)).toThrow(RangeError);
    expect(() => utf8Suffix("abc", bytes)).toThrow(RangeError);
  }
});

it("retains BOMs and literal replacement characters, and replaces interior invalid bytes", () => {
  const text = "\uFEFFa\uFFFD";
  for (const boundary of [undefined, "head", "tail"] as const)
    expect(decodeUtf8(Buffer.from(text), boundary)).toBe(text);
  expect(decodeUtf8(Buffer.from([0x61, 0xff, 0x62]))).toBe("a�b");
});
