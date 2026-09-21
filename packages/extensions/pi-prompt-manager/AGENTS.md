# [pi-prompt-manager](README.md) development

## Code navigation

- **Lifecycle and operations:** [src/index.ts](src/index.ts) connects Pi events to [manager.ts](src/manager.ts).
- **Collection processing:** [collection.ts](src/storage/collection.ts) handles format, recovery, mutation policy, and snapshots. [processing.ts](src/storage/processing.ts) decodes, validates, and updates large collections in a worker. [model.ts](src/model.ts) defines limits.
- **Storage I/O:** [repository.ts](src/storage/repository.ts) runs private-file transactions, and [directory.ts](src/storage/directory.ts) resolves paths.
- **History:** [history.ts](src/history.ts) validates captured text and deduplicates displayed history.
- **Commands and keys:** [commands.ts](src/commands.ts) parses arguments, and [settings.ts](src/settings.ts) chooses launch bindings.
- **Browser adapter:** [open.ts](src/browser/open.ts) supplies collection loading, actions, and row formatting to the [shared browser](../../libs/src/tui/components/browser/README.md). [search.ts](src/search.ts) prepares full-text search items.
- **Editor interface:** [editor.ts](src/host/editor.ts) rejects unsafe source and delegates editor access to Pi.
- **Offline fixtures:** [validation/workspace.ts](validation/workspace.ts) supplies storage, clipboard input capture, provider loading, and CLI flags.

## Constraints

Activate and access settings/storage only after TUI session startup. Before filesystem changes, read the shared [mutation protocol](../../libs/src/private-files/README.md#mutation-protocol).

Separate exact stored/copied source from sanitized display text. Reject unsafe editor restores. Use the native-only clipboard library, not Pi's general helper. Preserve [capture exclusions and side-effect limits](README.md#side-effects).

Restore selections only in the [browser host's](../../libs/src/tui/open-browser/README.md) `afterClose`, before requested removal and never during responsive remounts. Keep one logical browser; do not install a custom editor.

Keep recovery manual; never evict drafts for additions. Delete only when UUID, text, and timestamp match. Distinguish post-commit cleanup warnings from failed writes. Document contracts in [controls](docs/controls.md) and [storage and recovery](docs/storage.md).

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Use [package validation](README.md#validation). Keep automated TUI tests in [shared TUI](../../libs/src/tui/README.md#validation), not this extension. For nonvisual host integration changes, check both [API](validation/host.test.ts) and [installed-CLI](validation/bundle.test.ts) fixtures. Choose the relevant [terminal and platform checks](docs/validation.md) for interaction, clipboard, or privacy changes.
