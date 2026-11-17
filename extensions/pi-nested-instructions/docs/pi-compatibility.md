# Pi compatibility for maintainers

[Package](../README.md) · [Glossary](../GLOSSARY.md)

> Last verified against Pi 1.5.2 with package checks, offline host tests that include real codemode cases, and a source review of the Pi 1.5.1 to 1.5.2 changes. Not covered: manual [notice](../GLOSSARY.md#delivery) presentation and Windows paths.

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
- [ ] Boundary drafts are saved after tool results and before the next model request, without implicit steering or continuation.
- [ ] The selective-read and native path schemas still match the fields that the adapters read.
- [ ] On Windows, native tools still map `/c/…`, `/mnt/c/…`, and `/cygdrive/c/…` to `C:\…`, as `nativePath()` in the [scope extraction](../src/scopes.ts) does.

Discovery collects nested inputs until the same `turn_end`, without reading results. Only direct calls create [read markers](../GLOSSARY.md#discovery), because nested output may never reach the model.

### Session

- [ ] `turn_end.context.contextEntries` includes earlier boundary drafts and applies their compaction and context edits.
- [ ] Returning boundary entries replaces the accumulated draft list.
- [ ] `buildSessionProjection()` keeps source entry IDs and applies compaction and context edits.
- [ ] `getBranch()` supplies metadata for the branch.
- [ ] `session_start` fires for startup, resume, reload, new sessions, and forks.
- [ ] Pi awaits each `session_start` handler and then emits `resources_discover`, whose first lifecycle participant handler runs the startup commit that sends refreshed notices.
- [ ] An idle `sendMessage(..., { triggerTurn: false })` appends the message at once, so the commit rank decides its place among startup entries.
- [ ] `sendMessage(..., { triggerTurn: false })` doesn't interrupt a running batch.
- [ ] Metadata-only custom entries stay out of model context.
- [ ] Visible notices keep their content and details without a registered renderer.

Discovery preserves `turn_end.entries` when it adds notices or markers, because returned entries replace the draft list. Replaced content doesn't keep its loaded status just because its details are unchanged, and no pending discovery state is kept across turns or sessions. Presentation belongs to the [pi-tool-display adapter](../../pi-tool-display/src/adapters/pi-nested-instructions/README.md).

## Persisted notice contract

The [notice interface](../src/notices.ts) writes version 3. Display extensions decode notices with the `pi-nested-instructions/notices` export. A note identifies Pi as the sender, and loaded and updated notices wrap the instruction body in a `<project_instructions path="…">` tag. The `messageDigest` validates the full canonical model-facing message before the [ledger](../GLOSSARY.md#delivery) decodes and compares its instruction body.

The reader validates the current schema strictly:

- Notices with a version other than 3 or unknown metadata keys do not validate.
- The [invalid-notice behaviour](loading.md#invalid-notice-metadata) applies when validation fails.
- Direct-read markers use version 1 and hold filesystem revision stamps, originating-call identity, and call fingerprints.

## Limitations

The extension uses only public Pi APIs, with no host patches or tool overrides. The local filename list and input adapters still need checking on upgrades, because Pi has no public API for discovering only nested files that also avoids reading instruction files the model read directly.

- Discovery doesn't follow result paths, opaque scripts, or temporary context rewrites by other extensions.
- A [direct read](../GLOSSARY.md#discovery) is an attempt, not proof that the content was delivered in full.
- In Pi 1.5.0 to 1.5.2, a saved "Do not trust" decision makes `ctx.isProjectTrusted()` false even for a folder with only `AGENTS.md`. Pi still loads context files regardless of project trust, and discovery also ignores trust, so both stay aligned.
- In Pi 1.4.0 to 1.5.2, discovery reads inputs as issued, before Pi coerces them. A path that Pi converts to a string, such as a number, gives no scope.
- In Pi 1.5.1 and 1.5.2 on Windows, native `find` reads `\` in a pattern as a path separator. Discovery [reads a pattern's directories only with `/`](input-discovery.md#windows).

Replace local behaviour only if a public Pi API keeps these boundaries and metadata-only markers. Don't replace it with the startup loader, which also reads global and ancestor content.
