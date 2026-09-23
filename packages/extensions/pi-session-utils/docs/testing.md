# Session command coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

## Contracts

- Both commands require `isIdle()` and warn immediately when busy, without waiting, saving, switching, or queuing work. Busy child creation includes a POSIX-shell-safe `pi --parent-session` command for an existing parent file; ephemeral or unwritten parents receive save-first guidance instead. The CLI command preserves paths containing spaces, apostrophes, and shell metacharacters as a single literal argument.
- `/sesh persist` copies only the active branch under a fresh session header, retains any parent link, and switches to the saved file. Entries retain IDs, parent links, metadata, and model context. A file-backed session is unchanged.
- `/sesh create-empty-child` starts an empty conversation linked to the current persisted session. It refuses ephemeral parents and allocated-but-unwritten parent files, and leaves the current session unchanged on cancellation.
- Unsupported subcommands and extra arguments cause no session operations. Completion offers only the supported subcommands with short descriptions.
- Cancelled persistence removes the new file. A switch error retains the saved copy for recovery.
- `--parent-session` resolves a readable file path or an unambiguous exact ID without changing the parent. Header reads are bounded; malformed, oversized, missing, or non-file parents are rejected safely.
- The startup flag cannot reparent existing/nonempty sessions or combine with conflicting session-selection flags. Pi parses prompts and option values without treating their contents as flags.
- File-backed and ephemeral children keep the chosen parent without importing its conversation. Persisting an ephemeral child retains its lineage. Scratch sessions reconstructed by other extension factories are ignored. Reload and later sub-session creation do not reapply the startup parent.
- The initial JSON header already includes the parent, and startup errors exit nonzero instead of proceeding into a prompt.

## Coverage boundaries

This package owns command policy, JSONL snapshot selection, parent resolution, and startup-hook lifecycle. Real session-manager round trips, an `AgentSessionRuntime` test, and isolated installed-Pi processes verify the host integration. [OwnedHooks](../../../libs/src/owned-hooks/README.md) owns property restoration mechanics; Pi owns session reconstruction and normal subsequent persistence.

## Exclusions

No paid/provider requests, alternative-branch export, or terminal rendering assertions. Process fixtures append offline assistant entries directly to exercise Pi's file persistence without a provider.
