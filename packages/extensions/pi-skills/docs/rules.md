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

In the TUI, type `/` at the start of any whitespace-separated token, except at the start of the first line. The picker opens with skill suggestions. The text after `/` filters them with Pi's matching, so `/re` and `/skill:re` both find `review`. The picker closes when no skill matches, or when you type a space or delete the `/` with **Backspace** or **Delete**. Word deletion, undo, and some cursor jumps can leave old suggestions showing; press **Escape** to close them. Editing the token doesn't reopen the picker, and it can stay closed if you type on before the suggestions arrive. To reopen it, delete the token and type `/` again. You can also type `/skill:` at the start of any token, including mid-prompt or on a later line, and press **Tab**.

- A `/` at the start of the first line keeps Pi's own slash-command picker. A `/` inside a word, such as `and/or`, opens no picker.
- In a slash command's arguments, the command's own suggestions come first. Skill suggestions show only when the command has none.
- With the picker closed, **Tab** on a token such as `/usr/lo` keeps Pi's file completion.
- **Enter** or **Tab** accepts a suggestion without submitting. **Escape** closes the picker.
- Accepting replaces the whole token, including any text after the cursor, with `/skill:<name>` and one space.
- Suggestions follow Pi's registered skills and completion order.
- Skill names shared with an extension command or prompt template aren't suggested. Other completion still works.

Pi's `enableSkillCommands` setting (toggled in `/settings`) controls completion only, not expansion when you submit. Both use Pi's currently registered skills.

To open the picker after `/`, the extension wraps Pi's editor and calls a private editor method. In these cases, `/` doesn't open the picker, but **Tab** after `/skill:` still completes:

- The installed Pi version isn't supported, or an extension that loads earlier provides an editor that isn't Pi's. Pi shows a warning.
- An extension that loads later provides its own editor without wrapping this one. No warning appears.

The wrapped editor starts with an empty prompt history after `/reload` or a session switch, such as `/new` or `/resume`. **Up** then recalls only the prompts sent since then.

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
