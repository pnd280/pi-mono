import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  MouseRegion,
  Spacer,
  wrapTextWithAnsi,
  type Component,
  type TuiMouseEvent,
  type TuiMouseEventResult
} from "@earendil-works/pi-tui";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

import { builtinText } from "./builtins.ts";
import type { WidgetHost } from "./host.ts";
import { regions, resolveLayout, type Layout, type Placement, type Region } from "./layout.ts";
import { clip, renderRows, type Contribution, type Rendered } from "./render.ts";

type Registered = Contribution & Placement & { available: boolean };

const aboveEditorSpacing = 1;

const textComponent = (text: string): Component => ({
  render: (width) => wrapTextWithAnsi(text, width),
  invalidate() {}
});

export class WidgetCoordinator {
  private readonly hooks = new OwnedHooks();
  private readonly rendererHooks = new OwnedHooks();
  private renderer: WidgetHost["renderer"] | undefined;
  private readonly registry = new Map<string, Registered>();
  private readonly components: Record<Region, Component>;
  /** Unclipped regions from one render pass. */
  private measured: { width: number; rendered: Record<Region, Rendered> } | undefined;
  private cache: { width: number; height: number; rendered: Record<Region, Rendered> } | undefined;
  private saved: Layout | undefined;
  private draft: Layout | undefined;
  private contextThreshold: number | undefined;
  private readonly verbose = { context: false, tokens: false };
  private active = true;
  private readonly nativeFooter: WidgetHost["setExtensionFooter"];
  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly host: WidgetHost,
    private readonly theme: () => Theme,
    private readonly warn: (message: string) => void
  ) {
    if (host.customFooter)
      throw new Error(
        "pi-editor-widgets: footer conflict. Disable the other footer extension and /reload; native widgets and statuses remain supported."
      );
    this.nativeFooter = host.setExtensionFooter;
    const aboveEditor = new Container();
    aboveEditor.addChild(new Spacer(aboveEditorSpacing));
    aboveEditor.addChild(this.regionComponent("aboveEditor"));
    this.components = {
      aboveEditor,
      belowEditor: this.regionComponent("belowEditor"),
      footer: this.regionComponent("footer")
    };
    const switchMode = host.switchTuiMode.bind(host);
    const renderWidgets = host.renderWidgets.bind(host);

    try {
      this.bindRenderer();
      this.hooks.replace(host, "switchTuiMode", (...args) => {
        try {
          return switchMode(...args);
        } finally {
          if (this.active) this.bindRenderer();
        }
      });
      this.hooks.replace(host, "renderWidgets", () => {
        if (!this.active) return renderWidgets();
        this.mount();
        host.ui.requestRender();
      });
      this.hooks.replace(host, "setExtensionFooter", (factory) => {
        if (this.active) {
          if (factory)
            this.warn(
              "pi-editor-widgets: footer conflict. Coordinator released; disable the competing footer extension and /reload."
            );
          this.dispose();
        }

        this.nativeFooter.call(host, factory);
      });
      this.nativeFooter.call(host, () => this.components.footer);
      this.unsubscribe = host.footerDataProvider.onBranchChange(() => host.ui.requestRender());
      this.mount();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  get enabled(): boolean {
    return this.active;
  }

  apply(layout: Layout | undefined, contextThreshold?: number): void {
    this.saved = layout === undefined ? undefined : structuredClone(layout);
    this.contextThreshold = contextThreshold;
    this.host.ui.requestRender();
  }

  /** Render an unsaved menu draft in the live regions; `undefined` restores the saved layout. */
  showDraft(layout: Layout | undefined): void {
    if (JSON.stringify(layout) === JSON.stringify(this.draft)) return;
    this.draft = layout === undefined ? undefined : structuredClone(layout);
    this.host.ui.requestRender();
  }

  /** Unclipped region height including spacing, without measuring the editor it is sized against. */
  regionHeight(width: number): number {
    if (!this.active || width < 1) return 0;
    const { rendered } = this.measure(width);

    return (
      aboveEditorSpacing + regions.reduce((sum, region) => sum + rendered[region].lines.length, 0)
    );
  }

  contributions(): Placement[] {
    this.sync();

    return [...this.registry.values()].map(({ id, region }) => ({ id, region }));
  }

  available(id: string): boolean {
    // Menu layout discovery refreshes the registry once before formatting its labels.
    return this.registry.get(id)?.available ?? false;
  }

  private sync(): void {
    for (const source of this.registry.values()) source.available = false;

    for (const region of ["aboveEditor", "belowEditor"] as const) {
      const widgets =
        region === "aboveEditor"
          ? this.host.extensionWidgetsAbove
          : this.host.extensionWidgetsBelow;

      for (const [key, component] of widgets) {
        const id = `widget:${key}`;
        this.registry.set(id, { id, region, component, available: true });
      }
    }

    const fullscreen = this.host.renderer.mode === "fullscreen";
    const contextDisplay = this.verbose.context ? "verbose" : "compact";
    const tokensDisplay = this.verbose.tokens ? "verbose" : "compact";

    for (const [id, value] of builtinText(
      this.host.session,
      this.host.footerDataProvider,
      this.theme(),
      {
        contextThreshold: this.contextThreshold,
        contextDisplay: fullscreen ? contextDisplay : "regular",
        tokensDisplay: fullscreen ? tokensDisplay : "regular"
      }
    ))
      this.setText(id, value);
    for (const [key, value] of this.host.footerDataProvider.getExtensionStatuses())
      this.setText(
        `status:${key}`,
        value
          .replace(/[\r\n\t]/g, " ")
          .replace(/ +/g, " ")
          .trim()
      );

    // Remember unavailable identities, not disposed native components or their render state.
    for (const source of this.registry.values())
      if (!source.available) source.component = textComponent("");
  }

  private setText(id: string, value: string): void {
    let component = textComponent(value);

    if (
      (id === "builtin:context" || id === "builtin:tokens") &&
      this.host.renderer.mode === "fullscreen"
    ) {
      const widget = id === "builtin:context" ? "context" : "tokens";
      component = new MouseRegion(component, (event) => {
        if (!this.active || this.host.renderer.mode !== "fullscreen" || event.button !== "left")
          return undefined;
        // Claim the press so Pi delivers a click instead of starting text selection.
        if (event.type === "press") return { handled: true, render: false };
        if (event.type !== "click") return undefined;
        this.verbose[widget] = !this.verbose[widget];
        this.host.ui.requestRender();

        return { handled: true };
      });
    }

    this.registry.set(id, { id, region: "footer", component, available: true });
  }

  private bindRenderer(): void {
    // host.ui is Pi's forwarding proxy: defining a property there does NOT wrap its methods.
    if (this.renderer === this.host.renderer) return;
    this.rendererHooks.restore();
    this.renderer = this.host.renderer;
    this.invalidateCache();
    const renderer = this.renderer;
    const request = renderer.requestRender.bind(renderer);
    this.rendererHooks.replace(renderer, "requestRender", (...args) => {
      if (this.active) this.invalidateCache();
      request(...args);
    });
  }

  private invalidateCache(): void {
    this.cache = undefined;
    this.measured = undefined;
  }

  private mount(): void {
    for (const region of ["aboveEditor", "belowEditor"] as const) {
      const container =
        region === "aboveEditor" ? this.host.widgetContainerAbove : this.host.widgetContainerBelow;
      container.clear();
      container.addChild(this.components[region]);
    }
  }

  private render(width: number): Record<Region, Rendered> {
    if (width < 1)
      return {
        aboveEditor: { lines: [], cells: [] },
        belowEditor: { lines: [], cells: [] },
        footer: { lines: [], cells: [] }
      };
    const height = this.host.ui.terminal.rows;
    if (this.cache?.width === width && this.cache.height === height) return this.cache.rendered;
    const measured = this.measure(width);
    const rendered = { ...measured.rendered };
    // The /widgets menu sizes itself from regionHeight(), served by the measurement above.
    const editorHeight = Math.max(3, this.host.editorContainer.render(width).length);
    const otherHeight =
      this.host.statusContainer.render(width).length +
      this.host.pendingMessagesContainer.render(width).length;
    let remaining = Math.max(0, height - editorHeight - otherHeight - aboveEditorSpacing - 1);
    const ordered = [...regions].sort(
      (a, b) => rendered[a].lines.length - rendered[b].lines.length
    );

    ordered.forEach((region, index) => {
      const budget = Math.min(
        rendered[region].lines.length,
        Math.floor(remaining / (ordered.length - index))
      );
      rendered[region] = clip(rendered[region], budget, width);
      remaining -= budget;
    });
    this.cache = { width, height, rendered };

    return rendered;
  }

  private measure(width: number): NonNullable<WidgetCoordinator["measured"]> {
    if (this.measured?.width === width) return this.measured;
    this.sync();
    const layout = resolveLayout(this.draft ?? this.saved, [...this.registry.values()]);
    const sources = new Map([...this.registry].filter(([, source]) => source.available));
    const separator = this.theme().fg("dim", " • ");
    this.measured = {
      width,
      rendered: {
        aboveEditor: renderRows(layout.aboveEditor, sources, width, separator),
        belowEditor: renderRows(layout.belowEditor, sources, width, separator),
        footer: renderRows(layout.footer, sources, width, separator)
      }
    };

    return this.measured;
  }

  private regionComponent(region: Region): Component {
    return {
      render: (width) => (this.active ? this.render(width)[region].lines : []),
      invalidate: () => {
        this.invalidateCache();
        for (const source of this.registry.values())
          if (source.available && source.id.startsWith("widget:")) source.component.invalidate();
      },
      handleMouse: (event) => this.mouse(region, event)
    };
  }

  private mouse(region: Region, event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (!this.active) return undefined;
    const cells = this.cache?.rendered[region].cells ?? [];
    const cell = cells.find(
      ({ x, y, width, height }) =>
        event.x >= x && event.x < x + width && event.y >= y && event.y < y + height
    );
    if (!cell) return undefined;
    const result = cell.component.handleMouse?.({
      ...event,
      x: event.x - cell.x,
      y: event.y - cell.y,
      // Native containers use this width to validate their child mouse layout.
      width: cell.renderWidth,
      height: cell.height
    });
    if (!result || "target" in result || (!result.handled && !result.capture && !result.focus))
      return result;
    // Pi 0.87.1's container dispatch contract retains the native target for drag capture and focus.
    const forwarded = {
      ...result,
      handled: true,
      ...(result.focus ? { focusTarget: cell.component } : {}),
      target: {
        component: cell.component,
        originX: event.screenX - event.x + cell.x,
        originY: event.screenY - event.y + cell.y,
        width: cell.renderWidth,
        height: cell.height
      }
    };

    return forwarded;
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    this.unsubscribe?.();
    this.hooks.restore();
    this.rendererHooks.restore();
    if (this.host.customFooter === this.components.footer)
      this.nativeFooter.call(this.host, undefined);

    // Native rendering remounts borrowed contributions and its spacing without disposing them.
    if (
      this.host.widgetContainerAbove.children.includes(this.components.aboveEditor) ||
      this.host.widgetContainerBelow.children.includes(this.components.belowEditor)
    )
      this.host.renderWidgets();

    this.registry.clear();
    this.invalidateCache();
    this.host.ui.requestRender();
  }
}
