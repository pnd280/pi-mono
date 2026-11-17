# [pi-prompt-manager](README.md) development

## Constraints

- Register input, startup shortcuts, and shutdown only through the [input chain](../../libs/src/input-chain/README.md) and the [lifecycle coordinator](../../libs/src/lifecycle/README.md).

## References

| When you…                                                | Read                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Change filesystem code                                   | The [mutation protocol](src/private-files/README.md#mutation-protocol).                     |
| Run checks, or change clipboard, interaction, or privacy | [Validation](docs/validation.md), including the conditional terminal and platform checks.   |
| Change host integration                                  | The [API](validation/host.test.ts) and [installed-CLI](validation/bundle.test.ts) fixtures. |
