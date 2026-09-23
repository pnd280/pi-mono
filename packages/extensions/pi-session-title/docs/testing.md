# Session-title coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

## Contracts

- Generation requires an explicit model and supported thinking level from global or trusted current-project settings. Invalid participating sections disable requests rather than selecting a fallback model; clear remains available.
- Automatic naming makes at most one attempt per load, waits for nonempty user text without consuming the attempt, preserves existing names, and stays quiet. Manual regeneration uses recent current-branch conversation and reports safe notifications.
- Only current-branch user/assistant text is sent, within the documented 4,000-character source bounds; tool output and thinking are excluded. Complete text responses become sanitized, grapheme-safe titles of at most 80 characters; incomplete responses and provider errors preserve the name.
- Authentication and transport use Pi's configured provider. Deadlines and cancellation settle even if external work ignores abort, and stale results cannot rename a session.
- Native rename/clear cancels generation even if the name returns to its original value. Tree navigation, reload, and shutdown also cancel pending work; tree navigation does not replenish the automatic attempt. Print/JSON output stays clean and exit does not wait for background naming.

## Coverage boundaries

This package owns source selection, configuration, title sanitization, and lifecycle wiring. Retain real-host event tests and installed-process output/exit checks alongside focused policy tests. [Libraries](../../../libs/docs/testing.md) own latest-task stale-result protection, bounded settings I/O, and terminal grapheme algorithms. Provider-specific reasoning mappings and session metadata serialization belong to Pi.

## Exclusions

No paid model requests, subjective title-quality assertions, or duplicated provider-authentication implementation. Use representative host modes for distinct notification/activation branches, plus real process checks, rather than testing every scenario in every mode.
