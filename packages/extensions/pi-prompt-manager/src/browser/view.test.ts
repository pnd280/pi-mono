import {
  KeybindingsManager,
  TUI_KEYBINDINGS,
  visibleWidth,
  type KeyId
} from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import type { StoredEntry } from "../model.ts";
import { collection, entry } from "../test-fixture.ts";
import { BrowserController } from "./controller.ts";
import { BrowserView } from "./view.ts";

function viewFixture(
  text: string | (string | StoredEntry)[] = "abcdef",
  keys = new KeybindingsManager(TUI_KEYBINDINGS)
) {
  const close = vi.fn();
  const controller = new BrowserController(
    {
      read: async () =>
        collection(
          (typeof text === "string" ? [text] : text).map((value) =>
            typeof value === "string" ? entry(value) : value
          )
        ),
      copy: async () => {},
      restore: () => true,
      restoreAndRemove: async () => true,
      remove: async () => ({ status: "failed", message: "busy" }),
      close,
      changed() {},
      now: Date.now
    },
    { collection: "drafts", initialEditor: "" }
  );
  const tui = { terminal: { rows: 10 }, requestRender() {} };
  const fg = vi.fn((_color: string, value: string) => value);
  const view = new BrowserView(controller, tui, { fg, bold: (value) => value }, keys);

  return { controller, tui, view, close, fg };
}

it("keeps search cursor navigation and insertion in the middle of text", async () => {
  const { controller, view } = viewFixture();

  try {
    await controller.activate();
    view.render(40);
    view.handleInput("abc");
    view.handleInput("\x1b[D");
    view.handleInput("X");
    expect(controller.query).toBe("abXc");
  } finally {
    controller.close();
  }
});

it.each<{ name: string | undefined; down: KeyId | KeyId[]; input: string | undefined }>([
  { name: "Tab", down: "down", input: "\t" },
  { name: "Shift+Tab", down: "tab", input: "\x1b[Z" },
  { name: undefined, down: ["tab", "shift+tab"], input: undefined }
])(
  "shows model-style collection tabs with only the usable $name switching hint",
  async ({ name, down, input }) => {
    const { controller, view, tui, fg } = viewFixture(
      ["alpha", "beta"],
      new KeybindingsManager(TUI_KEYBINDINGS, { "tui.select.down": down })
    );

    try {
      tui.terminal.rows = 24;
      await controller.activate();
      const lines = view.render(80);
      expect(lines.join("\n")).toContain("View: history | drafts");
      expect(fg).toHaveBeenCalledWith("accent", "drafts");
      expect(fg).toHaveBeenCalledWith("muted", "history");
      if (name) expect(lines.join("\n")).toContain(`${name} view (history/drafts)`);
      else expect(lines.join("\n")).not.toContain(" view");
      expect(lines.length).toBeLessThanOrEqual(15);

      view.handleInput("beta");
      await vi.waitFor(() => expect(controller.searching).toBe(false));

      if (input) {
        view.handleInput(input);
        await vi.waitFor(() => {
          expect(controller.status).toBe("ready");
          expect(controller.searching).toBe(false);
        });
        fg.mockClear();
        view.render(80);
        expect(controller.collection).toBe("history");
        expect(controller.query).toBe("");
        expect(fg).toHaveBeenCalledWith("accent", "history");
        expect(fg).toHaveBeenCalledWith("muted", "drafts");
        view.handleInput(input);
        await vi.waitFor(() => {
          expect(controller.status).toBe("ready");
          expect(controller.searching).toBe(false);
        });
      } else {
        view.handleInput("\t");
        view.handleInput("\x1b[Z");
      }

      tui.terminal.rows = 10;
      const compact = view.render(40);
      expect(controller.collection).toBe("drafts");
      expect(controller.query).toBe("beta");
      expect(compact[0]).toContain("history | drafts");
      expect(compact.find((line) => line.startsWith("→ "))).toContain("beta");
      if (name) expect(compact.join("\n")).toContain(`${name} view`);
      else expect(compact.join("\n")).not.toContain(" view");
      expect(compact.length).toBeLessThanOrEqual(7);
      expect(compact.every((line) => visibleWidth(line) <= 40)).toBe(true);
    } finally {
      controller.close();
    }
  }
);

it("expands unnumbered prompt rows with aligned leading ages across resize and time changes", async () => {
  const text = "界a".repeat(35) + " END";
  const now = Date.UTC(2026, 0, 2);
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  const { controller, view, tui } = viewFixture([
    entry(text, { recordedAt: new Date(now - 5 * 3600000).toISOString() }),
    entry("short row", { recordedAt: new Date(now - 30 * 60000).toISOString() }),
    entry("future row", { recordedAt: new Date(now + 5 * 3600000).toISOString() }),
    entry("unknown row", { recordedAt: null })
  ]);

  try {
    tui.terminal.rows = 48;
    await controller.activate();

    for (const width of [80, 150, 80, 150, 40]) {
      const lines = view.render(width);
      const prefix = /^(?:→ | {2})(?:5h|30m|\+5h|Unknown time)\s{2,}/u;
      const rows = lines.filter((line) => prefix.test(line));
      expect(rows).toHaveLength(4);
      expect(rows[0]).toMatch(/^→ 5h\s{2,}/u);
      expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
      expect(lines.some((line) => /^(?:→ | {2})\d+\. /u.test(line))).toBe(false);
      if (width === 150) {
        expect(rows[0]).toContain(text);
        expect(lines.filter((line) => line.includes(text))).toHaveLength(1);
      } else expect(rows[0]).not.toContain("END");
      expect(new Set(rows.map((row) => prefix.exec(row)![0].length)).size).toBe(1);
    }

    clock.mockReturnValue(now + 3600000);
    expect(view.render(150).find((line) => line.startsWith("→ "))).toMatch(/^→ 6h\s{2,}/u);
    await controller.activate("history");
    const selected = view.render(150).find((line) => line.startsWith("→ "));
    expect(selected).toMatch(/^→ 6h\s{2,}/u);
    expect(selected).toContain(text);
  } finally {
    controller.close();
    clock.mockRestore();
  }
});

it("keeps list capacity and footer position stable when selecting long or multiline prompts", async () => {
  const { controller, view, tui } = viewFixture(
    Array.from({ length: 30 }, (_, index) =>
      index % 3 === 0
        ? `entry-${index} short`
        : index % 3 === 1
          ? `entry-${index} ${"long prompt ".repeat(100)}`
          : `entry-${index} multiline\nsecond line\nthird line`
    )
  );
  const rowCount = (lines: string[]) =>
    lines.filter((line) => /\b(?:now|\d+[a-z]+)\s+entry-\d+/u.test(line)).length;

  try {
    await controller.activate();

    for (const [width, height] of [
      [80, 32],
      [140, 40],
      [40, 10]
    ] as const) {
      tui.terminal.rows = height;
      controller.action("pageUp", 1000);
      const baseline = view.render(width);

      for (let index = 1; index <= 3; index++) {
        controller.action("down");
        const lines = view.render(width);
        expect(lines.find((line) => line.startsWith("→ "))).toContain(`entry-${index}`);
        expect(lines).toHaveLength(baseline.length);
        expect(rowCount(lines)).toBe(rowCount(baseline));
        expect(lines.findIndex((line) => line.includes("Enter restore"))).toBe(
          baseline.findIndex((line) => line.includes("Enter restore"))
        );
        expect(lines.some((line) => /^  entry-\d+/u.test(line))).toBe(false);
      }
    }
  } finally {
    controller.close();
  }
});

it("flows action hints together and wraps only when the next hint cannot fit", async () => {
  const { controller, view, tui } = viewFixture("draft");

  try {
    tui.terminal.rows = 48;

    for (const collection of ["history", "drafts"] as const) {
      await controller.activate(collection);

      for (const width of [160, 100, 60, 40, 160]) {
        const hints = [
          "Enter restore",
          "Ctrl+C copy",
          "Esc close",
          "Ctrl+P preview",
          "Del×2 remove",
          ...(collection === "drafts" ? ["Alt+Enter restore/remove"] : [])
        ];
        const lines = view.render(width);
        const footer = lines.filter((line) => hints.some((hint) => line.includes(hint)));
        for (const hint of hints) expect(footer.join("\n")).toContain(hint);
        expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
        if (width === 160) expect(footer).toHaveLength(1);
        if (width === 100) expect(footer[0]).toContain("Ctrl+P preview");
      }

      controller.action("preview");
      const preview = view.render(160);
      const footer = preview.filter((line) => /restore|copy|remove/u.test(line));
      expect(footer).toHaveLength(1);
      expect(footer[0]).toContain("Esc back");
    }
  } finally {
    controller.close();
  }
});

it("retains essential hints and results at 40×10, sanitizes source, and cancels below minimum", async () => {
  const { controller, view, tui, close } = viewFixture("\x1b[31mvisible\x1b[0m\x07");
  await controller.activate();
  const lines = view.render(40);
  expect(lines.length).toBeLessThanOrEqual(7); // Overlay: floor(10 × 0.75).
  expect(lines.every((line) => visibleWidth(line) <= 40)).toBe(true);
  const rendered = lines.join("\n");
  expect(rendered).toContain("> ");
  expect(lines.find((line) => line.startsWith("→ "))).toContain("visible");
  expect(rendered).not.toContain("\x07");
  expect(rendered).not.toContain("\x1b[31m");
  expect(rendered).toContain("Ctrl+P preview");
  expect(rendered).toContain("Alt+Enter restore/remove");
  expect(rendered).toContain("Del×2 remove");
  controller.action("delete");
  tui.terminal.rows = 9;
  expect(view.render(39).join()).toContain("Resize");
  expect(controller.armed).toBeUndefined();
  view.handleInput("\x1b");
  expect(close).toHaveBeenCalledTimes(1);
});

it("bounds a scrollable preview on resize, including the overlay threshold", async () => {
  const { controller, view, tui } = viewFixture("line\n".repeat(100));

  try {
    await controller.activate();
    controller.action("preview");

    for (const [rows, maximum] of [
      [24, 15],
      [19, 12],
      [18, 13],
      [10, 7],
      [2, 1]
    ] as const) {
      tui.terminal.rows = rows;
      await vi.waitFor(() => {
        const lines = view.render(80);
        expect(lines.join()).not.toContain("Preparing full preview");
        expect(lines.length).toBeLessThanOrEqual(maximum);
      });
    }
  } finally {
    controller.close();
  }
});

it("uses the list position counter without preview-style border indicators", async () => {
  const { controller, view, tui } = viewFixture(
    Array.from({ length: 30 }, (_, index) => `row-${index + 1}`)
  );

  try {
    await controller.activate();

    for (const [width, height, maximum] of [
      [80, 24, 15],
      [40, 10, 7]
    ] as const) {
      tui.terminal.rows = height;
      controller.action("pageUp", 1000);

      for (const movement of [0, 15, 1000]) {
        controller.action("pageDown", movement);
        const lines = view.render(width);
        const numbers = lines.flatMap((line) => {
          const match = /\brow-(\d+)$/u.exec(line);

          return match ? [Number(match[1])] : [];
        });
        expect(numbers.length).toBeGreaterThan(0);
        expect(numbers).toContain(controller.selectedIndex + 1);
        expect(lines.length).toBeLessThanOrEqual(maximum);
        expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
        expect(lines[0]).not.toContain(" more ");
        expect(lines.at(-1)).not.toContain(" more ");
        if (width === 80)
          expect(lines.join("\n")).toContain(`(${controller.selectedIndex + 1}/30)`);
      }
    }

    controller.action("delete");
    const confirmation = view.render(40)[0];
    expect(confirmation).toContain("Delete again");
    expect(confirmation).not.toContain(" more ");

    tui.terminal.rows = 24;

    for (const query of ["row-30", "no-match-token"]) {
      controller.setQuery(query);
      await vi.waitFor(() => expect(controller.searching).toBe(false));
      const lines = view.render(80);
      expect(lines[0]).not.toContain(" more ");
      expect(lines.at(-1)).not.toContain(" more ");
      expect(lines.join("\n")).not.toMatch(/\(\d+\/\d+\)/u);
    }
  } finally {
    controller.close();
  }
});

it("counts wrapped preview rows and clears overflow while preparing or after everything fits", async () => {
  const { controller, view, tui } = viewFixture(
    Array.from({ length: 20 }, () => "界".repeat(20)).join("\n")
  );

  try {
    await controller.activate();
    controller.action("preview");

    for (const [width, height, total, maximum] of [
      [80, 24, 20, 15],
      [40, 10, 40, 7]
    ] as const) {
      tui.terminal.rows = height;
      const preparing = view.render(width);
      expect(preparing.join("\n")).toContain("Preparing full preview");
      expect(preparing[0]).not.toContain(" more ");
      expect(preparing.at(-1)).not.toContain(" more ");
      await vi.waitFor(() =>
        expect(view.render(width).join("\n")).not.toContain("Preparing full preview")
      );
      controller.action("pageUp", 1000);

      for (const movement of [0, 5, 1000]) {
        controller.action("pageDown", movement);
        const lines = view.render(width);
        const visible = lines.filter((line) => line.includes("界")).length;
        expect(visible).toBeGreaterThan(0);
        expect(lines.length).toBeLessThanOrEqual(maximum);
        expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
        const below = total - controller.previewScroll - visible;
        if (controller.previewScroll)
          expect(lines[0]).toContain(`↑ ${controller.previewScroll} more`);
        else expect(lines[0]).not.toContain(" more ");
        if (below) expect(lines.at(-1)).toContain(`↓ ${below} more`);
        else expect(lines.at(-1)).not.toContain(" more ");
      }
    }

    tui.terminal.rows = 80;
    await vi.waitFor(() => {
      const lines = view.render(80);
      expect(lines.filter((line) => line.includes("界"))).toHaveLength(20);
      expect(lines[0]).not.toContain(" more ");
      expect(lines.at(-1)).not.toContain(" more ");
      expect(controller.previewScroll).toBe(0);
    });
  } finally {
    controller.close();
  }
});

it("renders literal-plus shortcut hints without breaking cancellation", async () => {
  const { controller, view } = viewFixture(
    "draft",
    new KeybindingsManager(TUI_KEYBINDINGS, {
      "tui.input.copy": "+"
    })
  );

  try {
    await controller.activate();
    expect(view.render(40).join("\n")).toContain("+ copy");
    view.handleInput("\x1b");
    expect(controller.closed).toBe(true);
  } finally {
    controller.close();
  }
});

it("lays out the complete long preview asynchronously and scrolls to its tail", async () => {
  const { controller, view } = viewFixture("begin\n" + "x".repeat(300000) + "\nEND MARKER");

  try {
    await controller.activate();
    view.render(40);
    view.handleInput("\x10");
    expect(view.render(40).join()).toContain("Preparing full preview");
    await vi.waitFor(() => expect(view.render(40).join()).not.toContain("Preparing full preview"));
    controller.action("pageDown", 100000);
    expect(view.render(40).join()).toContain("END MARKER");
    view.handleInput("\x1b");
    expect(controller.preview).toBe(false);
    expect(controller.closed).toBe(false);
    const list = view.render(40);
    expect(list[0]).not.toContain(" more ");
    expect(list.at(-1)).not.toContain(" more ");
  } finally {
    controller.close();
  }
});
