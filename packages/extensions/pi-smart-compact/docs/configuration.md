# Configuration reference

[pi-smart-compact](../README.md)

For the settings example, the top-level fields, and where settings live, see [configuration](../README.md#configuration).

## Rules

When compaction starts, the extension tests each rule in order against the conversation model as `provider/id`. The first matching rule decides both of its fields, and later rules are ignored. When no rule matches, compaction uses _native selection_: the session's current model and Pi's native thinking behaviour.

| Field           | Default            | Effect                                                                                                                                         |
| --------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `match`         | Required           | JavaScript regular expression tested against `provider/id`. Unanchored and case-sensitive; add `^` or `$` as needed. `""` matches every model. |
| `model`         | Conversation model | Summary model. Must be a model Pi knows; the ID may contain slashes.                                                                           |
| `thinkingLevel` | Native             | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. A level the model doesn't support is rejected, not adjusted.                     |

- A rule with only `match` keeps native selection for its models and stops later rules from matching, like `^local/` in the README example.
- After a `/model` change, the next compaction uses the rule that matches the new model.
- A trusted project's `rules` replace the global list instead of adding to it.
- For a virtual conversation model, rules match its own ID, such as `router/auto`, not the physical model it routes to.
- For a virtual summary model, the rule's thinking level is passed to the router, which picks the physical model and its level. Saved metadata records the virtual model and level.

## Instruction file

The `compactionInstructionsFile` setting names a UTF-8 file of extra focus for every compaction route.

- The file's text comes first, then a blank line, then any `/compact <instructions>` or tool instructions.
- `session_before_compact` handlers receive the combined focus. Custom summarisers must apply it themselves and control their own requests and output.
- Relative paths resolve from the directory of the settings file that set them: the agent directory for global settings, or `<cwd>/.pi` for project settings. Absolute and `~/` paths also work.
- A trusted project can override an inherited file, including with an empty file to turn the focus off.
- Only the selected file is read, at startup or `/reload`, up to 1 MiB.

## Docs

The `docs` setting lists UTF-8 files that tell the model how to use `context_window`, for example when to check usage and when to call `compact`.

- Each file is trimmed. The files follow the built-in `context_window` description in list order, separated by a blank line. `compact` gets no docs.
- The text goes into the current tool declaration. Descriptions already recorded in conversation history stay.
- Relative paths resolve from the directory of the settings file that lists them. Absolute and `~/` paths also work.
- A trusted project's list replaces the global list, and an empty array removes the docs.
- Only the selected files are read, at startup or `/reload`, each up to 1 MiB.

## Edge cases

- Custom summaries from `session_before_compact` handlers ignore `rules`.
- The conversation model and its thinking level never change.
- Pi keeps its native retries and the conversation model's retention budgets. Output is capped by the summary model's limit, so pick a summary model large enough for Pi's requests, including overflow recovery.
- Successful default summaries from any route save a `pi-smart-compact.model` entry recording the summary model, thinking level, and trigger. The model never sees it. Custom and failed summaries save no entry.
