import assert from "node:assert/strict";

import type { TuiMode, TuiMouseEvent } from "@earendil-works/pi-tui";
import { describe, it } from "vite-plus/test";

import { WIDGET_KEY } from "./constants.ts";
import {
  buildTodoWidgetLines,
  TodoOverlay,
  type TodoOverlayUI,
  type TodoWidgetFactory,
  type TodoWidgetTheme,
  type TodoWidgetTui
} from "./todo-overlay.ts";
import type { Task } from "./types.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  strikethrough: (text: string) => `~${text}~`
} satisfies TodoWidgetTheme;

type WidgetCall = {
  key: string;
  content: TodoWidgetFactory | undefined;
  options: { placement?: "aboveEditor" | "belowEditor" } | undefined;
};

/** Controller stand-in whose revision advances whenever the todo snapshot changes. */
function todoSource(initial: readonly Task[] = []) {
  const state = { tasks: initial, revision: 0 };

  return {
    controller: {
      getTodos: () => state.tasks,
      getRevision: () => state.revision
    },
    set(tasks: readonly Task[]) {
      state.tasks = tasks;
      state.revision += 1;
    },
    update(map: (tasks: readonly Task[]) => readonly Task[]) {
      state.tasks = map(state.tasks);
      state.revision += 1;
    }
  };
}

const fullscreenTui: TodoWidgetTui = { mode: "fullscreen", requestRender() {} };

function click(button: TuiMouseEvent["button"] = "left"): TuiMouseEvent {
  return {
    type: "click",
    button,
    x: 0,
    y: 0,
    screenX: 0,
    screenY: 0,
    width: 80,
    height: 1,
    shift: false,
    alt: false,
    ctrl: false,
    clickCount: 1
  };
}

describe("todo overlay", () => {
  it("shows a widget above the editor only while live todos exist", () => {
    const source = todoSource();
    const calls: WidgetCall[] = [];
    const overlay = new TodoOverlay(source.controller);
    overlay.setUICtx(createUi(calls));

    overlay.update();
    assert.equal(calls.length, 0);

    source.set([{ id: 1, subject: "Visible", status: "pending" }]);
    overlay.update();
    const registration = calls.at(-1);
    assert.ok(registration);
    assert.equal(registration.key, WIDGET_KEY);
    assert.deepEqual(registration.options, { placement: "aboveEditor" });
    assert.ok(registration.content);
    assert.match(
      registration
        .content({ mode: "fullscreen", requestRender() {} }, theme)
        .render(80)
        .join("\n"),
      /Visible/u
    );

    source.set([{ id: 1, subject: "Visible", status: "deleted" }]);
    overlay.update();
    assert.equal(calls.at(-1)?.content, undefined);
  });

  it("applies latent collapse state and leaves a disposed widget inactive", () => {
    const source = todoSource();
    const widgetCalls: WidgetCall[] = [];
    const workingMessages: Array<string | undefined> = [];
    const overlay = new TodoOverlay(source.controller);
    overlay.setUICtx(createUi(widgetCalls, workingMessages));

    overlay.setCollapsed(true);
    source.set([{ id: 1, subject: "Visible later", status: "pending" }]);
    overlay.update();
    const factory = widgetCalls.at(-1)?.content;
    assert.ok(factory);
    const component = factory({ mode: "fullscreen", requestRender() {} }, theme);
    assert.doesNotMatch(component.render(80).join("\n"), /Visible later/u);

    overlay.dispose();
    const widgetCallsAtDispose = widgetCalls.length;
    const workingMessagesAtDispose = workingMessages.length;
    overlay.setCollapsed(false);
    overlay.toggleCollapsed();
    assert.equal(widgetCalls.length, widgetCallsAtDispose);
    assert.equal(workingMessages.length, workingMessagesAtDispose);
  });

  it("collapses only in fullscreen mode and follows runtime mode switches", () => {
    const source = todoSource([{ id: 1, subject: "Active", status: "in_progress" }]);
    const workingMessages: Array<string | undefined> = [];
    const calls: WidgetCall[] = [];
    const tui: { mode: TuiMode; requestRender(): void } = {
      mode: "regular",
      requestRender() {}
    };
    const overlay = new TodoOverlay(source.controller);
    overlay.setUICtx(createUi(calls, workingMessages));
    overlay.setCollapsed(true);
    const factory = calls.at(-1)?.content;
    assert.ok(factory);
    const component = factory(tui, theme);

    assert.equal(overlay.canCollapse(), false);
    assert.match(component.render(80).join("\n"), /Active/u);
    assert.equal(workingMessages.at(-1), undefined);

    tui.mode = "fullscreen";
    component.invalidate();
    assert.equal(overlay.canCollapse(), true);
    assert.doesNotMatch(component.render(80).join("\n"), /Active/u);
    assert.equal(workingMessages.at(-1), "Active");

    tui.mode = "regular";
    component.invalidate();
    assert.match(component.render(80).join("\n"), /Active/u);
    assert.equal(workingMessages.at(-1), undefined);
  });

  it("toggles collapse on a primary click in fullscreen mode", () => {
    const source = todoSource([{ id: 1, subject: "Clickable", status: "pending" }]);
    const calls: WidgetCall[] = [];
    const overlay = new TodoOverlay(source.controller);
    overlay.setUICtx(createUi(calls));
    overlay.update();
    const factory = calls.at(-1)?.content;
    assert.ok(factory);
    const component = factory(fullscreenTui, theme);
    const handleMouse = component.handleMouse?.bind(component);
    assert.ok(handleMouse);

    assert.equal(handleMouse(click("right")), undefined);
    assert.match(component.render(80).join("\n"), /Clickable/u);
    assert.deepEqual(handleMouse(click()), { handled: true });
    assert.doesNotMatch(component.render(80).join("\n"), /Clickable/u);
    assert.deepEqual(handleMouse(click()), { handled: true });
    assert.match(component.render(80).join("\n"), /Clickable/u);
  });

  it("updates a widget constructed synchronously by the host", () => {
    const source = todoSource([{ id: 1, subject: "Initial", status: "pending" }]);
    let rendered: string[] = [];
    const overlay = new TodoOverlay(source.controller);
    overlay.setUICtx({
      setWidget(_key, content) {
        if (content === undefined) return;
        const component = content(
          { mode: "fullscreen", requestRender: () => (rendered = component.render(80)) },
          theme
        );
        rendered = component.render(80);
      },
      setActivity() {}
    });

    overlay.update();
    assert.match(rendered.join("\n"), /Initial/u);
    source.set([{ id: 1, subject: "Updated", status: "pending" }]);
    overlay.update();
    assert.match(rendered.join("\n"), /Updated/u);
  });

  it("restores the widget once after suppression and ignores releases after disposal", () => {
    const source = todoSource([{ id: 1, subject: "Visible", status: "pending" }]);
    const calls: WidgetCall[] = [];
    const overlay = new TodoOverlay(source.controller);
    overlay.setUICtx(createUi(calls));
    overlay.update();

    const suppression = overlay.suppress();
    assert.equal(calls.at(-1)?.content, undefined);
    suppression.release();
    const restored = calls.at(-1)?.content;
    assert.ok(restored);
    assert.match(
      restored({ mode: "fullscreen", requestRender() {} }, theme)
        .render(80)
        .join("\n"),
      /Visible/u
    );
    suppression.release();
    assert.equal(calls.at(-1)?.content, restored);

    const staleSuppression = overlay.suppress();
    overlay.dispose();
    const callsAtDispose = calls.length;
    staleSuppression.release();
    assert.equal(calls.length, callsAtDispose);
  });

  it("ignores a late factory from a cleared widget registration", () => {
    const source = todoSource([{ id: 1, subject: "Visible", status: "pending" }]);
    const calls: WidgetCall[] = [];
    const overlay = new TodoOverlay(source.controller);
    overlay.setUICtx(createUi(calls));
    overlay.update();
    const staleFactory = calls[0]?.content;
    assert.ok(staleFactory);

    const suppression = overlay.suppress();
    suppression.release();
    const currentFactory = calls[2]?.content;
    assert.ok(currentFactory);
    let staleRenderRequests = 0;
    staleFactory({ mode: "fullscreen", requestRender: () => (staleRenderRequests += 1) }, theme);
    overlay.update();
    assert.equal(staleRenderRequests, 0);

    let currentRenderRequests = 0;
    currentFactory(
      { mode: "fullscreen", requestRender: () => (currentRenderRequests += 1) },
      theme
    );
    overlay.update();
    assert.equal(currentRenderRequests, 1);
  });

  it("projects hierarchy-first active state into the collapsed working message", () => {
    const source = todoSource([
      { id: 1, subject: "Root", status: "pending" },
      { id: 2, subject: "Flat active", status: "in_progress" },
      {
        id: 3,
        subject: "Nested active",
        status: "in_progress",
        parentId: 1,
        inProgressLabel: "\x1b]0;owned\x07\nWorking\x1b[31m safely"
      },
      { id: 4, subject: "Later active", status: "in_progress" }
    ]);
    const workingMessages: Array<string | undefined> = [];
    const overlay = new TodoOverlay(source.controller);
    overlay.setUICtx(createUi([], workingMessages, fullscreenTui));

    overlay.update();
    assert.deepEqual(workingMessages, [undefined, undefined]);

    overlay.setCollapsed(true);
    assert.deepEqual(workingMessages, [undefined, undefined, "Working safely (+2 more)"]);

    source.update((tasks) =>
      tasks.map((task) =>
        task.id === 3
          ? {
              ...task,
              subject: "Nested\x1b[2J\nsubject",
              inProgressLabel: "\x1b[31m"
            }
          : task
      )
    );
    overlay.update();
    assert.equal(workingMessages.at(-1), "Nested subject (+2 more)");

    source.update((tasks) =>
      tasks.map((task) =>
        task.id === 3 ? { ...task, subject: "\x1b[31m", inProgressLabel: "\x1b]0;owned\x07" } : task
      )
    );
    overlay.update();
    assert.equal(workingMessages.at(-1), undefined);

    source.set([{ id: 1, subject: "Pending", status: "pending" }]);
    overlay.update();
    assert.equal(workingMessages.at(-1), undefined);

    source.set([{ id: 1, subject: "Expanded active", status: "in_progress" }]);
    overlay.setCollapsed(false);
    assert.equal(workingMessages.at(-1), undefined);
  });

  it("keeps working-message activity current while the widget is suppressed", () => {
    const source = todoSource([{ id: 1, subject: "First active", status: "in_progress" }]);
    const widgetCalls: WidgetCall[] = [];
    const workingMessages: Array<string | undefined> = [];
    const overlay = new TodoOverlay(source.controller);
    overlay.setUICtx(createUi(widgetCalls, workingMessages, fullscreenTui));
    overlay.setCollapsed(true);
    assert.equal(workingMessages.at(-1), "First active");

    const suppression = overlay.suppress();
    assert.equal(widgetCalls.at(-1)?.content, undefined);
    source.set([{ id: 1, subject: "Second active", status: "in_progress" }]);
    overlay.update();

    assert.equal(workingMessages.at(-1), "Second active");
    assert.equal(widgetCalls.at(-1)?.content, undefined);

    suppression.release();
    assert.equal(workingMessages.at(-1), "Second active");
    assert.ok(widgetCalls.at(-1)?.content);
  });

  it("sanitizes compact fields before widget styling", () => {
    const styledInputs: string[] = [];
    const recordingTheme = {
      fg: (_color: string, text: string) => {
        styledInputs.push(text);

        return text;
      },
      strikethrough: (text: string) => text
    } satisfies TodoWidgetTheme;

    const lines = buildTodoWidgetLines(
      [
        {
          id: 1,
          subject: "Subject\x1b[31m\nspoof",
          status: "in_progress",
          inProgressLabel: "working\x1b]0;owned\x07\nnow"
        }
      ],
      recordingTheme,
      80
    );

    assert.match(lines.join("\n"), /Todos \(0\/1 completed\)/u);
    assert.match(lines.join("\n"), /Subject spoof \(working now\)/u);
    assert.equal(lines.join("\n").includes("\x1b"), false);

    for (const input of styledInputs) {
      assert.equal(input.includes("\x1b"), false);
      assert.equal(input.includes("\r"), false);
      assert.equal(input.includes("\n"), false);
    }
  });

  it("shows dependency identifiers needed to understand a blocked todo", () => {
    const text = buildTodoWidgetLines(
      [
        { id: 1, subject: "Dependency", status: "pending" },
        { id: 2, subject: "Blocked", status: "pending", blockedBy: [1] }
      ],
      theme,
      80
    ).join("\n");

    assert.match(text, /#1 Dependency/u);
    assert.match(text, /#2 Blocked[^\n]*#1/u);
  });

  it("prioritizes in-progress paths over earlier pending todos on overflow", () => {
    const tasks: Task[] = [
      ...Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        subject: `Pending ${index + 1}`,
        status: "pending" as const
      })),
      { id: 11, subject: "Active ancestor", status: "completed" },
      { id: 12, subject: "In progress", status: "in_progress", parentId: 11 }
    ];

    const text = buildTodoWidgetLines(tasks, theme, 100).join("\n");

    assert.match(text, /Active ancestor[\s\S]*In progress/u);
    assert.doesNotMatch(text, /Pending (9|10)/u);
  });

  it("retains completed ancestors of unfinished todos before unrelated completed branches", () => {
    const tasks: Task[] = [
      ...Array.from({ length: 6 }, (_, index) => ({
        id: index + 1,
        subject: `Unrelated done ${index + 1}`,
        status: "completed" as const
      })),
      { id: 7, subject: "Required done ancestor", status: "completed" },
      { id: 8, subject: "Active child", status: "in_progress", parentId: 7 },
      ...Array.from({ length: 7 }, (_, index) => ({
        id: index + 9,
        subject: `Pending ${index + 1}`,
        status: "pending" as const
      }))
    ];

    const text = buildTodoWidgetLines(tasks, theme, 100).join("\n");

    assert.match(text, /Required done ancestor[\s\S]*Active child/u);
    assert.doesNotMatch(text, /Unrelated done [2-6]/u);
  });

  it("adds only complete active paths when required paths exceed the widget budget", () => {
    const tasks: Task[] = [
      ...Array.from({ length: 8 }, (_, index): Task => {
        const task: Task = {
          id: index + 1,
          subject: index === 7 ? "First active" : `First ancestor ${index + 1}`,
          status: index === 7 ? "in_progress" : "completed"
        };
        if (index > 0) task.parentId = index;

        return task;
      }),
      { id: 9, subject: "Second ancestor", status: "completed" },
      { id: 10, subject: "Second active", status: "pending", parentId: 9 },
      { id: 11, subject: "Third ancestor", status: "completed" },
      { id: 12, subject: "Third active", status: "pending", parentId: 11 }
    ];

    const text = buildTodoWidgetLines(tasks, theme, 100).join("\n");

    assert.match(text, /First ancestor 1[\s\S]*First active/u);
    assert.match(text, /Second ancestor[\s\S]*Second active/u);
    assert.doesNotMatch(text, /Third ancestor|Third active/u);
  });
});

/** Records registrations; with a TUI, constructs the widget synchronously like Pi does. */
function createUi(
  calls: WidgetCall[],
  workingMessages: Array<string | undefined> = [],
  tui?: TodoWidgetTui
): TodoOverlayUI {
  return {
    setWidget(key, content, options) {
      calls.push({ key, content, options });
      if (tui && content) content(tui, theme);
    },
    setActivity(message) {
      workingMessages.push(message);
    }
  };
}
