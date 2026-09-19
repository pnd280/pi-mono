import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  Text,
  type Component,
  type SelectListLayoutOptions
} from "@earendil-works/pi-tui";

import { displayText } from "../../terminal-text/index.ts";
import { renderHintFooter } from "../hint-footer/index.ts";
import { renderWindowedList } from "../windowed-list/index.ts";

export type OrderSettingsItem = { id: string; label: string; description: string };

export type OrderSettingsScope = {
  id: string;
  label: string;
  destination: string;
  order: readonly string[];
};

export type OrderSettingsOptions = {
  title: string;
  items: readonly OrderSettingsItem[];
  scopes: readonly OrderSettingsScope[];
  initialScope: string;
  theme: Pick<Theme, "fg" | "bold">;
  rows(): number;
  requestRender(): void;
  save(scope: string, order: readonly string[]): string;
  close(): void;
};

const plainLine = (text: string) => displayText(text).replace(/\s+/g, " ").trim();
const settingsListLayout = {
  minPrimaryColumnWidth: 1,
  maxPrimaryColumnWidth: 38
} satisfies SelectListLayoutOptions;

/** Scoped reorder drafts. No persistence or live application happens before Ctrl+S. */
export class OrderSettingsView implements Component {
  private items = new Map<string, OrderSettingsItem>();
  private readonly drafts: {
    scope: OrderSettingsScope;
    order: string[];
    saved: string[];
    selected: number;
  }[];
  private scopeIndex: number;
  private status = "";
  private failed = false;
  private closed = false;

  constructor(private readonly options: OrderSettingsOptions) {
    if (!options.scopes.length) throw new Error("Order settings require a save scope.");
    this.drafts = options.scopes.map((scope) => ({
      scope,
      order: [...scope.order],
      saved: [...scope.order],
      selected: 0
    }));
    this.scopeIndex = Math.max(
      0,
      options.scopes.findIndex((scope) => scope.id === options.initialScope)
    );
    this.updateItems(options.items);
  }

  updateItems(items: readonly OrderSettingsItem[]): void {
    this.items = new Map(
      items.map((item) => [
        item.id,
        { ...item, label: plainLine(item.label), description: plainLine(item.description) }
      ])
    );

    for (const draft of this.drafts) {
      const newIds = items
        .map((item) => item.id)
        .filter((id) => !draft.order.includes(id))
        .sort();
      draft.order.push(...newIds);
      draft.saved.push(...newIds);
    }

    this.options.requestRender();
  }

  handleInput(data: string): void {
    if (this.closed) return;
    const draft = this.current();

    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.closed = true;
      this.options.close();

      return;
    }

    if (matchesKey(data, "ctrl+s")) this.save();
    else if (matchesKey(data, "tab") || matchesKey(data, "shift+tab")) {
      const direction = matchesKey(data, "shift+tab") ? -1 : 1;
      this.scopeIndex = (this.scopeIndex + direction + this.drafts.length) % this.drafts.length;
      this.status = "";
    } else if (matchesKey(data, "shift+up") || matchesKey(data, "shift+down")) {
      const next = draft.selected + (matchesKey(data, "shift+up") ? -1 : 1);

      if (next >= 0 && next < draft.order.length) {
        [draft.order[draft.selected], draft.order[next]] = [
          draft.order[next]!,
          draft.order[draft.selected]!
        ];
        draft.selected = next;
        this.status = "";
      }
    } else if (draft.order.length && (matchesKey(data, "up") || matchesKey(data, "down"))) {
      const delta = matchesKey(data, "up") ? -1 : 1;
      draft.selected = (draft.selected + delta + draft.order.length) % draft.order.length;
    }

    this.options.requestRender();
  }

  render(width: number): string[] {
    if (width < 1) return [];
    const { theme } = this.options;
    const draft = this.current();
    const border = new DynamicBorder((text: string) => theme.fg("border", text)).render(width);
    const text = (value: string) => new Text(value, 0, 0).render(width);
    const dirty = this.isDirty(draft);
    const otherDirty = this.drafts.some((other) => other !== draft && this.isDirty(other));
    const height = Math.max(1, this.options.rows() - 2);
    const showContext = height >= 10;
    const roomy = height >= 18;
    const scopeTabs = this.drafts
      .map(({ scope }, index) =>
        theme.fg(index === this.scopeIndex ? "accent" : "muted", plainLine(scope.label))
      )
      .join(theme.fg("muted", " | "));
    const header = [
      ...border,
      ...text(theme.fg("accent", theme.bold(`  ${this.options.title}`))),
      "",
      ...text(theme.fg("muted", "  Scope: ") + scopeTabs),
      ...(showContext
        ? text(`  Settings file  ${theme.fg("muted", plainLine(draft.scope.destination))}`)
        : []),
      ...(roomy ? [""] : [])
    ];
    let draftState: string | undefined;
    if (dirty) draftState = `Unsaved changes${otherDirty ? " · unsaved draft in other scope" : ""}`;
    else if (otherDirty) draftState = "Unsaved draft in other scope";
    const hints = renderHintFooter({
      width,
      maxRows: 2,
      hints: [
        "↑/↓ select",
        "Shift+↑/↓ move",
        "Ctrl+S save",
        ...(this.drafts.length > 1 ? ["Tab scope"] : []),
        "Esc close"
      ],
      padding: "  ",
      separator: " · ",
      style: (value) => theme.fg("dim", value)
    }).rows;
    const footer = [
      ...(roomy ? [""] : []),
      ...(draftState ? text(theme.fg("warning", `  ${draftState}`)) : []),
      ...(this.status ? text(theme.fg(this.failed ? "error" : "success", `  ${this.status}`)) : []),
      ...hints,
      ...border
    ];
    const availableListRows = Math.max(0, Math.min(10, height - header.length - footer.length));
    const showListPosition = availableListRows >= 2 && draft.order.length > availableListRows;
    const maxRows = availableListRows - (showListPosition ? 1 : 0);
    const list = renderWindowedList({
      items: draft.order,
      selectedIndex: draft.selected,
      maxRows,
      width,
      theme: {
        selectedPrefix: (s) => theme.fg("accent", s),
        selectedText: (s) => theme.fg("accent", s),
        description: (s) => theme.fg("muted", s),
        scrollInfo: (s) => theme.fg("muted", s),
        noMatch: (s) => theme.fg("muted", s)
      },
      format: (ids) => ({
        items: ids.map((id) => {
          const item = this.items.get(id);

          return {
            value: id,
            label: item?.label ?? plainLine(id),
            description: item?.description ?? "unavailable"
          };
        }),
        layout: settingsListLayout
      })
    }).lines;
    const body = draft.order.length
      ? [
          ...list,
          ...(showListPosition
            ? text(theme.fg("muted", `  (${draft.selected + 1}/${draft.order.length})`))
            : [])
        ]
      : text(theme.fg("muted", "  No registered components."));

    return [...header, ...body, ...footer].slice(-height);
  }

  invalidate(): void {}

  private current() {
    return this.drafts[this.scopeIndex]!;
  }

  private isDirty(draft: ReturnType<OrderSettingsView["current"]>): boolean {
    return draft.order.some((id, index) => id !== draft.saved[index]);
  }

  private save(): void {
    const draft = this.current();

    try {
      this.status = plainLine(this.options.save(draft.scope.id, [...draft.order]));
      draft.saved = [...draft.order];
      this.failed = false;
    } catch (error) {
      this.failed = true;
      this.status = error instanceof Error ? plainLine(error.message) : "Could not save settings.";
    }
  }
}
