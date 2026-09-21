import { setImmediate } from "node:timers/promises";

import { visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { layoutPreview } from "./index.ts";

it("trims a wrapped row when its trailing newline follows a chunk boundary", async () => {
  const text = `${"a".repeat(4095)} \n`;
  expect(await layoutPreview(text, 51, () => true)).toEqual(wrapTextWithAnsi(text, 51));
});

it("matches whole-text wrapping across cooperative chunk boundaries", async () => {
  const plain = "x".repeat(4097);
  expect(await layoutPreview(plain, 7, () => true)).toEqual(wrapTextWithAnsi(plain, 7));

  const samples = [
    `${"x".repeat(4094)}\x1b[31mred words continue\x1b[0m`,
    `${"a ".repeat(2048)}next words`,
    `${"x".repeat(4090)} \x1b[31mred words continue\x1b[0m`,
    `${"word and space ".repeat(400)}\n${"next line ".repeat(400)}`
  ];

  for (const sample of samples)
    expect(await layoutPreview(sample, 40, () => true)).toEqual(wrapTextWithAnsi(sample, 40));
});

it("preserves native whitespace and ANSI state across logical-line batches", async () => {
  const samples = [
    `${"\n".repeat(4094)}a \n`,
    `${"a".repeat(4095)}\r\nb \r\nc\r`,
    `${"a".repeat(4095)}\rb \rc`,
    `\x1b[1;4;38;2;10;20;30m${"word ".repeat(1000)}\n\nnext\x1b[24;39m\nlast\x1b[0m\n`,
    `\x1b]8;id=preview;https://example.com\x07${"link ".repeat(1000)}\nnext\x1b]8;;\x07\n`,
    `${" ".repeat(5000)}\n${"a".repeat(4100)}\x1b[31m \nnext`,
    `${"x".repeat(4095)}e\u0301👩🏽‍💻🇯🇵${"🇺".repeat(4100)}\n`
  ];

  for (const text of samples)
    for (const width of [1, 2, 7, 51, 10000])
      expect(await layoutPreview(text, width, () => true)).toEqual(wrapTextWithAnsi(text, width));
});

it.each([
  {
    name: "reported seed",
    seed: 361902,
    tokens: [
      "one ",
      "  ",
      "abcdefg",
      "longword".repeat(7),
      "\n",
      "x",
      "你好 ",
      "\x1b[31mred\x1b[0m ",
      "e\u0301 "
    ]
  },
  {
    name: "unbroken logical lines",
    seed: 84217,
    tokens: [
      "one ",
      "   ",
      "abcdefg",
      "longword".repeat(7),
      "你好",
      "e\u0301",
      "👩🏽‍💻",
      "\x1b[4m",
      "\x1b[24m",
      "\x1b[31m",
      "\x1b[0m"
    ]
  },
  {
    name: "line delimiters and continuing styles",
    seed: 729041,
    tokens: [
      "x ",
      "\r",
      "\n",
      "\r\n",
      "    ",
      "你好 ",
      "🇯🇵",
      "\x1b[1;4;31m",
      "\x1b[22;39m",
      "\x1b[0m",
      "\x1b[48;5;123m"
    ]
  }
])("matches native snapshots for $name", async ({ seed, tokens }) => {
  const random = (maximum: number) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;

    return seed % maximum;
  };

  for (let sample = 0; sample < 500; sample++) {
    let text = "";
    while (text.length < 4500) text += tokens[random(tokens.length)];
    const width = 1 + random(100);
    expect(
      await layoutPreview(text, width, () => true),
      `sample ${sample}, width ${width}`
    ).toEqual(wrapTextWithAnsi(text, width));
  }
});

it("matches native wrapping for long lines, dense ANSI, and many output rows", async () => {
  for (const [text, width] of [
    ["x".repeat(150000), 1],
    ["\x1b[31mword\x1b[39m ".repeat(20000), 40],
    ["x\n".repeat(140000), 40]
  ] as const)
    expect(await layoutPreview(text, width, () => true)).toEqual(wrapTextWithAnsi(text, width));
});

it("returns no partial layout when cancelled initially or after a later event-loop yield", async () => {
  for (const text of [
    "",
    "short",
    "x".repeat(300000),
    "line\n".repeat(60000),
    "\x1b[31m".repeat(60000)
  ]) {
    expect(await layoutPreview(text, 40, () => false)).toEqual([]);
    if (text.length < 300000) continue;

    let active = true;
    let checks = 0;
    const lines = await layoutPreview(text, 40, () => {
      if (++checks === 1)
        void setImmediate().then(() => {
          active = false;
        });

      return active;
    });
    expect(lines).toEqual([]);
    expect(checks).toBe(2);
  }
});

it("keeps the minimum width of one column", async () => {
  for (const width of [0, -10])
    expect(await layoutPreview("abc def\n", width, () => true)).toEqual(
      wrapTextWithAnsi("abc def\n", 1)
    );
});

it("lays out complete text cooperatively without splitting surrogate pairs or losing trailing lines", async () => {
  expect(await layoutPreview("", 40, () => true)).toEqual([""]);
  expect(await layoutPreview("line\n", 40, () => true)).toEqual(["line", ""]);
  const text = "x".repeat(4095) + "😀" + "界".repeat(300000) + "\nTAIL";
  const lines = await layoutPreview(text, 40, () => true);
  expect(lines.at(-1)).toBe("TAIL");
  expect(lines.every((line) => visibleWidth(line) <= 40)).toBe(true);
  expect(lines.join("")).toContain("😀");
  expect(lines.join("")).not.toContain("\uFFFD");
  expect(await layoutPreview(text, 40, () => false)).toEqual([]);
});
