# Prompt-manager test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests collection formats, retention and recovery, activation, clipboard helper transport, and privacy of its notifications. Libs owns private-file protocols and the shared browser; delivery to the OS clipboard is a [manual check](#manual-checks).

## Must not regress

- **Critical, unit:** Extension notifications exclude prompt text, including text in malformed collections or arbitrary host and clipboard errors.
- **Critical, integration:** Invalid UTF-8, malformed JSON, and unsupported collection documents stay unavailable rather than becoming empty collections that a mutation can overwrite. A missing file counts as empty.
- **Critical, integration:** Mutations preserve exact retained draft data and unrelated committed mutations. Failed replacements leave stored bytes unchanged.
- **Critical, integration:** The repository refuses unsafe private-file paths and protects collection and directory permissions through the shared helper.
- **Critical, integration:** Draft additions that exceed capacity are refused without evicting existing drafts.
- **Critical, integration:** Deletion requires the selected UUID to stay unique in the latest locked collection, compared without regard to case, with the exact text and original `recordedAt` value and presence unchanged.
- **High, integration:** Session expiry cancels queued and processing operations before replacement, releases active processing resources, and lets started atomic writes and lock cleanup finish.
- **High, integration:** Cleanup warnings after a commit stay committed outcomes, not failed writes that the extension retries.
- **High, integration:** Copying passes the complete text, including Unicode, terminal controls, and large payloads, to the native helper's stdin without shell interpretation.
- **High, integration:** The five-second clipboard deadline and cancellation reject the copy and prevent fallback to later helpers.
- **High, e2e:** The extension reads settings and initialises storage only after `session_start` in TUI mode. Print, JSON, and RPC modes stay inactive. The installed-CLI check also covers worker and module loading and process exit.
- **High, e2e:** History captures only live interactive TUI input and never replays earlier input on reload.

## Not tested

- Capture ordering, history deduplication, search preparation and ranking, browser rows, command syntax, and editor restore timing: below the severity bar. Use the [manual validation checks](validation.md).
- Settings parsing and fallback: below the severity bar.
- Shared browser geometry and native editor history: owned by libs and Pi.
- Collection worker loading in the installed `release` tree, where the worker gets no Pi host packages: owned by the [release check](../../../../docs/development.md#release-branch).

## Manual checks

Delivery to the OS clipboard and filesystem permissions outside Linux: use the isolated [platform checks](validation.md#platform-checks). Capturing stdin does not prove native clipboard behaviour.
