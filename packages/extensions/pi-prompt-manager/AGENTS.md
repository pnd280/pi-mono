# [pi-prompt-manager](README.md) development

## Code navigation

- **Lifecycle and operations:** [src/index.ts](src/index.ts) connects Pi events to [manager.ts](src/manager.ts).
- **Collection and I/O:** [src/storage/](src/storage/) owns recovery, processing, and private-file transactions; [src/model.ts](src/model.ts) defines limits.
- **Interaction:** [src/browser/](src/browser/), [src/commands.ts](src/commands.ts), and [src/host/editor.ts](src/host/editor.ts).
- **Offline fixtures:** [validation/](validation/); use the [terminal procedure](docs/validation.md#terminal-launcher).

## Constraints

Activate and access settings/storage only after TUI session startup. Before filesystem changes, read the shared [mutation protocol](../../libs/src/private-files/README.md#mutation-protocol).

Separate exact stored/copied source from sanitized display text. Reject unsafe editor restores. Use the native-only clipboard library, not Pi's general helper. Preserve [capture exclusions and side-effect limits](README.md#side-effects).

Restore selections only in the [browser host's](../../libs/src/tui/open-browser/README.md) `afterClose`, before requested removal and never during responsive remounts. Keep one logical browser; do not install a custom editor.

Keep recovery manual; never evict drafts for additions. Delete only when UUID, text, and timestamp match. Distinguish post-commit cleanup warnings from failed writes. See [controls](docs/controls.md) and [storage and recovery](docs/storage.md).

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Use [package validation](README.md#validation) and [workspace verification](../../../docs/agents/verification.md). For host integration, check [API](validation/host.test.ts) and [installed-CLI](validation/bundle.test.ts) fixtures; for clipboard, interaction, or privacy changes, use [conditional checks](docs/validation.md). Shared TUI behavior belongs in [libs TUI](../../libs/src/tui/README.md#validation).
