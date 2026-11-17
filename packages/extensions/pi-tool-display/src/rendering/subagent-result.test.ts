import {
  CustomMessageComponent,
  initTheme,
  type MessageRenderer
} from "@earendil-works/pi-coding-agent";
import { noticeEntry } from "pi-nested-instructions/notices";
import { expect, it } from "vite-plus/test";

import { keybindingHints, plainTheme } from "../test-fixture.ts";
import { createNoticeRenderer } from "./notice.ts";
import { createSubagentResultRenderer } from "./subagent-result.ts";

it("preserves borrowed background messages through expansion and redraw", () => {
  initTheme("dark", false);
  const render = createSubagentResultRenderer(() => {});
  const text = "First line\n\u001b[31mRetained source\nThird\nFourth\nFifth";

  for (const content of [text, [{ type: "text" as const, text }]]) {
    const message = {
      role: "custom",
      customType: "pi-subagents.result",
      content,
      display: true,
      timestamp: 0,
      details: {
        task_id: "task-1",
        binding_id: "binding-1",
        description: "Review source",
        model: "offline/reviewer",
        thinking: "off",
        background: true,
        delivery: "follow_up",
        state: "completed",
        started_at: 0,
        ended_at: 1000,
        activity: "",
        usage: { input: 10, output: 5, cache_read: 0, cache_write: 0, cost: 0 },
        retained: { value: "Unknown producer detail" }
      }
    } satisfies Parameters<MessageRenderer>[0];
    const before = structuredClone(message);
    const component = new CustomMessageComponent(message, render);

    for (const expanded of [false, true, false]) {
      component.setExpanded(expanded);

      for (const width of [80, 10]) {
        component.render(width);
        component.invalidate();
        component.render(width);
      }
    }

    expect(message).toEqual(before);
  }
});

it("preserves borrowed instruction notices through expansion, clicks, and redraw", () => {
  initTheme("dark", false);
  const render = createNoticeRenderer();
  const { customType, content, display, details } = noticeEntry(
    "/repo/src",
    { action: "updated", path: "/repo/src/AGENTS.md", content: "# Rules\n\u001b[31mKeep\n" },
    "/repo"
  );
  const message = { role: "custom" as const, customType, content, display, details, timestamp: 0 };
  const before = structuredClone(message);

  for (const expanded of [false, true, false]) {
    const component = render(message, { expanded, outputPad: 1, ...keybindingHints }, plainTheme);

    for (const width of [80, 10]) {
      component.render(width);
      component.handleMouse({
        type: "click",
        button: "left",
        x: 0,
        y: 0,
        screenX: 0,
        screenY: 0,
        width,
        height: 1,
        shift: false,
        alt: false,
        ctrl: false
      });
      component.invalidate();
      component.render(width);
    }
  }

  expect(message).toEqual(before);
});
