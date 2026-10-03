# Skill-reference test coverage for maintainers

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

Shared algorithms are tested in libs and utils; see the [workspace ownership rules](../../../../docs/agents/testing.md#ownership). Unit coverage is limited to the native-insertion guard, borrowed completion-item identity, and current-catalogue lookup risks listed below. Filesystem settings, installed-host input and reload, and real-editor routing suites retain integration coverage.

## Must not regress

- A project format overrides the global format only when it is valid and comes from the trusted current directory, not an ancestor.
- Leading registered skill references returned by the input hook do not trigger Pi's native skill-content insertion under its literal-space command parsing, including existing references and custom formats starting with `{command}`.
- Pressing **Enter** to accept an open skill suggestion in the real editor inserts the completion without submitting the prompt.
- Completion items borrowed from another provider are accepted by that provider even when their text matches a skill suggestion.
- After `/reload`, subsequent input expansion uses the updated format and currently registered skill paths.
- After `/reload`, skill completion offers newly registered skills rather than removed ones.

## Expansion

- Exact, whitespace-separated registered commands are expanded using their paths as registered and the configured format.
- The expansion interface accepts the current command catalogue and returns ready-to-submit text.
- Colliding skill commands still expand, while records from other command sources are ignored.
- Unmatched text is kept.
- Inserted or previously expanded references are never scanned again, including references whose prefixes overlap.
- Expansion stays on when native completion is turned off.

## Configuration

- Invalid formats and files fall back safely.
- Each scope is validated independently, rejecting unknown section keys and falling back when its optional format is absent.

## Completion

- Native autocomplete order and metadata are kept.
- Command names shared with other sources are excluded.
- Accepting replaces the whole token around the cursor, keeps surrounding separators and lines, and leaves the cursor after the inserted space.
- Cursor-token eligibility is exercised through suggestions, file gating, and acceptance, including a cursor immediately after `/skill:` and unrelated attached text.
- Unrelated completion is passed through unchanged. Aborted asynchronous results are discarded.
- **Tab** with a single candidate, and on later lines, reaches skill completion rather than file completion.
- TUI registration is separate from input expansion outside the TUI.

## How to test

- Keep focused tests of real host wiring and real-editor routing. Assertions against the provider alone can't prove native acceptance behaviour.
- Put expansion and native-insertion guard edge cases through `expandSkillInput` in the pure suite; the installed-host tests still prove that Pi does not insert skill contents. Put cursor-token cases through the completion provider. Don't repeat host tests across modes or token positions when the extension takes the same path.

## Not covered here

Skill-file discovery and content loading, Pi's undo, persistence, and queue, and a fuzzy-scoring matrix all belong to Pi.

## Terminal checks

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
