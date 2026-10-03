import { expect, it } from "vite-plus/test";

import { decodeUtf8Window } from "./utf8.ts";

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
    expect(decodeUtf8Window(bytes.subarray(0, limit), "head")).toEqual({
      text: prefix,
      omittedBytes: limit - Buffer.byteLength(prefix)
    });
    expect(decodeUtf8Window(bytes.subarray(bytes.length - limit), "tail")).toEqual({
      text: suffix,
      omittedBytes: limit - Buffer.byteLength(suffix)
    });
  }
});

it("replaces interior invalid bytes", () => {
  expect(decodeUtf8Window(Buffer.from([0x61, 0xff, 0x62]))).toEqual({
    text: "a�b",
    omittedBytes: 0
  });
});

it("counts clipped source bytes independently of invalid-byte replacement decoding", () => {
  expect(decodeUtf8Window(Buffer.from([0xff, 0xe7, 0x95]), "head")).toEqual({
    text: "�",
    omittedBytes: 2
  });
  expect(decodeUtf8Window(Buffer.from([0x95, 0x8c, 0xff]), "tail")).toEqual({
    text: "�",
    omittedBytes: 2
  });
  expect(decodeUtf8Window(Buffer.from([0xff, 0x80]), "head")).toEqual({
    text: "��",
    omittedBytes: 0
  });
});
