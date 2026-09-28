# Session management coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

## Contracts

### Session commands and startup

- Persistence and child creation require `isIdle()` and warn immediately when busy, without waiting, saving, switching, or queuing. Busy child creation includes a POSIX-shell-safe `pi --parent-session` command for an existing parent file; ephemeral or unwritten parents receive save-first guidance. The command preserves paths with spaces, apostrophes, and shell metacharacters as one literal argument. Paths with control characters receive idle-retry guidance instead; notifications sanitize displayed paths without changing filesystem or session-switch targets.
- `/sesh persist` copies only the active branch under a fresh session header, retains any parent link, and switches to the saved file. Entries keep IDs, parent links, metadata, and model context. The current session-wide name or explicit clearing survives even when its metadata is outside the active branch; an empty branch can retain a name without importing conversation. The source and already file-backed sessions remain unchanged.
- `/sesh create-empty-child` starts an empty conversation linked to the current persisted session. It refuses ephemeral parents and allocated-but-unwritten parent files, and leaves the current session unchanged on cancellation.
- `/sesh` owns persistence, child creation, and `auto-name [clear]`; no standalone naming command is registered. Unsupported subcommands and extra arguments cause no session operations or naming requests. Completion offers supported subcommands and nested clear with short descriptions, without intercepting submission of complete arguments.
- Only persistence and child creation share an operation lock. Naming works while the agent or a session operation is busy; regeneration supersedes previous generation and clear cancels immediately.
- Cancelled persistence removes the new file. A switch error retains the saved copy for recovery.
- `--parent-session` resolves a readable file path or an unambiguous exact ID without changing the parent. Header reads are bounded; malformed, oversized, missing, or non-file parents are rejected safely.
- The startup flag cannot reparent existing/nonempty sessions or combine with conflicting session-selection flags. Pi parses prompts and option values without treating their contents as flags.
- File-backed and ephemeral children keep the chosen parent without importing its conversation. Persisting an ephemeral child retains its lineage. Scratch sessions reconstructed by other extension factories are ignored. Reload and later sub-session creation do not reapply the startup parent.
- The initial JSON header already includes the parent, and startup errors exit nonzero instead of proceeding into a prompt.

### Naming

- Generation requires an explicit model and supported thinking level from `ext.pi-session-utils.auto-title` in global or trusted current-project settings. Fields inherit across scopes. Missing or invalid settings disable requests rather than selecting a fallback model; clear and session operations remain available.
- Automatic naming makes at most one attempt per load, waits for nonempty user text without consuming the attempt, preserves existing names, and stays quiet. Manual regeneration uses recent current-branch conversation and reports safe notifications.
- Only current-branch user and assistant text is sent, within the documented 4,000-character source bounds; tool output and thinking are excluded. Complete text responses become sanitized, grapheme-safe titles of at most 80 characters; incomplete responses and provider errors preserve the name.
- Authentication and transport use Pi's configured provider. Deadlines and cancellation settle even if external work ignores abort, and stale results cannot rename a session.
- Native rename/clear cancels generation even if the name returns to its original value. Tree navigation, reload, session replacement, and shutdown also cancel pending work; tree navigation does not replenish the automatic attempt. Persistence retains existing name metadata, while empty children start unnamed and can name themselves from their own requests. Print/JSON output stays clean and exit does not wait for background naming.

## Coverage boundaries

This package owns command policy, JSONL snapshot selection, parent resolution, startup-hook lifecycle, source selection, naming configuration, title sanitization, and naming lifecycle wiring. Session-manager round trips, Pi host and runtime tests, and isolated installed-Pi processes verify integration. [OwnedHooks](../../../libs/src/owned-hooks/README.md) owns property restoration; [libraries](../../../libs/docs/testing.md) own latest-task stale-result protection, bounded settings I/O, and terminal grapheme algorithms. Pi owns session reconstruction, metadata serialization, later persistence, and provider-specific reasoning mappings.

## Exclusions

No paid model requests, subjective title-quality assertions, alternative-branch export, terminal rendering assertions, or duplicated provider-authentication implementation. Use representative host modes for distinct notification/activation branches plus real process checks, rather than testing every scenario in every mode. Process fixtures use offline providers or append assistant entries directly to exercise persistence.
