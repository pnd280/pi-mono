import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, type Component } from "@earendil-works/pi-tui";
import { ExpiringNotice } from "@pi-mono/libs/expiring-notice";
import {
  renderSettingsMenu,
  settingsLoadFeedback,
  settingsSaveFeedback,
  settingsSaveFailure,
  type SettingsFeedback,
  type SettingsMenuItem
} from "@pi-mono/libs/tui/components/settings-menu";

import type { WidgetCoordinator } from "./coordinator.ts";
import { WidgetDrafts, type Navigation } from "./drafts.ts";
import { regions } from "./layout.ts";
import { itemLabel, regionLabel, rowSummary, viewTitle } from "./menu-view.ts";
import type { Preferences, Scope, WidgetSettings } from "./settings.ts";

const minimumHeight = 10;
const navigationKeys = [
  ["escape", "back"],
  ["ctrl+c", "close"],
  ["tab", "switchScope"],
  ["shift+tab", "switchScope"],
  ["ctrl+s", "save"],
  ["a", "add"],
  ["shift+up", "moveUp"],
  ["shift+down", "moveDown"],
  ["delete", "remove"],
  ["up", "up"],
  ["down", "down"],
  ["enter", "open"]
] as const;

type Item = SettingsMenuItem & {
  editable?: boolean;
  action?: string;
};

export class WidgetMenu implements Component {
  readonly drafts: WidgetDrafts;
  private feedback: SettingsFeedback | undefined;
  private readonly success: ExpiringNotice<SettingsFeedback>;
  private warning: SettingsFeedback | undefined;
  private closed = false;

  constructor(
    private readonly options: {
      settings: WidgetSettings;
      preferences: Preferences;
      coordinator: WidgetCoordinator;
      theme: () => Theme;
      rows(): number;
      requestRender(): void;
      close(): void;
    }
  ) {
    this.drafts = new WidgetDrafts(options.preferences, () => options.coordinator.contributions());
    this.warning = settingsLoadFeedback(options.preferences.warnings);
    this.success = new ExpiringNotice({
      durationMs: 3000,
      changed: () => this.options.requestRender()
    });
    this.showDraft();
  }

  /** The live regions are the preview; closing restores the saved layout. */
  private showDraft(): void {
    // Input can close the menu, which has already restored the saved layout.
    if (this.closed) return;
    this.options.coordinator.showDraft(this.drafts.source());
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

    return { key: id, label: itemLabel(id), description };
  }

  private items({ layout, view, choices }: ReturnType<WidgetDrafts["snapshot"]>): Item[] {
    if (view.kind === "root")
      return choices.map(({ id, key }) => {
        const region = regions.find((candidate) => candidate === id);

        return region
          ? {
              key,
              label: regionLabel[region],
              description: layout[region].length === 1 ? "1 row" : `${layout[region].length} rows`,
              action: "open"
            }
          : { key, label: "Reset to defaults", gapBefore: true, action: "reset" };
      });
    if (view.kind === "rows")
      return choices.map(({ key }, index) => ({
        key,
        label: `Row ${index + 1}`,
        description: rowSummary(layout[view.region][index] ?? []),
        editable: true,
        action: "open"
      }));
    if (view.kind === "contents")
      return choices.map(({ id, key }) => ({ ...this.contribution(id), key, editable: true }));

    return choices.map(({ id, key, disabled }) => {
      const item = { ...this.contribution(id), key };
      if (disabled) return { ...item, disabled: true, description: "Already in row" };

      return { ...item, action: "add" };
    });
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

    if (scope !== this.drafts.scope || (edited && this.feedback?.severity !== "error"))
      this.setFeedback(undefined);
    this.showDraft();
    this.options.requestRender();
  }

  private handleMenuInput(data: string): void {
    const action: Navigation | undefined = navigationKeys.find(([key]) =>
      matchesKey(data, key)
    )?.[1];
    if (!action || (action === "switchScope" && !this.options.settings.projectTrusted)) return;
    const effect = this.drafts.navigate(action);
    if (effect === "save") this.save();
    else if (effect === "close") this.close();
  }

  dispose(): void {
    this.closed = true;
    this.success.dispose();
  }

  private close(): void {
    this.dispose();
    this.options.coordinator.showDraft(undefined);
    this.options.close();
  }

  private setFeedback(feedback: SettingsFeedback | undefined): void {
    this.success.clear();
    this.feedback = feedback?.severity === "success" ? undefined : feedback;
    if (feedback?.severity === "success") this.success.set(feedback);
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
      this.options.coordinator.apply(
        preferences.project ?? preferences.global,
        preferences.contextThreshold
      );
      this.warning = settingsLoadFeedback(preferences.warnings);
      const feedback = settingsSaveFeedback(false, preferences.warnings);
      // The saved project override takes effect on close; the global draft stays visible for now.
      if (this.drafts.scope === "global" && preferences.project !== undefined)
        feedback.summary = preferences.warnings.length
          ? "Saved; project applies on close.\nSettings warning. Check files."
          : "Saved globally; previewing draft.\nProject layout applies on close.";
      this.setFeedback(feedback);
    } catch (error) {
      this.setFeedback(settingsSaveFailure(error));
    }
  }

  private hints(item: Item | undefined): string[] {
    const view = this.drafts.view;

    return [
      "Ctrl+S save",
      view.kind === "root" ? "Esc close" : "Esc back",
      ...(this.options.settings.projectTrusted ? ["Tab scope"] : []),
      ...(item ? ["↑/↓ select"] : []),
      ...(item?.action && !item.disabled ? [`Enter ${item.action}`] : []),
      ...(view.kind === "rows" || view.kind === "contents" ? ["a add"] : []),
      ...(item?.editable
        ? ["Shift+↑/↓ move", view.kind === "rows" ? "Del remove row" : "Del remove"]
        : [])
    ];
  }

  render(width: number): string[] {
    if (width < 1) return [];
    const rows = this.options.rows() - 2;
    // Leave the live draft regions visible; below the 10-row frame minimum, they clip instead.
    const height = Math.max(
      1,
      Math.min(rows, minimumHeight),
      rows - this.options.coordinator.regionHeight(width)
    );
    const theme = this.options.theme();
    const snapshot = this.drafts.snapshot();
    const items = this.items(snapshot);
    const view = snapshot.view;
    const item = items[view.selected];

    const scopes: Scope[] = this.options.settings.projectTrusted
      ? ["global", "project"]
      : ["global"];

    return renderSettingsMenu({
      width,
      height,
      theme,
      title: viewTitle(view),
      scope: this.drafts.scope,
      scopes: scopes.map((scope) => {
        const draft = this.drafts.draft(scope);

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
      feedback: this.success.value ?? this.feedback ?? this.warning
    });
  }

  invalidate(): void {}
}
