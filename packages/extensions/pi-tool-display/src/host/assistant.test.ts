import { AssistantMessageComponent, initTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { assistantMessage } from "../test-fixture.ts";
import { bindAssistantPresentation } from "./assistant.ts";

beforeEach(() => initTheme("dark", false));

function lines(component: AssistantMessageComponent, width = 80): string[] {
  return component.render(width).map((row) => stripTerminalSequences(row).trimEnd());
}

it("marks each prose block without marking thinking or diagnostics or changing source", () => {
  const message = {
    ...assistantMessage([
      { type: "thinking", thinking: "Retained thought" },
      { type: "text", text: "First paragraph.\n\nSecond paragraph." },
      { type: "text", text: "Separate block." }
    ]),
    stopReason: "error" as const,
    errorMessage: "Retained error"
  };
  const retained = structuredClone(message);
  const component = new AssistantMessageComponent(message);
  const release = bindAssistantPresentation(component, () => {});

  try {
    expect(release).toBeTypeOf("function");
    expect(lines(component)).toEqual([
      "",
      " Retained thought",
      "",
      "• First paragraph.",
      "",
      "  Second paragraph.",
      "• Separate block.",
      "",
      " Error: Retained error"
    ]);
    component.setHideThinkingBlock(true);
    expect(lines(component).join("\n")).not.toContain("Thinking...");
    expect(lines(component).filter((row) => row.startsWith("• "))).toHaveLength(2);
    expect(message).toEqual(retained);
  } finally {
    release?.();
  }

  expect(lines(component).join("\n")).not.toContain("•");
  expect(lines(component).join("\n")).toContain("Thinking...");
});

it.each([0, 3])("wraps prose with a hanging indent regardless of Pi padding %i", (padding) => {
  const component = new AssistantMessageComponent(
    assistantMessage([{ type: "text", text: "alpha beta gamma delta" }])
  );
  component.setOutputPad(padding);
  const release = bindAssistantPresentation(component, () => {});

  try {
    expect(lines(component, 12)).toEqual(["", "• alpha beta", "  gamma", "  delta"]);

    for (const width of [1, 2, 3, 12, 80]) {
      expect(component.render(width).every((row) => visibleWidth(row) <= width)).toBe(true);
    }

    component.updateContent(
      assistantMessage([
        { type: "text", text: "**界界** alpha\n\n```ts\nconst x = 1;\n```\n\n- item" }
      ])
    );

    for (const width of [8, 24, 80]) {
      const rendered = lines(component, width);
      expect(rendered.filter((row) => row.startsWith("• "))).toHaveLength(1);
      expect(rendered.every((row) => !row || /^[• ] /.test(row))).toBe(true);
      expect(component.render(width).every((row) => visibleWidth(row) <= width)).toBe(true);
    }
  } finally {
    release?.();
  }
});

it("retains Markdown transformers through streaming, invalidation, and removal", () => {
  const transformer = vi.fn((markdown: string) => markdown.replace("source", "shown"));
  const component = new AssistantMessageComponent(undefined, true, undefined, undefined, 1, [
    transformer
  ]);
  const changed = vi.fn();
  const release = bindAssistantPresentation(component, changed);

  try {
    component.updateContent(assistantMessage([{ type: "text", text: "  " }]), true);
    expect(lines(component)).toEqual([]);
    component.updateContent(assistantMessage([{ type: "text", text: "source" }]), true);
    expect(lines(component, 20)).toEqual(["", "• shown"]);
    expect(transformer).toHaveBeenLastCalledWith("source", {
      messageType: "assistant",
      isStreaming: true,
      availableWidth: 18
    });
    component.updateContent(assistantMessage([{ type: "text", text: "source final" }]), false);
    component.invalidate();
    component.setOutputPad(0);
    expect(lines(component, 20)).toEqual(["", "• shown final"]);
    expect(transformer).toHaveBeenLastCalledWith("source final", {
      messageType: "assistant",
      isStreaming: false,
      availableWidth: 18
    });
    // Final-message middleware can remove previously streamed prose entirely.
    component.updateContent(assistantMessage([]), false);
    expect(lines(component)).toEqual([]);
    component.updateContent(assistantMessage([{ type: "text", text: "source final" }]), false);
  } finally {
    release?.();
  }

  expect(lines(component)).toEqual(["", "shown final"]);
});

it("bounds decoration work across unchanged redraws and refreshes width and content", () => {
  const component = new AssistantMessageComponent(
    assistantMessage([{ type: "text", text: "alpha beta gamma delta" }])
  );
  const prose = component.children
    .flatMap((child) => (child instanceof Container ? child.children : []))
    .find((child) => child instanceof Markdown);
  expect(prose).toBeDefined();
  const source = prose!.render(40);
  const first = source[0];
  let reads = 0;
  Object.defineProperty(source, 0, {
    get() {
      reads++;

      return first;
    }
  });
  const release = bindAssistantPresentation(component, () => {});

  try {
    for (let frame = 0; frame < 10; frame++)
      expect(lines(component, 40)).toEqual(["", "• alpha beta gamma delta"]);
    expect(reads).toBeLessThanOrEqual(2);
    expect(lines(component, 12)).toEqual(["", "• alpha beta", "  gamma", "  delta"]);
    component.updateContent(assistantMessage([{ type: "text", text: "replacement" }]), true);
    expect(lines(component, 40)).toEqual(["", "• replacement"]);
    component.invalidate();
    expect(lines(component, 40)).toEqual(["", "• replacement"]);
  } finally {
    release?.();
  }
});

it("preserves later wrappers and makes retained callbacks inert on disposal", () => {
  const message = assistantMessage([{ type: "text", text: "Retained prose" }]);
  const component = new AssistantMessageComponent(message);
  const changed = vi.fn();
  const release = bindAssistantPresentation(component, changed);
  const update = component.updateContent.bind(component);
  const later = vi.fn(update);
  component.updateContent = later;
  release?.();
  changed.mockClear();
  component.updateContent(message, false);
  expect(component.updateContent === later).toBe(true);
  expect(lines(component)).toEqual(["", " Retained prose"]);
  expect(changed).not.toHaveBeenCalled();
  // Unknown update implementations must keep their own presentation.
  expect(bindAssistantPresentation(component, changed)).toBeUndefined();
  expect(lines(component)).toEqual(["", " Retained prose"]);
});
