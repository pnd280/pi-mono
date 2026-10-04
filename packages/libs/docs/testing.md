# Shared-library test coverage

[Package](../README.md) · [Testing policy](../../../docs/agents/testing.md#coverage)

This package tests reusable protocols with I/O, scheduling, or terminal output. [Utils](../../utils/docs/testing.md) owns other pure helpers; extensions own feature records, policies, and their SDK integration.

## Must not regress

- **Critical, integration:** Under caller-established trusted parents, private-file access rejects foreign ownership before repairing permissions or ACLs.
- **Critical, integration:** Private-file access rejects final-path symlinks, hard-linked files, and nonregular files without changing their permissions or contents.
- **Critical, integration:** Private-file lock acquisition does not reclaim an existing lock, regardless of its age or the owning process's liveness.
- **Critical, integration:** Private-file transactions acquire the data path's lock before reading the bytes supplied to the update callback.
- **Critical, integration:** Settings updates preserve JSON keys that the synchronous mutator leaves untouched, including `__proto__` and `constructor`.
- **Critical, integration:** Settings updates follow an existing symlink without replacing the link itself.
- **Critical, integration:** On POSIX filesystems, settings updates preserve existing permission bits even when the writer's umask would mask them.
- **Critical, integration:** Settings updates refuse malformed input or serialised output above 1 MiB before replacing the file.
- **Critical, unit:** For complete input snapshots, `displayText` removes terminal escape and control bytes other than normalised whitespace.
- **Critical, unit:** For complete input snapshots, `styledOutput` retains only SGR styling from source terminal controls.
- **High, unit:** `highlightCodeBounded` returns its input unchanged when language detection or input limits prevent highlighting, so callers must supply display-safe text.
- **High, unit:** Native hook disposal leaves later replacements by other owners intact.
- **High, integration:** Disposing a native-tool or file-mutation subscription stops that subscription's observation callbacks without disabling surviving subscriptions.

## Not tested

- Model-facing schema projection: consumers reject invalid domain input before side effects, and only live provider checks prove that providers accept a schema.
- Output retention, bounded diffs, Git inspection, cooperative search ranking, caches, working messages, and offline fixtures: below the severity bar.
- Reusable TUI selection, navigation, layout, settings frames, and diff rows: below the severity bar. Use the [shared TUI validation](../src/tui/README.md#validation).
- Extension-specific collection formats and tool-card policies: owned by extensions.

## Manual checks

- Native clipboard contents and cross-platform ACL guarantees: use the [isolated platform checks](../../extensions/pi-prompt-manager/docs/validation.md#platform-checks).
- Visual themes and mouse selection: use the [terminal checks](../../extensions/pi-tool-display/docs/validation.md#host-interaction-checks).
