# Settings menu

[Shared TUI](../../README.md#usage)

`renderSettingsMenu` provides the common frame for scoped settings editors. Import it and its feedback helpers from `@pi-mono/libs/tui/components/settings-menu`.

## Behavior

The frame shares headings, scope tabs, save destinations, list styling, overflow positions, dirty indicators, feedback, and controls between `/widgets` and `/working-message`. The selected save scope uses the accent color. `*` marks an edited draft; `(not set)` refers to persisted state, not whether the draft has been edited.

Overflowing lists show a dim `(selected/total)` row directly below the last visible item, before draft state, feedback, or controls. Settings-frame borders never carry list pagination; border overflow labels are reserved for prose previews. Lists that fit show no counter. Constrained layouts drop the bottom border before scope context to retain the selected item and its counter.

Feedback has a blank line above it when space allows; constrained layouts drop that gap before sacrificing selection, recovery, or controls. Keybinding hints always have a blank line above them, even in compact layouts; that separator is part of the reserved control budget.

At 40×10, selection, save/exit controls, and inline recovery take priority over paths and secondary draft context. Below that size, the target takes priority; resize if controls or recovery no longer fit. Lists never wrap or change selection during rendering.

`settingsLoadFeedback`, `settingsSaveFeedback`, and `settingsSaveFailure` distinguish warnings, successful but overridden saves, and failed saves with retained drafts. Detail lines appear when space allows. Labels, destinations, and feedback are terminal-sanitized; caller-owned values are unchanged.

## Caller responsibilities

Own input, selection, drafts, persistence, and domain-specific actions. Supply only available hints, with Ctrl+S save and the actual Escape action first. The frame performs no I/O and never applies a draft.

Keep scope `isSet` tied to successful persistence and `dirty` tied to the saved baseline. Clear stale success on actual edits or scope switches. Keep failures actionable until retry or a scope switch, and retain load warnings until settings reload successfully.

Pass the current Pi theme on each render. Mount through the [responsive custom UI host](../../responsive-custom-ui/README.md) without an overlay for these settings editors.

## Validation

Use the [library checks](../../../../README.md#validation). Tests cover list-local pagination, constrained layout, target and recovery visibility, scope/dirty cues, empty states, and terminal safety. Consumers own draft, save, and host integration tests. Terminal appearance and physical keyboard protocols require separate terminal validation.
