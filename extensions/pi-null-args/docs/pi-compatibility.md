# Pi compatibility for maintainers

[pi-null-args](../README.md)

> Last verified against Pi 1.6.1 with the package checks, the offline host test, and a source review of the Pi 1.6.0 to 1.6.1 changes. Not covered: the direct `validateToolArguments` probe of the text `"null"`, which last ran on Pi 1.5.1; live providers, including their malformed-argument and `\u` escape repair paths.

## Checklist

[Handler](../src/index.ts):

- [ ] A `message_end` replacement still updates the finished assistant message in place.
- [ ] The agent loop still reads tool calls from that message after `message_end`.
- [ ] Pi still runs `prepareArguments` and validation after `message_end`.
- [ ] Pi still runs the `tool_call` event after validation.
- [ ] Each `message_end` handler still receives the previous handler's replacement.
- [ ] Tool-call replacement preserves metadata such as `argumentsError`, which Pi sets with empty arguments for malformed JSON.
- [ ] `pi.getAllTools()` still returns each tool's `parameters`, including `required` lists and object-composition keywords.
- [ ] Pi's real-`null` normalisation still matches the [documented behaviour](../README.md#usage).

## Limitations

- If Pi's argument validation starts to treat the text `"null"` in optional arguments like a real `null`, remove this extension.
- Pi 1.5.0 to 1.6.1 validate tool arguments with `@earendil-works/pi-schema` coercion. The first pass drops a real `null` under the same conditions as Pi 1.4.0, and also walks pattern and additional properties. The conversion turns the text `"null"` into `null` only for a `type: "null"` schema, alone or as an `anyOf` or `oneOf` branch; the tool then receives `null`, not its default. In Pi 1.5.1 to 1.6.1, a schema with `type: "undefined"` can also convert the text `"null"` to `undefined`, including through a union branch. A string field keeps the text, as does an enum that lists `"null"` as a string. An enum that does not accept that text, a number field, or a boolean field fails validation. The extension's rule is still needed.
- Pi 1.5.0 to 1.6.1 validate a copy of the arguments, so the coercion does not change the saved tool call. The cleaning in `message_end` is the only change that the saved session records.
- In Pi 1.6.0 and 1.6.1, a tool call prepared after an abort gets an "Operation aborted" result before validation (`prepareToolCall` in `agent-loop.js`).
- In Pi 1.6.1, a source review of the Pi 1.6.0 to 1.6.1 changes found `pi-schema`, the `pi-agent-core` agent loop, pi-ai's `validateToolArguments`, and the `message_end` replacement in `agent-session.js` unchanged.
