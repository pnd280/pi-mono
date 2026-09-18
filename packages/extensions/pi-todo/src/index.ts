import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIContext
} from "@earendil-works/pi-coding-agent";

import {
  registerTodosCommand,
  TodosCustomViewHost,
  todosArgumentAutocompleteProvider
} from "./commands.ts";
import { loadTodoConfig } from "./config.ts";
import { TodoController } from "./controller.ts";
import { shouldActivate } from "./runtime.ts";
import { TodoOverlay, type TodoOverlayUI } from "./todo-overlay.ts";
import { registerTodoTool } from "./tool.ts";

export type TodoLifecycleContext = Pick<ExtensionContext, "cwd" | "isProjectTrusted" | "mode"> & {
  ui: TodoOverlayUI & Pick<ExtensionUIContext, "addAutocompleteProvider">;
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

export type TodoExtensionAPI = Pick<ExtensionAPI, "registerCommand"> &
  Parameters<typeof registerTodoTool>[0] & {
    on<Event extends keyof TodoEventHandlers>(
      event: Event,
      handler: TodoEventHandlers[Event]
    ): void;
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
  const controller = new TodoController();
  const widget = new TodoOverlay(controller);
  const views = new TodosCustomViewHost(widget);
  registerTodoTool(pi, controller);
  registerTodosCommand(pi, controller, views, widget);
  pi.on("session_start", (_event, ctx) => {
    const config = loadTodoConfig(ctx.cwd, { projectTrusted: ctx.isProjectTrusted() });

    controller.reconstructFromBranch(ctx.sessionManager.getBranch());

    if (ctx.mode === "tui") {
      ctx.ui.addAutocompleteProvider(todosArgumentAutocompleteProvider);
      views.start();
      widget.setUICtx(ctx.ui);
      widget.setCollapsed(config.widgetCollapsed);
    } else {
      views.shutdown();
      widget.dispose();
    }
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
