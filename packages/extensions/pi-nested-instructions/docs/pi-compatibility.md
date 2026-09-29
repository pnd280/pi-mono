# Pi compatibility

[Package](../README.md)

## Contracts to verify

- [ ] Native context discovery still prioritizes `AGENTS.override.md`, `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, then `CLAUDE.MD`, strips a UTF-8 BOM, follows file symlinks, and skips unreadable/nonregular candidates.
- [ ] `turn_end.message` exposes issued assistant tool-call inputs, including blocked or rejected calls; boundary drafts are persisted after tool results and before the next model request, without implicit steering or continuation.
- [ ] `getAllTools().sourceInfo` identifies official FFF tools, including late registrations and overrides. Check selective-read and native path schemas alongside FFF's actual source schemas.
- [ ] `buildSessionProjection()` retains source entry IDs and applies compaction/context edits; `getBranch()` supplies branch-local metadata. Replaced content must not retain loaded status from unchanged details alone.
- [ ] `session_start` fires for startup, resume, reload, new sessions, and forks. `sendMessage(..., { triggerTurn: false })` does not interrupt a running batch. No pending discovery state is kept across turns or sessions.
- [ ] Metadata-only custom entries remain absent from model context; visible notices retain their content/details without a registered renderer. Presentation belongs to the [pi-tool-display adapter](../../pi-tool-display/src/adapters/pi-nested-instructions/README.md).

## Limitations and replacement opportunities

Uses public Pi APIs; no host patch or tool override. The local filename list and input adapters need upgrade checks because Pi has no public nested-only discovery API that avoids reading directly observed instruction files.

Scope detection is deliberately conservative. It does not follow result paths, opaque scripts, FFF cursor state, or transient context rewrites by other extensions. Direct reads are attempts, not proof of complete delivery. Filesystem revision comparison on reload avoids reading unchanged directly observed files.

Replace local behavior only if a public Pi API preserves these boundaries and metadata-only markers. Do not replace it with the startup loader, which also reads global/ancestor content.

## Validation

Run [package checks and offline tests](../README.md#validation), plus utils and `pi-fff-guard` suites after shared adapter changes. Notice contract changes also require the pi-tool-display suite. No paid model request is required by the automated checks.
