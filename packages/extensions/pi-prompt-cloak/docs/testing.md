# Prompt cloak test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package rephrases the built-in prompt lines in the [replacement table](../src/prompt-rewrites.ts); Pi owns prompt construction and request-local transcript copies.

## Must not regress

There are no automated invariants. Prompt wording is below the testing policy's severity bar.

## Not tested

- Live Anthropic acceptance is not tested because the checks use no live provider.

## Manual checks

Load the extension in an offline Pi SDK session with a faux provider and inspect the system prompt received by the provider.

| Do                                                                                                       | Expect                                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Send a prompt with the default tools, a skill, project instructions, and an appended instruction.        | Only the lines in the replacement table change. All other text, documentation paths, and tool declarations remain unchanged. |
| Load the extension before and then after `pi-model-prompt`.                                              | Both orders preserve the model-specific appended instructions.                                                               |
| Update a rewritten section between prompts, retaining its built-in lines.                                | The built-in lines are rephrased in earlier system messages and in the new section update.                                   |
| Remove a rewritten section before a later prompt.                                                        | The `null` removal remains intact and the section is not restored.                                                           |
| Inspect the stored system messages after a request.                                                      | Their original wording remains unchanged.                                                                                    |
| Add custom wording around the built-in lines in their section, and copy those lines into other sections. | Only the exact matches in their own section change. Custom wording and copies in other sections remain unchanged.            |
| Supply a complete `systemPrompt` override.                                                               | The forced text reaches the provider unchanged.                                                                              |
| Use a non-Anthropic faux provider without OAuth.                                                         | The built-in lines are still rewritten.                                                                                      |
