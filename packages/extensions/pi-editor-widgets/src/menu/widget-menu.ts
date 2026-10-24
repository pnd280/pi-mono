import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { SettingsScope } from "@pi-mono/libs/settings-file";
import {
  renderSettingsMenu,
  settingsLoadFeedback,
  settingsSaveFeedback,
  settingsSaveFailure,
  type SettingsFeedback,
  type SettingsMenuItem
} from "@pi-mono/libs/tui/components/settings-menu";
import { KeyControls, type KeybindingSource, type KeyControl } from "@pi-mono/libs/tui/keybindings";

import type { WidgetCoordinator } from "../coordinator.ts";
import { regions } from "../layout.ts";
import type { Preferences, WidgetSettings } from "../settings.ts";
import { WidgetDrafts, type Navigation } from "./drafts.ts";
import { itemLabel, regionLabel, rowSummary, viewTitle } from "./labels.ts";

const minimumHeight = 10;
const successDurationMs = 3000;

const menuControls: readonly KeyControl<Navigation>[] = [
  // Save and close come first, so that a remapped Pi key cannot take them.
  { action: "save", key: "ctrl+s" },
  { action: "close", key: "ctrl+c" },
  { action: "back", id: "tui.select.cancel" },
  { action: "up", id: "tui.select.up" },
  { action: "down", id: "tui.select.down" },
  { action: "open", id: "tui.select.confirm" },
  { action: "switchScope", key: "tab" },
  { action: "switchScope", key: "shift+tab" },
  { action: "add", key: "a" },
  { action: "moveUp", key: "shift+up" },
  { action: "moveDown", key: "shift+down" },
  { action: "remove", key: "delete" },
  // The Mac key labelled Delete sends Backspace; forward Delete needs Fn.
  { action: "remove", key: "backspace" }
];

type Item = SettingsMenuItem & {
  editable?: boolean;
  action?: string;
};

export class WidgetMenu implements Component {
  readonly drafts: WidgetDrafts;
  private readonly controls: KeyControls<Navigation>;
  private feedback: SettingsFeedback | undefined;
  private successExpiry: ReturnType<typeof setTimeout> | undefined;
  private warning: SettingsFeedback | undefined;
  private closed = false;

  constructor(
    private readonly options: {
      settings: WidgetSettings;
      preferences: Preferences;
      coordinator: WidgetCoordinator;
      theme: () => Theme;
      keys: KeybindingSource;
      rows(): number;
      requestRender(): void;
      close(): void;
    }
  ) {
    this.drafts = new WidgetDrafts(options.preferences, () => options.coordinator.contributions());
    this.controls = new KeyControls(options.keys, menuControls);
    this.warning = settingsLoadFeedback(options.preferences.warnings);
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

  ownsFullscreenInput(data: string): boolean {
    return !this.closed && this.actionFor(data) !== undefined;
  }

  private actionFor(data: string): Navigation | undefined {
    const action = this.controls.actionFor(data);

    return action === "switchScope" && !this.options.settings.projectTrusted ? undefined : action;
  }

  handleInput(data: string): void {
    if (this.closed) return;
    const scope = this.drafts.scope;
    const value = JSON.stringify(this.drafts.current.value);
    this.handleMenuInput(data);
    const edited =
      this.actionFor(data) !== "save" &&
      scope === this.drafts.scope &&
      value !== JSON.stringify(this.drafts.current.value);

    if (scope !== this.drafts.scope || (edited && this.feedback?.severity !== "error"))
      this.setFeedback(undefined);
    this.showDraft();
    this.options.requestRender();
  }

  private handleMenuInput(data: string): void {
    const action = this.actionFor(data);
    if (!action) return;
    const effect = this.drafts.navigate(action);
    if (effect === "save") this.save();
    else if (effect === "close") this.close();
  }

  dispose(): void {
    this.closed = true;
    clearTimeout(this.successExpiry);
  }

  private close(): void {
    this.dispose();
    this.options.coordinator.showDraft(undefined);
    this.options.close();
  }

  private setFeedback(feedback: SettingsFeedback | undefined): void {
    clearTimeout(this.successExpiry);
    this.feedback = feedback;
    // Success clears itself; warnings and errors stay until replaced.
    if (feedback?.severity === "success")
      this.successExpiry = setTimeout(() => {
        this.feedback = undefined;
        this.options.requestRender();
      }, successDurationMs);
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
      this.options.coordinator.apply(preferences.project ?? preferences.global);
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
    const controls = this.controls;

    return [
      controls.hint("save", "save"),
      // Without a back key, Ctrl+C is the only way out.
      controls.label("back")
        ? controls.hint("back", view.kind === "root" ? "close" : "back")
        : controls.hint("close", "close"),
      ...(this.options.settings.projectTrusted ? [controls.hint("switchScope", "scope")] : []),
      ...(item ? controls.navigationHints("up", "down", "select") : []),
      ...(item?.action && !item.disabled ? [controls.hint("open", item.action)] : []),
      ...(view.kind === "rows" || view.kind === "contents" ? [controls.hint("add", "add")] : []),
      ...(item?.editable
        ? [
            ...controls.navigationHints("moveUp", "moveDown", "move"),
            controls.hint("remove", view.kind === "rows" ? "remove row" : "remove")
          ]
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
    const addKey = this.controls.label("add");

    const scopes: SettingsScope[] = this.options.settings.projectTrusted
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
      emptyLabel: `${view.kind === "rows" ? "No rows" : "Empty row"}. ${addKey ? `Press ${addKey} to add.` : "Add unavailable."}`,
      hints: this.hints(item),
      feedback: this.feedback ?? this.warning
    });
  }

  invalidate(): void {}
}
