# pi-smart-compact

Adds model-callable `context_window` and `compact` tools to inspect context usage and compact while continuing the current task. Pi handles compaction natively, including summaries of a long ongoing turn. An optional summary model can also serve `/compact` and automatic compaction; an instruction file adds focus to all three routes. Requires the inspected Pi **0.87.1** runtime; see [compatibility](docs/pi-compatibility.md).

## Usage

The extension provides two model-callable tools:

```typescript
context_window({});
compact({});
compact({ instructions: "Preserve decisions, modified files, and remaining tests." });
```

`context_window({})` returns Pi's context usage unchanged as JSON (`tokens`, `contextWindow`, `percent`); unknown usage preserves `null` tokens and percent, and unavailable usage reports `Context usage unavailable.`

`compact` acknowledges a request, not a successful compaction. [`pi-tool-display`](../pi-tool-display/README.md) shows a **Requested compaction** card with focus and configured model selection, and presents context usage as readable totals; model selection stays out of the model-facing acknowledgement.

Pi saves the whole tool batch, then attempts compaction before the next model response. Success uses Pi's native summary and entry. Skipped attempts and Pi-reported cancellations or failures save a model-visible `pi-smart-compact.result` status before continuation, without triggering another turn. Print mode waits for the task's final response.

Successful default summaries from the tool, `/compact`, or automatic compaction save a context-free `pi-smart-compact.model` entry with the summary model, thinking level, and trigger. Hook-supplied summaries and failed or cancelled attempts do not save this entry.

The interactive footer shows `compacted N×` for successful compaction entries on the active branch, including those from other extensions. RPC forwards the status under `pi-smart-compact.compactions`; display depends on the client.

Instructions focus Pi's default history and split-turn summaries without replacing their native format; `session_before_compact` handlers can still cancel or supply custom summaries. Duplicate requests in a tool batch produce one attempt, with the last executed request's instructions (or no instructions) taking precedence. Escape during compaction cancels compaction, not the agent run.

## Configuration

By default, compaction uses the session's active model and native thinking behavior, including subsequent model switches. To override them for the `compact` tool, set the literal top-level `ext.pi-smart-compact` key in global or trusted project [settings.json](../../../node_modules/@earendil-works/pi-coding-agent/docs/settings.md):

```json
{
  "ext.pi-smart-compact": {
    "model": "provider/model-id",
    "thinkingLevel": "off",
    "applyToManual": true,
    "applyToAuto": true,
    "instructionsFile": "compaction-instructions.txt"
  }
}
```

All fields are optional. `model` must identify a model known to Pi, including any slashes within its ID. Omitting it uses the active model. `thinkingLevel` accepts `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`; explicitly unsupported levels are rejected rather than adjusted. Omitting it preserves native thinking behavior.

`applyToManual` and `applyToAuto` default to `false` and independently apply model/thinking overrides to `/compact` (including RPC/SDK manual calls) and automatic threshold/overflow compaction. They do not control instruction-file focus; without model or thinking overrides, they leave native selection unchanged.

`instructionsFile` points to a UTF-8 file supplementing Pi's default prompts for **every compaction route**, independently of the flags. File text precedes `/compact <instructions>` or tool instructions, separated by a blank line. Existing `session_before_compact` handlers receive the combined focus; custom summarizers must use it themselves.

Relative instruction paths resolve from the setting's directory: the agent directory globally or `<cwd>/.pi` for project settings. Absolute and `~/` paths work too. Inherited paths keep their original base; a trusted project may override the file, including with an empty file to disable inherited focus. Only the selected file is read, at session startup or `/reload`, with a 1 MiB limit. Neither settings nor instruction files are watched.

For the example above, create `compaction-instructions.txt` beside the settings file with the focus you want, such as `Preserve outstanding decisions and remaining tests.`

Settings are read from:

| Scope   | File                                                                           |
| ------- | ------------------------------------------------------------------------------ |
| Global  | `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` when set. |
| Project | `<cwd>/.pi/settings.json`; no ancestor search.                                 |

Only [trusted projects](../../../node_modules/@earendil-works/pi-coding-agent/docs/security.md#understand-project-trust) override global fields; omitted fields inherit. Apply changes with `/reload`. Remove `model` and `thinkingLevel` from participating settings to restore native selection. No extension-specific environment variables or settings writes.

Unreadable, malformed, or oversized settings files (over 1 MiB), invalid values, unknown keys inside `ext.pi-smart-compact`, or an unreadable/missing selected instruction file make `compact` unavailable until corrected and reloaded. `context_window` and native compaction remain available.

An unavailable model, unsupported thinking level, authentication error, or summary failure does not silently fall back to another model. During overflow recovery, Pi may already have omitted the failed attempt from model context; those edits remain if compaction fails.

Hook-provided custom summaries ignore model and thinking overrides; the conversation model and thinking level never change. Pi retains native retries and the conversation model's retention budgets, with output capped by the summary model's limit. Choose a summary model with enough capacity for Pi's prepared requests, including overflow recovery.

An explicit tool request bypasses the automatic token threshold and `compaction.enabled` without changing them.

## Side effects

- Sends conversation history to the active or configured summary model through native summarization requests, with their usual provider usage and cost.
- Saves native compaction entries and metadata to the current session, plus context-free `pi-smart-compact.model` entries for default summaries and model-visible status messages for skipped, cancelled, or failed tool-requested attempts. Raw history remains in the session file.
- Patches private Pi methods in memory, scoped to the session; restores only hooks it still owns, without overwriting later replacements by other extensions.
- Sets and clears one footer status (`pi-smart-compact.compactions`) through `ctx.ui.setStatus`.
- Does not modify installed Pi files, create configuration, send user prompts, or manufacture continuation requests.

## Validation

Use the [workspace validation commands](../../../docs/development.md#focused-validation).

See the [testing specification](docs/testing.md) for automated coverage and exclusions. Before changing supported fingerprints, follow the [compatibility checklist](docs/pi-compatibility.md), including manual checks of interactive progress, Escape behavior, and real-provider summary quality.
