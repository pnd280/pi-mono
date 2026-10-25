# Skill-reference rules

[pi-skills](../README.md)

This guide lists when a `/skill:<name>` token expands, how completion behaves, and the rules for `expansionFormat`. The [package README](../README.md) shows the normal use.

## Matching

- Tokens must match a registered command exactly and be separated by whitespace. This applies inside fenced code too.
- Punctuation or backticks attached to a token stop it from matching, unless the whole token is itself a registered command.
- Paths are inserted exactly as registered. References already in the current format, with the registered path, aren't expanded again.
- An existing reference must be complete. If the format ends in a placeholder, the reference must be followed by whitespace or the end of the prompt, so a longer path such as `/skills/review.md.backup` isn't taken for `/skills/review.md`.

## What gets expanded

Expansion covers what you type and extension `sendUserMessage()` calls. The prompt history of pi-prompt-manager saves the text before expansion.

Expansion doesn't cover commands that Pi handles before extensions see the input, text produced by prompt templates, or custom `sendMessage()` messages.

## Completion

In the TUI, type `/skill:` at the start of any token, including mid-prompt or on a later line, and press **Tab**.

- **Enter** or **Tab** accepts a suggestion without submitting. **Escape** closes the picker.
- Accepting replaces the whole token, including any text after the cursor, and adds one space.
- Suggestions follow Pi's registered skills and completion order.
- Skill names shared with an extension command or prompt template aren't suggested. Other completion still works.

Pi's `enableSkillCommands` setting (toggled in `/settings`) controls completion only, not expansion when you submit. Both use Pi's currently registered skills.

## Expansion format

Put the `ext.pi-skills` key in global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json` when set), or in `<cwd>/.pi/settings.json` of a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust). Parent directories aren't searched.

`expansionFormat` sets what each token becomes. The default is `"[{command}](<{path}>)"`. The angle brackets keep paths with spaces or parentheses inside the Markdown link. Paths that contain `<`, `>`, or a line break don't make a valid link.

| Placeholder | Replaced with                          | Required |
| ----------- | -------------------------------------- | -------- |
| `{path}`    | The registered path of the skill file. | Yes      |
| `{command}` | The full `/skill:<name>` token.        | No       |

- Placeholders may repeat. Everything else, including spaces, is literal.
- If a leading reference could invoke a registered skill or prompt-template command, a space is added before it to keep it literal. This includes formats such as `"{command} ({path})"` and references already in the current format. Ordinary prompt-template commands still work.
- Formats are limited to 512 Unicode code points. Invalid sections, and settings files larger than 1 MiB, are ignored.
- A trusted project's format overrides the global one.
- Settings load on session start and `/reload`.
