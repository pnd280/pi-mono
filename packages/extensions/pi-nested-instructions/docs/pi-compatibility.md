# Pi compatibility for maintainers

[Package](../README.md) · [Glossary](../GLOSSARY.md)

> Last verified against Pi 1.3.0 (package checks and offline host tests, real codemode cases, shared utils, FFF guard, and display suites, and an unchanged native context loader; no runtime changes needed). Not covered: live FFF integration and manual [notice](../GLOSSARY.md#delivery) presentation.

## Upgrade procedure

1. Run the [package checks and offline tests](../README.md#validation). No paid model request is needed.
2. After shared adapter changes, also run the utils and `pi-fff-guard` suites. Changes to the notice contract also need the pi-tool-display suite.
3. Work through the checklist below, then update the "Last verified" line.

## Checklist

Nested discovery must preserve Pi's native instruction loading and deduplicate against the surviving session context.

### Native discovery

- [ ] Native context discovery still prefers `AGENTS.override.md`, `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, then `CLAUDE.MD`.
- [ ] It strips a UTF-8 BOM, follows file symlinks, and skips unreadable and non-regular candidates.

### Tool inputs

- [ ] `turn_end.message` exposes the inputs of tool calls the assistant made directly, including blocked or rejected calls.
- [ ] Public `tool_execution_start` events with `parentToolCallId` supply nested inputs before validation and interception. Collect them until the same `turn_end`, without reading results.
- [ ] Only direct calls can create [read markers](../GLOSSARY.md#discovery), because nested output may never reach the model.
- [ ] Boundary drafts are saved after tool results and before the next model request, without implicit steering or continuation.
- [ ] `getAllTools().sourceInfo` identifies official FFF tools, including late registrations and overrides. Check the selective-read and native path schemas alongside FFF's real source schemas.

### Session

- [ ] `buildSessionProjection()` keeps source entry IDs and applies compaction and context edits. `getBranch()` supplies metadata for the branch.
- [ ] Replaced content doesn't keep its loaded status just because its details are unchanged.
- [ ] `session_start` fires for startup, resume, reload, new sessions, and forks.
- [ ] `sendMessage(..., { triggerTurn: false })` doesn't interrupt a running batch.
- [ ] No pending discovery state is kept across turns or sessions.
- [ ] Metadata-only custom entries stay out of model context. Visible notices keep their content and details without a registered renderer. Presentation belongs to the [pi-tool-display adapter](../../pi-tool-display/src/adapters/pi-nested-instructions/README.md).

## Persisted notice contract

The [notice interface](../src/notices.ts) writes version 3. Version 3 changes only the model-facing text: a note says that Pi sent the notice, not the user, and loaded and updated notices wrap the instruction body in a `<project_instructions path="…">` tag. It retains `messageDigest` to validate the full canonical model-facing message before the [ledger](../GLOSSARY.md#delivery) decodes and compares its instruction body.

This is a breaking replay change with no compatibility reader or automatic migration:

- Version-1 and version-2 notices no longer validate. Strict validation also rejects the version-1 `stamp` and `fileDigest` keys.
- Invalid notices provide no deduplication or refresh [scope](../GLOSSARY.md#discovery) tracking, no structured notice rendering, and no run-summary counts. Their original model-facing content is not deleted; display falls back to the supplied text.
- Resume and reload do not eagerly restore scopes represented only by old notices. A later qualifying tool input can load those instructions again, even while the old message text remains in context.
- Direct-read markers remain version 1 and retain their filesystem revision stamps, originating-call identity, and call fingerprints.

Keep discovery and the pi-tool-display adapter on the same notice contract. Contract changes need checks for strict validation, visible-message corruption, body equality, rendering, summaries, and host replay.

## Limitations

The extension uses only public Pi APIs, with no host patches or tool overrides. The local filename list and input adapters still need checking on upgrades, because Pi has no public API for discovering only nested files that also avoids reading instruction files the model read directly.

- Discovery doesn't follow result paths, opaque scripts, FFF cursor state, or temporary context rewrites by other extensions.
- A [direct read](../GLOSSARY.md#discovery) is an attempt, not proof that the content was delivered in full.
- Comparing filesystem revisions on reload avoids rereading unchanged files the model read directly.

Replace local behaviour only if a public Pi API keeps these boundaries and metadata-only markers. Don't replace it with the startup loader, which also reads global and ancestor content.
