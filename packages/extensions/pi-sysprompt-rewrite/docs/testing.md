# Sysprompt-rewrite test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests global-only settings and the rewriting of the request's system prompt sections. Pi owns prompt construction, project-trust resolution, and the request-local transcript copies that keep saved sessions unchanged.

## Must not regress

- **Critical, e2e:** Rules in project settings never change the provider request, even in trusted projects.
- **High, e2e:** Global rules rewrite the bodies of the sections that they list, in list order, in the provider request, including section patches added during the session. The saved session keeps the original text.

## Not tested

- Rule validation, field limits, and warning wording are below the severity bar.
- The README example's wording is below the severity bar; the [compatibility checklist](pi-compatibility.md) checks that it still matches Pi's prompt.

## Manual checks

Load the extension in an offline Pi SDK session with a faux provider and the [README example](../README.md#configuration) in the global settings, then inspect the system prompt that the provider receives.

| Do                                                                                    | Expect                                                                                                         |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Send a prompt with the default tools, a skill, project instructions, and append text. | Only the two `docs` lines change. All other text, documentation paths, and tool declarations remain unchanged. |
| Remove a rewritten section before a later prompt.                                     | The section stays removed in the request.                                                                      |
| Add an invalid rule and a rule with an unknown field, then run `/reload`.             | One warning per rule names its index but not its text, and the valid rules still apply.                        |
| Supply a complete `systemPrompt` override.                                            | The forced text reaches the provider unchanged.                                                                |
