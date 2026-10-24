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

## Behaviour

pi-model-prompt adds the files of the first matching rule that sets `append` after Pi's append text, such as `APPEND_SYSTEM.md` or `--append-system-prompt`; it does not replace that text. The files come before the text of [pi-profiles](../pi-profiles/README.md), and models with no matching rule get only Pi's append text.

## Configuration

pi-model-prompt reads only the global settings and ignores project settings. Each rule has a `match` regular expression, tested against `provider/modelId`, and an `append` list of file paths. Relative paths resolve against the settings file's directory. Run `/reload` after you edit settings or files.

| When you…                                                                  | Read                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Need the field limits, the matching order, or the order of the prompt text | [Model prompt rules](docs/rules.md)                                      |
| Want per-model text instead of a shared `APPEND_SYSTEM.md`                 | [Replace shared instructions](docs/rules.md#replace-shared-instructions) |
| See a settings warning                                                     | [Errors](docs/rules.md#errors)                                           |
| Use a virtual model                                                        | [Virtual models](docs/virtual-models.md)                                 |

## Side effects

- pi-model-prompt adds only to the append section of the system prompt.
- Pi records the change in the session transcript.
- Switching models mid-conversation changes the prompt, so prompt-cache reuse depends on the provider.
- pi-model-prompt writes no files and makes no network requests.

## Validation

Tests run offline.

| When you…                              | Read                                         |
| -------------------------------------- | -------------------------------------------- |
| Decide where a test belongs            | [testing](docs/testing.md)                   |
| Override SDK directories or upgrade Pi | [Pi compatibility](docs/pi-compatibility.md) |
