import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { registerWorkingMessage, type WorkingMessageContext } from "@pi-mono/libs/working-message";

import {
  getTodosArgumentCompletions,
  runTodosCommand,
  TodosCustomViewHost,
  todosArgumentAutocompleteProvider
} from "./commands.ts";
import { loadTodoConfig } from "./config.ts";
import { shouldActivate } from "./runtime.ts";
import { TodoController } from "./state/controller.ts";
import { createTodoTool } from "./tool.ts";
import { TodoWidget, type TodoWidgetUI } from "./ui/todo-widget.ts";

/** The shared working-message coordinator also handles these events, so extend its context. */
export type TodoLifecycleContext = WorkingMessageContext & {
  ui: Omit<TodoWidgetUI, "setActivity"> & Pick<ExtensionUIContext, "addAutocompleteProvider">;
  sessionManager: { getBranch(): readonly object[] };
};

type TodoEventHandlers = {
  session_start: (event: object, ctx: TodoLifecycleContext) => void;
  session_compact: (event: object, ctx: TodoLifecycleContext) => void;
  session_tree: (event: object, ctx: TodoLifecycleContext) => void;
  session_shutdown: (event: object, ctx: TodoLifecycleContext) => void;
  tool_execution_end: (
    event: { toolName: string; isError: boolean },
    ctx: TodoLifecycleContext
  ) => void;
};

export type TodoExtensionAPI = Pick<ExtensionAPI, "events"> & {
  registerTool(definition: ReturnType<typeof createTodoTool>): void;
  registerCommand(
    name: string,
    definition: Omit<Parameters<ExtensionAPI["registerCommand"]>[1], "handler"> & {
      handler(args: string, ctx: Parameters<typeof runTodosCommand>[1]): Promise<void>;
    }
  ): void;
  on<Event extends keyof TodoEventHandlers>(event: Event, handler: TodoEventHandlers[Event]): void;
};

export default function piTodo(pi: TodoExtensionAPI): void {
  if (
    !shouldActivate({
      argv: process.argv,
      stdinIsTTY: process.stdin.isTTY,
      stdoutIsTTY: process.stdout.isTTY,
      title: process.title
    })
  )
    return;
  const activity = registerWorkingMessage(pi, {
    id: "pi-todo.activity",
    label: "Activity",
    contributor: "pi-todo"
  });
  const controller = new TodoController();
  const widget = new TodoWidget(controller);
  const views = new TodosCustomViewHost(widget);
  pi.registerTool(createTodoTool(controller));
  pi.registerCommand("todos", {
    description: "Review todos or control the above-editor todo widget",
    getArgumentCompletions: getTodosArgumentCompletions,
    handler: (args, ctx) =>
      runTodosCommand(args, ctx, controller, { customViewHost: views, widgetStateHost: widget })
  });
  pi.on("session_start", (_event, ctx) => {
    const config = loadTodoConfig(ctx.cwd, { projectTrusted: ctx.isProjectTrusted() });

    controller.reconstructFromBranch(ctx.sessionManager.getBranch());
    ctx.ui.addAutocompleteProvider(todosArgumentAutocompleteProvider);
    views.start();
    widget.setUICtx({
      setWidget: (key, content, options) => ctx.ui.setWidget(key, content, options),
      setActivity: (text) => activity.setText(text)
    });
    widget.setCollapsed(config.collapseWidgetByDefault);
  });
  pi.on("session_compact", (_event, ctx) => {
    controller.reconstructFromBranch(ctx.sessionManager.getBranch());
    widget.update();
  });
  pi.on("session_tree", (_event, ctx) => {
    controller.reconstructFromBranch(ctx.sessionManager.getBranch());
    widget.update();
  });
  pi.on("session_shutdown", () => {
    views.shutdown();
    widget.dispose();
  });
  pi.on("tool_execution_end", (event) => {
    if (event.toolName === "todo" && !event.isError) widget.update();
  });
}
