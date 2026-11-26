# pi-smart-compact

Keep long tasks going before they reach the context limit. pi-smart-compact lets the model check its context usage and compact its own context mid-task, and you can configure a summary model for each conversation model, apply it to `/compact` and automatic compaction, add an instruction file of extra focus, add docs that tell the model when to compact, and report context usage to the model each time it grows by a set number of tokens.

_Compaction_ replaces older conversation history with a summary that a model writes. Pi does the compaction itself. For example, after a large refactor the model can call `compact({ instructions: "Preserve modified files and remaining tests." })` and then carry on.

## Controls

| Control                     | Effect                                                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context_window` model tool | Returns Pi's context usage as JSON: `tokens`, `contextWindow`, and `percent`. Code that other tools run can also call it.                                                    |
| `compact` model tool        | Asks Pi to compact before the model's next response, and the task then continues. The optional `instructions` add focus to the summary. Only the model can call it directly. |
| `/compact`                  | Pi's command. With `applyToManual`, it uses the summary model of the matching rule; see [configuration](#configuration).                                                     |

## Usage

pi-smart-compact requires Pi 1.6.1. The model calls the tools like this:

```typescript
context_window({});
compact({});
compact({ instructions: "Preserve decisions, modified files, and remaining tests." });
```

### `context_window`

- When usage is unknown, `tokens` and `percent` are `null`.
- When usage is unavailable, the tool returns `Context usage unavailable.`
- Configured [docs](docs/configuration.md#docs) follow its description.

### `compact`

- The tool does not confirm that compaction succeeded. If the attempt is skipped, cancelled, or fails, a `pi-smart-compact.result` status message tells the model what happened.
- `instructions` add focus to Pi's default summaries without replacing their format.
- When you press **Escape** during compaction, Pi cancels the compaction, not the agent run.

For the full request sequence, several calls in one response, other extensions' hooks, and SDK use, read [compaction requests](docs/requests.md).

### Context status

With [`statusStep`](#configuration) set, the model does not have to ask. Each time usage passes a multiple of the step, the extension adds one message to the session that the model reads before its next response:

```text
Context usage: {"tokens":152340,"contextWindow":200000,"percent":76.17}
```

The JSON is what `context_window` returns, so your [docs](docs/configuration.md#docs) apply to it. For when a status appears, and what happens after compaction or a model change, read [context status](docs/configuration.md#context-status).

### What you see

- When [pi-tool-display](../pi-tool-display/README.md) is loaded, `compact` calls show as a "Requested compaction" card with the call's focus and, when a rule sets `model`, the summary model, and context usage shows as readable totals, both for `context_window` calls and for each context status. Without it, a context status shows as its message text. The model never sees the summary-model selection.
- The interactive terminal footer shows `compacted N×`, which counts the successful compactions on the active branch, including those from other extensions. Print, JSON, and RPC modes do not publish this decorative status.

## Configuration

Without settings, compaction uses the session's current model and Pi's native thinking behaviour, called _native selection_. Put the `ext.pi-smart-compact` key at the top level of global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`), or of `.pi/settings.json` in the current directory of a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust). A trusted project's fields override the global fields. Run `/reload` after you change settings, instruction files, or docs files.

This example shows every field. Remove the comments before you copy it, because Pi reads `settings.json` as plain JSON:

```jsonc
{
  "ext.pi-smart-compact": {
    // Optional. The summary model and thinking level for compact, chosen by conversation model. The first rule that matches decides. Without a matching rule, compaction uses native selection.
    "rules": [
      // A rule with only "match" keeps native selection for its models and stops later rules.
      { "match": "^local/" },
      {
        // Required. A JavaScript regular expression, tested against the conversation model as provider/id. Unanchored and case-sensitive. "" matches every model.
        "match": "^anthropic/",
        // Optional. A provider/model-id that Pi knows. Default: the conversation model.
        "model": "anthropic/claude-haiku-4-5",
        // Optional. off, minimal, low, medium, high, xhigh, or max. Default: Pi's native thinking behaviour. A level that the model does not support is rejected, not adjusted.
        "thinkingLevel": "off"
      }
    ],
    // Optional. Also use the matching rule for /compact, including manual compaction through RPC and the SDK. Default: false.
    "applyToManual": true,
    // Optional. Also use the matching rule for automatic compaction at the threshold or on overflow. Default: false.
    "applyToAuto": true,
    // Optional. A UTF-8 file, up to 1 MiB, of extra focus for every compaction route, whatever rules, applyToManual, and applyToAuto say. A relative path resolves from the settings file's directory. Default: no extra focus.
    "compactionInstructionsFile": "compaction-instructions.txt",
    // Optional. UTF-8 files, up to 1 MiB each, whose text follows the context_window description. Default: no docs.
    "docs": ["context-window.md"],
    // Optional. Report context usage to the model each time it passes a multiple of this many tokens. A whole number of at least 50000. 0 or null turns it off, also for a value inherited from global settings. Default: off.
    "statusStep": 50000
  }
}
```

Create the example's `compaction-instructions.txt` and `context-window.md` beside the settings file. Put the focus that you want in the first, such as `Preserve outstanding decisions and remaining tests.`, and guidance on when to compact in the second.

Invalid settings, or a missing instruction or docs file, make `compact` unavailable until you fix the problem and run `/reload`. A failed summary model never falls back silently to another model.

## Side effects

- pi-smart-compact sends conversation history to the active or configured summary model through Pi's native summarisation requests, with the usual provider usage and cost.
- It saves to the current session native compaction entries, `pi-smart-compact.model` entries for default summaries, status messages for skipped, cancelled, or failed requested attempts, and, with `statusStep`, `pi-smart-compact.context-usage` messages. Raw history stays in the session file.
- Metadata and native compaction are separate writes. A storage error can leave one without the other. Cancellation protects them only before native persistence starts.
- It patches private Pi methods in memory for the session. On shutdown it restores only the hooks that it still owns, and leaves later replacements by other extensions in place.
- In interactive terminal mode, it sets and clears one footer status, `pi-smart-compact.compactions`.
- It does not modify installed Pi files, create configuration, send user prompts, or invent continuation requests.

## Docs

| When you…                                                                            | Read                                                             |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Write rule patterns, choose thinking levels, or route through virtual models         | [Rules](docs/configuration.md#rules)                             |
| Place the instruction file, override it per project, or use `session_before_compact` | [Instruction file](docs/configuration.md#instruction-file)       |
| Tell the model when to check context usage or compact                                | [Docs](docs/configuration.md#docs)                               |
| Find out when a context status appears, or what a model change does to it            | [Context status](docs/configuration.md#context-status)           |
| Combine global and project settings, or turn routing off                             | [Where settings live](docs/configuration.md#where-settings-live) |
| Find out why `compact` is unavailable                                                | [Errors](docs/configuration.md#errors)                           |
| Pick a summary model for overflow recovery or check what metadata is saved           | [Edge cases](docs/configuration.md#edge-cases)                   |
| Want the request sequence, several calls in one response, or SDK use                 | [Compaction requests](docs/requests.md)                          |
| Find out what happens when a summary model or overflow recovery fails                | [Failed attempts](docs/requests.md#failed-attempts)              |
| Decide where a test belongs or check what is covered                                 | [Test coverage](docs/testing.md)                                 |
| Upgrade Pi or change the supported Pi versions                                       | [Pi compatibility](docs/pi-compatibility.md)                     |
