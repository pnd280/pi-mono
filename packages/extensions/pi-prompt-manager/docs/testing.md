# Prompt-manager coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

## Contracts

- Stay inactive outside interactive TUI sessions, including no settings/storage reads. Reload replaces callbacks without replaying captures; pending effects must not reach a later session.
- Capture trimmed interactive input before native expansion, excluding commands handled before the hook and extension-generated messages. Queued captures are FIFO and bounded with safe, limited diagnostics.
- Store exact drafts separately, never evict drafts for additions, and prune History only on committed capture. Consecutive suppression and displayed-history deduplication have different semantics.
- Collections preserve unknown recovery fields and exact source. Refuse additions to corrupt, oversized, or read-only collections rather than treating corruption as empty storage. Delete only unique entries whose UUID, text, and timestamp remain unchanged. Capacity checks account for original bytes and final JSON escaping.
- Aliases of the same real cwd share storage; distinct directories do not. Update the latest locked contents across instances/processes. Translate shared storage failures and post-commit warnings without exposing prompt text or retrying a committed mutation.
- Save expanded editor text and clear only after commit if still unchanged and not explicitly restored. Restore safe source without submission after final browser closure, never during a remount; failed deletion leaves restored text intact.
- Copy exact source with session cancellation and safe diagnostics. Commands reject invalid syntax before effects; settings validate independently and resolve shortcut collisions predictably.
- Search prepares complete sanitized text without changing copy/restore source or draft numbering; stale preparation stops. Large collection work stays responsive and cancellable.

## Coverage boundaries

This package owns collection formats, retention/recovery, editor effects, activation, and repository options/error handling. [Utils](../../../utils/docs/testing.md) own search ranking; [libraries](../../../libs/docs/testing.md) own cooperative search, permission/ACL enforcement, lock/atomic-write protocols, clipboard transport, browser navigation, and mounting. Consumer tests should prove safety checks are used without repeating every shared protocol fault. Retain installed-CLI tests for worker/module loading and process exit; SDK tests do not exercise that boundary.

## Exclusions

No duplicate shared browser geometry, search-score matrix, or native editor history tests. OS clipboard delivery and non-Linux filesystem permissions require the isolated [platform checks](validation.md#platform-checks); stdin capture is not evidence of native clipboard behavior.
