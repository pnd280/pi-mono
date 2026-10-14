# [pi-null-args](README.md) development

Clean arguments in `message_end`. The `tool_call` event runs after Pi validates the arguments, which is too late.

## Must not regress

- Never change required arguments, or values other than the exact text `"null"`.

## Validation

Use the [focused checks](../../../docs/development.md#focused-validation). [Testing](docs/testing.md) lists what is tested. For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
