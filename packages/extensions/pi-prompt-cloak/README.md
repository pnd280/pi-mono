# pi-prompt-cloak

Pi's system prompt contains wording that upstream providers can use to identify Pi. pi-prompt-cloak rephrases some of that wording before each request, and keeps its meaning:

```diff
- Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
+ Pi documentation (read only for questions about the agent, its SDK, extensions, themes, skills, or TUI):
```

The [replacement table](src/prompt-rewrites.ts) lists the current rewrites. No configuration is required.

## Behaviour

- It rewrites only Pi's built-in wording in its usual place. Custom wording, and copies of the built-in wording in other places, stay as written.
- It runs for every provider and authentication method.
- It preserves instructions added by [pi-model-prompt](../pi-model-prompt/README.md) in either extension load order.

## Side effects

The extension changes only the prompt wording of the request that Pi sends. It does not rewrite saved sessions or credentials. In Pi 1.4.0, a complete `systemPrompt` override from another extension takes precedence over the rewrites.

No live request has verified that Anthropic accepts the rewritten prompt.

## Validation

| When you…           | Read                                                |
| ------------------- | --------------------------------------------------- |
| Change the rewrites | [manual checks](docs/testing.md#manual-checks)      |
| Upgrade Pi          | [compatibility checklist](docs/pi-compatibility.md) |
