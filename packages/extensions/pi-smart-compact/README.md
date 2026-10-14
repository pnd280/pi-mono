# pi-smart-compact

Keep long tasks going before they reach the context limit by letting the model compact its own context mid-task. For example, after a large refactor the model can call `compact({ instructions: "Preserve modified files and remaining tests." })` and then carry on.

_Compaction_ replaces older conversation history with a summary written by a model. Pi does the compaction itself; this extension adds a way for the model to request it, an optional dedicated summary model, and an optional instruction file. Requires Pi 1.2.0; see [compatibility](docs/pi-compatibility.md).

## Usage

The extension adds two tools the model can call:

```typescript
context_window({});
compact({});
compact({ instructions: "Preserve decisions, modified files, and remaining tests." });
```

### `context_window`

Returns Pi's context usage as JSON: `tokens`, `contextWindow`, and `percent`.

- When usage is unknown, `tokens` and `percent` are `null`.
- When usage is unavailable, it returns `Context usage unavailable.`
- Code run by other tools can also call it.

### `compact`

`compact` asks Pi to compact; it does not confirm that compaction succeeded. Only the model can call it directly, so every request has its own tool result that replays correctly.

What happens after a request:

1. Pi saves the whole tool batch.
2. Before the next model response, Pi tries to compact, using its native summary and entry.
3. If the attempt is skipped, cancelled, or fails, a `pi-smart-compact.result` status message tells the model what happened. It does not start another turn.
4. The task continues as normal. In print mode, Pi still waits for the task's final response.

Other behaviour:

- `instructions` add focus to Pi's default history and split-turn summaries without replacing their format.
- Several `compact` calls in one tool batch produce a single attempt. The last call's instructions, or lack of them, win.
- Pressing **Escape** during compaction cancels the compaction, not the agent run.
- An explicit request ignores the automatic token threshold and `compaction.enabled`, without changing them.
- `session_before_compact` handlers from other extensions can still cancel compaction or supply their own summaries.

### What you see

- When [pi-tool-display](../pi-tool-display/README.md) is loaded, `compact` calls show as a "Requested compaction" card with the focus and summary model, and context usage shows as readable totals. The model never sees the summary-model selection.
- The interactive footer shows `compacted N×`, counting successful compactions on the active branch, including those from other extensions. RPC clients receive this status as `pi-smart-compact.compactions`.

## Configuration

By default, compaction uses the session's current model and Pi's native thinking behaviour. To choose a summary model for each conversation model, add an `ext.pi-smart-compact` key at the top level of global or trusted project [settings.json](https://pi.dev/docs/latest/settings):

```json
{
  "ext.pi-smart-compact": {
    "rules": [
      { "match": "^local/" },
      { "match": "^anthropic/", "model": "anthropic/claude-haiku-4-5", "thinkingLevel": "off" },
      { "match": "", "model": "provider/model-id" }
    ],
    "applyToManual": true,
    "applyToAuto": true,
    "instructionsFile": "compaction-instructions.txt"
  }
}
```

All fields are optional.

| Field              | Default | Effect                                                                                                          |
| ------------------ | ------- | --------------------------------------------------------------------------------------------------------------- |
| `rules`            | None    | Summary model and thinking level for `compact`, chosen by conversation model. See [rules](#rules).              |
| `applyToManual`    | `false` | Also use the matching rule for `/compact`, including manual compaction through RPC and the SDK.                 |
| `applyToAuto`      | `false` | Also use the matching rule for automatic compaction at the threshold or on overflow.                            |
| `instructionsFile` | None    | UTF-8 file of extra focus for every compaction route, whatever `rules`, `applyToManual`, and `applyToAuto` say. |

### Rules

When compaction starts, each rule is tested in order against the conversation model as `provider/id`. The first matching rule decides both of its fields, and later rules are ignored. When no rule matches, compaction uses native selection.

| Field           | Default            | Effect                                                                                                                                         |
| --------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `match`         | Required           | JavaScript regular expression tested against `provider/id`. Unanchored and case-sensitive; add `^` or `$` as needed. `""` matches every model. |
| `model`         | Conversation model | Summary model. Must be a model Pi knows; the ID may contain slashes.                                                                           |
| `thinkingLevel` | Native             | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. A level the model doesn't support is rejected, not adjusted.                     |

- A rule with only `match` keeps native selection for its models and stops later rules from matching, like `^local/` above.
- After a `/model` change, the next compaction uses the rule that matches the new model.
- A trusted project's `rules` replace the global list instead of adding to it.
- For a virtual conversation model, rules match its own ID, such as `router/auto`, not the physical model it routes to.
- For a virtual summary model, the rule's thinking level is passed to the router, which picks the physical model and its level. Saved metadata records the virtual model and level.

### Instruction file

For the example above, create `compaction-instructions.txt` beside the settings file containing the focus you want, such as `Preserve outstanding decisions and remaining tests.`

- The file's text comes first, then a blank line, then any `/compact <instructions>` or tool instructions.
- `session_before_compact` handlers receive the combined focus. Custom summarizers must apply it themselves.
- Relative paths resolve from the directory of the settings file that set them: the agent directory for global settings, or `<cwd>/.pi` for project settings. Absolute and `~/` paths also work.
- A trusted project can override an inherited file, including with an empty file to turn the focus off.
- Only the selected file is read, at startup or `/reload`, up to 1 MiB.

### Where settings live

| Scope   | File                                                                           |
| ------- | ------------------------------------------------------------------------------ |
| Global  | `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` when set. |
| Project | `<cwd>/.pi/settings.json`; parent directories are not searched.                |

Project settings override global fields only in [trusted projects](https://pi.dev/docs/latest/security#understand-project-trust), and omitted fields are inherited. Settings and instruction files are not watched, so run `/reload` after changes. To go back to native selection, remove `rules`. The extension has no environment variables and never writes settings.

### Errors

`compact` becomes unavailable until you fix the problem and run `/reload` if any of these happen:

- a settings file is unreadable, malformed, or over 1 MiB;
- a value is invalid, including a `match` that is not a valid regular expression, or `ext.pi-smart-compact` or a rule contains an unknown key;
- the selected instruction file is missing or unreadable.

`context_window` and Pi's native compaction keep working.

An unavailable model, unsupported thinking level, authentication error, or failed summary never falls back silently to another model. During overflow recovery, Pi may already have removed the failed request from model context; that removal stays if compaction fails.

### Edge cases

- Custom summaries from `session_before_compact` handlers ignore `rules`.
- The conversation model and its thinking level never change.
- Pi keeps its native retries and the conversation model's retention budgets. Output is capped by the summary model's limit, so pick a summary model large enough for Pi's requests, including overflow recovery.
- Successful default summaries from any route save a `pi-smart-compact.model` entry recording the summary model, thinking level, and trigger. The model never sees it. Custom and failed summaries save no entry.

## Side effects

- It sends conversation history to the active or configured summary model through Pi's native summarisation requests, with the usual provider usage and cost.
- It saves to the current session: native compaction entries, `pi-smart-compact.model` entries for default summaries, and status messages for skipped, cancelled, or failed requested attempts. Raw history stays in the session file.
- It patches private Pi methods in memory for the session. On shutdown it restores only the hooks it still owns, leaving later replacements by other extensions in place.
- It sets and clears one footer status, `pi-smart-compact.compactions`.
- It does not modify installed Pi files, create configuration, send user prompts, or invent continuation requests.

## Validation

Use the [workspace validation commands](../../../docs/development.md#focused-validation). The [testing specification](docs/testing.md) lists what is covered automatically. Before changing supported Pi versions, follow the [compatibility checklist](docs/pi-compatibility.md).
