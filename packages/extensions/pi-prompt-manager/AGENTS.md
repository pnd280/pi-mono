# [pi-prompt-manager](README.md) development

## Constraints

- Register input, startup shortcuts, and shutdown only through the [input chain](../../libs/src/input-chain/README.md) and the [lifecycle coordinator](../../libs/src/lifecycle/README.md). Direct Pi handlers would run in load order.

## References

| When you…                                                | Read                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Change filesystem code                                   | The [mutation protocol](src/private-files/README.md#mutation-protocol).                     |
| Change browser keys, search, deletion, or draft commands | [Controls](docs/controls.md).                                                               |
| Change storage layout, limits, backup, or repair         | [Storage and recovery](docs/storage.md).                                                    |
| Run checks, or change clipboard, interaction, or privacy | [Validation](docs/validation.md), including the conditional terminal and platform checks.   |
| Change host integration                                  | The [API](validation/host.test.ts) and [installed-CLI](validation/bundle.test.ts) fixtures. |
