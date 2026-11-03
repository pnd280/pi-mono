# Pi compatibility for maintainers

[pi-prompt-cloak](../README.md)

> Last verified against Pi 1.5.0 with package checks, a source review of the Pi 1.4.0 to 1.5.0 changes, and an offline SDK request that compares the docs section with and without the extension. Not covered: the other manual offline host checks and live Anthropic acceptance.

## Upgrade procedure

1. Run the [workspace checks](../../../../docs/development.md#focused-validation) and the [manual checks](testing.md#manual-checks).
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

[Extension](../src/index.ts):

- [ ] Each built-in line in the [replacement table](../src/prompt-rewrites.ts) still matches a line of Pi's system prompt in the same section.
- [ ] `context_with_system` runs after the `before_agent_start` and `context` handlers, with a request-local copy of the complete transcript.
- [ ] System messages expose prompt text through `sections`, keyed by section name, with `null` for section removal.
- [ ] Rewriting the listed lines preserves all other text, section tags, removals, tool declarations, and message order.
- [ ] A complete `systemPrompt` override from another extension still has the [documented precedence](../README.md#side-effects).

## Limitations

- In Pi 1.5.0, the "Tightened system prompt" change reworded both lines that the table matches. The table matches the Pi 1.5.0 wording only, so on Pi 1.4.0 the extension rewrites nothing.
- In Pi 1.5.0, the preamble, the last line of the tools section, and the last line of the docs section also changed. The table does not rewrite them, so they reach the provider in Pi's wording.
