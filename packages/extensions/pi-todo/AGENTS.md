# pi-todo development

## Constraints

Keep hierarchy independent of status and dependencies, mutations atomic, and every result fully replayable.

Leave cards to the host; attach no renderer fields to the tool definition.

Reuse shared terminal sanitization and [custom-UI mounting](../../libs/src/tui/responsive-custom-ui/README.md). Publish activity through the [working-message coordinator](../../libs/src/working-message/README.md), not directly to Pi. Keep UI ownership local; use non-overlay UI in fullscreen mode without global keybinding changes.

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

For UI changes, use the [interactive checks](docs/validation.md); see [coverage boundaries](docs/testing.md#coverage-boundaries) before duplicating shared-library tests.
