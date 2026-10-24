# Prompt-manager test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests collection formats, retention and recovery, activation, clipboard helper transport, and privacy of its notifications, while libs owns the private-file protocols and the shared browser.

## Must not regress

- **Critical, unit:** Extension notifications exclude prompt text, including text in malformed collections or arbitrary host and clipboard errors.
- **Critical, integration:** Invalid UTF-8, malformed JSON, and unsupported collection documents stay unavailable rather than becoming empty collections that a mutation can overwrite. A missing file counts as empty.
- **Critical, integration:** Mutations preserve exact retained draft data and unrelated committed mutations.
- **Critical, integration:** Reading history after `historyRetention` is lowered keeps every stored record; only a committed capture applies the new retention.
- **Critical, integration:** Failed replacements leave stored bytes unchanged.
- **Critical, integration:** The repository refuses unsafe private-file paths.
- **Critical, integration:** The repository protects collection and directory permissions through the shared helper.
- **Critical, integration:** Draft additions that exceed capacity are refused without evicting existing drafts.
- **Critical, integration:** Deletion requires the selected UUID to stay unique in the latest locked collection, compared without regard to case, with the exact text and original `recordedAt` value and presence unchanged.
- **High, integration:** Session expiry cancels queued and processing operations before replacement and releases active processing resources. Its cleanup waits for started atomic writes and for cancelled operations to release their locks.
- **High, integration:** Cleanup warnings after a commit stay committed outcomes, not failed writes that the extension retries.
- **High, integration:** Copying passes the complete text, including Unicode, terminal controls, and large payloads, to the native helper's stdin without shell interpretation.
- **High, integration:** The five-second clipboard deadline and cancellation reject the copy and prevent fallback to later helpers.
- **High, integration:** Each clipboard helper runs in its own process group, so Ctrl+Z, which suspends Pi's group, does not stop a helper that stays as the clipboard owner.
- **High, e2e:** The extension reads settings and initialises storage only after `session_start` in TUI mode. Print, JSON, and RPC modes stay inactive. The installed-CLI check also covers worker and module loading and process exit.
- **High, e2e:** History captures only live interactive TUI input, as typed before input-chain transforms, and never replays earlier input on reload.

## Not tested

- History deduplication, search preparation and ranking, browser rows, command syntax, and editor restore timing are below the severity bar. The [manual validation checks](validation.md) cover them. The live-input scenario also checks capture ordering as part of the capture invariant.
- Settings parsing and fallback are below the severity bar.
- Event-loop responsiveness during large collection processing is below the severity bar. The [interaction measurement](validation.md#interaction-measurement) covers it.
- Libs owns the shared browser geometry.
- Pi owns native editor history.
- The [release check](../../../../docs/development.md#release-branch) owns collection worker loading in the installed `release` tree, where the worker gets no Pi host packages.
- Delivery to the OS clipboard is not tested because capturing stdin does not prove native clipboard behaviour. The [manual checks](#manual-checks) cover it.

## Manual checks

For delivery to the OS clipboard and filesystem permissions outside Linux, use the isolated [platform checks](validation.md#platform-checks).
