# Pi compatibility for maintainers

[pi-null-args](../README.md)

> Last verified against Pi 1.5.0 with the package checks, the offline host test, a source review of the Pi 1.4.0 to 1.5.0 changes, and a direct `validateToolArguments` probe of the text `"null"`. Not covered: live providers, including their malformed-argument and `\u` escape repair paths.

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
- Pi 1.5.0 validates tool arguments with `@earendil-works/pi-schema` coercion. Its first pass drops a real `null` under the same conditions as Pi 1.4.0, and also walks pattern and additional properties. Its conversion turns the text `"null"` into `null` only for a `type: "null"` schema, alone or as an `anyOf` or `oneOf` branch; the tool then receives `null`, not its default. An optional string keeps the text, and an optional enum, number, or boolean still fails validation. The extension's rule is still needed.
- Pi 1.5.0 validates a copy of the arguments, so its coercion does not change the saved tool call. The cleaning in `message_end` is the only change that the saved session records.
