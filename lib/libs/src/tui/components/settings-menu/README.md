# Settings menu

[Shared TUI](../../README.md#usage)

Scoped settings editors need a common frame for dirty-state markers, feedback, and controls. [`renderSettingsMenu`](index.ts) renders this frame from the caller's scopes, items, and feedback.

## Behaviour

- `*` marks an edited draft.
- `(not set)` refers to persisted state, not whether the draft has been edited.
- `settingsLoadFeedback`, `settingsSaveFeedback`, and `settingsSaveFailure` distinguish warnings, overridden saves, and failures.
- On small terminals, the frame keeps controls and inline recovery visible before secondary context. The [settings menu layout guide](../../../../docs/tui-settings-menu.md) gives the sizes and the list overflow rules.
- The frame sanitises labels, destinations, and feedback for the terminal, and leaves caller-owned values unchanged.
- The frame performs no I/O and never applies a draft.

## Usage

Build `controls` as shown in the [keybinding example](../../keybindings/README.md#usage), then pass its hints to the frame.

```ts
import {
  renderSettingsMenu,
  settingsSaveFeedback
} from "@pi-mono/libs/tui/components/settings-menu";

const lines = renderSettingsMenu({
  width,
  height,
  theme,
  title: "Widgets",
  scopes: [
    { id: "global", label: "Global", destination: globalPath, isSet: true, dirty: draft.dirty }
  ],
  scope: "global",
  items: [{ key: "clock", label: "Clock", description: "Show the time" }],
  selected,
  emptyLabel: "No widgets",
  hints: [
    controls.hint("save", "save"),
    controls.hint("close", "close"),
    ...controls.navigationHints("up", "down", "select")
  ],
  feedback: saved ? settingsSaveFeedback(false) : undefined
});
```

## Caller responsibilities

- Own input, selection, drafts, persistence, and domain-specific actions.
- Put the save hint and the cancel hint first.
- Build hints from the keys that reach each action within the view, and show "unavailable" when an action has no key.
- Keep scope `isSet` tied to successful persistence.
- Keep `dirty` tied to the saved baseline.
- Clear stale success on actual edits or scope switches.
- Keep failures actionable until retry or a scope switch.
- Retain load warnings until settings reload successfully.
- Pass the current Pi theme on each render.
- Mount through the [responsive custom UI host](../../responsive-custom-ui/README.md) without an overlay for these settings editors.

Related: consumers own draft, save, and host integration tests; the [shared TUI validation](../../README.md#validation) lists the terminal checks.
