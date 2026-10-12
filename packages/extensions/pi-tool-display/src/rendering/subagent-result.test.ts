import {
  CustomMessageComponent,
  initTheme,
  type MessageRenderer
} from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

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
