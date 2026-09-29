# Settings menu

[Shared TUI](../../README.md#usage)

`renderSettingsMenu` provides the common frame for scoped settings editors. Import it and its feedback helpers from `@pi-mono/libs/tui/components/settings-menu`.

## Behavior

The frame shares scoped settings presentation between `/widgets` and `/working-message`. `*` marks an edited draft; `(not set)` refers to persisted state, not whether the draft has been edited.

Overflowing lists show `(selected/total)` below the last visible item rather than in the border; border overflow labels are reserved for prose previews.

At 40×10, selection, save/exit controls, and inline recovery take priority over paths and secondary draft context. Below that size, resize if controls or recovery no longer fit.

`settingsLoadFeedback`, `settingsSaveFeedback`, and `settingsSaveFailure` distinguish warnings, overridden saves, and failures. Labels, destinations, and feedback are terminal-sanitized; caller-owned values are unchanged.

## Caller responsibilities

Own input, selection, drafts, persistence, and domain-specific actions. Supply only available hints, with Ctrl+S save and the actual Escape action first. The frame performs no I/O and never applies a draft.

Keep scope `isSet` tied to successful persistence and `dirty` tied to the saved baseline. Clear stale success on actual edits or scope switches. Keep failures actionable until retry or a scope switch, and retain load warnings until settings reload successfully.

Pass the current Pi theme on each render. Mount through the [responsive custom UI host](../../responsive-custom-ui/README.md) without an overlay for these settings editors.

## Validation

Use the [library checks](../../../../README.md#validation). [Frame tests](index.test.ts) cover pagination, layout, and terminal safety; consumers own draft, save, and host integration tests. Physical keyboard and appearance need terminal validation.
