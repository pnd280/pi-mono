import { contentText } from "@earendil-works/pi-ai";
import {
  AssistantMessageComponent,
  BashExecutionComponent,
  BranchSummaryMessageComponent,
  CompactionSummaryMessageComponent,
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createPowerShellToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  CustomMessageComponent,
  ToolExecutionComponent,
  truncateTail,
  UserMessageComponent,
  type ToolRenderers
} from "@earendil-works/pi-coding-agent";
import { Container, Spacer, type Component, type TUI } from "@earendil-works/pi-tui";
import { displayText } from "@pi-mono/libs/tui/terminal-text";

import type {
  ToolOutput,
  Transcript,
  TranscriptItem,
  TranscriptMessage
} from "../history/transcript.ts";

export interface ViewerOptions {
  ui: TUI;
  cwd: string;
  /** Renderers for tools that Pi does not build in, by name. */
  tools: ReadonlyMap<string, ToolRenderers>;
}

type Expandable =
  | ToolExecutionComponent
  | BashExecutionComponent
  | CustomMessageComponent
  | CompactionSummaryMessageComponent
  | BranchSummaryMessageComponent;

type Row =
  | { kind: "message"; component: Component; message: TranscriptMessage; streaming: boolean }
  | {
      kind: "tool";
      component: ToolExecutionComponent;
      name: string;
      args: unknown;
      started: boolean;
      output: ToolOutput | undefined;
      partial: boolean;
    };

function expandable(component: Component): component is Expandable {
  return (
    component instanceof ToolExecutionComponent ||
    component instanceof BashExecutionComponent ||
    component instanceof CustomMessageComponent ||
    component instanceof CompactionSummaryMessageComponent ||
    component instanceof BranchSummaryMessageComponent
  );
}

type Renderers = ConstructorParameters<typeof ToolExecutionComponent>[4];

/** Pi's renderers receive display copies; the recorded arguments and details stay exact. */
function displayValue(value: unknown): unknown {
  if (typeof value === "string") return displayText(value);
  if (Array.isArray(value)) return value.map(displayValue);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [displayText(key), displayValue(item)])
    );

  return value;
}

/** For their renderers only: these tools never run here. */
function builtInRenderers(cwd: string): Map<string, Renderers> {
  return new Map(
    [
      createReadToolDefinition(cwd),
      createBashToolDefinition(cwd),
      createPowerShellToolDefinition(cwd),
      createEditToolDefinition(cwd),
      createWriteToolDefinition(cwd),
      createGrepToolDefinition(cwd),
      createFindToolDefinition(cwd),
      createLsToolDefinition(cwd)
    ].map((definition): [string, Renderers] => [definition.name, definition])
  );
}

/**
 * A child transcript in Pi's chat components. Calls never receive `setArgsComplete`, as in
 * Pi's own history, so renderers do not read the current files. Scrolling, keyboard focus,
 * and mounting belong to the caller.
 */
export class TranscriptViewer extends Container {
  private rows = new Map<string, Row>();
  private expanded = false;
  private renderers: Map<string, Renderers>;
  private unsubscribe: () => void;

  constructor(
    private transcript: Transcript,
    private options: ViewerOptions
  ) {
    super();
    this.renderers = new Map([...builtInRenderers(options.cwd), ...options.tools]);
    this.sync();
    this.unsubscribe = transcript.subscribe(() => {
      this.sync();
      options.ui.requestRender();
    });
  }

  /** Reuse components by item key, so expansion and tool state survive refreshes. */
  private sync(): void {
    const rows = new Map<string, Row>();
    this.clear();

    for (const item of this.transcript.items()) {
      const row = item.kind === "tool" ? this.tool(item) : this.message(item);
      if (!row) continue;
      rows.set(item.key, row);
      // Pi's chat separates these messages from the row above them.
      const role = row.kind === "message" ? row.message.role : "";
      if (
        (role === "user" && this.children.length > 0) ||
        role === "compactionSummary" ||
        role === "branchSummary"
      )
        this.addChild(new Spacer(1));
      this.addChild(row.component);
    }

    this.rows = rows;
  }

  private message(item: Extract<TranscriptItem, { kind: "message" }>): Row | undefined {
    const previous = this.rows.get(item.key);
    const reused = previous?.kind === "message" ? previous : undefined;
    const row = { kind: "message" as const, message: item.message, streaming: item.streaming };

    if (reused) {
      // A streaming message changes in place; saved messages arrive as new objects.
      const same =
        reused.message === item.message
          ? !item.streaming
          : JSON.stringify(reused.message) === JSON.stringify(item.message);
      if (same && reused.streaming === item.streaming)
        return { ...row, component: reused.component };

      if (
        reused.component instanceof AssistantMessageComponent &&
        item.message.role === "assistant"
      ) {
        reused.component.updateContent(item.message, item.streaming);

        return { ...row, component: reused.component };
      }
    }

    const component = messageComponent(item.message, item.streaming, this.options);
    if (!component) return;
    if (expandable(component)) component.setExpanded(this.expanded);

    return { ...row, component };
  }

  private tool(item: Extract<TranscriptItem, { kind: "tool" }>): Row {
    const { call, output, partial, started } = item;
    const previous = this.rows.get(item.key);
    let reused = previous?.kind === "tool" && previous.name === call.name ? previous : undefined;
    let component = reused?.component;

    if (!component) {
      component = new ToolExecutionComponent(
        displayText(call.name),
        call.id,
        displayValue(call.arguments),
        { showImages: false },
        this.renderers.get(call.name),
        this.options.ui,
        this.options.cwd
      );
      component.setExpanded(this.expanded);
      reused = undefined;
    }

    if (reused && reused.args !== call.arguments)
      component.updateArgs(displayValue(call.arguments));
    if (started && !reused?.started) component.markExecutionStarted();
    if (
      output &&
      (reused?.output?.content !== output.content ||
        reused.output.details !== output.details ||
        reused.output.isError !== output.isError ||
        reused.partial !== partial)
    )
      component.updateResult(
        {
          ...output,
          content: output.content.map((block) =>
            block.type === "text" ? { ...block, text: displayText(block.text) } : block
          ),
          details: displayValue(output.details)
        },
        partial
      );

    return {
      kind: "tool",
      component,
      name: call.name,
      args: call.arguments,
      started,
      output,
      partial
    };
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    for (const { component } of this.rows.values())
      if (expandable(component)) component.setExpanded(expanded);
  }

  dispose(): void {
    this.unsubscribe();
    this.rows.clear();
    this.clear();
  }
}

function messageComponent(
  message: TranscriptMessage,
  streaming: boolean,
  { ui }: ViewerOptions
): Component | undefined {
  switch (message.role) {
    case "assistant": {
      const component = new AssistantMessageComponent(undefined, true);
      component.updateContent(message, streaming);

      return component;
    }

    case "bashExecution": {
      const component = new BashExecutionComponent(message.command, ui, message.excludeFromContext);
      if (message.output) component.appendOutput(message.output);
      component.setComplete(
        message.exitCode,
        message.cancelled,
        message.truncated ? { ...truncateTail(message.output), truncated: true } : undefined,
        message.fullOutputPath
      );

      return component;
    }

    case "user": {
      const text = contentText(message.content);

      return text ? new UserMessageComponent(text) : undefined;
    }

    // Pi's default box, without extension renderers.
    case "custom":
      return message.display ? new CustomMessageComponent(message, undefined) : undefined;
    case "compactionSummary":
      return new CompactionSummaryMessageComponent(message);
    case "branchSummary":
      return new BranchSummaryMessageComponent(message);
    default:
      return;
  }
}
