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

Activate the feature and access its settings and storage only after TUI session startup. Before changing filesystem integration, read the shared [mutation protocol](../../libs/src/private-files/README.md#mutation-protocol).

Keep exact stored and copied source separate from sanitized display text. Reject unsafe text before restoring it to the editor. Use the native-only clipboard library, not Pi's general clipboard helper. Preserve the [capture exclusions and side-effect limits](README.md#side-effects).

Apply browser restoration requests in the manager only through the [browser host's](../../libs/src/tui/open-browser/README.md) `afterClose` callback, never during a responsive remount. Restore before any requested removal. Preserve one logical browser instead of installing a custom editor.

Keep recovery manual. Never evict existing drafts to make room for additions. Require the UUID, text, and timestamp to match before deletion. Distinguish cleanup warnings after commit from failed writes. Document user-facing contracts in [controls](docs/controls.md) and [storage and recovery](docs/storage.md).

## Validation

Use [package validation](README.md#validation). Keep automated TUI tests in [shared TUI](../../libs/src/tui/README.md#validation), not this extension. For nonvisual host integration changes, check both [API](validation/host.test.ts) and [installed-CLI](validation/bundle.test.ts) fixtures. Choose the relevant [terminal and platform checks](docs/validation.md) for interaction, clipboard, or privacy changes.
