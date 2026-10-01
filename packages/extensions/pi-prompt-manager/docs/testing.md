# Prompt-manager test coverage for maintainers

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

Shared algorithms are tested in libs and utils; see the [workspace ownership rules](../../../../docs/agents/testing.md#ownership). This package tests collection formats, retention and recovery, editor effects, activation, browser presentation policy, and its own option and error handling.

## Must not regress

- Nothing reads settings or storage outside interactive TUI sessions.
- Diagnostics never expose prompt text, and a committed change is never retried.
- Drafts are never evicted to make room for additions.
- Corrupt storage is never treated as empty.
- Only unique entries whose UUID, text, and timestamp are unchanged are deleted.

## Lifecycle and capture

- Reload replaces callbacks without replaying captures. Pending effects never reach a later session.
- Interactive input is captured trimmed, before native expansion. Commands handled before the hook, and extension-generated messages, are excluded.
- Queued captures are first in, first out, and bounded, with safe, limited diagnostics.

## Collections

- Drafts are stored exactly. History is pruned only when a capture is committed.
- History storage suppresses only a capture that matches the latest saved entry; older duplicates stay stored.
- The displayed history shows the newest occurrence of each distinct trimmed prompt.
- Unknown fields and exact source survive recovery.
- Additions are refused for corrupt, oversized, or read-only collections.
- Capacity checks count original bytes and final JSON escaping.
- When non-finite parsed numbers need repair, read-only diagnostics don't blame valid IDs.
- Aliases of the same real cwd share storage; different directories don't. Changes apply to the latest locked contents across instances and processes.
- Shared storage failures and warnings after a commit are translated for the user.
- Unsupported platforms are refused before managed-directory I/O.

## Editor

- Saves use the expanded editor text. The editor is cleared only after the commit, and only if it is unchanged and nothing was restored since.
- Safe source is restored without submitting, after the browser has finally closed, never during a remount.
- If deletion fails, the restored text stays.

## Commands, settings, and copy

- Copy uses the exact source, is cancelled with the session, and reports safe diagnostics.
- Commands reject invalid syntax before doing anything.
- Numbered commands select the full collection position, including second-entry copying and inspection.
- Global settings reads are bounded. Each setting is validated on its own, and shortcut collisions resolve predictably.
- Absent global settings use defaults without warning; malformed JSON warns without exposing its contents.

## Search

- Search prepares complete sanitised text without changing the copy and restore source or draft numbering. Row summary excerpts keep complete graphemes. Stale preparation stops.
- Large collection processing runs off-thread. Search and preview preparation cooperate with cancellation; native wrapping of one long line remains synchronous.
- History deduplication uses trimmed exact source, not sanitised display, and skipped duplicates still yield and check cancellation.

## Browser rows

- Compact ages floor at minute, hour, day, seven-day week, 30-day month, and 365-day year thresholds. Below one minute they show "now".
- Future ages have a `+` prefix when at least one minute away; invalid timestamps show "Unknown time".
- Row formatting samples one clock value, aligns the age column to the visible ages, and mutes only unselected ages.

## How to test

- Consumer tests show that the shared safety checks are used, without repeating every fault in the shared protocols.
- Keep the installed-CLI tests for worker and module loading and process exit; SDK tests don't exercise that boundary.

## Not covered here

- Shared browser geometry, the search-score matrix, and native editor history.
- Delivery to the OS clipboard and filesystem permissions outside Linux; use the isolated [platform checks](validation.md#platform-checks). Capturing stdin doesn't prove native clipboard behaviour.
