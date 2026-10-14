import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, type Component } from "@earendil-works/pi-tui";

import {
  renderSettingsMenu,
  settingsLoadFeedback,
  settingsSaveFailure,
  type SettingsFeedback
} from "../settings-menu/index.ts";

export type OrderSettingsItem = { id: string; label: string; description: string };

export type OrderSettingsScope = {
  id: string;
  label: string;
  destination: string;
  isSet: boolean;
  order: readonly string[];
  inheritFrom?: string;
};

export type OrderSettingsOptions = {
  title: string;
  items: readonly OrderSettingsItem[];
  scopes: readonly OrderSettingsScope[];
  initialScope: string;
  warnings?: readonly string[];
  theme: Pick<Theme, "fg" | "bold">;
  rows(): number;
  requestRender(): void;
  save(scope: string, order: readonly string[]): SettingsFeedback;
  close(): void;
};

/** Scoped reorder drafts. No persistence or live application happens before Ctrl+S. */
export class OrderSettingsView implements Component {
  private items = new Map<string, OrderSettingsItem>();
  private readonly drafts: {
    scope: OrderSettingsScope;
    order: string[];
    saved: string[];
    isSet: boolean;
    selected: number;
  }[];
  private scopeIndex: number;
  private feedback: SettingsFeedback | undefined;
  private warning: SettingsFeedback | undefined;
  private closed = false;

  constructor(private readonly options: OrderSettingsOptions) {
    if (!options.scopes.length) throw new Error("Order settings require a save scope.");
    this.drafts = options.scopes.map((scope) => {
      const source = options.scopes.find((other) => other.id === scope.inheritFrom && other.isSet);
      const order = scope.isSet ? scope.order : (source?.order ?? scope.order);

      return {
        scope,
        order: [...order],
        saved: [...order],
        isSet: scope.isSet,
        selected: 0
      };
    });
    this.scopeIndex = Math.max(
      0,
      options.scopes.findIndex((scope) => scope.id === options.initialScope)
    );
    this.warning = settingsLoadFeedback(options.warnings ?? []);
    this.updateItems(options.items);
  }

  updateItems(items: readonly OrderSettingsItem[]): void {
    this.items = new Map(items.map((item) => [item.id, { ...item }]));

    for (const draft of this.drafts) {
      const newIds = items
        .map((item) => item.id)
        .filter((id) => !draft.order.includes(id))
        .sort();
      draft.order.push(...newIds);
      draft.saved.push(...newIds);
    }

    this.syncInheritedDrafts();
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
      const next = (this.scopeIndex + direction + this.drafts.length) % this.drafts.length;
      if (next !== this.scopeIndex) this.feedback = undefined;
      this.scopeIndex = next;
    } else if (matchesKey(data, "shift+up") || matchesKey(data, "shift+down")) {
      const next = draft.selected + (matchesKey(data, "shift+up") ? -1 : 1);
      const selectedId = draft.order[draft.selected];
      const nextId = draft.order[next];

      if (selectedId !== undefined && nextId !== undefined) {
        [draft.order[draft.selected], draft.order[next]] = [nextId, selectedId];
        draft.selected = next;
        if (this.feedback?.severity !== "error") this.feedback = undefined;
      }
    } else if (draft.order.length && (matchesKey(data, "up") || matchesKey(data, "down"))) {
      const delta = matchesKey(data, "up") ? -1 : 1;
      draft.selected = Math.max(0, Math.min(draft.selected + delta, draft.order.length - 1));
    }

    this.options.requestRender();
  }

  render(width: number): string[] {
    const draft = this.current();

    return renderSettingsMenu({
      width,
      height: Math.max(1, this.options.rows() - 2),
      theme: this.options.theme,
      title: this.options.title,
      scope: draft.scope.id,
      scopes: this.drafts.map((entry) => ({
        ...entry.scope,
        isSet: entry.isSet,
        dirty: this.isDirty(entry)
      })),
      items: draft.order.map((id) => {
        const item = this.items.get(id);

        return {
          key: id,
          label: item?.label ?? id,
          description: item?.description ?? "unavailable"
        };
      }),
      selected: draft.selected,
      emptyLabel: "No registered components.",
      hints: [
        "Ctrl+S save",
        "Esc close",
        ...(this.drafts.length > 1 ? ["Tab scope"] : []),
        ...(draft.order.length ? ["↑↓ select", "Shift+↑↓ move"] : [])
      ],
      feedback: this.feedback ?? this.warning
    });
  }

  invalidate(): void {}

  private current() {
    const draft = this.drafts[this.scopeIndex];
    if (!draft) throw new Error("Order settings scope does not exist.");

    return draft;
  }

  private isDirty(draft: ReturnType<OrderSettingsView["current"]>): boolean {
    return (
      draft.order.length !== draft.saved.length ||
      draft.order.some((id, index) => id !== draft.saved[index])
    );
  }

  private syncInheritedDrafts(): void {
    for (const draft of this.drafts) {
      if (draft.isSet) continue;
      const source = this.drafts.find(
        (other) => other.scope.id === draft.scope.inheritFrom && other.isSet
      );
      if (!source) continue;
      const dirty = this.isDirty(draft);
      const selected = draft.order[draft.selected];
      draft.saved = [...source.saved];
      if (dirty) continue;
      draft.order = [...source.saved];
      draft.selected = selected === undefined ? 0 : Math.max(0, draft.order.indexOf(selected));
    }
  }

  private save(): void {
    const draft = this.current();

    try {
      this.feedback = this.options.save(draft.scope.id, [...draft.order]);
      this.warning =
        this.feedback.severity === "warning"
          ? settingsLoadFeedback([this.feedback.detail ?? this.feedback.summary])
          : undefined;
      draft.saved = [...draft.order];
      draft.isSet = true;
      this.syncInheritedDrafts();
    } catch (error) {
      this.feedback = settingsSaveFailure(error);
    }
  }
}
