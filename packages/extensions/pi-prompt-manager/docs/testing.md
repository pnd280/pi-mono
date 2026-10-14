# Prompt-manager test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests collection formats, retention and recovery, activation, and privacy of its notifications. Libs owns private-file protocols, the shared browser, and native clipboard helper selection; delivery to the OS clipboard is a [manual check](#manual-checks) here.

## Must not regress

- **Critical, unit:** Extension notifications exclude prompt text, including text in malformed collections or arbitrary host and clipboard errors.
- **Critical, integration:** Invalid UTF-8, malformed JSON, and unsupported collection documents stay unavailable rather than becoming empty collections that a mutation can overwrite. A missing file counts as empty.
- **Critical, integration:** Draft additions that exceed capacity are refused without evicting existing drafts.
- **Critical, integration:** Deletion requires the selected UUID to stay unique in the latest locked collection, compared without regard to case, with the exact text and original `recordedAt` value and presence unchanged.
- **High, integration:** Cleanup warnings after a commit stay committed outcomes, not failed writes that the extension retries.
- **High, e2e:** The extension reads settings and initialises storage only after `session_start` in TUI mode. Print, JSON, and RPC modes stay inactive. The installed-CLI check also covers worker and module loading and process exit.

## Not tested

- Capture ordering, history deduplication, search preparation, browser rows, command syntax, and editor restore timing: below the severity bar. Use the [manual validation checks](validation.md).
- Settings parsing and fallback: below the severity bar.
- Shared browser geometry, the search-score matrix, and native editor history: owned by libs and Pi.

## Manual checks

Delivery to the OS clipboard and filesystem permissions outside Linux: use the isolated [platform checks](validation.md#platform-checks). Capturing stdin does not prove native clipboard behaviour.
