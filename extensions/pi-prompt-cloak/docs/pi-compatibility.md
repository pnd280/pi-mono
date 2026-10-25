# Pi compatibility for maintainers

[pi-prompt-cloak](../README.md)

> Last verified against Pi 1.4.0 with package checks and a source review of the Pi 1.3.0 to 1.4.0 changes. Not covered: the manual offline host checks and live Anthropic acceptance.

## Upgrade checklist

Run the [manual checks](testing.md#manual-checks), then confirm each item.

- [ ] Each built-in line in the [replacement table](../src/prompt-rewrites.ts) still matches a line of Pi's system prompt in the same section.
- [ ] `context_with_system` runs after the `before_agent_start` and `context` handlers, with a request-local copy of the complete transcript.
- [ ] System messages expose prompt text through `sections`, keyed by section name, with `null` for section removal.
- [ ] Rewriting the listed lines preserves all other text, section tags, removals, tool declarations, and message order.
- [ ] A complete `systemPrompt` override from another extension still has the [documented precedence](../README.md#side-effects).
