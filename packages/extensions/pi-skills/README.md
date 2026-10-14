# pi-skills

Pi on its own recognises `/skill:<name>` only at the very start of a prompt, where it pastes in the whole skill. With this extension, you can mention skills anywhere in a prompt: `/skill:<name>` anywhere becomes a link to the skill's file, and **Tab** completes skill names mid-prompt.

## Usage

Write standalone `/skill:<name>` tokens anywhere in your text:

```text
Use /skill:review then /skill:review
```

For a skill registered at `/skills/review/SKILL.md`, the submitted prompt becomes:

```text
Use [/skill:review](/skills/review/SKILL.md) then [/skill:review](/skills/review/SKILL.md)
```

The reference stays plain prompt text. Pi doesn't insert the skill's contents, and the model isn't guaranteed to read the file.

### Matching

- Tokens must match a registered command exactly and be separated by whitespace. This applies inside fenced code too.
- Punctuation or backticks attached to a token stop it from matching, unless the whole token is itself a registered command.
- Paths are inserted exactly as registered. References already in the current format, with the registered path, aren't expanded again.

### Completion

In the TUI, type `/skill:` at the start of any token, including mid-prompt or on a later line, and press **Tab**.

- **Enter** or **Tab** accepts a suggestion without submitting. **Escape** closes the picker.
- Accepting replaces the whole token, including any text after the cursor, and adds one space.
- Suggestions follow Pi's registered skills and completion order.
- Skill names shared with an extension command or prompt template aren't suggested. Other completion still works.

### What gets expanded

Expansion runs in Pi's input hook. It covers what you type and extension `sendUserMessage()` calls.

It doesn't cover commands handled before the hook, text produced by prompt templates, or custom `sendMessage()` messages.

## Compatibility

The extension uses the public extension and autocomplete APIs of Pi 1.0.2. Maintainers checking another host version should follow the [compatibility checklist](docs/pi-compatibility.md).

## Configuration

Add an `ext.pi-skills` key to Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`), or to `.pi/settings.json` in the current directory of a [trusted](https://pi.dev/docs/latest/security#understand-project-trust) project:

```json
{
  "ext.pi-skills": {
    "expansionFormat": "[{command}]({path})"
  }
}
```

`expansionFormat` sets what each token becomes. The default is `"[{command}]({path})"`.

| Placeholder | Replaced with                          | Required |
| ----------- | -------------------------------------- | -------- |
| `{path}`    | The registered path of the skill file. | Yes      |
| `{command}` | The full `/skill:<name>` token.        | No       |

- Placeholders may repeat. Everything else, including spaces, is literal.
- If a format starts with the command, such as `"{command} ({path})"`, a space is added before it at the start of a prompt, so Pi doesn't insert the skill's contents.
- Formats are limited to 512 characters. Invalid sections, and settings files that are too large, are ignored.
- A trusted project's format overrides the global one.
- Settings load on session start and `/reload`.

Pi's `enableSkillCommands` setting (toggled in `/settings`) controls completion only, not expansion when you submit. Both use Pi's currently registered skills.

## Side effects

Only prompt text changes. Pi saves the changed prompt in its normal session storage. The extension keeps no state of its own and makes no network requests.

## Validation

Use the [workspace checks](../../../docs/development.md#focused-validation). For changes to completion, formats, or host integration, also run the [terminal checks](docs/testing.md#manual-checks). For what is tested where, see [testing](docs/testing.md).
