# [pi-null-args](README.md) development

Clean arguments in `message_end`. The `tool_call` event runs after Pi validates the arguments, which is too late.

Preserve the documented [argument-cleaning rules](README.md#behaviour).

## Validation

[Testing](docs/testing.md) lists what is tested. For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
