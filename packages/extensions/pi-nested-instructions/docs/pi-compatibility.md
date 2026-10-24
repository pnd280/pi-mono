# Pi compatibility for maintainers

[Package](../README.md) · [Glossary](../GLOSSARY.md)

> Last verified against Pi 1.4.0 with package checks, offline host tests that include real codemode cases, and a source review of the Pi 1.3.0 to 1.4.0 changes. Not covered: live FFF integration and manual [notice](../GLOSSARY.md#delivery) presentation.

## Upgrade procedure

1. Run both package tasks, `check` and `test`, with the [focused validation commands](../../../../docs/development.md#focused-validation). The tests run offline without paid model requests.
2. After shared adapter changes, also run the utils and `pi-fff-guard` suites. Changes to the notice contract also need the pi-tool-display suite.
3. Work through the checklist below, then update the "Last verified" line.

## Checklist

Nested discovery must preserve Pi's native instruction loading and deduplicate against the surviving session context.

### Native discovery

- [ ] Native context discovery still prefers `AGENTS.override.md`, `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, then `CLAUDE.MD`.
- [ ] Native context discovery strips a UTF-8 BOM.
- [ ] Native context discovery follows file symlinks.
- [ ] Native context discovery skips unreadable and non-regular candidates.

### Tool inputs

- [ ] `turn_end.message` exposes the inputs of tool calls the assistant made directly, including blocked or rejected calls.
- [ ] `turn_end.messageEntryId` identifies the exact source entry for each direct call.
- [ ] Public `tool_execution_start` events with `parentToolCallId` supply nested inputs before validation and interception.

Discovery collects nested inputs until the same `turn_end`, without reading results.

- [ ] Only direct calls can create [read markers](../GLOSSARY.md#discovery), because nested output may never reach the model.
- [ ] Boundary drafts are saved after tool results and before the next model request, without implicit steering or continuation.
- [ ] `getAllTools().sourceInfo` identifies official FFF tools, including late registrations and overrides.
- [ ] The selective-read and native path schemas still match the fields that the adapters read.
- [ ] On Windows, native tools still map `/c/…`, `/mnt/c/…`, and `/cygdrive/c/…` to `C:\…`, as `nativePath()` in the [scope extraction](../src/scopes.ts) does.

Compare the FFF adapters with FFF's real source schemas, not its README parameters.

### Session

- [ ] `turn_end.context.contextEntries` includes earlier boundary drafts and applies their compaction and context edits.
- [ ] Returning boundary entries replaces the accumulated draft list.
- [ ] `buildSessionProjection()` keeps source entry IDs and applies compaction and context edits.
- [ ] `getBranch()` supplies metadata for the branch.
- [ ] Replaced content doesn't keep its loaded status just because its details are unchanged.
- [ ] `session_start` fires for startup, resume, reload, new sessions, and forks.
- [ ] Pi awaits each `session_start` handler and then emits `resources_discover`, whose first lifecycle participant handler runs the startup commit that sends refreshed notices.
- [ ] An idle `sendMessage(..., { triggerTurn: false })` appends the message at once, so the commit rank decides its place among startup entries.
- [ ] `sendMessage(..., { triggerTurn: false })` doesn't interrupt a running batch.
- [ ] No pending discovery state is kept across turns or sessions.
- [ ] Metadata-only custom entries stay out of model context.
- [ ] Visible notices keep their content and details without a registered renderer.

Discovery preserves `turn_end.entries` when it adds notices or markers, because returned entries replace the draft list. Presentation belongs to the [pi-tool-display adapter](../../pi-tool-display/src/adapters/pi-nested-instructions/README.md).

## Persisted notice contract

The [notice interface](../src/notices.ts) writes version 3. A note identifies Pi as the sender, and loaded and updated notices wrap the instruction body in a `<project_instructions path="…">` tag. The `messageDigest` validates the full canonical model-facing message before the [ledger](../GLOSSARY.md#delivery) decodes and compares its instruction body.

The reader validates the current schema strictly:

- Notices with a version other than 3 or unknown metadata keys do not validate.
- Invalid notices provide no deduplication or refresh [scope](../GLOSSARY.md#discovery) tracking, no structured notice rendering, and no run-summary counts. Their original model-facing content is not deleted; display falls back to the supplied text.
- Resume and reload do not eagerly restore scopes represented only by invalid notices. A later qualifying tool input can load those instructions again, even while the invalid message text remains in context.
- Direct-read markers use version 1 and hold filesystem revision stamps, originating-call identity, and call fingerprints.

Keep discovery and the pi-tool-display adapter on the same notice contract. Contract changes need checks for strict validation, visible-message corruption, body equality, rendering, summaries, and host replay.

## Limitations

The extension uses only public Pi APIs, with no host patches or tool overrides. The local filename list and input adapters still need checking on upgrades, because Pi has no public API for discovering only nested files that also avoids reading instruction files the model read directly.

- Discovery doesn't follow result paths, opaque scripts, FFF cursor state, or temporary context rewrites by other extensions.
- A [direct read](../GLOSSARY.md#discovery) is an attempt, not proof that the content was delivered in full.

Replace local behaviour only if a public Pi API keeps these boundaries and metadata-only markers. Don't replace it with the startup loader, which also reads global and ancestor content.
