import { sliceByColumn, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { pairPatchLines, renderDiffBody } from "./diff-view.ts";
import { parsePatch } from "./diff.ts";

const backgrounds: Record<string, string> = {
  toolErrorBg: "\x1b[48;5;1m",
  toolSuccessBg: "\x1b[48;5;2m",
  selectedBg: "\x1b[48;5;3m"
};
const theme = {
  fg: (_token: string, text: string) => text,
  bg: (token: string, text: string) => `${backgrounds[token]}${text}\x1b[49m`,
  getBgAnsi: (token: string) => backgrounds[token]!,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`
};
const highlight = (text: string) => `\x1b[34m${text}\x1b[39m`;
const displayOptions = { expanded: false, expansionHint: "ctrl+o to expand", theme, highlight };

it("pairs unequal change blocks without moving lines across context or hunk boundaries", () => {
  const parsed = parsePatch(
    "@@ -5,3 +8,4 @@\n-old\n+new\n+extra\n context\n-deleted\n+replaced\n@@ -100000000,0 +100000002 @@\n+last\n"
  )!;
  expect(
    parsed.hunks
      .flatMap((hunk) => pairPatchLines(hunk.lines))
      .map((row) => [row.old?.text, row.new?.text])
  ).toEqual([
    ["old", "new"],
    [undefined, "extra"],
    ["context", "context"],
    ["deleted", "replaced"],
    [undefined, "last"]
  ]);
  expect(parsed.hunks.at(-1)?.lines.at(-1)?.newLine).toBe(100000002);
});

it("shows split previews by default when wide and unified rows when narrow without losing content", () => {
  const parsed = parsePatch("@@ -1,2 +1,3 @@\n-old\n+new\n+extra\n context\n")!;
  const render = (width: number) => renderDiffBody(parsed, { ...displayOptions, width });
  const split = render(120).map(stripTerminalSequences);
  expect(split[0]).toMatch(/1 -old\s+│ 1 \+new/);
  expect(split[1]).toMatch(/^\s+│ 2 \+extra/);
  expect(split[2]).toMatch(/2  context\s+│ 3  context/);
  for (const width of [40, 80]) {
    const unified = render(width).map(stripTerminalSequences).join("\n");
    expect(unified).not.toContain("│");
    for (const text of ["1 -old", "1 +new", "2 +extra", "3  context"])
      expect(unified).toContain(text);
  }
  const longPatch = parsePatch("@@ -1 +1 @@\n-" + "界".repeat(80) + "\n+short\n")!;
  const wrapped = renderDiffBody(longPatch, { ...displayOptions, width: 120 });
  expect(wrapped.every((row) => visibleWidth(row) <= 120)).toBe(true);
  expect(stripTerminalSequences(wrapped.join("\n")).match(/界/g)).toHaveLength(80);
  expect(wrapped.filter((row) => stripTerminalSequences(row).includes("+short"))).toHaveLength(1);
});

it("restores row backgrounds after inline highlights and clears styles between columns", () => {
  const parsed = parsePatch(
    "@@ -1,2 +1,2 @@\n-const value = old;\n+const value = new;\n context\n"
  )!;
  const rows = renderDiffBody(parsed, { ...displayOptions, width: 120 });
  const changed = rows.find((row) => stripTerminalSequences(row).includes("old"))!;
  const plain = stripTerminalSequences(changed);
  const separator = plain.indexOf("│");
  const removed = theme.getBgAnsi("toolErrorBg");
  const added = theme.getBgAnsi("toolSuccessBg");
  const inline = theme.getBgAnsi("selectedBg");
  expect(sliceByColumn(changed, 4, 1)).toContain(removed);
  expect(sliceByColumn(changed, plain.indexOf("old"), 1)).toContain(inline);
  expect(sliceByColumn(changed, plain.indexOf("new"), 1)).toContain(inline);
  expect(sliceByColumn(changed, separator - 2, 1)).toContain(removed);
  expect(sliceByColumn(changed, 119, 1)).toContain(added);
  // sliceByColumn retains earlier SGR codes, including those already reset.
  expect(sliceByColumn(changed, separator, 1).endsWith("\x1b[0m│")).toBe(true);
  expect(rows.find((row) => stripTerminalSequences(row).includes("context"))).not.toContain(
    "\x1b[48;"
  );
});

it("emphasizes inline changes after sanitizing controls without splitting graphemes or syntax colors", () => {
  const before = "\tconst value = '👩‍💻 é 界';\x1b]52;c;YQ==\x07";
  const after = "\tconst value = '👩‍🔬 è 界';\x1b[2J";
  const parsed = parsePatch(`@@ -1 +1 @@\n-${before}\n+${after}\n`)!;
  const original = structuredClone(parsed);
  const rows = renderDiffBody(parsed, { ...displayOptions, width: 80 });
  expect(rows.every((row) => row.includes("\x1b[1m") && row.includes("\x1b[34m"))).toBe(true);
  expect(rows.join("\n")).not.toContain("\x1b]52");
  expect(rows.join("\n")).not.toContain("\x1b[2J");
  expect(rows.map((row) => stripTerminalSequences(row).trimEnd())).toEqual([
    "1 -    const value = '👩‍💻 é 界';",
    "1 +    const value = '👩‍🔬 è 界';"
  ]);
  expect(parsed).toEqual(original);
});

it("bounds total inline comparison work across pairs without dropping later changes", () => {
  const parsed = parsePatch(
    `@@ -1,2 +1,2 @@\n-${"α".repeat(200)}\n-old\n+${"β".repeat(200)}\n+new\n`
  )!;
  const rows = renderDiffBody(parsed, { ...displayOptions, width: 240 });
  const compared = rows.filter((row) => stripTerminalSequences(row).includes("α"));
  expect(compared.length).toBeGreaterThan(0);
  expect(compared.every((row) => row.includes("\x1b[1m") || row.includes("\x1b[1;"))).toBe(true);
  const later = rows.find((row) => stripTerminalSequences(row).includes("2 -old"))!;
  expect(stripTerminalSequences(later)).toContain("2 +new");
  expect(later).not.toContain("\x1b[1m");
  expect(later).not.toContain(theme.getBgAnsi("selectedBg"));
});

it("shows complete focused diffs through the row limit and labels only multi-hunk patches", () => {
  for (const width of [80, 120]) {
    const limit = 30;
    for (const count of [limit, limit + 1]) {
      const parsed = parsePatch(
        `@@ -0,0 +1,${count} @@\n${Array.from({ length: count }, (_, index) => `+line ${index}`).join("\n")}\n`
      )!;
      const compact = renderDiffBody(parsed, { ...displayOptions, width });
      const text = stripTerminalSequences(compact.join("\n"));
      expect(compact.length).toBe(count <= limit ? count : limit + 1);
      expect(text).not.toContain("Hunk 1/1");
      expect(text.includes(`+line ${count - 1}`)).toBe(count <= limit);
      if (count > limit) expect(stripTerminalSequences(compact.at(-1)!)).toMatch(/^… /);
      const expanded = stripTerminalSequences(
        renderDiffBody(parsed, { ...displayOptions, width, expanded: true }).join("\n")
      );
      expect(expanded).not.toContain("Hunk 1/1");
      expect(expanded).toContain(`+line ${count - 1}`);
      for (const rendered of [text, expanded]) {
        expect(rendered).not.toContain("Before");
        expect(rendered).not.toContain("After");
        expect(rendered).not.toContain("@@");
      }
    }
  }
  const multiple = parsePatch("@@ -3 +3,0 @@\n-old\n@@ -50,0 +51 @@\n+new\n")!;
  for (const expanded of [false, true]) {
    const text = renderDiffBody(multiple, { ...displayOptions, width: 120, expanded }).join("\n");
    expect(stripTerminalSequences(text)).toContain("Hunk 1/2");
    expect(stripTerminalSequences(text)).toContain("Hunk 2/2");
    expect(text).not.toContain(theme.getBgAnsi("selectedBg")); // No cross-hunk pairing.
  }
});

it("keeps the whole first hunk when it fits even if later hunks exceed the compact limit", () => {
  const parsed = parsePatch(
    "@@ -1,7 +1,7 @@\n leading 1\n leading 2\n leading 3\n-old\n+new\n trailing 1\n trailing 2\n trailing 3\n@@ -100,0 +101,40 @@\n" +
      "+later\n".repeat(40)
  )!;
  for (const width of [80, 120]) {
    const rows = renderDiffBody(parsed, { ...displayOptions, width });
    const text = stripTerminalSequences(rows.join("\n"));
    for (const context of ["leading 1", "leading 3", "trailing 1", "trailing 3"])
      expect(text).toContain(context);
    expect(text).toContain("1 more hunk");
    expect(text).not.toContain("hunk excerpt");
    expect(text).not.toContain("+later");
    expect(rows.length).toBeLessThanOrEqual(36);
  }
});

it("adds surrounding context without spending the 30 changed-row budget", () => {
  for (const width of [80, 120]) {
    const count = width === 80 ? 15 : 30;
    const removed = Array.from({ length: count }, (_, index) => `-OLD_${index}`).join("\n");
    const added = Array.from({ length: count }, (_, index) => `+NEW_${index}`).join("\n");
    const context = " leading 1\n leading 2\n";
    const trailing = " trailing 1\n trailing 2\n unselected context\n";
    const parsed = parsePatch(
      `@@ -1,${count + 6} +1,${count + 6} @@\n${context}${removed}\n${added}\n${trailing}-LATER_OLD\n+LATER_NEW\n`
    )!;
    const rows = renderDiffBody(parsed, { ...displayOptions, width });
    const text = stripTerminalSequences(rows.join("\n"));
    for (const value of [
      "leading 1",
      "leading 2",
      "trailing 1",
      "trailing 2",
      `OLD_${count - 1}`,
      `NEW_${count - 1}`
    ])
      expect(text).toContain(value);
    expect(text).not.toContain("LATER_");
    expect(text).not.toContain("unselected context");
    expect(text).not.toContain("Hunk 1/1");
    expect(rows).toHaveLength(35); // 30 changed rows, four context rows, hint.
  }
});

it("keeps both sides of a large replacement in compact unified order", () => {
  const removed = Array.from({ length: 30 }, (_, index) => `-OLD_${index}`).join("\n");
  const added = Array.from({ length: 30 }, (_, index) => `+NEW_${index}`).join("\n");
  const parsed = parsePatch(`@@ -1,30 +1,30 @@\n${removed}\n${added}\n`)!;
  for (const width of [40, 80, 120]) {
    const rows = renderDiffBody(parsed, { ...displayOptions, width });
    const text = stripTerminalSequences(rows.join("\n"));
    expect(text).toContain("OLD_0");
    expect(text).toContain("NEW_0");
    expect(rows.length).toBeLessThanOrEqual(36);
    if (width < 120) expect(text.indexOf("OLD_1")).toBeLessThan(text.indexOf("NEW_0"));
  }
});

it("centers compact excerpts on whole changed graphemes after sanitizing controls", () => {
  const context = "界".repeat(90);
  const parsed = parsePatch(
    `@@ -1 +1 @@\n-${context}👩‍💻 é${context}\u001b]52;c;YQ==\u0007\n+${context}👩‍🔬 è${context}\u001b[2J\n`
  )!;
  const original = structuredClone(parsed);
  const rows = renderDiffBody(parsed, { ...displayOptions, width: 24 });
  const text = stripTerminalSequences(rows.join("\n"));
  for (const grapheme of ["👩‍💻", "👩‍🔬", "é", "è"]) expect(text).toContain(grapheme);
  expect(rows.join("\n")).toContain(theme.getBgAnsi("selectedBg"));
  expect(rows.join("\n")).not.toContain("\u001b]52");
  expect(rows.join("\n")).not.toContain("\u001b[2J");
  expect(rows.every((row) => visibleWidth(row) <= 24)).toBe(true);
  expect(rows.length).toBeLessThanOrEqual(36);
  expect(parsed).toEqual(original);
});

it("keeps long lines without inline comparison and displays missing-newline facts", () => {
  const before = "α".repeat(1000),
    after = "β";
  const parsed = parsePatch(`@@ -1 +1 @@\n-${before}\n\\ No newline at end of file\n+${after}\n`)!;
  const rows = renderDiffBody(parsed, { ...displayOptions, width: 120, expanded: true });
  expect(rows.join("\n")).not.toContain("\x1b[1m");
  const text = stripTerminalSequences(rows.join("\n"));
  expect(text.match(/α/g)).toHaveLength(1000);
  expect(text.match(/β/g)).toHaveLength(1);
  expect(text).toContain("\\ No newline at end of file");
  expect(rows.every((row) => visibleWidth(row) <= 120)).toBe(true);
});
