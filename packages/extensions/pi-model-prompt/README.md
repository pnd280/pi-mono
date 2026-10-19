# pi-model-prompt

Pi appends the same system instructions for every model, even when models need different guidance. pi-model-prompt adds each model's own instructions after Pi's append text.

Configure Claude and GPT models in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`):

```json
{
  "ext.pi-model-prompt": {
    "rules": [
      { "match": "claude", "append": ["prompts/ant.md"] },
      { "match": "^openai-codex/gpt-", "append": ["~/prompts/gpt.md"] }
    ]
  }
}
```

## Usage

1. Write prompt files anywhere.
2. List them per model in [settings](#configuration).
3. Switch models as usual. The matching files apply from the next prompt.

### Replace shared instructions

To give models instructions instead of shared ones, move the shared text into a prompt file. Relative paths such as `prompts/shared.md` resolve against the directory of the global `settings.json`, normally `~/.pi/agent/`.

| Do                                                                                                                  | Expect                                                                          |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Move the text of `~/.pi/agent/APPEND_SYSTEM.md` to `~/.pi/agent/prompts/shared.md`, then delete `APPEND_SYSTEM.md`. | After `/reload`, no model gets the shared text.                                 |
| Add `"prompts/shared.md"` to the `append` list of each rule whose models also need the shared text.                 | Those models get the shared text and their own files, in list order.            |
| Add `{ "match": ".", "append": ["prompts/shared.md"] }` as the last rule.                                           | Models without an earlier matching rule that sets `append` get the shared text. |

A trusted project's `.pi/APPEND_SYSTEM.md`, `--append-system-prompt` text, and append text from earlier extensions still apply to every model. Move that text into prompt files too if it must depend on the model.

## Behaviour

pi-model-prompt adds the listed files after Pi's append text; it does not replace that text.

- Pi uses the `--append-system-prompt` text when it is given. Otherwise, Pi uses one `APPEND_SYSTEM.md`: the project's `.pi/` file in [trusted](https://pi.dev/docs/latest/security#understand-project-trust) projects, or else the agent directory's file.
- pi-model-prompt keeps the changes that earlier extensions make to the append text.
- The text comes before the text of [pi-profiles](../pi-profiles/README.md), whatever the extension load order.
- pi-model-prompt chooses the files for the model that the run uses, after other extensions, such as pi-profiles, finish a model switch.
- pi-model-prompt joins the files' contents in list order with a blank line (`\n\n`), the way Pi joins several append sources.
- A blank line separates the files' contents from Pi's append text.
- Empty files add nothing.
- Models with no matching rule get only Pi's append text.

Rules for a [virtual model](https://pi.dev/docs/latest/virtual-models) match its own ID, not the model it routes to. For the effects on routed requests, read [virtual models](docs/virtual-models.md).

## Configuration

pi-model-prompt ignores project settings.

| Field    | Meaning                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `match`  | Required JavaScript regular expression, 1-512 characters, tested against `provider/modelId`. The match is unanchored and case-sensitive; add `^` or `$` as needed.                                                                    |
| `append` | Optional array of up to 32 file paths, each 1-4096 characters, added in order. `~` alone expands to the home directory, as do leading `~/` and, on Windows, `~\`. Other relative paths resolve against the settings file's directory. |

- The first matching rule that sets `append` wins. Matching rules without `append` don't stop later rules from matching.
- An empty `append` list adds nothing, but it still wins, so later matching rules aren't tried.
- With no rules, Pi's append text is unchanged.
- `rules` holds at most 100 entries.
- Listed files can live anywhere, including inside projects. Project trust doesn't affect them, because only global settings list them.
- pi-model-prompt loads settings and files on session start and `/reload`, like Pi's own `APPEND_SYSTEM.md`, so run `/reload` after editing them.

### Errors

pi-model-prompt shows problems as UI warnings when settings load. Modes without a UI, such as print mode, show no warnings.

| Problem                                                                                                   | Result                                                                  |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Invalid rule, including an unknown field in a rule                                                        | That rule is skipped.                                                   |
| Invalid section, including an unknown field in it                                                         | All rules are disabled.                                                 |
| `settings.json` can't be read                                                                             | All rules are disabled.                                                 |
| A listed file is missing, unreadable, not a regular file, contains invalid UTF-8, or is larger than 1 MiB | The rule adds none of its files, and later matching rules aren't tried. |

## Side effects

- pi-model-prompt adds only to the append section of the system prompt.
- Pi records the change in the session transcript.
- Switching models mid-conversation changes the prompt, so prompt-cache reuse depends on the provider.
- Writes no files and makes no network requests.

## Validation

Tests run offline.

| When you…                              | Read                                         |
| -------------------------------------- | -------------------------------------------- |
| Decide where a test belongs            | [testing](docs/testing.md)                   |
| Override SDK directories or upgrade Pi | [Pi compatibility](docs/pi-compatibility.md) |
