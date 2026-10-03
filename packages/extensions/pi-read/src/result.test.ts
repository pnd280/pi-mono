import { selectionSchema } from "@pi-mono/utils/source-selection";
import {
  appendPreview,
  interpretReadResult,
  type ReadResult,
  type ReadResultView
} from "pi-read/result";
import { describe, expect, it } from "vite-plus/test";

const span = (startLine: number, endLine = startLine) =>
  selectionSchema.parse({ startLine, endLine });

function result(text: string, details?: unknown): ReadResultView {
  return { content: [{ type: "text", text }], details };
}

describe("preview provenance", () => {
  it("restores serialised provenance without replacing borrowed blocks or unrelated details", () => {
    const persisted: ReadResultView = {
      content: [
        { type: "text", text: "Selected source preview:\nsource" },
        { type: "text", text: "more source\n" },
        { type: "text", text: "preview" }
      ],
      details: { selectiveRead: { sourceBlocks: 2 }, unrelated: { retained: true } }
    };
    // This round trip originates from the explicit typed fixture, not an external result.
    // oxlint-disable-next-line typescript/no-unsafe-assignment
    const retained: ReadResultView = JSON.parse(JSON.stringify(persisted));
    const before = structuredClone(retained);
    Object.freeze(retained.content);
    for (const block of retained.content) Object.freeze(block);
    Object.freeze(retained);
    const interpreted = interpretReadResult(retained);

    expect(interpreted.valid).toBe(true);
    expect(interpreted.preview).toEqual({ kind: "valid", contentIndex: 2 });
    expect(interpreted.sourceContent).toEqual(retained.content.slice(0, 2));
    expect(interpreted.sourceContent[0]).toBe(retained.content[0]);
    expect(interpreted.document?.lines).toEqual([
      "Selected source preview:",
      "source",
      "more source"
    ]);
    expect(retained).toEqual(before);
  });

  it("never hides unmarked source, even when its text looks like a preview", () => {
    for (const details of [undefined, {}, { unrelated: true }, { selectiveRead: undefined }]) {
      const retained = result("Selected source preview:\nsource", details);
      const interpreted = interpretReadResult(retained);
      expect(interpreted.valid).toBe(true);
      expect(interpreted.preview).toEqual({ kind: "absent" });
      expect(interpreted.sourceContent).toBe(retained.content);
    }
  });

  it.each([0, -1, 0.5, 2, 9, "1", Number.MAX_SAFE_INTEGER + 1, null, undefined])(
    "preserves all retained blocks for a malformed marked count: %j",
    (sourceBlocks) => {
      const retained: ReadResultView = {
        content: [
          { type: "text", text: "source" },
          { type: "text", text: "preview" }
        ],
        details: { selectiveRead: { sourceBlocks } }
      };
      const interpreted = interpretReadResult(retained);
      expect(interpreted.valid).toBe(false);
      expect(interpreted.preview).toEqual({ kind: "invalid" });
      expect(interpreted.sourceContent).toBe(retained.content);
      expect(interpreted.document?.lines).toEqual(["source", "preview"]);
    }
  );

  it("requires exactly one trailing text preview and an entirely text marked result", () => {
    for (const content of [
      [{ type: "text", text: "source" }],
      [
        { type: "text", text: "source" },
        { type: "text", text: "preview" },
        { type: "text", text: "unowned" }
      ],
      [
        { type: "text", text: "source" },
        { type: "image", data: "AA==", mimeType: "image/png" }
      ],
      [
        { type: "image", data: "AA==", mimeType: "image/png" },
        { type: "text", text: "preview" }
      ]
    ] satisfies ReadResultView["content"][]) {
      const retained = { content, details: { selectiveRead: { sourceBlocks: 1 } } };
      const interpreted = interpretReadResult(retained);
      expect(interpreted.valid).toBe(false);
      expect(interpreted.preview.kind).toBe("invalid");
      expect(interpreted.sourceContent).toBe(content);
    }
  });

  it("distinguishes absent provenance from invalid unrelated details", () => {
    for (const details of [
      null,
      "details",
      { truncation: { outputLines: -1 } },
      { truncation: { outputLines: 0.5 } }
    ]) {
      const interpreted = interpretReadResult(result("source", details));
      expect(interpreted.valid).toBe(false);
      expect(interpreted.preview).toEqual({ kind: "absent" });
      expect(interpreted.document?.lines).toEqual(["source"]);
    }

    const retained = {
      content: [
        { type: "text", text: "source" },
        { type: "text", text: "preview" }
      ],
      details: { selectiveRead: { sourceBlocks: 1 }, truncation: { outputLines: -1 } }
    } satisfies ReadResultView;
    const interpreted = interpretReadResult(retained);

    expect(interpreted.preview.kind).toBe("invalid");
    expect(interpreted.sourceContent).toBe(retained.content);
  });
});

it("does not conceal invalid provenance when appending, and replaces only a validated preview", () => {
  const retained: ReadResult = {
    content: [
      { type: "text", text: "source" },
      { type: "text", text: "retained unknown block" }
    ],
    details: { selectiveRead: { sourceBlocks: 9 } }
  };
  expect(appendPreview(retained, { path: "a.ts" }, span(1))).toBe(retained);
  const valid: ReadResult = {
    content: [
      { type: "text", text: "source" },
      { type: "text", text: "old preview" }
    ],
    details: { selectiveRead: { sourceBlocks: 1 } }
  };
  const updated = appendPreview(valid, { path: "a.ts" }, span(1));
  expect(updated.content).toEqual([
    valid.content[0],
    { type: "text", text: "Selected source preview:\nsource" }
  ]);
  expect(updated.content[0]).toBe(valid.content[0]);
  expect(valid.content[1]).toEqual({ type: "text", text: "old preview" });
  expect(updated.details?.selectiveRead).toEqual({ sourceBlocks: 1 });
});

describe("native source windows", () => {
  it("shares fractional native window arithmetic without imposing selection-coordinate rules", () => {
    const retained = result("first\nsecond\nthird\n\nnotice");
    const interpreted = interpretReadResult(retained, { offset: 2.8, limit: 1.4 });
    expect(interpreted.document).toMatchObject({
      firstLine: 2,
      lines: ["first", "second"],
      notice: "third\n\nnotice"
    });
  });

  it("keeps end-relative windows selectable without inferring notice provenance from prose", () => {
    const retained = result("first\nsecond\nthird\n\narbitrary native notice");
    const interpreted = interpretReadResult(retained, { limit: -1 });
    expect(interpreted.document).toMatchObject({
      lines: ["first", "second", "third"],
      notice: "arbitrary native notice"
    });
    expect(
      interpreted.blocks[0]?.highlight(
        "first\nsecond\nthird\n\narbitrary native notice",
        span(1, 9)
      )
    ).toHaveLength(3);
    const truncated = interpretReadResult(
      result("first\n\nnotice", { truncation: { outputLines: 0 } }),
      { limit: -1 }
    );
    expect(truncated.document?.lines).toEqual([]);
    expect(truncated.blocks[0]?.highlight("first", span(1))).toEqual([]);
  });

  it.each([1, 3])(
    "uses returned truncation lines (%i) in preference to the requested limit",
    (outputLines) => {
      const retained = result("first\nsecond\nthird\n\nnotice", { truncation: { outputLines } });
      const interpreted = interpretReadResult(retained, { limit: 2 });
      expect(interpreted.document?.lines).toHaveLength(outputLines);
      expect(interpreted.blocks[0]?.highlight("first\nsecond\nthird", span(1, 8))).toHaveLength(
        outputLines
      );
    }
  );

  it("keeps a zero-source-line byte-limit diagnostic outside the selected source", () => {
    const diagnostic =
      "[Line 1 is 60KB, exceeds 50KB limit. Use bash: sed -n '1p' a | head -c 51200]";
    const interpreted = interpretReadResult(result(diagnostic, { truncation: { outputLines: 0 } }));
    expect(interpreted.document).toMatchObject({ lines: [], notice: diagnostic });
    expect(interpreted.document?.select(span(1))).toMatchObject({
      lines: [],
      ranges: [],
      partial: true
    });
    expect(interpreted.blocks[0]?.highlight("", span(1))).toEqual([]);
  });

  it("bounds multi-block source by returned counts despite trailing newlines and empty blocks", () => {
    const retained: ReadResultView = {
      content: [
        { type: "text", text: "alpha\n" },
        { type: "text", text: "" },
        {
          type: "text",
          text: "\t😀界tail\nnext\n\n[3 more lines in file. Use offset=15 to continue.]"
        },
        { type: "text", text: "preview" }
      ],
      details: { selectiveRead: { sourceBlocks: 3 }, truncation: { outputLines: 5 } }
    };
    const interpreted = interpretReadResult(retained, { offset: 10, limit: 1 });
    expect(interpreted.document?.lines).toEqual(["alpha", "", "", "\t😀界tail", "next"]);
    expect(interpreted.blocks[3]).toBeUndefined();
  });
});
