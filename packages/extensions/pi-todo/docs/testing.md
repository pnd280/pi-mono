# Todo test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests mutation atomicity, replayable snapshots, tool exposure, and cleanup of shared UI state, while libs and utils own shared algorithms and [tool display](../../pi-tool-display/docs/testing.md) owns todo cards.

## Must not regress

- **Critical, unit:** A rejected mutation leaves the tasks and next ID unchanged, including when the proposed result exceeds snapshot limits.
- **Critical, unit:** Returned tool results contain a complete replayable state snapshot on success and domain failure. Invalid parameter shapes may throw instead.
- **Critical, e2e:** A successful direct model call records its snapshot in the session branch for reconstruction.
- **Critical, unit:** Replay skips snapshots that are not version 2 or exceed the current limits.
- **Critical, unit:** Replay restores the latest valid todo result on the current branch, or empty state if none exists.
- **High, e2e:** Nested tool calls cannot discover or execute the `todo` tool.
- **High, unit:** Widget cleanup removes only the todo widget registration.
- **High, unit:** Clearing todo activity leaves other working-message contributions intact while the session stays active.

## Not tested

- Schema projection, hierarchy and dependency rules, field limits, model-facing list bounds, activation rules, widget collapse settings, widget layout, and the read-only browser are below the severity bar.
- Libs own full snapshots of shared tree and layout output.
- Pi owns its session persistence internals.
