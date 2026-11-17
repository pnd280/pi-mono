# Todo test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests mutation atomicity, replayable snapshots, and tool exposure, while libs and utils own shared algorithms and [tool display](../../pi-tool-display/docs/testing.md) owns todo cards. The mutation and replay tests also exercise schema projection, rejected hierarchy and dependency changes, field limits, and model-facing list bounds as part of the listed invariants.

## Must not regress

- **Critical, unit:** A rejected mutation leaves the tasks and next ID unchanged, including when the proposed result exceeds snapshot limits.
- **Critical, unit:** Returned tool results contain a complete replayable state snapshot on success and domain failure, and mutating objects in them cannot change live todo state or later results. Invalid parameter shapes may throw instead.
- **Critical, e2e:** A successful direct model call records its snapshot in the session branch for reconstruction.
- **Critical, unit:** Replay skips snapshots that are not version 2 or exceed the current limits.
- **Critical, unit:** Replay restores the latest valid todo result on the current branch, or empty state if none exists.
- **High, unit:** An update whose metadata fits the limits alone, but not after it merges with the stored metadata, is rejected with the metadata limit error as a replayable failure that leaves the tasks, next ID, and revision unchanged.
- **High, e2e:** Nested tool calls cannot discover or execute the `todo` tool.

## Not tested

- Activation rules, widget collapse settings, widget layout, widget cleanup, clearing todo activity beside other working-message contributions, and the read-only browser are below the severity bar. The [working-message fixture](validation.md#working-message-fixture) checks cleanup and activity manually.
- Shared TUI layout is checked manually; use the [shared TUI validation](../../../libs/src/tui/README.md#validation).
- Pi owns its session persistence internals.
