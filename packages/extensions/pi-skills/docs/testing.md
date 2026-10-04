# Skill-reference test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests format trust, skill-reference expansion, and completion routing in the real editor. Pi owns skill-file discovery, content loading, undo, persistence, queueing, and fuzzy scoring.

## Must not regress

- **Critical, integration:** A project format overrides the global format only when it is valid and comes from the trusted current directory, not an ancestor.
- **High, e2e:** Leading registered skill references returned by the input hook do not trigger Pi's native skill-content insertion under its literal-space command parsing, including existing references and custom formats starting with `{command}`. Edge cases go through `expandSkillInput` in a unit test.
- **High, e2e:** Pressing **Enter** to accept an open skill suggestion in the real editor inserts the completion without submitting the prompt.
- **High, unit:** Completion items borrowed from another provider are accepted by that provider even when their text matches a skill suggestion.
- **High, e2e:** After `/reload`, input expansion uses the updated format and currently registered skill paths, and completion offers newly registered skills rather than removed ones.

## Not tested

- Expansion matching, token replacement, cursor eligibility, and **Tab** routing details: below the severity bar. Use the manual checks.
- Provider-only assertions cannot prove native acceptance behaviour, so they do not replace the real-editor checks above.

## Manual checks

For changes to completion, formats, or host integration, launch an isolated offline Pi session from the repository root:

```sh
vpr 'pi-skills#validate:terminal'
```

Setup: the launcher provides `review` and `release` skills and `sample.txt`. Submissions are written to `work/inputs.jsonl` in the printed fixture directory, without model requests. The fixture is kept after exit.

| When changing          | Do                                                                                                                                                   | Expect                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Completion             | Press **Tab** after `Use /skill:re`, and on a later line starting with `/skill:re`.                                                                  | Both complete to a skill.                                                                        |
| Completion             | Put the cursor after `re` in `/skill:reBAD rest` and accept.                                                                                         | `reBAD` is replaced; `rest` stays.                                                               |
| Completion             | Accept with **Enter** and with **Tab**; press **Escape**; undo an insertion.                                                                         | Accepting never submits. **Escape** closes the picker. Undo removes the insertion.               |
| Completion             | Toggle skill commands in `/settings`, then submit `/skill:review`.                                                                                   | Completion follows the setting, but `/skill:review` still expands, without the skill's contents. |
| Formats                | In the fixture's `agent/settings.json`, set `"ext.pi-skills": {"expansionFormat": "{command} ({path})"}`, run `/reload`, and submit `/skill:review`. | The new format is used, and no skill contents are inserted.                                      |
| Resources or lifecycle | Rename `skills/review.md` to `skills/fresh.md`, change its frontmatter `name` to `fresh`, and run `/reload`.                                         | Completion offers `fresh`, and the submitted path is the new one.                                |
| Provider composition   | Complete a file (`./sam`), an attachment (`@sam`), a native command (`/settings`), and the fixture extension (`/fixture`, `#fi`).                    | Each completes as usual outside skill tokens.                                                    |
