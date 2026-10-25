# pi-smart-compact

Keep long tasks going before they reach the context limit by letting the model compact its own context mid-task. For example, after a large refactor the model can call `compact({ instructions: "Preserve modified files and remaining tests." })` and then carry on.

_Compaction_ replaces older conversation history with a summary written by a model. Pi does the compaction itself; this extension adds a way for the model to request it, an optional dedicated summary model, an optional instruction file, and optional `context_window` docs. Requires Pi 1.4.0.

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

`compact` asks Pi to compact before the model's next response, and the task then continues. Only the model can call it directly.

- The tool does not confirm that compaction succeeded. If the attempt is skipped, cancelled, or fails, a `pi-smart-compact.result` status message tells the model what happened.
- `instructions` add focus to Pi's default summaries without replacing their format.
- Pressing **Escape** during compaction cancels the compaction, not the agent run.

For the full request sequence, several calls in one response, other extensions' hooks, and SDK use, read [compaction requests](docs/requests.md).

### What you see

- When [pi-tool-display](../pi-tool-display/README.md) is loaded, `compact` calls show as a "Requested compaction" card with the focus and summary model, and context usage shows as readable totals. The model never sees the summary-model selection.
- The interactive terminal footer shows `compacted N×`, counting successful compactions on the active branch, including those from other extensions. Print, JSON, and RPC modes do not publish this decorative status.

## Configuration

By default, compaction uses the session's current model and Pi's native thinking behaviour, called _native selection_ below. To choose a summary model for each conversation model, add an `ext.pi-smart-compact` key at the top level of global or trusted project [settings.json](https://pi.dev/docs/latest/settings):

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

Put the key in global `~/.pi/agent/settings.json` or in `<cwd>/.pi/settings.json` of a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust). A trusted project's fields override the global fields. Run `/reload` after you change settings, instruction files, or docs files.

Invalid settings, or a missing instruction or docs file, make `compact` unavailable until you fix the problem and run `/reload`. A failed summary model never falls back silently to another model.

| When you…                                                                            | Read                                                             |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Write rule patterns, choose thinking levels, or route through virtual models         | [Rules](docs/configuration.md#rules)                             |
| Place the instruction file, override it per project, or use `session_before_compact` | [Instruction file](docs/configuration.md#instruction-file)       |
| Tell the model when to check context usage or compact                                | [Docs](docs/configuration.md#docs)                               |
| Combine global and project settings, or turn routing off                             | [Where settings live](docs/configuration.md#where-settings-live) |
| Find out why `compact` is unavailable                                                | [Errors](docs/configuration.md#errors)                           |
| Find out what happens when a summary model or overflow recovery fails                | [Failed attempts](docs/requests.md#failed-attempts)              |
| Pick a summary model for overflow recovery or check what metadata is saved           | [Edge cases](docs/configuration.md#edge-cases)                   |

## Side effects

- It sends conversation history to the active or configured summary model through Pi's native summarisation requests, with the usual provider usage and cost.
- It saves native compaction entries, `pi-smart-compact.model` entries for default summaries, and status messages for skipped, cancelled, or failed requested attempts to the current session. Raw history stays in the session file.
- Metadata and native compaction are separate writes. A storage error can leave one without the other. Cancellation protects them only before native persistence starts.
- It patches private Pi methods in memory for the session. On shutdown it restores only the hooks it still owns, leaving later replacements by other extensions in place.
- In interactive terminal mode, it sets and clears one footer status, `pi-smart-compact.compactions`.
- It doesn't modify installed Pi files, create configuration, send user prompts, or invent continuation requests.

## Validation

The [test coverage guide](docs/testing.md) lists what is covered automatically. Before changing supported Pi versions, follow the [compatibility checklist](docs/pi-compatibility.md).
