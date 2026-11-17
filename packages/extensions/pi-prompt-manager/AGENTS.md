# [pi-prompt-manager](README.md) development

## Constraints

- Register input, startup shortcuts, and shutdown only through the [input chain](../../libs/src/input-chain/README.md) and the [lifecycle coordinator](../../libs/src/lifecycle/README.md).

## References

| When you…                                                | Read                                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Change filesystem code                                   | [Private-file integration](src/private-files/README.md).                                  |
| Run checks, or change clipboard, interaction, or privacy | [Validation](docs/validation.md), including the conditional terminal and platform checks. |
