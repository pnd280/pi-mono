# [pi-prompt-manager](README.md) development

Keep one logical browser, and keep Pi's own editor: install no custom editor.

## Must not regress

| Risk         | Rule                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Activation   | Touch settings and storage only after a TUI session has started.                                           |
| Exact source | Keep the exact stored and copied text separate from sanitised display text. Reject unsafe editor restores. |
| Deletion     | Delete only when UUID, text, and timestamp all match. Never evict drafts to make room for additions.       |
| Privacy      | Keep the [capture exclusions](docs/storage.md#capture) and [side-effect limits](README.md#side-effects).   |

## Constraints

- Register input, startup shortcuts, and shutdown only through the [input chain](../../libs/src/input-chain/README.md) and the [lifecycle coordinator](../../libs/src/lifecycle/README.md). Direct Pi handlers would run in load order.
- Keep the shutdown revoke synchronous. Await started mutations, including the lock cleanup of cancelled ones, only in its cleanup.
- Copy through the native-only [clipboard module](src/clipboard.ts), not Pi's general helper.
- Restore selections only in the [browser host's](../../libs/src/tui/open-browser/README.md) `afterClose`, before any requested removal, and never during a responsive remount.
- Keep recovery manual.
- Report cleanup warnings after a commit separately from failed writes.

## References

| When you…                                                | Read                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Change filesystem code                                   | The shared [mutation protocol](../../libs/src/private-files/README.md#mutation-protocol).   |
| Change browser keys, search, deletion, or draft commands | [Controls](docs/controls.md).                                                               |
| Change storage layout, limits, backup, or repair         | [Storage and recovery](docs/storage.md).                                                    |
| Choose tests                                             | The [coverage specification](docs/testing.md).                                              |
| Run checks, or change clipboard, interaction, or privacy | [Validation](docs/validation.md), including the conditional terminal and platform checks.   |
| Change host integration                                  | The [API](validation/host.test.ts) and [installed-CLI](validation/bundle.test.ts) fixtures. |
| Change shared browser, sizing, or remount behaviour      | [Libs TUI](../../libs/src/tui/README.md#validation), which owns those tests.                |
| Upgrade Pi                                               | The [compatibility checklist](docs/pi-compatibility.md).                                    |
