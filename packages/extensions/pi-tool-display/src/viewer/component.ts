import { contentText, type AssistantMessage } from "@earendil-works/pi-ai";
import {
  AssistantMessageComponent,
  BashExecutionComponent,
  BranchSummaryMessageComponent,
  CompactionSummaryMessageComponent,
  CustomMessageComponent,
  ToolExecutionComponent,
  UserMessageComponent,
  truncateTail,
  type MessageRenderer,
  type ToolRenderers
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  Spacer,
  visibleWidth,
  type Component,
  type TUI,
  type TuiMouseEvent
} from "@earendil-works/pi-tui";

import { createNoticeRenderer } from "../adapters/pi-nested-instructions/index.ts";
import { isLive, type DisplayAction, type DisplayCall, type DisplayMode } from "../contracts.ts";
import { markAssistantProse } from "../rendering/assistant.ts";
import { createToolDisplayRenderers } from "../rendering/cards.ts";
import { layoutRow, rowChrome, type RowLayout } from "../rendering/row-layout.ts";
import { renderRunSummary } from "../rendering/summary-line.ts";
import type { DisplayTheme } from "../rendering/types.ts";
import type { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { isInstructionNotice, TranscriptMessages } from "../transcript/messages.ts";
import type { TranscriptModel } from "./model.ts";
import { messageIdentity, type TranscriptMessage } from "./wire.ts";

type Expandable =
  | BashExecutionComponent
  | CustomMessageComponent
  | CompactionSummaryMessageComponent
  | BranchSummaryMessageComponent;

function expandable(component: Component | undefined): component is Expandable {
  return (
    component instanceof BashExecutionComponent ||
    component instanceof CustomMessageComponent ||
    component instanceof CompactionSummaryMessageComponent ||
    component instanceof BranchSummaryMessageComponent
  );
}

export interface ViewerOptions {
  ui: TUI;
  theme: DisplayTheme;
  cwd: string;
  fullscreen: boolean;
  requestRender(): void;
  action?: (action: DisplayAction) => void;
  /** Custom message renderers by `customType`, as the caller would register them with Pi. */
  messageRenderers?: ReadonlyMap<string, MessageRenderer>;
}

/** These components are ours: use public Pi renderer slots, never private row state. */
class ViewerToolRow extends Container {
  trailing = true;
  private row: ToolExecutionComponent;
  private heights = { call: 0, result: 0 };
  private targets: RowLayout["targets"] = [];
  private detach: () => void;

  constructor(
    readonly call: DisplayCall,
    private coordinator: TranscriptCoordinator,
    private options: ViewerOptions
  ) {
    super();
    const renderers = createToolDisplayRenderers(call.name, call.adapter, {
      binding: { call, coordinator }
    });
    const measured = (slot: "call" | "result", component: Component): Component => ({
      render: (width) => {
        const rows = component.render(width);
        this.heights[slot] = rows.length;

        return rows;
      },
      invalidate: () => component.invalidate(),
      ...(component.handleMouse
        ? { handleMouse: (event: TuiMouseEvent) => component.handleMouse?.(event) }
        : {})
    });
    const slots: ToolRenderers = {
      renderShell: "self",
      renderCall: (args, _theme, context) =>
        measured("call", renderers.renderCall(args, options.theme, context)),
      renderResult: (result, state, _theme, context) =>
        measured("result", renderers.renderResult(result, state, options.theme, context))
    };
    this.row = new ToolExecutionComponent(
      call.name,
      call.reference.toolCallId,
      call.args,
      {},
      slots,
      options.ui,
      options.cwd
    );
    this.addChild(this.row);
    this.row.setArgsComplete();
    if (call.result)
      this.row.updateResult(
        {
          ...call.result,
          content: [...call.result.content],
          isError: call.outcome === "failure" || call.outcome === "cancelled"
        },
        isLive(call)
      );
    this.row.setExpanded(call.expanded);
    this.detach = coordinator.attach(call, {
      invalidate: () => {
        this.row.invalidate();
        options.requestRender();
      },
      requestRender: () => options.requestRender(),
      setExpanded: (expanded) => {
        this.row.setExpanded(expanded);
        options.requestRender();
      }
    });
  }

  override render(width: number): string[] {
    const chrome = rowChrome(
      this.call,
      this.coordinator,
      width,
      this.options.theme,
      () =>
        renderRunSummary(this.coordinator.summary(this.call), { width, theme: this.options.theme }),
      false,
      this.trailing
    );
    this.heights.call = 0;
    this.heights.result = 0;
    if (chrome.kind === "card")
      this.row.setImageWidthCells(Math.max(1, width - visibleWidth(chrome.imagePrefix)));
    const rows = chrome.kind === "card" ? this.row.render(width) : [];
    const layout = layoutRow(rows, this.heights.call + this.heights.result, chrome);
    this.targets = layout.targets;

    return layout.rows;
  }

  override handleMouse(event: TuiMouseEvent): ReturnType<Container["handleMouse"]> {
    if (!this.options.fullscreen) return;
    const target = this.targets[event.y];
    if (!target) return;

    if (event.type === "click" && event.button === "left") {
      if (this.coordinator.activate(this.call, target.kind)) {
        this.options.requestRender();

        return this.handled(event);
      }

      if (target.kind === "card") {
        const action = this.coordinator.interpretation(this.call).action;
        if (action && this.options.action) this.options.action(action);
        // Pi's ordinary card regions toggle only after a result exists. Keep the
        // shared call authoritative instead of toggling only Pi's private state.
        else if (this.call.result) this.coordinator.expand(this.call, !this.call.expanded);
        else return;

        return this.handled(event);
      }
    }

    if (target.kind === "card") return this.row.handleMouse({ ...event, y: target.y + 1 });

    return;
  }

  dispose(): void {
    this.detach();
  }

  private handled(event: TuiMouseEvent) {
    return {
      handled: true as const,
      target: {
        component: this,
        originX: event.screenX - event.x,
        originY: event.screenY - event.y,
        width: event.width,
        height: event.height
      }
    };
  }
}

class ViewerNoticeRow extends Container {
  trailing = true;
  private detach: () => void;
  private targets: RowLayout["targets"] = [];

  constructor(
    private row: CustomMessageComponent,
    private call: DisplayCall,
    private coordinator: TranscriptCoordinator,
    private options: ViewerOptions
  ) {
    super();
    this.addChild(row);
    this.detach = coordinator.attach(call, {
      invalidate: () => {
        row.invalidate();
        options.requestRender();
      },
      requestRender: () => options.requestRender(),
      setExpanded: () => {}
    });
  }

  override render(width: number): string[] {
    const chrome = rowChrome(
      this.call,
      this.coordinator,
      width,
      this.options.theme,
      () => [],
      true,
      this.trailing
    );
    const rows = chrome.kind === "card" ? this.row.render(width) : [];
    const layout = layoutRow(rows, Math.max(0, rows.length - 1), chrome);
    this.targets = layout.targets;

    return layout.rows;
  }

  override handleMouse(event: TuiMouseEvent): ReturnType<Container["handleMouse"]> {
    if (!this.options.fullscreen) return;
    const target = this.targets[event.y];
    if (!target) return;
    const click = event.type === "click" && event.button === "left";

    if (click) {
      this.coordinator.activate(this.call, target.kind === "collapse" ? "collapse" : "notice");
      this.options.requestRender();
    }

    if (target.kind === "card") return this.row.handleMouse({ ...event, y: target.y + 1 });
    if (!click) return;

    return {
      handled: true,
      target: {
        component: this,
        originX: event.screenX - event.x,
        originY: event.screenY - event.y,
        width: event.width,
        height: event.height
      }
    };
  }

  dispose(): void {
    this.detach();
  }
}

/** Scrolling, keyboard focus, and mounting belong to the caller. */
export class TranscriptViewer extends Container {
  private rows: (ViewerToolRow | ViewerNoticeRow)[] = [];
  /** Message components by identity, so their click state survives rebuilds, as Pi keeps chat rows. */
  private messages = new Map<string, Component>();
  private shown = new WeakMap<Component, string>();
  private unsubscribe: () => void;
  private active = true;

  constructor(
    private model: TranscriptModel,
    private options: ViewerOptions
  ) {
    super();
    model.display.coordinator.setSummaries(options.fullscreen);
    this.rebuild();
    this.unsubscribe = model.subscribe(() => {
      this.rebuild();
      options.requestRender();
    });
  }

  private rebuild(): void {
    for (const row of this.rows) row.dispose();
    this.rows = [];
    const retained = new Map<string, Component>();
    this.clear();
    const coordinator = this.model.display.coordinator;
    coordinator.setSummaries(this.options.fullscreen);
    const calls = [...coordinator.calls.values()];
    const reader = new TranscriptMessages(true);
    let anchor: ViewerToolRow | undefined;
    let lastNotice: ViewerNoticeRow | undefined;

    for (const message of this.model.messages) {
      const normalised = reader.read(message);
      if (
        normalised?.kind === "boundary" ||
        (normalised?.kind === "assistant" && normalised.boundary)
      )
        anchor = undefined;
      const component = this.retainedComponent(message, retained);

      if (component instanceof CustomMessageComponent && normalised?.kind === "notice" && anchor) {
        anchor.trailing = false;
        if (lastNotice) lastNotice.trailing = false;
        const row = new ViewerNoticeRow(component, anchor.call, coordinator, this.options);
        this.rows.push(row);
        this.addChild(row);
        lastNotice = row;
      } else if (component) {
        // Pi's chat separates these messages from the row above them.
        if (
          (message.role === "user" && this.children.length > 0) ||
          message.role === "compactionSummary" ||
          message.role === "branchSummary"
        )
          this.addChild(new Spacer(1));
        this.addChild(component);
      }

      if (message.role !== "assistant") continue;

      for (const call of calls.filter(
        (call) => call.reference.messageTimestamp === message.timestamp
      )) {
        const row = new ViewerToolRow(call, coordinator, this.options);
        this.rows.push(row);
        this.addChild(row);
        anchor = row;
        lastNotice = undefined;
      }
    }

    this.messages = retained;
  }

  /**
   * Preserve thinking toggles, summary and notice expansion through snapshot and
   * streaming rebuilds. A changed message gets a new component, except a streaming
   * assistant, which Pi updates in place. Dropped messages leave the cache.
   */
  private retainedComponent(
    message: TranscriptMessage,
    retained: Map<string, Component>
  ): Component | undefined {
    const shown =
      message.role === "assistant"
        ? withoutEndedThinking(message, this.model.activeThinking(message))
        : undefined;
    const content = JSON.stringify(shown ?? message);
    // Pi keys thinking toggles by run position; removing an ended run shifts later runs.
    const base = shown ? `${messageIdentity(message)}\0${thinkingRuns(shown)}` : content;
    let key = base;
    for (let index = 1; retained.has(key); index++) key = `${base}\0${index}`;
    let component = this.messages.get(key);

    if (component instanceof AssistantMessageComponent && shown) {
      if (this.shown.get(component) !== content) component.updateContent(shown);
    } else if (!component) {
      component = messageComponent(shown ?? message, this.options);
      // Pi creates expandable chat rows with the current tool-output expansion.
      if (expandable(component))
        component.setExpanded(this.model.display.coordinator.mode === "verbose");
    }

    if (!component) return;
    this.shown.set(component, content);
    retained.set(key, component);

    return component;
  }

  setMode(mode: DisplayMode): void {
    if (!this.active) return;
    const coordinator = this.model.display.coordinator;
    coordinator.setMode(mode);
    for (const call of coordinator.calls.values()) coordinator.expand(call, mode === "verbose");
    for (const component of this.messages.values())
      if (expandable(component)) component.setExpanded(mode === "verbose");
    this.options.requestRender();
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    this.unsubscribe();
    for (const row of this.rows) row.dispose();
    this.rows = [];
    this.messages.clear();
    this.clear();
  }
}

/** Content indices of visible thinking blocks, which fix Pi's thinking run positions. */
function thinkingRuns(message: Extract<TranscriptMessage, { role: "assistant" }>): string {
  return message.content
    .flatMap((block, index) => (block.type === "thinking" && block.thinking.trim() ? [index] : []))
    .join(",");
}

/** Like the chat, keep a placeholder only while some block of its thinking run is still active. */
function withoutEndedThinking(
  message: Extract<TranscriptMessage, { role: "assistant" }>,
  active: ReadonlySet<number>
): typeof message {
  const content: typeof message.content = [];
  let run: typeof message.content = [];
  let live = false;

  for (const [index, block] of message.content.entries()) {
    if (block.type === "thinking") {
      run.push(block);
      live ||= active.has(index);
      continue;
    }

    if (live) content.push(...run);
    content.push(block);
    run = [];
    live = false;
  }

  if (live) content.push(...run);

  return { ...message, content };
}

/** Owned rows use the public component tree; foreign viewing installs no host hooks. */
class ViewerAssistantMessage extends AssistantMessageComponent {
  constructor(message: AssistantMessage) {
    super(message, true, undefined, undefined, 1);
  }

  override updateContent(message: AssistantMessage, isStreaming?: boolean): void {
    super.updateContent(message, isStreaming);

    for (const child of this.children) if (child instanceof Container) markAssistantProse(child, 1);
  }
}

function messageComponent(
  message: TranscriptMessage,
  { ui, messageRenderers }: ViewerOptions
): Component | undefined {
  switch (message.role) {
    case "assistant":
      return new ViewerAssistantMessage(message);

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

    case "user":
      return new UserMessageComponent(contentText(message.content));
    case "custom":
      return message.display
        ? new CustomMessageComponent(
            message,
            isInstructionNotice(message)
              ? createNoticeRenderer()
              : messageRenderers?.get(message.customType)
          )
        : undefined;
    case "compactionSummary":
      return new CompactionSummaryMessageComponent(message);
    case "branchSummary":
      return new BranchSummaryMessageComponent(message);
    default:
      return;
  }
}

export function createTranscriptViewer(
  model: TranscriptModel,
  options: ViewerOptions
): TranscriptViewer {
  return new TranscriptViewer(model, options);
}
