import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { parsePatch as parseSourcePatch } from "@pi-mono/utils/patch";
import { expect, it } from "vite-plus/test";

import { renderDiffBody } from "./index.ts";

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
const displayOptions = {
  expanded: false,
  compactRows: 30,
  contextRows: 2,
  expansionHint: "expand",
  theme,
  highlight
};
const parsePatch = (source: string) => parseSourcePatch(source, 128 * 1024);

// Interpret the terminal's SGR background state, not the renderer's escape ordering.
// This fixture uses ASCII cells and indexed background colours only.
function backgroundAt(row: string, column: number): number | undefined {
  let background: number | undefined;
  let cell = 0;

  // oxlint-disable-next-line no-control-regex
  for (const match of row.matchAll(/\x1b\[([0-9;]*)m|([^\x1b])/gu)) {
    if (match[1] !== undefined) {
      const codes = match[1].split(";").map(Number);

      for (let index = 0; index < codes.length; index++) {
        const code = codes[index];

        if (code === 0 || code === 49) background = undefined;
        else if (code === 48 && codes[index + 1] === 5) {
          background = codes[index + 2];
          index += 2;
        }
      }
    } else if (cell++ === column) return background;
  }

  throw new Error(`Missing terminal cell ${column}`);
}

it("does not highlight omitted compact lines or hunks, but expands all retained source", () => {
  const parsed = parsePatch(
    "@@ -0,0 +1,31 @@\n" + "+first hunk\n".repeat(31) + "@@ -50,0 +82 @@\n+last hunk\n"
  )!;
  const highlighted: string[] = [];
  const options = {
    ...displayOptions,
    width: 120,
    highlight: (text: string) => {
      highlighted.push(text);

      return highlight(text);
    }
  };
  const compact = renderDiffBody(parsed, options);
  expect(compact.join("\n")).toContain("1 more hunk");
  expect(highlighted).toHaveLength(30);
  expect(highlighted).not.toContain("last hunk");
  highlighted.length = 0;
  const expanded = renderDiffBody(parsed, { ...options, expanded: true });
  expect(expanded.join("\n")).toContain("last hunk");
  expect(highlighted).toHaveLength(32);
});

it("pairs unequal change blocks without moving lines across context or hunk boundaries", () => {
  const parsed = parsePatch(
    "@@ -5,3 +8,4 @@\n-old\n+new\n+extra\n context\n-deleted\n+replaced\n@@ -100000000,0 +100000002 @@\n+last\n"
  )!;
  const split = renderDiffBody(parsed, { ...displayOptions, width: 160 }).map(
    stripTerminalSequences
  );
  expect(split).toHaveLength(7);
  expect(split[0]).toBe("Hunk 1/2");
  expect(split[1]).toMatch(/^\s*5 -old\s+│\s+8 \+new\s*$/);
  expect(split[2]).toMatch(/^\s+│\s+9 \+extra\s*$/);
  expect(split[3]).toMatch(/^\s*6  context\s+│\s+10  context\s*$/);
  expect(split[4]).toMatch(/^\s*7 -deleted\s+│\s+11 \+replaced\s*$/);
  expect(split[5]).toBe("Hunk 2/2");
  expect(split[6]).toMatch(/^\s+│ 100000002 \+last\s*$/);

  const unified = renderDiffBody(parsed, { ...displayOptions, width: 40 }).map((row) =>
    stripTerminalSequences(row).trim()
  );
  expect(unified).toEqual([
    "Hunk 1/2",
    "5 -old",
    "8 +new",
    "9 +extra",
    "10  context",
    "7 -deleted",
    "11 +replaced",
    "Hunk 2/2",
    "100000002 +last"
  ]);
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

it.each([
  ["additions", "@@ -7,2 +7,3 @@", "+", 9],
  ["removals", "@@ -7,3 +7,2 @@", "-", 8]
] as const)(
  "uses the full unified width for %s even with retained context",
  (_, header, sign, trailingLine) => {
    const changed = "changed_" + "x".repeat(70);
    const parsed = parsePatch(`${header}\n leading\n${sign}${changed}\n trailing\n`)!;

    for (const width of [120, 240]) {
      for (const expanded of [false, true]) {
        const rows = renderDiffBody(parsed, { ...displayOptions, width, expanded });
        expect(rows.map((row) => stripTerminalSequences(row).trimEnd())).toEqual([
          "7  leading",
          `8 ${sign}${changed}`,
          `${trailingLine}  trailing`
        ]);
        expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
      }
    }
  }
);

it("restores row backgrounds after inline highlights and clears styles between columns", () => {
  const parsed = parsePatch(
    "@@ -1,2 +1,2 @@\n-const value = old;\n+const value = new;\n context\n"
  )!;
  const rows = renderDiffBody(parsed, { ...displayOptions, width: 120 });
  const changed = rows.find((row) => stripTerminalSequences(row).includes("old"))!;
  const plain = stripTerminalSequences(changed);
  const separator = plain.indexOf("│");
  expect(backgroundAt(changed, plain.indexOf("const"))).toBe(1);
  expect(backgroundAt(changed, plain.indexOf("old"))).toBe(3);
  expect(backgroundAt(changed, plain.indexOf("new"))).toBe(3);
  expect(backgroundAt(changed, separator - 2)).toBe(1);
  expect(backgroundAt(changed, plain.length - 1)).toBe(2);
  expect(backgroundAt(changed, separator)).toBeUndefined();
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

it("keeps later changes visible after an expensive inline comparison", () => {
  const parsed = parsePatch(
    `@@ -1,2 +1,2 @@\n-${"α".repeat(200)}\n-old\n+${"β".repeat(200)}\n+new\n`
  )!;
  const rows = renderDiffBody(parsed, { ...displayOptions, width: 240 });
  const compared = rows.filter((row) => stripTerminalSequences(row).includes("α"));
  expect(compared.length).toBeGreaterThan(0);
  const later = rows.find((row) => stripTerminalSequences(row).includes("2 -old"))!;
  expect(stripTerminalSequences(later)).toContain("2 +new");
});

it("shows complete focused diffs through the row limit and identifies multiple hunks", () => {
  for (const width of [80, 120]) {
    const limit = 30;

    for (const count of [limit, limit + 1]) {
      const parsed = parsePatch(
        `@@ -0,0 +1,${count} @@\n${Array.from({ length: count }, (_, index) => `+line ${index}`).join("\n")}\n`
      )!;
      const compact = renderDiffBody(parsed, { ...displayOptions, width });
      const text = stripTerminalSequences(compact.join("\n"));
      expect(compact.length).toBe(count <= limit ? count : limit + 1);
      expect(text.includes(`+line ${count - 1}`)).toBe(count <= limit);
      if (count > limit) expect(stripTerminalSequences(compact.at(-1)!)).toMatch(/^… /);
      const expanded = stripTerminalSequences(
        renderDiffBody(parsed, { ...displayOptions, width, expanded: true }).join("\n")
      );
      expect(expanded).toContain(`+line ${count - 1}`);
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

it("keeps the first hunk's edits visible when wrapped context would consume the compact budget", () => {
  const leading = Array.from({ length: 4 }, () => " " + "leading context ".repeat(40)).join("\n");
  const trailing = Array.from({ length: 4 }, () => " " + "trailing context ".repeat(40)).join("\n");
  const shared = "shared ".repeat(10);
  const parsed = parsePatch(
    `@@ -23,9 +23,9 @@ first section\n${leading}\n-FIRST_OLD ${shared} END_OLD\n+FIRST_NEW ${shared} END_NEW\n${trailing}\n@@ -100 +100 @@ second section\n-SECOND_OLD\n+SECOND_NEW\n`
  )!;

  for (const width of [40, 80, 157]) {
    const rows = renderDiffBody(parsed, { ...displayOptions, width });
    const compact = stripTerminalSequences(rows.join("\n"));
    for (const edit of ["FIRST_OLD", "FIRST_NEW", "END_OLD", "END_NEW"])
      expect(compact).toContain(edit);
    expect(compact).toContain("Hunk 1/2");
    expect(compact).not.toContain("SECOND_OLD");
    expect(rows.length).toBeLessThanOrEqual(36);
    const expanded = stripTerminalSequences(
      renderDiffBody(parsed, { ...displayOptions, width, expanded: true }).join("\n")
    );
    expect(expanded).toContain("Hunk 2/2");
    expect(expanded).toContain("SECOND_OLD");
    expect(expanded).toContain("SECOND_NEW");
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

it("excerpts long changed lines around the actual edit instead of their shared prefix or suffix", () => {
  const prefix = "unchanged prefix ".repeat(100);
  const suffix = " unchanged suffix".repeat(100);
  const before = prefix + "OLD_TARGET" + suffix;
  const after = prefix + "NEW_TARGET" + suffix;
  const parsed = parsePatch(`@@ -5 +5 @@\n-${before}\n+${after}\n`)!;

  for (const width of [80, 157]) {
    const rows = renderDiffBody(parsed, { ...displayOptions, width });
    const compact = stripTerminalSequences(rows.join("\n"));
    expect(compact).toContain("OLD_TARGET");
    expect(compact).toContain("NEW_TARGET");
    expect(rows.length).toBeLessThanOrEqual(36);
    const expanded = stripTerminalSequences(
      renderDiffBody(parsed, { ...displayOptions, width, expanded: true }).join("\n")
    );
    expect(expanded).toContain("OLD_TARGET");
    expect(expanded).toContain("NEW_TARGET");
    expect(expanded.match(/unchanged/g)).toHaveLength(400);
  }
});

it("honors caller-selected compact/context budgets and viewports narrower than line-number gutters", () => {
  const parsed = parsePatch(
    "@@ -100,4 +100,4 @@\n leading\n-old\n+new\n trailing\n-last\n+final\n"
  )!;
  const options = { ...displayOptions, compactRows: 2, contextRows: 0, width: 80 };
  const rows = renderDiffBody(parsed, options).map(stripTerminalSequences);
  expect(rows).toHaveLength(3);
  expect(rows.join("\n")).toContain("-old");
  expect(rows.join("\n")).toContain("+new");
  expect(rows.join("\n")).not.toContain("trailing");
  expect(rows.join("\n")).not.toContain("last");

  for (const width of [0, 1, 2, 4]) {
    const narrow = renderDiffBody(parsed, { ...options, width });
    expect(narrow.every((row) => visibleWidth(row) <= width)).toBe(true);
    if (!width) expect(narrow).toEqual([]);
  }

  expect(() => renderDiffBody(parsed, { ...options, compactRows: 1 })).toThrow(RangeError);
});

it.each([0, 200])(
  "keeps changes visible with missing-newline markers and %i extra characters",
  (length) => {
    const parsed = parsePatch(
      `@@ -1 +1 @@\n-old${"a".repeat(length)}\n\\ No newline at end of file\n+new${"b".repeat(length)}\n\\ No newline at end of file\n`
    )!;

    for (const width of [80, 120]) {
      const rows = renderDiffBody(parsed, {
        ...displayOptions,
        width,
        compactRows: 2,
        contextRows: 0
      });
      const text = stripTerminalSequences(rows.join("\n"));
      expect(text).toContain("-old");
      expect(text).toContain("+new");
      expect(text).toContain("\\ No newline at end of file");
      expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
    }
  }
);

it("keeps long lines and displays missing-newline facts", () => {
  const before = "α".repeat(1000),
    after = "β";
  const parsed = parsePatch(`@@ -1 +1 @@\n-${before}\n\\ No newline at end of file\n+${after}\n`)!;
  const rows = renderDiffBody(parsed, { ...displayOptions, width: 120, expanded: true });
  const text = stripTerminalSequences(rows.join("\n"));
  expect(text.match(/α/g)).toHaveLength(1000);
  expect(text.match(/β/g)).toHaveLength(1);
  expect(text).toContain("\\ No newline at end of file");
  expect(rows.every((row) => visibleWidth(row) <= 120)).toBe(true);
});
