# pi-model-prompt

Pi appends the same system instructions for every model, even when models need different guidance. pi-model-prompt adds each model's own prompt files after Pi's append text, chosen by rules that match the model ID.

With the configuration below, Claude models get `~/.pi/agent/prompts/ant.md` and Codex GPT models get `~/prompts/gpt.md`, after the text of `APPEND_SYSTEM.md` or `--append-system-prompt`.

## Usage

1. Write prompt files anywhere.
2. List them for each model in the [settings](#configuration).
3. Switch models as usual. The matching files apply from the next prompt.

Only the first matching rule that sets `append` adds its files. The files come before the text of [pi-profiles](../pi-profiles/README.md). With no matching rule, pi-model-prompt adds nothing; Pi's append text and other extensions' additions still apply. To give each model its own instructions instead of a shared `APPEND_SYSTEM.md`, follow [replace shared instructions](docs/rules.md#replace-shared-instructions).

## Configuration

Put the `ext.pi-model-prompt` section in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`). pi-model-prompt reads only the global settings and ignores project settings. Run `/reload` after you edit settings or a prompt file.

An SDK host that sets a custom agent directory must also set `PI_CODING_AGENT_DIR` to it.

This example shows every field. Remove the comments before you copy it, because Pi reads `settings.json` as plain JSON:

```jsonc
{
  "ext.pi-model-prompt": {
    // Optional. Up to 100 rules. The first matching rule that sets "append" wins. Omit it, or leave it empty, to keep Pi's append text unchanged.
    "rules": [
      {
        // Required. A JavaScript regular expression, 1 to 512 characters, tested against provider/modelId. The match is unanchored and case-sensitive; add ^ or $ as needed.
        "match": "claude",
        // Optional. Up to 32 file paths, each 1 to 4096 characters, added in list order. A relative path resolves against the settings file's directory; a leading ~ expands to the home directory. Omit it to let later rules match. An empty list adds nothing and stops later rules.
        "append": ["prompts/ant.md"]
      },
      {
        "match": "^openai-codex/gpt-",
        "append": ["~/prompts/gpt.md"]
      }
    ]
  }
}
```

## Side effects

- pi-model-prompt adds only to the append section of the system prompt.
- Pi records the change in the session transcript.
- Switching models mid-conversation changes the prompt, so prompt-cache reuse depends on the provider.
- In modes with a UI, pi-model-prompt shows a warning at session start for invalid settings or a prompt file that it cannot read; see [errors](docs/rules.md#errors).
- pi-model-prompt writes no files and makes no network requests.

## Docs

| When you…                                                                  | Read                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Need the field limits, the matching order, or the order of the prompt text | [Model prompt rules](docs/rules.md)                                      |
| Want per-model text instead of a shared `APPEND_SYSTEM.md`                 | [Replace shared instructions](docs/rules.md#replace-shared-instructions) |
| See a settings warning                                                     | [Errors](docs/rules.md#errors)                                           |
| Use a virtual model                                                        | [Virtual models](docs/virtual-models.md)                                 |
| Decide where a test belongs                                                | [Testing](docs/testing.md)                                               |
| Upgrade Pi                                                                 | [Pi compatibility](docs/pi-compatibility.md)                             |
