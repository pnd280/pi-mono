import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import {
  getCapabilities,
  setCapabilityOverrides,
  stripTerminalSequences,
  type TuiMouseEvent
} from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { nativeAdapter } from "../adapters/native/index.ts";
import { createToolDisplayRenderers } from "../rendering/cards.ts";
import { plainTheme, renderingTui } from "../test-fixture.ts";
import { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { TranscriptRows } from "./rows.ts";

it.each([
  { count: 1, expanded: false },
  { count: 2, expanded: false },
  { count: 2, expanded: true }
])(
  "places the bottom control after native images: $count calls, expanded=$expanded",
  ({ count, expanded }) => {
    initTheme("dark", false);
    const images = getCapabilities().images;
    setCapabilityOverrides({ images: "kitty" });
    const coordinator = new TranscriptCoordinator("image-run-controls", {
      cwd: "/tmp",
      mode: "summary",
      animationClock: { start: () => () => {} }
    });
    const children: ToolExecutionComponent[] = [];
    const host = { chatContainer: { children }, ui: renderingTui() };
    const rows = new TranscriptRows(host, coordinator, {
      active: () => true,
      styleAssistant: true,
      chrome: true
    });
    rows.useTheme(plainTheme);

    try {
      for (let index = 0; index < count; index++) {
        const args = { path: `${index}.png` };
        const adapter = nativeAdapter("read")!;
        const call = coordinator.add(
          { messageTimestamp: 1, contentIndex: index, toolCallId: String(index) },
          "read",
          args,
          adapter,
          "historical"
        );
        const definition = createToolDisplayRenderers("read", adapter, {
          binding: { call, coordinator }
        });
        rows.retainDefinition(definition, call);
        const child = new ToolExecutionComponent(
          "read",
          String(index),
          args,
          { showImages: true },
          definition,
          host.ui,
          "/tmp"
        );
        children.push(child);
        const result = {
          content: [
            {
              type: "image" as const,
              mimeType: "image/png",
              data: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAG0lEQVR4nGP4z8BANiJf56jmUc2jmkc1U0UzADHNjoAymaoJAAAAAElFTkSuQmCC"
            }
          ],
          details: undefined
        };
        coordinator.result(call, result, "success");
        child.updateResult({ ...result, isError: false });
      }

      rows.bind();
      const calls = [...coordinator.calls.values()];
      const last = calls.at(-1)!;
      const tail = children.at(-1)!;
      coordinator.expand(last, expanded);

      for (const width of [24, 80]) {
        coordinator.activate(last, "card");
        const rendered = children.map((child) => child.render(width));
        const tailRows = rendered.at(-1)!;
        const footer = tailRows.length - 1;
        const rule = "─".repeat(width);
        expect(
          rendered
            .flat()
            .map(stripTerminalSequences)
            .filter((row) => row === rule)
        ).toHaveLength(2);
        expect(rendered[0]!.slice(0, 3).map(stripTerminalSequences)).toEqual(["", rule, ""]);
        expect(tailRows.slice(-2).map(stripTerminalSequences)).toEqual(["", rule]);
        const image = tailRows.findIndex((row) => row.includes("\x1b_G"));
        expect(image).toBeGreaterThan(0);
        expect(image).toBeLessThan(footer);
        const click: TuiMouseEvent = {
          type: "click",
          button: "left",
          x: 2,
          y: footer,
          screenX: 2,
          screenY: footer,
          width,
          height: tailRows.length,
          shift: false,
          alt: false,
          ctrl: false
        };
        // Native image rows and their spacer must not collapse or toggle cards.
        expect(tail.handleMouse({ ...click, y: image - 1 })).toBeUndefined();
        expect(tail.handleMouse({ ...click, y: image })).toBeUndefined();
        expect(last.expanded).toBe(expanded);
        expect(coordinator.run(last)?.opened).toBe(true);

        // Both padding rows and the moved footer collapse without toggling cards.
        for (const [child, y] of [
          [children[0]!, 2],
          [tail, footer - 1],
          [tail, footer]
        ] as const) {
          // Reopen from the summary line; a click on an opened card toggles its group.
          if (!coordinator.run(last)?.opened) coordinator.activate(last, "card");
          for (const member of children) member.render(width);
          const event = { ...click, y, height: child.render(width).length };
          child.handleMouse({ ...event, button: "right" });
          expect(coordinator.run(last)?.opened).toBe(true);
          expect(child.handleMouse(event)).toMatchObject({ handled: true });
          expect(coordinator.run(last)?.opened).toBe(false);
          expect(calls.every((call) => call.expanded === expanded)).toBe(true);
          expect(children[0]!.render(width).map(stripTerminalSequences)).toEqual([
            "",
            `  Read ${count} ${count === 1 ? "file" : "files"}`
          ]);
          for (const member of children.slice(1)) expect(member.render(width)).toEqual([]);
        }
      }
    } finally {
      rows.dispose();
      coordinator.dispose();
      setCapabilityOverrides({ images });
    }
  }
);
