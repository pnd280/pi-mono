# [pi-prompt-manager](README.md) development

Keep one logical browser, and don't install a custom editor.

## Must not regress

| Risk         | Rule                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Activation   | Touch settings and storage only after a TUI session has started.                                           |
| Exact source | Keep the exact stored and copied text separate from sanitised display text. Reject unsafe editor restores. |
| Deletion     | Delete only when UUID, text, and timestamp all match. Never evict drafts to make room for additions.       |
| Privacy      | Keep the [capture exclusions and side-effect limits](README.md#side-effects).                              |

## Constraints

- Before changing filesystem code, read the shared [mutation protocol](../../libs/src/private-files/README.md#mutation-protocol).
- Register input, startup shortcuts, and shutdown only through the [input chain](../../libs/src/input-chain/README.md) and the [lifecycle coordinator](../../libs/src/lifecycle/README.md). Direct Pi handlers would run in load order.
- Keep the shutdown revoke synchronous. Await started writes only in its cleanup.
- Use the native-only [clipboard module](src/clipboard.ts), not Pi's general helper.
- Restore selections only in the [browser host's](../../libs/src/tui/open-browser/README.md) `afterClose`, before any requested removal, and never during a responsive remount.
- Keep recovery manual.
- Report cleanup warnings after a commit separately from failed writes.

Before changing browser keys, search, deletion, or draft commands, read [controls](docs/controls.md). Before changing storage layout, limits, backup, or repair, read [storage and recovery](docs/storage.md).

## Validation

- Use [package validation](README.md#validation) and [workspace verification](../../../docs/agents/verification.md).
- For host integration, check the [API](validation/host.test.ts) and [installed-CLI](validation/bundle.test.ts) fixtures.
- For clipboard, interaction, or privacy changes, use the [conditional checks](docs/validation.md).
- Shared TUI behaviour belongs in [libs TUI](../../libs/src/tui/README.md#validation).
- For Pi upgrades, use the [compatibility checklist](docs/pi-compatibility.md).
