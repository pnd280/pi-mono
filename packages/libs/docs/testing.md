# Shared-library test coverage

[Package](../README.md) · [Testing policy](../../../docs/agents/testing.md#coverage)

This package tests reusable protocols with I/O, scheduling, or terminal output; [utils](../../utils/docs/testing.md) owns other pure helpers, and extensions own feature records, policies, and their SDK integration.

## Must not regress

- **Critical, integration:** Under caller-established trusted parents, private-file access rejects foreign ownership before repairing permissions or ACLs.
- **Critical, integration:** Private-file access rejects final-path symlinks, hard-linked files, and nonregular files without changing their permissions or contents.
- **Critical, integration:** Private-file lock acquisition does not reclaim an existing lock, regardless of its age or the owning process's liveness.
- **Critical, integration:** Releasing a private-file lock never removes a lock whose token or inode changed.
- **Critical, integration:** Private-file transactions acquire the data path's lock before reading the bytes supplied to the update callback.
- **Critical, integration:** Without POSIX owner IDs, private storage refuses a directory outside the user profile before it creates it, and works inside the profile without owner or mode checks.
- **Critical, integration:** Settings updates preserve JSON keys that the synchronous mutator leaves untouched, including `__proto__` and `constructor`.
- **Critical, integration:** Settings updates follow an existing symlink without replacing the link itself.
- **Critical, integration:** On POSIX filesystems, settings updates preserve existing permission bits even when the writer's umask would mask them.
- **Critical, integration:** Settings updates refuse malformed input or serialised output above 1 MiB before replacing the file.
- **Critical, integration:** Settings sections ignore untrusted project and parent-directory settings, and refuse project saves in an untrusted project.
- **Critical, integration:** Settings section loads never write. Saves replace only their field, and refuse invalid values, malformed sections, and held locks without changing the file.
- **Critical, integration:** Settings section diagnostics show terminal-safe paths, while loads and saves still use the real paths.
- **Critical, unit:** For complete input snapshots, `displayText` removes terminal escape and control bytes other than normalised whitespace.
- **Critical, unit:** For complete input snapshots, `styledOutput` retains only SGR styling from source terminal controls.
- **High, integration:** Disposing a private-write lifetime cancels unstarted transactions and waits for started commits and lock cleanup.
- **High, integration:** A private-file transaction whose post-commit cleanup or lock release fails still reports `committed`, with the warnings and cleanup errors separate.
- **High, unit:** `highlightCodeBounded` returns its input unchanged when language detection or input limits prevent highlighting, so callers must supply display-safe text.
- **High, unit:** Native hook disposal leaves later replacements by other owners intact.
- **High, integration:** Disposing a native-tool or file-mutation subscription stops that subscription's observation callbacks without disabling surviving subscriptions.
- **High, integration:** File renames retry only on Windows and only for `EPERM`, `EACCES`, and `EBUSY`, stop after 10 attempts, and keep the previous target when they fail.

## Not tested

- Model-facing schema projection: consumers reject invalid domain input before side effects, and only live provider checks prove that providers accept a schema.
- Output retention, working-message contributions, scripted provider streams, and the interactive host fixture: below the severity bar.
- Reusable TUI selection, navigation, layout, settings frames, and diff rows: below the severity bar. Use the [shared TUI validation](../src/tui/README.md#validation).
- Extension-specific collection formats and tool-card policies: owned by extensions.

## Manual checks

- Cross-platform ACL guarantees: use the [isolated platform checks](../../extensions/pi-prompt-manager/docs/validation.md#platform-checks).
- Visual themes and mouse selection: use the [terminal checks](../../extensions/pi-tool-display/docs/validation.md#host-interaction-checks).
