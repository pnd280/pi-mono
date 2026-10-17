# pi-model-prompt

Pi appends one shared `APPEND_SYSTEM.md` for every model, even when models need different guidance. pi-model-prompt gives each model its own appended system instructions.

Configure Claude and GPT models in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`):

```json
{
  "ext.pi-model-prompt": {
    "rules": [
      { "match": "claude", "append": ["prompts/ant.md"] },
      { "match": "^openai-codex/gpt-", "append": ["APPEND_SYSTEM.md", "~/prompts/gpt.md"] }
    ]
  }
}
```

## Usage

1. Write prompt files anywhere.
2. List them per model in [settings](#configuration).
3. Switch models as usual. The matching files apply from the next prompt.

The listed files replace Pi's append text; they don't add to it.

- Their contents are joined in list order with a blank line (`\n\n`), the way Pi joins several append sources.
- To keep the agent-level `APPEND_SYSTEM.md` as well, list it (relative to the settings directory).
- An empty list or one empty file removes the append text. Several empty files leave only the joining blank lines.
- Models with no matching rule keep Pi's normal `APPEND_SYSTEM.md`. Pi looks for it in the project's `.pi/` first, in [trusted](https://pi.dev/docs/latest/security#understand-project-trust) projects only, then in the agent directory.

Append text from `--append-system-prompt` or another extension is normally left alone. Rules for a [virtual model](https://pi.dev/docs/latest/virtual-models) match its own ID, not the model it routes to. To see exactly when the replacement applies in these cases, read [when the replacement applies](docs/replacement.md).

## Configuration

Project settings are ignored.

| Field    | Meaning                                                                                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `match`  | Required JavaScript regular expression, 1-512 characters, tested against `provider/modelId`. Unanchored and case-sensitive; add `^` or `$` as needed.                                                                                    |
| `append` | Optional array of up to 32 file paths, each 1-4096 characters, appended in order. `~` alone expands to the home directory, as do leading `~/` and, on Windows, `~\`. Other relative paths resolve against the settings file's directory. |

- The first matching rule that sets `append` wins. Matching rules without `append` don't stop later rules from matching.
- With no rules, Pi's append text is unchanged.
- `rules` holds at most 100 entries.
- Listed files can live anywhere, including inside projects. Project trust affects only the discovery of Pi's own `APPEND_SYSTEM.md`.
- Settings and files are loaded on session start and `/reload`, like Pi's own `APPEND_SYSTEM.md`, so run `/reload` after editing them.

### Errors

Problems are shown as UI warnings when settings load. Modes without a UI, such as print mode, show no warnings.

| Problem                                                                                                        | Result                                                       |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Invalid rule, including an unknown field in a rule                                                             | That rule is skipped.                                        |
| Invalid section, including an unknown field in it                                                              | All rules are disabled.                                      |
| `settings.json` can't be read                                                                                  | All rules are disabled.                                      |
| A listed file is missing, unreadable, not a regular file, contains invalid UTF-8, or is larger than 1 MiB      | The rule keeps Pi's text instead of applying a partial list. |
| Pi's own `APPEND_SYSTEM.md` is unreadable, not a regular file, contains invalid UTF-8, or is larger than 1 MiB | No replacement happens.                                      |

## Side effects

- Changes only the append section of the system prompt. Pi records the change in the session transcript.
- Switching models mid-conversation changes the prompt, so prompt-cache reuse depends on the provider.
- Writes no files and makes no network requests.

## Validation

Tests run offline; the Unix FIFO test needs `mkfifo`.

| When you…                              | Read                                         |
| -------------------------------------- | -------------------------------------------- |
| Decide where a test belongs            | [testing](docs/testing.md)                   |
| Override SDK directories or upgrade Pi | [Pi compatibility](docs/pi-compatibility.md) |
