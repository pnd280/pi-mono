import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, type Component } from "@earendil-works/pi-tui";
import {
  renderSettingsMenu,
  settingsLoadFeedback,
  settingsSaveFeedback,
  settingsSaveFailure,
  type SettingsFeedback,
  type SettingsMenuItem
} from "@pi-mono/libs/tui/components/settings-menu";

import type { WidgetCoordinator } from "./coordinator.ts";
import { WidgetDrafts, type View } from "./drafts.ts";
import { isWidget, regions, type Layout } from "./layout.ts";
import { itemLabel, regionLabel, rowSummary, viewTitle } from "./menu-view.ts";
import type { Preferences, Scope, WidgetSettings } from "./settings.ts";

type Item = SettingsMenuItem & {
  run?(): void;
  editable?: boolean;
  identity?: string;
  action?: string;
};

export class WidgetMenu implements Component {
  readonly drafts: WidgetDrafts;
  private feedback: SettingsFeedback | undefined;
  private warning: SettingsFeedback | undefined;
  private closed = false;
  private readonly selections = new WeakMap<View, { key: string; index: number }>();
  private readonly rowAnchors = new WeakMap<View, string[]>();

  constructor(
    private readonly options: {
      settings: WidgetSettings;
      preferences: Preferences;
      coordinator: WidgetCoordinator;
      theme: () => Theme;
      rows(): number;
      requestRender(): void;
      close(): void;
      apply(preferences: Preferences): void;
    }
  ) {
    this.drafts = new WidgetDrafts(options.preferences, () => options.coordinator.contributions());
    this.warning = settingsLoadFeedback(options.preferences.warnings);
  }

  private contribution(id: string): Item {
    let description: string;

    if (id === "separator") description = "•";
    else if (id === "flex") description = "Fill remaining space";
    else {
      const source = id.startsWith("status:") ? "Status" : "Widget";
      description = id.startsWith("builtin:") ? "Built-in" : source;
      if (!this.options.coordinator.available(id)) description += " · unavailable";
    }

    return { key: id, label: itemLabel(id), description, identity: id };
  }

  private rootItems(layout: Layout): Item[] {
    return [
      ...regions.map((region) => ({
        key: region,
        label: regionLabel[region],
        description: layout[region].length === 1 ? "1 row" : `${layout[region].length} rows`,
        action: "open",
        run: () => this.drafts.push({ kind: "rows", region, selected: 0 })
      })),
      {
        key: "reset",
        label: "Reset to defaults",
        gapBefore: true,
        action: "reset",
        run: () => this.drafts.reset()
      }
    ];
  }

  private items(layout: Layout): Item[] {
    const view = this.drafts.view;
    if (view.kind === "root") return this.rootItems(layout);
    if (view.kind === "rows")
      return layout[view.region].map((row, index) => ({
        key: JSON.stringify(row),
        label: `Row ${index + 1}`,
        description: rowSummary(row),
        editable: true,
        action: "open",
        run: () =>
          this.drafts.push({ kind: "contents", region: view.region, row: index, selected: 0 })
      }));
    const row = layout[view.region][view.row] ?? [];
    let preceding: string | undefined;

    if (view.kind === "contents")
      return row.map((id) => {
        if (isWidget(id)) preceding = id;

        return {
          ...this.contribution(id),
          // Auto-discovered statuses can insert separators ahead of the selected one.
          key: id === "separator" ? JSON.stringify([id, preceding]) : id,
          editable: true
        };
      });

    return this.drafts.picker().map((id) => ({
      ...this.contribution(id),
      ...(id === "flex" && row.includes("flex")
        ? { disabled: true, description: "Already in row" }
        : {}),
      action: "add",
      run: () => this.drafts.add(id)
    }));
  }

  private reconcileRows(layout: Layout): void {
    const views = this.drafts.current.views;

    for (const [index, view] of views.entries()) {
      if (view.kind !== "contents" && view.kind !== "picker") continue;
      const anchor = this.rowAnchors.get(view);

      if (anchor && anchor.length > 0) {
        // Unset layouts follow native placement. A moved row must not retarget a nested edit.
        const row = layout[view.region].findIndex((items) =>
          anchor.some((id) => items.includes(id))
        );

        if (row < 0) {
          views.splice(index);

          return;
        }

        view.row = row;
      }

      this.rowAnchors.set(view, (layout[view.region][view.row] ?? []).filter(isWidget));
    }
  }

  private currentItems(layout: Layout): Item[] {
    this.reconcileRows(layout);
    const view = this.drafts.view;
    const occurrences = new Map<string, number>();
    const items = this.items(layout).map((item) => {
      const occurrence = occurrences.get(item.key) ?? 0;
      occurrences.set(item.key, occurrence + 1);

      return { ...item, key: JSON.stringify([item.key, occurrence]) };
    });
    const previous = this.selections.get(view);

    // Reconcile by identity when registrations arrive between renders or before a keypress.
    if (previous && previous.index === view.selected) {
      const index = items.findIndex((item) => item.key === previous.key);
      if (index >= 0) view.selected = index;
    }

    view.selected = Math.max(0, Math.min(view.selected, items.length - 1));
    const selected = items[view.selected];
    if (selected) this.selections.set(view, { key: selected.key, index: view.selected });
    else this.selections.delete(view);

    return items;
  }

  handleInput(data: string): void {
    if (this.closed) return;
    const scope = this.drafts.scope;
    const value = JSON.stringify(this.drafts.current.value);
    this.handleMenuInput(data);
    const edited =
      !matchesKey(data, "ctrl+s") &&
      scope === this.drafts.scope &&
      value !== JSON.stringify(this.drafts.current.value);

    if (edited) {
      // An edited row may stop matching its old summary. Keep its parent index rather than
      // matching a different, previously identical row when returning from its contents.
      for (const parent of this.drafts.current.views.slice(0, -1)) this.selections.delete(parent);
    }

    if (scope !== this.drafts.scope || (edited && this.feedback?.severity !== "error"))
      this.feedback = undefined;
    this.options.requestRender();
  }

  private handleMenuInput(data: string): void {
    const view = this.drafts.view;
    const previous = this.selections.get(view);
    const items = this.currentItems(this.drafts.layout());
    // A live refresh can remove the selected row or close its nested view. Drop stale input
    // rather than applying it to a different target before the user has seen the new selection.
    if (view !== this.drafts.view || (previous && !items.some((item) => item.key === previous.key)))
      return;

    if (matchesKey(data, "escape")) {
      if (!this.drafts.back()) this.close();
    } else if (matchesKey(data, "ctrl+c")) this.close();
    else if (
      (matchesKey(data, "tab") || matchesKey(data, "shift+tab")) &&
      this.options.settings.options.projectTrusted
    )
      this.drafts.scope = this.drafts.scope === "global" ? "project" : "global";
    else if (matchesKey(data, "ctrl+s")) this.save();
    else if (matchesKey(data, "a")) {
      if (view.kind === "rows") {
        this.drafts.addRow(view.region);
        this.drafts.push({
          kind: "contents",
          region: view.region,
          row: view.selected,
          selected: 0
        });
      } else if (view.kind === "contents")
        this.drafts.push({ kind: "picker", region: view.region, row: view.row, selected: 0 });
    } else this.handleListInput(data, items);
  }

  private handleListInput(data: string, items: Item[]): void {
    const view = this.drafts.view;
    if (matchesKey(data, "shift+up")) this.drafts.move(-1);
    else if (matchesKey(data, "shift+down")) this.drafts.move(1);
    else if (matchesKey(data, "delete")) this.drafts.remove();
    else if (matchesKey(data, "up")) view.selected = Math.max(0, view.selected - 1);
    else if (matchesKey(data, "down"))
      view.selected = Math.min(items.length - 1, view.selected + 1);
    else if (matchesKey(data, "enter")) {
      const item = items[view.selected];
      if (!item?.disabled) item?.run?.();
    } else return;
    // Local navigation/mutations choose their next index deliberately, unlike registry refreshes.
    this.selections.delete(this.drafts.view);
    this.rowAnchors.delete(this.drafts.view);
    this.currentItems(this.drafts.layout());
  }

  private close(): void {
    this.closed = true;
    this.options.close();
  }

  private save(): void {
    try {
      if (!this.options.coordinator.enabled)
        throw new Error("Resolve footer conflict and /reload.\nWidget coordinator is inactive.");
      this.options.settings.save(
        this.drafts.scope,
        this.drafts.current.value ?? this.drafts.layout()
      );
      const preferences = this.options.settings.load();
      this.drafts.saved(preferences);
      this.options.apply(preferences);
      this.warning = settingsLoadFeedback(preferences.warnings);
      this.feedback = settingsSaveFeedback(
        this.drafts.scope === "global" && preferences.project !== undefined,
        preferences.warnings
      );
    } catch (error) {
      this.feedback = settingsSaveFailure(error);
    }
  }

  private hints(item: Item | undefined): string[] {
    const view = this.drafts.view;
    const remove = item?.identity && isWidget(item.identity) ? "hide" : "remove";

    return [
      "Ctrl+S save",
      view.kind === "root" ? "Esc close" : "Esc back",
      ...(this.options.settings.options.projectTrusted ? ["Tab scope"] : []),
      ...(item ? ["↑/↓ select"] : []),
      ...(item?.action && !item.disabled ? [`Enter ${item.action}`] : []),
      ...(view.kind === "rows" || view.kind === "contents" ? ["a add"] : []),
      ...(item?.editable
        ? ["Shift+↑/↓ move", view.kind === "rows" ? "Del remove row" : `Del ${remove}`]
        : [])
    ];
  }

  private preview(layout: Layout, width: number): string[] | undefined {
    const view = this.drafts.view;
    if (view.kind === "root") return undefined;
    const index = view.kind === "rows" ? view.selected : view.row;
    const row = layout[view.region][index];
    if (!row) return undefined;
    const focused: Layout = { aboveEditor: [], belowEditor: [], footer: [], hidden: [] };
    focused[view.region] = [row];

    return row.length
      ? this.options.coordinator.preview(focused, width)[view.region]
      : [this.options.theme().fg("dim", "Empty row. Add an item.")];
  }

  render(width: number): string[] {
    if (width < 1) return [];
    const height = Math.max(1, this.options.rows() - 2);
    const theme = this.options.theme();
    const layout = this.drafts.layout();
    const items = this.currentItems(layout);
    const view = this.drafts.view;
    const item = items[view.selected];

    const scopes: Scope[] = this.options.settings.options.projectTrusted
      ? ["global", "project"]
      : ["global"];

    return renderSettingsMenu({
      width,
      height,
      theme,
      title: viewTitle(view),
      scope: this.drafts.scope,
      scopes: scopes.map((scope) => {
        const draft = this.drafts.drafts[scope];

        return {
          id: scope,
          label: scope,
          destination: this.options.settings.paths[scope],
          isSet: draft.saved !== undefined,
          dirty: JSON.stringify(draft.value) !== JSON.stringify(draft.saved)
        };
      }),
      items,
      selected: view.selected,
      emptyLabel: `${view.kind === "rows" ? "No rows" : "Empty row"}. Press a to add.`,
      hints: this.hints(item),
      feedback: this.feedback ?? this.warning,
      preview: () => this.preview(layout, Math.max(1, width - 4))
    });
  }

  invalidate(): void {}
}
