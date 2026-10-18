# pi-prompt-cloak

This extension rephrases Pi-specific system prompt text to reduce fingerprinting by upstream providers.

## Behaviour

- The extension uses `context_with_system` for every provider and authentication method. It does not detect OAuth.
- It replaces only the documentation heading and the topic-to-file list in the `docs` section of every outgoing system message, including earlier messages and section updates. The [replacement table](src/prompt-rewrites.ts) defines both exact matches.
- It preserves all other lines and sections, including the preamble, tool summaries, usage rules, skills, project instructions, and appended instructions. Tool declarations and documentation paths remain unchanged.
- It preserves instructions added by [pi-model-prompt](../pi-model-prompt/README.md) in either extension load order.
- Matching uses complete lines. Custom wording in `docs` remains unchanged unless it exactly matches one of the two built-in lines. Copies in other sections and unstructured system text remain unchanged. No configuration is required.

## Side effects

The handler changes only the outgoing transcript for the current request. It does not rewrite saved sessions or credentials. In Pi 1.3.0, a complete `systemPrompt` override from another extension takes precedence over this rewrite.

This changes prompt wording only. Package checks do not exercise live Anthropic requests.

## Validation

Maintainers can use the [manual checks](docs/testing.md#manual-checks) and [Pi compatibility checklist](docs/pi-compatibility.md).
