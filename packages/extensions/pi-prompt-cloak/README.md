# pi-prompt-cloak

Pi's system prompt contains wording that upstream providers can use to identify Pi. pi-prompt-cloak rephrases two of those lines in the `docs` section of the system prompt before each request:

```diff
-Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
+Pi documentation (read only for questions about the agent, its SDK, extensions, themes, skills, or TUI):
```

The second line, the topic-to-file list, gets a new lead-in ("When asked about:" becomes "Choose the reference for the requested topic:"), semicolons instead of commas between topics, and two new labels ("TUI components" becomes "terminal UI components", and "pi packages" becomes "packages"). The [replacement table](src/prompt-rewrites.ts) holds both lines. No configuration is required.

## Behaviour

- It rewrites a line only when the complete line exactly matches one of the two built-in lines. Custom wording in `docs` stays as written.
- It rewrites only inside the `docs` section. Copies of the two lines in other sections and in system text without sections stay unchanged.
- It rewrites every outgoing system message, including earlier messages and section updates.
- It runs for every provider and authentication method. It does not detect OAuth sign-in.
- It preserves instructions added by [pi-model-prompt](../pi-model-prompt/README.md) in either extension load order.

The extension does not change any other text: the preamble, tool summaries, usage rules, skills, project instructions, appended instructions, tool declarations, and documentation paths.

## Side effects

The extension changes only the request that Pi sends. It does not rewrite saved sessions or credentials. In Pi 1.4.0, a complete `systemPrompt` override from another extension takes precedence over this rewrite.

The extension changes prompt wording only. Package checks don't send live Anthropic requests, so provider acceptance is not verified.

## Validation

| When you…           | Read                                                |
| ------------------- | --------------------------------------------------- |
| Change the rewrites | [manual checks](docs/testing.md#manual-checks)      |
| Upgrade Pi          | [compatibility checklist](docs/pi-compatibility.md) |
