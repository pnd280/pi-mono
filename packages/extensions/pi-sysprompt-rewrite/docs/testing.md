# Sysprompt-rewrite test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests global-only rules and the rewriting of the request's system prompt sections. Pi owns prompt construction, project-trust resolution, and the request-local transcript copies that keep saved sessions unchanged.

## Must not regress

- **Critical, e2e:** Rules in project settings never change the provider request, even in trusted projects.
- **High, e2e:** Global rules rewrite the bodies of the sections that they list, in list order, in the provider request, including section patches added during the session. The saved session keeps the original text.

## Not tested

- Rule validation, field limits, and warning wording are below the severity bar.
- The docs collapse has no listed invariant yet; its behaviour is checked manually.
- The README example's wording is below the severity bar; the [compatibility checklist](pi-compatibility.md) checks that it still matches Pi's prompt.

## Manual checks

Load the extension in an offline Pi SDK session with a faux provider and the [README example](../README.md#configuration) in the global settings, then inspect the system prompt that the provider receives. For the `piDocsCollapse` rows, set `TMPDIR` to a disposable temporary directory, and mark the project as trusted unless the row says otherwise.

| Do                                                                                                                                   | Expect                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| With `piDocsCollapse.enabled` set to `false`, send a prompt with the default tools, a skill, project instructions, and append text.  | Only the two `docs` lines change. All other text, documentation paths, and tool declarations remain unchanged.                                                                                                    |
| Remove a rewritten section before a later prompt.                                                                                    | The section stays removed in the request.                                                                                                                                                                         |
| Add an invalid rule and a rule with an unknown field, then run `/reload`.                                                            | One warning per rule names its index but not its text, and the valid rules still apply.                                                                                                                           |
| Supply a complete `systemPrompt` override.                                                                                           | The forced text reaches the provider unchanged.                                                                                                                                                                   |
| Enable `piDocsCollapse` with the default tools, then deactivate bash before a later prompt.                                          | `docs` holds the pointer line with the PI_* hint, `rules` lacks the PI_* bullet, the file holds the rewritten `docs` body, and the later request's pointer omits the hint. The saved session keeps Pi's sections. |
| With `piDocsCollapse` enabled globally, set `piDocsCollapse.enabled` to `false` in trusted project settings, then in untrusted ones. | The trusted project keeps Pi's `docs` section; the untrusted one is collapsed.                                                                                                                                    |
| Set an invalid `fileName`, such as `../x.md`, in project settings.                                                                   | One warning without the value; `docs` stays uncollapsed and the global rules still apply.                                                                                                                         |
| Put a directory at the docs file's path.                                                                                             | One warning; every request keeps Pi's `docs` section.                                                                                                                                                             |
