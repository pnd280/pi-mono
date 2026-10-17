import type { SettingsScope } from "@pi-mono/libs/settings-file";

import {
  defaultLayout,
  isWidget,
  regions,
  resolveLayout,
  type Layout,
  type Placement,
  type Region
} from "../layout.ts";
import type { Preferences } from "../settings.ts";

export type View =
  | Readonly<{ kind: "root"; selected: number }>
  | Readonly<{ kind: "rows"; region: Region; selected: number }>
  | Readonly<{ kind: "contents" | "picker"; region: Region; row: number; selected: number }>;

export type Navigation =
  | "open"
  | "add"
  | "remove"
  | "up"
  | "down"
  | "moveUp"
  | "moveDown"
  | "back"
  | "close"
  | "switchScope"
  | "save";

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

type NavigationView = Mutable<View> & {
  selection?: string | undefined;
  rowAnchor?: string[] | undefined;
};

type Draft = { value: Layout | undefined; saved: Layout | undefined; views: NavigationView[] };

type Choice = { id: string; key: string; disabled?: boolean };

function placedIds(layout: Layout): string[] {
  return [...new Set(regions.flatMap((region) => layout[region].flat().filter(isWidget)))];
}

/** Removing one copy of a duplicated contribution leaves its other placements visible. */
function hideUnplaced(layout: Layout, ids: readonly string[]): void {
  const placed = new Set(placedIds(layout));

  for (const id of new Set(ids))
    if (!placed.has(id) && !layout.hidden.includes(id)) layout.hidden.push(id);
}

export class WidgetDrafts {
  private readonly drafts: Record<SettingsScope, Draft>;
  private activeScope: SettingsScope;
  private persistedGlobal: Layout | undefined;

  constructor(
    preferences: Preferences,
    private readonly contributions: () => Placement[]
  ) {
    this.persistedGlobal = structuredClone(preferences.global);
    const draft = (value: Layout | undefined): Draft => ({
      value: structuredClone(value),
      saved: structuredClone(value),
      views: [{ kind: "root", selected: 0 }]
    });
    this.drafts = { global: draft(preferences.global), project: draft(preferences.project) };
    this.activeScope = preferences.project === undefined ? "global" : "project";
  }

  get scope(): SettingsScope {
    return this.activeScope;
  }
  draft(scope: SettingsScope): Readonly<Pick<Draft, "value" | "saved">> {
    const { value, saved } = this.drafts[scope];

    return { value, saved };
  }
  get current(): Readonly<Pick<Draft, "value" | "saved">> {
    return this.draft(this.scope);
  }
  get view(): View {
    const view = this.currentView;
    if (view.kind === "root") return { kind: view.kind, selected: view.selected };
    if (view.kind === "rows")
      return { kind: view.kind, region: view.region, selected: view.selected };

    return { kind: view.kind, region: view.region, row: view.row, selected: view.selected };
  }
  private get currentView(): NavigationView {
    return this.drafts[this.scope].views.at(-1) ?? { kind: "root", selected: 0 };
  }

  /** The displayed draft before discovery; unset project drafts inherit the saved global layout. */
  source(): Layout {
    const inherited = this.scope === "project" ? this.persistedGlobal : undefined;

    return this.current.value ?? inherited ?? defaultLayout();
  }

  layout(): Layout {
    return resolveLayout(this.source(), this.contributions());
  }

  private push(view: NavigationView): void {
    this.drafts[this.scope].views.push(view);
  }
  private back(): boolean {
    const views = this.drafts[this.scope].views;
    if (views.length === 1) return false;
    views.pop();

    return true;
  }

  private reset(): void {
    this.drafts[this.scope].value = defaultLayout();
    this.drafts[this.scope].views = [{ kind: "root", selected: 0 }];
  }

  private addRow(region: Region): void {
    const layout = this.layout();
    layout[region].push([]);
    this.drafts[this.scope].value = layout;
    this.currentView.selected = layout[region].length - 1;
    this.push({ kind: "contents", region, row: layout[region].length - 1, selected: 0 });
  }

  private remove(): void {
    const view = this.currentView;
    const layout = this.layout();
    if (view.kind === "rows") {
      const removed = layout[view.region].splice(view.selected, 1)[0];
      if (!removed) return;
      hideUnplaced(layout, removed.filter(isWidget));
    } else if (view.kind === "contents") {
      const removed = layout[view.region][view.row]?.splice(view.selected, 1)[0];
      if (removed === undefined) return;
      if (isWidget(removed)) hideUnplaced(layout, [removed]);
    } else return;
    this.drafts[this.scope].value = layout;
  }

  private move(delta: number): void {
    const view = this.currentView;
    const layout = this.layout();

    const swap = <T>(items: T[]) => {
      const from = items[view.selected];
      const to = items[view.selected + delta];
      if (from === undefined || to === undefined) return false;
      items[view.selected] = to;
      items[view.selected + delta] = from;
      view.selected += delta;

      return true;
    };

    const changed =
      view.kind === "rows"
        ? swap(layout[view.region])
        : view.kind === "contents" && swap(layout[view.region][view.row] ?? []);
    if (changed) this.drafts[this.scope].value = layout;
  }

  /** Hidden contributions first, then visible ones that can be duplicated into another row. */
  private picker(layout: Layout): string[] {
    return ["separator", "flex", ...layout.hidden, ...placedIds(layout)];
  }

  private add(id: string): void {
    const view = this.currentView;
    if (view.kind !== "picker") return;
    const layout = this.layout();
    const row = layout[view.region][view.row];
    if (!row || (id !== "separator" && row.includes(id))) return;
    if (isWidget(id) && !layout.hidden.includes(id) && !placedIds(layout).includes(id)) return;
    row.push(id);
    layout.hidden = layout.hidden.filter((hidden) => hidden !== id);
    this.drafts[this.scope].value = layout;
    this.back();
    this.currentView.selected = row.length - 1;
  }

  private choices(layout: Layout): Choice[] {
    const view = this.currentView;
    let choices: Choice[];

    if (view.kind === "root") choices = [...regions, "reset"].map((id) => ({ id, key: id }));
    else if (view.kind === "rows")
      choices = layout[view.region].map((row, index) => ({
        id: String(index),
        key: JSON.stringify(row)
      }));
    else {
      const row = layout[view.region][view.row] ?? [];
      let preceding: string | undefined;
      choices =
        view.kind === "picker"
          ? this.picker(layout).map((id) => ({
              id,
              key: id,
              disabled: id !== "separator" && row.includes(id)
            }))
          : row.map((id) => {
              if (isWidget(id)) preceding = id;

              // Discovery can insert separators ahead of the selected contributor.
              return { id, key: id === "separator" ? JSON.stringify([id, preceding]) : id };
            });
    }

    const occurrences = new Map<string, number>();

    return choices.map((choice) => {
      const occurrence = occurrences.get(choice.key) ?? 0;
      occurrences.set(choice.key, occurrence + 1);

      return { ...choice, key: JSON.stringify([choice.key, occurrence]) };
    });
  }

  private refreshNativeRows(layout: Layout): void {
    const views = this.drafts[this.scope].views;

    for (const [index, view] of views.entries()) {
      if (view.kind !== "contents" && view.kind !== "picker") continue;
      const anchor = view.rowAnchor;

      if (anchor && anchor.length > 0) {
        // Native placement changes can alter row contents. Prefer the nearest greatest overlap;
        // inherited saves instead use exact row and duplicate-occurrence matching below.
        let row = -1;
        let best = 0;

        for (const [candidate, items] of layout[view.region].entries()) {
          const overlap = anchor.filter((id) => items.includes(id)).length;

          if (
            overlap > best ||
            (overlap === best &&
              overlap > 0 &&
              Math.abs(candidate - view.row) < Math.abs(row - view.row))
          ) {
            row = candidate;
            best = overlap;
          }
        }

        if (row < 0) {
          views.splice(index);

          return;
        }

        view.row = row;
      }

      view.rowAnchor = (layout[view.region][view.row] ?? []).filter(isWidget);
    }
  }

  /** Refresh discovery and retain selection identity without exposing mutable navigation state. */
  snapshot(): { layout: Layout; view: View; choices: Choice[] } {
    const layout = this.layout();
    this.refreshNativeRows(layout);
    const view = this.currentView;
    const choices = this.choices(layout);

    if (view.selection !== undefined) {
      const selected = choices.findIndex((choice) => choice.key === view.selection);
      if (selected >= 0) view.selected = selected;
    }

    view.selected = Math.max(0, Math.min(view.selected, choices.length - 1));
    view.selection = choices[view.selected]?.key;

    return { layout, view: this.view, choices };
  }

  private open(choice: Choice | undefined): void {
    if (!choice || choice.disabled) return;
    const view = this.currentView;
    if (view.kind === "root") {
      const region = regions.find((candidate) => candidate === choice.id);
      if (region) this.push({ kind: "rows", region, selected: 0 });
      else this.reset();
    } else if (view.kind === "rows")
      this.push({ kind: "contents", region: view.region, row: view.selected, selected: 0 });
    else if (view.kind === "picker") this.add(choice.id);
  }

  /** Closing is unconditional; stale input cannot edit a newly discovered target or save. */
  navigate(action: Navigation): "save" | "close" | undefined {
    if (action === "close") return action;
    const previous = this.currentView;
    const selection = previous.selection;
    const { choices } = this.snapshot();
    if (
      previous !== this.currentView ||
      (selection !== undefined && !choices.some((choice) => choice.key === selection))
    )
      return undefined;

    if (action === "save") return action;
    if (action === "back") return this.back() ? undefined : "close";

    if (action === "switchScope") {
      this.activeScope = this.scope === "global" ? "project" : "global";

      return undefined;
    }

    const before = JSON.stringify(this.current.value);
    const current = this.currentView;

    if (action === "up") current.selected = Math.max(0, current.selected - 1);
    else if (action === "down")
      current.selected = Math.max(0, Math.min(choices.length - 1, current.selected + 1));
    else if (action === "moveUp") this.move(-1);
    else if (action === "moveDown") this.move(1);
    else if (action === "remove") this.remove();
    else if (action === "add") {
      if (current.kind === "rows") this.addRow(current.region);
      else if (current.kind === "contents")
        this.push({ kind: "picker", region: current.region, row: current.row, selected: 0 });
    } else this.open(choices[current.selected]);

    if (before !== JSON.stringify(this.current.value)) {
      // A locally edited row keeps its parent index, even if another row had the same contents.
      for (const parent of this.drafts[this.scope].views.slice(0, -1)) parent.selection = undefined;
    }

    this.currentView.selection = undefined;
    this.currentView.rowAnchor = undefined;
    this.snapshot();

    return undefined;
  }

  private refreshInheritedViews(before: Layout, after: Layout): void {
    const views = this.drafts.project.views;

    for (const [index, view] of views.entries()) {
      if (view.kind === "root") continue;
      const previous = view.kind === "rows" ? view.selected : view.row;
      const key = JSON.stringify(before[view.region][previous]);
      const occurrence = before[view.region]
        .slice(0, previous)
        .filter((row) => JSON.stringify(row) === key).length;
      const matches = after[view.region].flatMap((row, rowIndex) =>
        JSON.stringify(row) === key ? [rowIndex] : []
      );
      const next = matches[occurrence];

      if (next === undefined) {
        // A replaced/removed inherited row must not silently retarget a nested edit.
        if (view.kind === "rows") {
          view.selection = undefined;
          view.selected = Math.max(0, Math.min(previous, after[view.region].length - 1));
          views.splice(index + 1);
        } else views.splice(index);

        break;
      }

      if (view.kind === "rows") view.selected = next;
      else {
        view.row = next;
        view.rowAnchor = after[view.region][next]?.filter(isWidget);
      }
    }
  }

  saved(preferences: Preferences): void {
    if (
      this.drafts.project.value === undefined &&
      (this.scope === "global" || preferences.project === undefined)
    )
      this.refreshInheritedViews(
        resolveLayout(this.persistedGlobal, this.contributions()),
        resolveLayout(preferences.global, this.contributions())
      );
    this.persistedGlobal = structuredClone(preferences.global);
    this.drafts[this.scope].value = structuredClone(preferences[this.scope]);
    this.drafts[this.scope].saved = structuredClone(preferences[this.scope]);
  }
}
