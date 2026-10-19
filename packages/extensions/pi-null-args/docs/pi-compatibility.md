# Pi compatibility for maintainers

[pi-null-args](../README.md)

> Last verified against Pi 1.3.0 with the offline host test and source inspection. Not covered: live providers, including their malformed-argument and `\u` escape repair paths.

## Upgrade procedure

1. Run the [workspace checks](../../../../docs/development.md#focused-validation). The host test runs the installed Pi offline.
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

[Handler](../src/index.ts):

- [ ] A `message_end` replacement still updates the finished assistant message in place.
- [ ] The agent loop still reads tool calls from that message after `message_end`.
- [ ] Pi still runs `prepareArguments` and validation after `message_end`.
- [ ] Pi still runs the `tool_call` event after validation.
- [ ] Each `message_end` handler still receives the previous handler's replacement.
- [ ] Tool-call replacement preserves metadata such as `argumentsError`, which Pi sets with empty arguments for malformed JSON.
- [ ] `pi.getAllTools()` still returns each tool's `parameters`, including `required` lists and object-composition keywords.
- [ ] Pi's real-`null` normalisation still matches the [documented behaviour](../README.md#behaviour).

## Limitations

- If Pi's argument validation starts to treat the text `"null"` in optional arguments like a real `null`, remove this extension.
