# pi-skills

Pi on its own recognises `/skill:<name>` only at the start of a prompt, where it pastes in the whole skill. With this extension, you can mention skills anywhere in a prompt: `/skill:<name>` anywhere becomes a link to the skill's file, and **Tab** completes skill names mid-prompt.

## Usage

Write standalone `/skill:<name>` tokens anywhere in your text:

```text
Use /skill:review then /skill:review
```

For a skill registered at `/skills/review/SKILL.md`, the submitted prompt becomes:

```text
Use [/skill:review](</skills/review/SKILL.md>) then [/skill:review](</skills/review/SKILL.md>)
```

The reference stays plain prompt text. Pi doesn't insert the skill's contents, and the model isn't guaranteed to read the file. A token expands only when it is separated by whitespace and matches a registered skill exactly.

To complete a name, type `/skill:` at the start of any token, even mid-prompt or on a later line, and press **Tab**. **Enter** or **Tab** accepts a suggestion without submitting, and **Escape** closes the picker.

| When you…                                                | Read                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Wonder why a token didn't expand                         | [matching](docs/rules.md#matching) and [what gets expanded](docs/rules.md#what-gets-expanded) |
| Want the details of completion and `enableSkillCommands` | [completion](docs/rules.md#completion)                                                        |

## Configuration

Set `expansionFormat` under the `ext.pi-skills` key in Pi's global settings or a trusted project's `.pi/settings.json`:

```json
{
  "ext.pi-skills": {
    "expansionFormat": "[{command}](<{path}>)"
  }
}
```

The format must contain `{path}`, and can contain `{command}`. The value above is the default. For file locations, limits, and the rules for leading references, read [expansion format](docs/rules.md#expansion-format).

## Side effects

Only prompt text changes. Pi saves the changed prompt in its normal session storage. The extension writes no files and makes no network requests.

## Validation

| When you…                                       | Read                                             |
| ----------------------------------------------- | ------------------------------------------------ |
| Change completion, formats, or host integration | [terminal checks](docs/testing.md#manual-checks) |
| Decide where a test belongs                     | [test coverage](docs/testing.md)                 |
