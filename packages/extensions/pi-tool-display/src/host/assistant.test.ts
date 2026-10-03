import { AssistantMessageComponent, initTheme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
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
