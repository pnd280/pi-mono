# Shared-library coverage

[Package](../README.md) · [Shared testing policy](../../../docs/agents/testing.md)

## Contracts

### Files, processes, and observation

- Private files enforce ownership, reject unsafe links/types before permission/ACL repair, and bound reads. Directory aliases share storage scopes without permitting child paths to escape them.
- Transactions lock before reading current bytes, serialize cooperating writers, and commit by atomic rename. Cancellation prevents unstarted writes but lets started writes and cleanup finish. Post-commit warnings must not become failed writes or retries; locks are never stolen.
- Clipboard helpers receive exact UTF-8 through stdin, use platform-native selection/fallback, and respect cancellation/deadlines without shell interpretation or OSC 52 fallback.
- Settings reads are bounded and preserve caller-owned error policy. File observations distinguish complete, missing, changed, invalid, and nonregular sources without repairing permissions.
- Stream/file output retention preserves order, byte/line bounds, UTF-8 edges, and generated-omission provenance.
- Bounded diffs run off the main thread. Queue wait does not consume request-time budgets. Active and waiting inputs share an accounting budget; unrelated option fields are not retained. Queue overload, work limits, and worker failures remain distinct. Completed and failed work releases capacity; rejected requests retain no inputs. Waiting and future requests remain usable.
- Git inspection uses real repository rules, worktrees, tracked exceptions, literal names, and symlink boundaries; cancellation and deadline remain distinct from missing/ignored targets.
- Native hooks observe only verified definitions, share observations across consumers, preserve execution and mutation order, isolate observer failures, and restore only owned replacements. Disposed consumers cannot affect surviving consumers.

### Lifetimes and shared state

- Latest tasks, async caches, timed confirmations, and deferred notices reject stale work after replacement or disposal. Caches share loads and bound storage; falsy values are cache hits, while rejected/busy loads remain retryable.
- Working-message contributors compose independently. Old handles cannot clear replacements, session transitions clear contributions, and saved ordering respects project trust and unrelated settings.
- Offline fixtures isolate homes, credentials, mutable directories, and launch flags; scripted providers terminate on errors and cancellation rather than hanging consumers.

### Reusable TUI

- Browsers preserve selection and per-section search/preview state, distinguish loading/empty/error states, confirm the same deletion target within its deadline, and suppress asynchronous effects after closure.
- Host mounting keeps one logical view through resize, closes exactly once, and restores the captured editor before consumer effects. Fullscreen input ownership respects focus, overlays, listener order, and transcript search without capturing unrelated keys.
- Lists, trees, footers, previews, and order editors keep essential selection/actions visible within supplied dimensions. Order edits remain drafts until saved; inherited and explicitly empty orders differ.
- Terminal sanitization, grapheme-safe slicing, highlighting, wrapping, and diff layouts preserve source meaning without emitting terminal commands. Distinguish byte, code-point, and terminal-cell bounds; limits must not hide the edit or mislabel literal text as an omission. Theme-dependent output refreshes on invalidation.
- Search/layout preparation yields and discards cancelled work while matching whole-input results across chunk boundaries.

## Coverage boundaries

This package owns reusable algorithms and protocols; [utils](../../utils/docs/testing.md) own pure source/path/patch helpers and search ranking. Extensions own feature schemas, budgets, messages, activation, and adapter wiring. Keep integration checks where a consumer could omit a safety option or misinterpret a result, without repeating every shared failure matrix.

Use real filesystem/process tests and host components where mocks cannot establish the boundary. Assert exact call counts only to protect bounded work, prevent duplicate I/O, or verify effect ownership, not a particular helper decomposition.

## Exclusions

No extension-specific collection formats or tool-card policies. Native clipboard contents and cross-platform ACL guarantees require [isolated platform checks](../../extensions/pi-prompt-manager/docs/validation.md#platform-checks); captured stdin and Linux tests cannot establish them. Visual themes and mouse selection need [terminal checks](../../extensions/pi-tool-display/docs/validation.md#host-interaction-checks). Do not freeze full terminal snapshots or internal batching when public state, bounded work, and routing outcomes suffice.
