import {
  defaultLayout,
  isWidget,
  regions,
  resolveLayout,
  type Layout,
  type Placement,
  type Region
} from "./layout.ts";
import type { Preferences, Scope } from "./settings.ts";

export type View =
  | { kind: "root"; selected: number }
  | { kind: "rows"; region: Region; selected: number }
  | { kind: "contents" | "picker"; region: Region; row: number; selected: number };

type Draft = { value: Layout | undefined; saved: Layout | undefined; views: View[] };

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
  readonly drafts: Record<Scope, Draft>;
  scope: Scope;
  private persisted: Preferences;

  constructor(
    preferences: Preferences,
    private readonly contributions: () => Placement[]
  ) {
    this.persisted = structuredClone(preferences);
    const draft = (value: Layout | undefined): Draft => ({
      value: structuredClone(value),
      saved: structuredClone(value),
      views: [{ kind: "root", selected: 0 }]
    });
    this.drafts = { global: draft(preferences.global), project: draft(preferences.project) };
    this.scope = preferences.project === undefined ? "global" : "project";
  }

  get current(): Draft {
    return this.drafts[this.scope];
  }
  get view(): View {
    return this.current.views.at(-1) ?? { kind: "root", selected: 0 };
  }
  get dirty(): boolean {
    return JSON.stringify(this.current.value) !== JSON.stringify(this.current.saved);
  }

  /** The displayed draft before discovery; unset project drafts inherit the saved global layout. */
  source(): Layout {
    const inherited = this.scope === "project" ? this.persisted.global : undefined;

    return this.current.value ?? inherited ?? defaultLayout();
  }

  layout(): Layout {
    return resolveLayout(this.source(), this.contributions());
  }

  push(view: View): void {
    this.current.views.push(view);
  }
  back(): boolean {
    if (this.current.views.length === 1) return false;
    this.current.views.pop();

    return true;
  }

  reset(): void {
    this.current.value = defaultLayout();
    this.current.views = [{ kind: "root", selected: 0 }];
  }

  addRow(region: Region): void {
    const layout = this.layout();
    layout[region].push([]);
    this.current.value = layout;
    this.view.selected = layout[region].length - 1;
  }

  remove(): void {
    const view = this.view;
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
    this.current.value = layout;
  }

  move(delta: number): void {
    const view = this.view;
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
    if (changed) this.current.value = layout;
  }

  /** Hidden contributions first, then visible ones that can be duplicated into another row. */
  picker(): string[] {
    const layout = this.layout();

    return ["separator", "flex", ...layout.hidden, ...placedIds(layout)];
  }

  add(id: string): void {
    const view = this.view;
    if (view.kind !== "picker") return;
    const layout = this.layout();
    const row = layout[view.region][view.row];
    if (!row || (id !== "separator" && row.includes(id))) return;
    if (isWidget(id) && !layout.hidden.includes(id) && !placedIds(layout).includes(id)) return;
    row.push(id);
    layout.hidden = layout.hidden.filter((hidden) => hidden !== id);
    this.current.value = layout;
    this.back();
    this.view.selected = row.length - 1;
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
          view.selected = Math.max(0, Math.min(previous, after[view.region].length - 1));
          views.splice(index + 1);
        } else views.splice(index);

        break;
      }

      if (view.kind === "rows") view.selected = next;
      else view.row = next;
    }
  }

  saved(preferences: Preferences): void {
    if (this.scope === "global" && this.drafts.project.value === undefined)
      this.refreshInheritedViews(
        resolveLayout(this.persisted.global, this.contributions()),
        resolveLayout(preferences.global, this.contributions())
      );
    this.persisted = structuredClone(preferences);
    this.current.value = structuredClone(preferences[this.scope]);
    this.current.saved = structuredClone(preferences[this.scope]);
  }
}
