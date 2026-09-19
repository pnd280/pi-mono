import assert from "node:assert/strict";

import { describe, it } from "vite-plus/test";

import { MAX_WIDGET_LINES, WIDGET_KEY } from "./constants.ts";
import {
  buildTodoWidgetLines,
  TodoOverlay,
  type TodoOverlayUI,
  type TodoWidgetFactory,
  type TodoWidgetTheme
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

/** Controller stand-in whose revision advances whenever the task snapshot changes. */
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

describe("todo overlay", () => {
  it("registers above-editor widget only when non-deleted tasks exist", () => {
    const source = todoSource();
    const setWidgetCalls: WidgetCall[] = [];
    const overlay = new TodoOverlay(source.controller);
    overlay.setUICtx(createUi(setWidgetCalls));

    overlay.update();
    assert.equal(setWidgetCalls.length, 0);

    source.set([{ id: 1, subject: "Visible", status: "pending" }]);
    overlay.update();
    assert.equal(setWidgetCalls.length, 1);
    const firstCall = setWidgetCalls[0];
    assert.ok(firstCall);
    assert.equal(firstCall.key, WIDGET_KEY);
    assert.deepEqual(firstCall.options, { placement: "aboveEditor" });

    let renderRequests = 0;
    const factory = firstCall.content;
    assert.ok(factory);
    const component = factory({ requestRender: () => (renderRequests += 1) }, theme);
    const renderedWidget = component.render(80).join("\n");
    assert.match(renderedWidget, /Tasks \(0\/1 completed\)/u);
    assert.match(renderedWidget, /Visible/u);

    overlay.update();
    assert.equal(renderRequests, 1);

    source.set([]);
    overlay.update();
    const clearCall = setWidgetCalls[1];
    assert.ok(clearCall);
    assert.equal(clearCall.key, WIDGET_KEY);
    assert.equal(clearCall.content, undefined);
  });

  it("keeps collapse state latent, refreshes idempotently, and stays disposed", () => {
    const source = todoSource();
    const widgetCalls: WidgetCall[] = [];
    const workingMessages: Array<string | undefined> = [];
    const overlay = new TodoOverlay(source.controller);
    overlay.setUICtx(createUi(widgetCalls, workingMessages));

    assert.equal(overlay.setCollapsed(true), true);
    assert.equal(overlay.setCollapsed(true), true);
    assert.equal(widgetCalls.length, 0);

    source.set([{ id: 1, subject: "Visible later", status: "pending" }]);
    overlay.update();
    const factory = widgetCalls[0]?.content;
    assert.ok(factory);
    let renderRequests = 0;
    const component = factory({ requestRender: () => (renderRequests += 1) }, theme);
    assert.equal(component.render(80).length, 1);

    assert.equal(overlay.setCollapsed(true), true);
    assert.equal(renderRequests, 1);
    assert.equal(overlay.toggleCollapsed(), false);
    assert.equal(renderRequests, 2);
    assert.equal(component.render(80).length, 2);
    assert.equal(overlay.toggleCollapsed(), true);
    assert.equal(renderRequests, 3);
    assert.equal(component.render(80).length, 1);

    overlay.dispose();
    const widgetCallsAtDispose = widgetCalls.length;
    const workingMessagesAtDispose = workingMessages.length;
    assert.equal(overlay.setCollapsed(false), false);
    assert.equal(overlay.toggleCollapsed(), true);
    assert.equal(widgetCalls.length, widgetCallsAtDispose);
    assert.equal(workingMessages.length, workingMessagesAtDispose);
  });

  it("captures synchronously constructed widgets so later updates render", () => {
    const source = todoSource([{ id: 1, subject: "Initial", status: "pending" }]);
    let renderRequests = 0;
    const overlay = new TodoOverlay(source.controller);
    overlay.setUICtx({
      setWidget(_key, content) {
        if (content === undefined) return;
        content({ requestRender: () => (renderRequests += 1) }, theme);
      },
      setActivity() {}
    });

    overlay.update();
    source.set([{ id: 1, subject: "Updated", status: "pending" }]);
    overlay.update();

    assert.equal(renderRequests, 1);
  });

  it("reuses the presentation snapshot and rendered lines until the revision changes", () => {
    const tasks: Task[] = [{ id: 1, subject: "Cached", status: "pending" }];
    let revision = 0;
    let reads = 0;
    const setWidgetCalls: WidgetCall[] = [];
    const overlay = new TodoOverlay({
      getTodos: () => {
        reads += 1;

        return tasks;
      },
      getRevision: () => revision
    });
    overlay.setUICtx(createUi(setWidgetCalls));
    overlay.update();
    overlay.update();
    assert.equal(reads, 1);

    const factory = setWidgetCalls[0]?.content;
    assert.ok(factory);
    const component = factory({ requestRender() {} }, theme);
    const firstRender = component.render(80);
    assert.equal(component.render(80), firstRender);
    assert.equal(reads, 1);

    component.invalidate();
    assert.notEqual(component.render(80), firstRender);

    revision += 1;
    overlay.update();
    assert.equal(reads, 2);
    assert.notEqual(component.render(80), firstRender);
  });

  it("keeps invalidation visual-only and suppression ownership idempotent", () => {
    const source = todoSource([{ id: 1, subject: "Visible", status: "pending" }]);
    const calls: WidgetCall[] = [];
    const overlay = new TodoOverlay(source.controller);
    overlay.setUICtx(createUi(calls));
    overlay.update();
    const factory = calls[0]?.content;
    assert.ok(factory);
    const component = factory({ requestRender() {} }, theme);

    component.invalidate();
    assert.equal(calls.length, 1);

    const suppression = overlay.suppress();
    assert.equal(calls.length, 2);
    assert.equal(calls[1]?.content, undefined);
    suppression.release();
    suppression.release();
    assert.equal(calls.length, 3);
    assert.ok(calls[2]?.content);

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
    staleFactory({ requestRender: () => (staleRenderRequests += 1) }, theme);
    overlay.update();
    assert.equal(staleRenderRequests, 0);

    let currentRenderRequests = 0;
    currentFactory({ requestRender: () => (currentRenderRequests += 1) }, theme);
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
    overlay.setUICtx(createUi([], workingMessages));

    overlay.update();
    assert.deepEqual(workingMessages, [undefined]);

    overlay.setCollapsed(true);
    assert.deepEqual(workingMessages, [undefined, "Working safely (+2 more)"]);

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

  it("keeps working-message synchronization active while the widget is suppressed", () => {
    const source = todoSource([{ id: 1, subject: "First active", status: "in_progress" }]);
    const widgetCalls: WidgetCall[] = [];
    const workingMessages: Array<string | undefined> = [];
    const overlay = new TodoOverlay(source.controller);
    overlay.setUICtx(createUi(widgetCalls, workingMessages));
    overlay.setCollapsed(true);

    const suppression = overlay.suppress();
    assert.equal(widgetCalls.at(-1)?.content, undefined);
    source.set([{ id: 1, subject: "Second active", status: "in_progress" }]);
    overlay.update();

    assert.deepEqual(workingMessages, ["First active", "Second active"]);
    assert.equal(widgetCalls.length, 2);

    suppression.release();
    assert.deepEqual(workingMessages, ["First active", "Second active", "Second active"]);
    const restoredFactory = widgetCalls.at(-1)?.content;
    assert.ok(restoredFactory);
    assert.equal(restoredFactory({ requestRender() {} }, theme).render(80).length, 1);
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

    assert.match(lines.join("\n"), /Tasks \(0\/1 completed\)/u);
    assert.match(lines.join("\n"), /Subject spoof \(working now\)/u);
    assert.equal(lines.join("\n").includes("\x1b"), false);

    for (const input of styledInputs) {
      assert.equal(input.includes("\x1b"), false);
      assert.equal(input.includes("\r"), false);
      assert.equal(input.includes("\n"), false);
    }
  });

  it("renders only the existing heading when collapsed", () => {
    const tasks: Task[] = [
      { id: 1, subject: "Pending", status: "pending" },
      { id: 2, subject: "Done", status: "completed" }
    ];
    const expanded = buildTodoWidgetLines(tasks, theme, 80);
    const collapsed = buildTodoWidgetLines(tasks, theme, 80, { collapsed: true });

    assert.equal(expanded.length, 3);
    assert.deepEqual(collapsed, [expanded[0]]);
    assert.deepEqual(
      buildTodoWidgetLines([{ id: 1, subject: "Deleted", status: "deleted" }], theme, 80, {
        collapsed: true
      }),
      []
    );
  });

  it("shows ids only when hierarchy or dependency context exists", () => {
    const flat = buildTodoWidgetLines(
      [{ id: 1, subject: "Flat", status: "pending" }],
      theme,
      80
    ).join("\n");
    assert.match(flat, /Flat/u);
    assert.doesNotMatch(flat, /#1/u);

    const hierarchy = buildTodoWidgetLines(
      [
        { id: 1, subject: "Root", status: "pending" },
        { id: 2, subject: "Child", status: "pending", parentId: 1 }
      ],
      theme,
      80
    ).join("\n");
    assert.match(hierarchy, /#1 Root[\s\S]*#2 Child/u);

    const dependency = buildTodoWidgetLines(
      [
        { id: 1, subject: "Dependency", status: "pending" },
        { id: 2, subject: "Blocked", status: "pending", blockedBy: [1] }
      ],
      theme,
      80
    ).join("\n");
    assert.match(dependency, /#1 Dependency[\s\S]*#2 Blocked ⊣ #1/u);
    assert.doesNotMatch(dependency, /blockedBy/u);
  });

  it("renders sibling-aware branches and ancestor guides, including before overflow", () => {
    const lines = buildTodoWidgetLines(
      [
        { id: 1, subject: "Root one", status: "pending" },
        { id: 7, subject: "Root two", status: "pending" },
        { id: 2, subject: "First child", status: "pending", parentId: 1 },
        { id: 5, subject: "Second child", status: "pending", parentId: 1 },
        { id: 3, subject: "First grandchild", status: "pending", parentId: 2 },
        { id: 4, subject: "Second grandchild", status: "pending", parentId: 2 },
        { id: 6, subject: "Nested under last child", status: "pending", parentId: 5 }
      ],
      theme,
      100
    );

    assert.deepEqual(lines.slice(1), [
      "├─ ◦ #1 Root one",
      "│  ├─ ◦ #2 First child",
      "│  │  ├─ ◦ #3 First grandchild",
      "│  │  └─ ◦ #4 Second grandchild",
      "│  └─ ◦ #5 Second child",
      "│     └─ ◦ #6 Nested under last child",
      "└─ ◦ #7 Root two"
    ]);

    const overflowLines = buildTodoWidgetLines(
      [
        { id: 1, subject: "Overflow root", status: "pending" },
        ...Array.from({ length: 11 }, (_, index) => ({
          id: index + 2,
          subject: `Overflow child ${index + 1}`,
          status: "pending" as const,
          parentId: 1
        }))
      ],
      theme,
      100
    );
    assert.equal(overflowLines.length, MAX_WIDGET_LINES);
    assert.match(overflowLines[1] ?? "", /^├─ .*#1 Overflow root/u);
    assert.match(overflowLines.at(-2) ?? "", /^│  └─ .*#10 Overflow child 9/u);
    assert.match(overflowLines.at(-1) ?? "", /^└─ \+2 more \(2 active\)$/u);
  });

  it("prioritizes in-progress paths over earlier pending Tasks on overflow", () => {
    const tasks: Task[] = [
      ...Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        subject: `Pending ${index + 1}`,
        status: "pending" as const
      })),
      { id: 11, subject: "Active ancestor", status: "completed" },
      { id: 12, subject: "In progress", status: "in_progress", parentId: 11 }
    ];

    const lines = buildTodoWidgetLines(tasks, theme, 100);
    const text = lines.join("\n");

    assert.equal(lines.length, MAX_WIDGET_LINES);
    assert.match(text, /Pending 8[\s\S]*Active ancestor[\s\S]*In progress/u);
    assert.doesNotMatch(text, /Pending (9|10)/u);
    assert.match(text, /\+2 more \(2 active\)/u);
  });

  it("retains completed ancestors of unfinished Tasks before unrelated completed branches", () => {
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

    const lines = buildTodoWidgetLines(tasks, theme, 100);
    const text = lines.join("\n");

    assert.equal(lines.length, MAX_WIDGET_LINES);
    assert.match(text, /Required done ancestor[\s\S]*Active child/u);
    assert.match(text, /Unrelated done 1/u);
    assert.doesNotMatch(text, /Unrelated done [2-6]/u);
    assert.match(text, /\+5 more \(5 completed\)/u);
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

    const lines = buildTodoWidgetLines(tasks, theme, 100);
    const text = lines.join("\n");

    assert.equal(lines.length, MAX_WIDGET_LINES);
    assert.match(text, /First ancestor 1[\s\S]*First active/u);
    assert.match(text, /Second ancestor[\s\S]*Second active/u);
    assert.doesNotMatch(text, /Third ancestor|Third active/u);
    assert.match(text, /\+2 more \(1 completed, 1 active\)/u);
  });

  it("fails closed instead of rendering an orphan from malformed state", () => {
    assert.deepEqual(
      buildTodoWidgetLines(
        [{ id: 2, subject: "Orphan", status: "pending", parentId: 99 }],
        theme,
        80
      ),
      []
    );
  });
});

function createUi(
  calls: WidgetCall[],
  workingMessages: Array<string | undefined> = []
): TodoOverlayUI {
  return {
    setWidget(key, content, options) {
      calls.push({ key, content, options });
    },
    setActivity(message) {
      workingMessages.push(message);
    }
  };
}
