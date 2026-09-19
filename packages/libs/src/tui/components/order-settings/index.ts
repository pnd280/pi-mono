import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, type Component } from "@earendil-works/pi-tui";

import { displayText } from "../../terminal-text/index.ts";
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
  note: string;
  theme: Pick<Theme, "fg" | "bold">;
  rows(): number;
  requestRender(): void;
  save(scope: string, order: readonly string[]): string;
  close(): void;
};

const plainLine = (text: string) => displayText(text).replace(/\s+/g, " ").trim();

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
    else if (matchesKey(data, "tab")) {
      this.scopeIndex = (this.scopeIndex + 1) % this.drafts.length;
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
    const header = [
      ...border,
      ...text(theme.fg("accent", theme.bold(this.options.title))),
      ...text(
        theme.fg("muted", `Save to ${draft.scope.label}: ${plainLine(draft.scope.destination)}`)
      ),
      ...text(theme.fg("dim", this.options.note))
    ];
    const footer = [
      ...text(
        theme.fg(
          dirty || otherDirty ? "warning" : "dim",
          `${dirty ? "Unsaved changes" : "Saved order"}${otherDirty ? " · unsaved draft in other scope" : ""} · ${draft.order.length ? draft.selected + 1 : 0}/${draft.order.length}`
        )
      ),
      ...(this.status ? text(theme.fg(this.failed ? "error" : "success", this.status)) : []),
      ...text(theme.fg("dim", "↑/↓ select · Shift+↑/↓ move · Ctrl+S save")),
      ...text(
        theme.fg(
          "dim",
          `${this.drafts.length > 1 ? "Tab scope · " : ""}Esc/Ctrl+C close (discard unsaved)`
        )
      ),
      ...border
    ];
    const height = Math.max(1, this.options.rows() - 2);
    const maxRows = Math.max(0, Math.min(8, height - header.length - footer.length));
    const list = renderWindowedList({
      items: draft.order,
      selectedIndex: draft.selected,
      maxRows,
      width,
      theme: {
        selectedPrefix: (s) => theme.fg("accent", s),
        selectedText: (s) => theme.fg("accent", s),
        description: (s) => theme.fg("muted", s),
        scrollInfo: (s) => theme.fg("dim", s),
        noMatch: (s) => theme.fg("dim", s)
      },
      format: (ids) => ({
        items: ids.map((id) => {
          const item = this.items.get(id);

          return {
            value: id,
            label: item ? `${item.label} · ${item.description}` : `${plainLine(id)} · unavailable`
          };
        })
      })
    }).lines;
    const body = draft.order.length ? list : text(theme.fg("muted", "No registered components."));

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
