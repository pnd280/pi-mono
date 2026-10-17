# Settings menu

[Shared TUI](../../README.md#usage)

[`renderSettingsMenu`](index.ts) gives scoped settings editors a common frame for dirty-state markers, feedback, and controls.

## Behaviour

- `*` marks an edited draft; `(not set)` refers to persisted state, not whether the draft has been edited.
- Overflowing lists show `(selected/total)` below the last visible item rather than in the border; border overflow labels are reserved for prose previews.
- The list budgets group gaps only within the visible window. Hidden groups do not reduce the number of visible items.
- At 40×10, selection, save and exit controls, and inline recovery take priority over paths and secondary draft context.
- Below that size, resize if controls or recovery no longer fit.
- `settingsLoadFeedback`, `settingsSaveFeedback`, and `settingsSaveFailure` distinguish warnings, overridden saves, and failures.
- Labels, destinations, and feedback are terminal-sanitised; caller-owned values are unchanged.
- The frame performs no I/O and never applies a draft.

## Caller responsibilities

- Own input, selection, drafts, persistence, and domain-specific actions.
- Supply only available hints, with **Ctrl+S** save and the actual **Escape** action first.
- Keep scope `isSet` tied to successful persistence and `dirty` tied to the saved baseline.
- Clear stale success on actual edits or scope switches.
- Keep failures actionable until retry or a scope switch, and retain load warnings until settings reload successfully.
- Pass the current Pi theme on each render.
- Mount through the [responsive custom UI host](../../responsive-custom-ui/README.md) without an overlay for these settings editors.

## Validation

Use the [library checks](../../../../README.md#validation). Consumers own draft, save, and host integration tests. Physical keyboard and appearance need terminal validation.
