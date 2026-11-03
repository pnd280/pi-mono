# [pi-null-args](README.md) development

Clean arguments in `message_end`. The `tool_call` event runs after Pi validates the arguments, which is too late.

Preserve the documented [argument-cleaning rules](README.md#behaviour).

## Validation

For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
