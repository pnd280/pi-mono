# [pi-subagents](README.md) development

Use only public Pi APIs and RPC; the one exception is the late-usage patch in [ADR 0002](docs/adr/0002-count-late-background-usage.md). Keep task policy and process lifecycle in this package.

## Boundaries

- Do not use Pi's `RpcClient`: it cannot answer child dialogs or stop process trees, and its environment merging breaks fixture isolation.
- Keep entry identifiers in `src/constants.ts`, shared by readers and writers.
- Preserve the supervisor's project-trust decision, and pass only the explicitly selected child arguments.
- Before changing when background results are delivered, read [ADR 0001](docs/adr/0001-hold-run-for-background-results.md).
- Hold capacity until a child exits, including during forced shutdown. Claim inactive tasks before waiting for capacity to prevent concurrent resumes.
- Claim a live connection before sending input; retry only when no prompt was sent. Ownership transfer receipts identify their recipient; keep stopped-owner validation and commit under one shared filesystem lock, and preserve retry and restart recovery after a recipient write failure.
- Keep foreign transcript reads in memory. Only inactive-owner adoption may open a foreign session for an intentional metadata write.
- Runtime code must not import validation fixtures. Fixtures use the isolated shared Pi launcher and fixed offline scenarios.

## Validation

Follow the [testing coverage and manual checks](docs/testing.md). New invariants and tests require user approval under the workspace testing policy. Recheck public contracts with the [compatibility checklist](docs/pi-compatibility.md) and [installed Pi API references](../../../docs/pi-docs.md) when upgrading Pi.
