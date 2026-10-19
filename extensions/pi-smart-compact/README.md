# pi-smart-compact

Keep long tasks going before they reach the context limit by letting the model compact its own context mid-task. For example, after a large refactor the model can call `compact({ instructions: "Preserve modified files and remaining tests." })` and then carry on.

_Compaction_ replaces older conversation history with a summary written by a model. Pi does the compaction itself; this extension adds a way for the model to request it, an optional dedicated summary model, an optional instruction file, and optional `context_window` docs. Requires Pi 1.3.0; see [compatibility](docs/pi-compatibility.md).

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
- Configured [docs](docs/configuration.md#docs) follow its description.

### `compact`

`compact` asks Pi to compact; it does not confirm that compaction succeeded. Only the model can call it directly, so every request has its own tool result that replays correctly.

What happens after a request:

1. Pi saves the whole tool batch.
2. Before the next model response, Pi tries to compact, using its native summary and entry.
3. If the attempt is skipped, cancelled, or fails, a `pi-smart-compact.result` status message tells the model what happened. It does not start another turn.
4. The task continues unless the whole run is aborted or an unexpected exception stops it. In print mode, Pi waits for the task's final response.

Other behaviour:

- `instructions` add focus to Pi's default history and split-turn summaries without replacing their format.
- Several `compact` calls in one tool batch produce a single attempt. The last call's instructions, or lack of them, win.
- Pressing **Escape** during compaction cancels the compaction, not the agent run.
- An explicit request ignores the automatic token threshold and `compaction.enabled`, without changing them.
- `session_before_compact` handlers from other extensions can still cancel compaction or supply their own summaries.
- SDK callers must await each manual compaction before they start another. Concurrent calls can fail in Pi's native compaction state.

### What you see

- When [pi-tool-display](../pi-tool-display/README.md) is loaded, `compact` calls show as a "Requested compaction" card with the focus and summary model, and context usage shows as readable totals. The model never sees the summary-model selection.
- The interactive terminal footer shows `compacted N×`, counting successful compactions on the active branch, including those from other extensions. Print, JSON, and RPC modes do not publish this decorative status.

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
    "compactionInstructionsFile": "compaction-instructions.txt",
    "docs": ["context-window.md"]
  }
}
```

All fields are optional.

| Field                        | Default | Effect                                                                                                                  |
| ---------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `rules`                      | None    | Summary model and thinking level for `compact`, chosen by conversation model. See [rules](docs/configuration.md#rules). |
| `applyToManual`              | `false` | Also use the matching rule for `/compact`, including manual compaction through RPC and the SDK.                         |
| `applyToAuto`                | `false` | Also use the matching rule for automatic compaction at the threshold or on overflow.                                    |
| `compactionInstructionsFile` | None    | UTF-8 file of extra focus for every compaction route, whatever `rules`, `applyToManual`, and `applyToAuto` say.         |
| `docs`                       | None    | UTF-8 files whose text follows the `context_window` description. See [docs](docs/configuration.md#docs).                |

For the example `compactionInstructionsFile`, create `compaction-instructions.txt` beside the settings file containing the focus you want, such as `Preserve outstanding decisions and remaining tests.` Its text comes before any `/compact <instructions>` or tool instructions.

| When you…                                                                            | Read                                                       |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Write rule patterns, choose thinking levels, or route through virtual models         | [Rules](docs/configuration.md#rules)                       |
| Place the instruction file, override it per project, or use `session_before_compact` | [Instruction file](docs/configuration.md#instruction-file) |
| Tell the model when to check context usage or compact                                | [Docs](docs/configuration.md#docs)                         |
| Pick a summary model for overflow recovery or check what metadata is saved           | [Edge cases](docs/configuration.md#edge-cases)             |

### Where settings live

| Scope   | File                                                                           |
| ------- | ------------------------------------------------------------------------------ |
| Global  | `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` when set. |
| Project | `<cwd>/.pi/settings.json`; parent directories are not searched.                |

Project settings override global fields only in [trusted projects](https://pi.dev/docs/latest/security#understand-project-trust), and omitted fields are inherited. Settings, instruction files, and docs files are not watched, so run `/reload` after changes. To go back to native selection, remove `rules`. The extension has no environment variables and never writes settings.

### Errors

`compact` becomes unavailable until you fix the problem and run `/reload` if any of these happen:

- a settings file is unreadable, malformed, or over 1 MiB;
- a value is invalid, including a `match` that is not a valid regular expression, or `ext.pi-smart-compact` or a rule contains an unknown key;
- a selected instruction or docs file is missing or unreadable.

`context_window`, without docs, and Pi's native compaction keep working.

An unavailable model, unsupported thinking level, authentication error, or failed summary never falls back silently to another model. Overflow recovery also covers recoverable length stops. If Pi removed the failed request from model context before recovery, that removal stays if compaction fails.

## Side effects

- It sends conversation history to the active or configured summary model through Pi's native summarisation requests, with the usual provider usage and cost.
- It saves native compaction entries, `pi-smart-compact.model` entries for default summaries, and status messages for skipped, cancelled, or failed requested attempts to the current session. Raw history stays in the session file.
- Metadata and native compaction are separate writes. A storage error can leave one without the other. Cancellation protects them only before native persistence starts.
- It patches private Pi methods in memory for the session. On shutdown it restores only the hooks it still owns, leaving later replacements by other extensions in place.
- In interactive terminal mode, it sets and clears one footer status, `pi-smart-compact.compactions`.
- It does not modify installed Pi files, create configuration, send user prompts, or invent continuation requests.

## Validation

Use the [workspace validation commands](../../../docs/development.md#focused-validation). The [testing specification](docs/testing.md) lists what is covered automatically. Before changing supported Pi versions, follow the [compatibility checklist](docs/pi-compatibility.md).
