# Prompt cloak test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package rephrases two documentation lines; Pi owns prompt construction and request-local transcript copies.

## Must not regress

There are no automated invariants. Prompt wording is below the testing policy's severity bar.

## Not tested

- There are no automated tests for the wording replacement.
- Package checks do not cover live Anthropic acceptance.

## Manual checks

Load the extension in an offline Pi SDK session with a faux provider and inspect the system prompt received by the provider.

| Do                                                                                                   | Expect                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Send a prompt with the default tools, a skill, project instructions, and an appended instruction.    | Only the documentation heading and topic-to-file list change. All other text, documentation paths, and tool declarations remain unchanged. |
| Load the extension before and then after `pi-model-prompt`.                                          | Both orders preserve the model-specific appended instructions.                                                                             |
| Update the `docs` section between prompts, retaining the two built-in lines.                         | Both lines are rephrased in earlier system messages and in the new section update.                                                         |
| Remove the `docs` section before a later prompt.                                                     | The `null` removal remains intact and the section is not restored.                                                                         |
| Inspect the stored system messages after a request.                                                  | Their original documentation wording remains unchanged.                                                                                    |
| Add custom wording around the two built-in lines in `docs` and copy those lines into other sections. | Only the exact matches inside `docs` change. Custom wording and copies in other sections remain unchanged.                                 |
| Supply a complete `systemPrompt` override.                                                           | The forced text reaches the provider unchanged.                                                                                            |
| Use a non-Anthropic faux provider without OAuth.                                                     | The two documentation lines are still rewritten.                                                                                           |
