# pi-skills

Pi on its own recognises `/skill:<name>` only at the start of a prompt, where it pastes in the whole skill. With this extension, you can mention skills anywhere in a prompt: `/skill:<name>` anywhere becomes a link to the skill's file in a format that you can configure, and typing `/` mid-prompt opens skill completion.

Write standalone `/skill:<name>` tokens anywhere in your text:

```text
Use /skill:review then /skill:review
```

For a skill registered at `/skills/review/SKILL.md`, the submitted prompt becomes:

```text
Use [/skill:review](</skills/review/SKILL.md>) then [/skill:review](</skills/review/SKILL.md>)
```

## Controls

| Control                                    | Effect                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Type `/` at the start of a token           | Open the skill picker, except at the start of the first line. The text after `/` filters the skills.                                                         |
| **Tab** after `/skill:` at a token start   | Complete the skill name, also mid-prompt or on a later line. With the picker closed, **Tab** on other tokens, such as `/usr/lo`, keeps Pi's file completion. |
| **Up** after `/reload` or a session switch | Recall only the prompts sent since then, because the extension's editor starts with an empty prompt history.                                                 |

## Usage

The reference stays plain prompt text. Pi doesn't insert the skill's contents, and the model isn't guaranteed to read the file. A token expands only when it is separated by whitespace and matches a registered skill exactly. The [matching rules](docs/rules.md#matching) and [what gets expanded](docs/rules.md#what-gets-expanded) give the details.

In the skill picker, **Enter** or **Tab** accepts a suggestion without submitting, and **Escape** closes the picker. Pi's `enableSkillCommands` setting controls completion; see [completion](docs/rules.md#completion).

## Configuration

Put the `ext.pi-skills` section in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`), or in `<cwd>/.pi/settings.json` of a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust). A trusted project's format overrides the global one. Run `/reload` after you edit settings.

This example shows every field. Remove the comments before you copy it, because Pi reads `settings.json` as plain JSON:

```jsonc
{
  "ext.pi-skills": {
    // Optional. What each token becomes. Must contain {path}, and can contain {command}.
    // Up to 512 Unicode code points. Default: "[{command}](<{path}>)".
    "expansionFormat": "[{command}](<{path}>)"
  }
}
```

For the placeholders, invalid settings, and the rules for leading references, read [expansion format](docs/rules.md#expansion-format).

## Side effects

Only prompt text changes. Pi saves the changed prompt in its normal session storage. The extension writes no files and makes no network requests.

The extension wraps Pi's editor, so the prompt history is empty after `/reload` or a session switch, such as `/new` or `/resume`.

## Docs

| When you…                                                | Read                                                   |
| -------------------------------------------------------- | ------------------------------------------------------ |
| Wonder why a token didn't expand                         | [Matching and expansion rules](docs/rules.md#matching) |
| Want the details of completion and `enableSkillCommands` | [Completion](docs/rules.md#completion)                 |
| Need the placeholders, settings files, or format limits  | [Expansion format](docs/rules.md#expansion-format)     |
| Change completion, formats, or host integration          | [Terminal checks](docs/testing.md#manual-checks)       |
| Decide where a test belongs                              | [Test coverage](docs/testing.md)                       |
| Upgrade Pi                                               | [Pi compatibility](docs/pi-compatibility.md)           |
