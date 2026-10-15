# Pi compatibility for maintainers

[pi-null-args](../README.md)

> Last verified against Pi 1.2.0 (offline host test). Not covered: live providers.

## Upgrade procedure

1. Run the [workspace checks](../../../../docs/development.md#focused-validation). The host test runs the installed Pi offline.
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

[Handler](../src/index.ts):

- [ ] A `message_end` replacement still updates the finished assistant message in place, and the agent loop reads tool calls from that message after `message_end`.
- [ ] Pi still runs `prepareArguments` and validation after `message_end`, and the `tool_call` event after validation.
- [ ] `pi.getAllTools()` still returns each tool's `parameters` with the top-level `required` names.
- [ ] Pi's validation still removes a real `null` from optional arguments, so the handler needs only the text form.

## Limitations

- If Pi's argument validation starts to treat the text `"null"` in optional arguments like a real `null`, remove this extension.
