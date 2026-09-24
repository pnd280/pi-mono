# pi-smart-compact

Adds model-callable `context_window` and `compact` tools to inspect context usage and compact with Pi's native orchestration while continuing the current task. Supports an optional dedicated summary model and additional instructions, including summaries of a long ongoing turn. Requires the inspected Pi **0.87.1** runtime; see [compatibility](docs/pi-compatibility.md).

## Usage

After [loading the extension](../../../README.md#load-an-extension), these tools are available:

```typescript
context_window({});
compact({});
compact({ instructions: "Preserve decisions, modified files, and remaining tests." });
```

`context_window({})` returns `ctx.getContextUsage()` unchanged as JSON: `tokens` (estimated context usage), `contextWindow` (total capacity), and `percent` (usage percentage). Unknown usage preserves `null` tokens and percent, for example after compaction before fresh model usage. If Pi returns `undefined`, the tool reports `Context usage unavailable.` It does not calculate extra fields or trigger compaction.

`compact` returns `Compaction requested.` to the model: acknowledgement of the request, not successful compaction. [`pi-tool-display`](../pi-tool-display/README.md) presents a **Requested compaction** card with the instruction focus and, when a model override is configured, `Model: provider/model-id:off` from saved result metadata. Model information is never added to the agent-facing text. The suffix is the configured thinking level, otherwise the session's current level (`off` for a non-reasoning summary model). History keeps the request-time selection after settings change. Without a model override, no model label is added; without the display adapter, Pi shows the plain acknowledgement. The display adapter also presents `context_window` as readable token totals and usage percentage, with raw JSON available on expansion.

Pi finishes and saves the entire tool batch, then attempts compaction before the next model response. Success uses Pi's native compaction entry and summary, without an extra success message. Skipped attempts and cancellations or failures reported by Pi save a visible `smart-compaction-result` status. Skips include a reason; failures include an error. The model sees that status before continuing, and it remains in session history without requesting an extra turn. Print mode waits for the task's final response.

If Pi returns without an outcome event, the skip reason may only say `Pi did not start compaction.` Unexpected exceptions propagate without a status message and can stop continuation.

Instructions add focus to Pi's default history and split-turn summary prompts; they do not replace the native format. Existing `session_before_compact` handlers receive the same instructions and may cancel or supply their own summaries. Custom summarizers remain responsible for their output.

Duplicate requests in one tool batch become one compaction attempt and at most one status message. The last executed request's instructions win; omitting instructions clears an earlier focus. If Pi reports cancellation or summarization failure, existing context is preserved and ordinary task continuation remains possible. Aborting the whole agent run prevents continuation; Escape during compaction only cancels compaction. The built-in `/compact` command is unchanged.

## Configuration

By default, compaction uses the session's active model and native thinking behavior, including subsequent model switches. To override them for the `compact` tool, set the literal top-level `ext.pi-smart-compact` key in global or trusted project [settings.json](../../../node_modules/@earendil-works/pi-coding-agent/docs/settings.md):

```json
{
  "ext.pi-smart-compact": {
    "model": "provider/model-id",
    "thinkingLevel": "off"
  }
}
```

Both fields are optional. `model` must identify a model known to Pi, including any slashes within its ID. Omitting it uses the active model. `thinkingLevel` accepts `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`; explicitly unsupported levels are rejected rather than adjusted. Omitting it preserves native thinking behavior.

Settings are read from:

| Scope   | File                                                                           |
| ------- | ------------------------------------------------------------------------------ |
| Global  | `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` when set. |
| Project | `<cwd>/.pi/settings.json`; no ancestor search.                                 |

Only [trusted projects](../../../node_modules/@earendil-works/pi-coding-agent/docs/security.md#project-trust) override global fields; omitted fields inherit. Apply changes with `/reload`. Remove both fields from all participating settings to restore native defaults. No extension-specific environment variables or settings writes.

Unreadable, malformed, or oversized participating files (over 1 MiB), invalid values, and unknown keys inside `ext.pi-smart-compact` make the tool unavailable until corrected and reloaded; `context_window` remains available. An unavailable model, unsupported thinking level, authentication error, or summary failure reports a failed compaction and preserves context without silently falling back to another model.

The override affects only this tool's default summaries, not `/compact`, automatic compaction, or hook-provided custom summaries. It never switches the conversation model or thinking level.

Pi retains native retries and the active conversation model's retention/summary budgets, with output capped by the summary model's limit. Choose a summary model that can accept the conversation being summarized.

Summary requests preserve Pi's provider retry limits, HTTP idle/request timeout, WebSocket connection timeout, and `before_provider_headers` hooks. Header hooks run after the selected provider's authentication resolves, including on summary retries.

Pi resolves the selected provider's authentication, but its native active-provider authentication step still runs before compaction hooks.

An explicit tool request bypasses the automatic token threshold and `compaction.enabled`. It does not change those settings. Native events and hooks report `reason: "manual"`; `isCompacting` remains native, and the run stays busy until it settles.

## Side effects

- Sends conversation history to the active or configured summary model through native summarization requests, with their usual provider usage and cost.
- Saves native compaction entries and metadata to the current session, plus model-visible status messages for skipped, cancelled, or failed attempts. Raw history remains in the session file.
- Patches private Pi methods in memory, with requests scoped to the session. Model, thinking, and instruction wrappers deactivate when compaction finishes; the shared boundary is released after the last session binding shuts down. Cleanup restores only methods it still owns, leaving later third-party replacements untouched.
- Does not modify installed Pi files, create configuration, send user prompts, or manufacture continuation requests. Outcome messages use Pi's default custom-message rendering.

## Validation

From the workspace root:

```sh
vpr 'pi-smart-compact#check'
vpr 'pi-smart-compact#test'
```

See the [testing specification](docs/testing.md) for automated coverage and exclusions. Before changing supported fingerprints, follow the [compatibility checklist](docs/pi-compatibility.md), including manual checks of interactive progress, Escape behavior, and real-provider summary quality.
