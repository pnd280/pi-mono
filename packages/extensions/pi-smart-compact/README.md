# pi-smart-compact

Adds model-callable `context_window` and `compact` tools to inspect context usage and compact while continuing the current task. Pi handles compaction natively, including summaries of a long ongoing turn. An optional summary model can also serve `/compact` and automatic compaction; an instruction file adds focus to all three routes. Requires the inspected Pi **0.87.1** runtime; see [compatibility](docs/pi-compatibility.md).

## Usage

After [loading the extension](../../../README.md#load-an-extension), these tools are available:

```typescript
context_window({});
compact({});
compact({ instructions: "Preserve decisions, modified files, and remaining tests." });
```

`context_window({})` returns `ctx.getContextUsage()` unchanged as JSON: `tokens` (estimated context usage), `contextWindow` (total capacity), and `percent` (usage percentage). Unknown usage preserves `null` tokens and percent, for example after compaction before fresh model usage. If Pi returns `undefined`, the tool reports `Context usage unavailable.` It does not calculate extra fields or trigger compaction.

`compact` returns `Compaction requested.` to the model, acknowledging the request rather than a successful compaction. [`pi-tool-display`](../pi-tool-display/README.md) shows a **Requested compaction** card with instruction focus and, if a model override is configured, `Model: provider/model-id:off` from saved result metadata. The suffix is the configured thinking level or the session's current level (`off` for a non-reasoning summary model). History retains the request-time selection after settings change. Model information never enters the agent-facing text. Without an override, the card has no model label; without the display adapter, Pi shows the plain acknowledgement. The adapter also shows `context_window` as readable token totals and usage percentage, with raw JSON on expansion.

Pi finishes and saves the entire tool batch, then attempts compaction before the next model response. Success uses Pi's native compaction entry and summary, without an extra success message. Skipped attempts and reported cancellations or failures save a visible `pi-smart-compact.result` status. Skips include a reason; failures include an error. The model sees this status before continuing, and it stays in session history without requesting another turn. Print mode waits for the task's final response.

Each successful default summary from the tool, `/compact`, or automatic compaction saves a `pi-smart-compact.model` session entry immediately before the native compaction entry. It records the `provider/model-id`, generation-time thinking level, and trigger (`tool`, `manual`, `threshold`, or `overflow`) despite later setting changes. Interactive mode renders a dim `Compacted with provider/model-id:level (trigger)` line. The entry stays out of model context. Hook-supplied summaries, unrelated summary calls, summarization failures, and attempts cancelled before persistence record no entry.

If Pi returns without an outcome event, the skip reason may only say `Pi did not start compaction.` Unexpected exceptions propagate without a status message and can stop continuation.

Instructions add focus to Pi's default history and split-turn summary prompts; they do not replace the native format. Existing `session_before_compact` handlers receive the same instructions and may cancel or supply their own summaries. Custom summarizers remain responsible for their output.

Duplicate requests in one tool batch produce one attempt and at most one status message. The last executed request's instructions win; omitting them clears earlier per-call focus. If Pi reports cancellation or summarization failure, existing context remains and the task can continue. Aborting the agent run prevents continuation; Escape during compaction cancels only compaction. Apart from the summary-model entry, `/compact` and automatic compaction retain native behavior unless an instruction file or their model and thinking overrides are configured below.

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

`applyToManual` defaults to `false`. Set it to `true` to apply the configured model and thinking level to `/compact`, including RPC and SDK manual compaction through the same native entry point. Instructions, cancellation, persistence, and continuation remain native. Without a model or thinking override, the flag leaves native selection unchanged.

`applyToAuto` defaults to `false`. Set it to `true` to apply the configured model and thinking level to threshold-triggered compaction and overflow recovery. Triggers, hooks, retries, persistence, and continuation remain native. Without a model or thinking override, the flag leaves native selection unchanged. The flags are independent and control only model and thinking overrides, not instruction-file focus.

`instructionsFile` points to a UTF-8 text file whose contents supplement Pi's default prompts for **every compaction route**: the tool, `/compact` (including RPC/SDK manual calls), threshold compaction, and overflow recovery. This does not depend on `applyToManual` or `applyToAuto`. The file text comes first, followed by any `/compact <instructions>` or tool `instructions`, separated by a blank line. Both history and split-turn summaries receive the combined focus exactly once, including on retries. Existing `session_before_compact` handlers receive that same combined text; handlers supplying custom summaries remain responsible for using it.

Relative instruction paths resolve from the directory containing the setting: the agent directory for global settings, or `<cwd>/.pi` for project settings. Absolute paths and `~/` paths are also supported. A trusted project's `instructionsFile` replaces the global path; omitted fields inherit it without changing its base directory. Only the selected file is read. File contents are loaded at session startup or `/reload`, trimmed, and limited to 1 MiB. An empty file adds no focus. Omitting the setting leaves existing instruction behavior unchanged; an empty project file can disable inherited file focus. Neither settings nor instruction files are watched.

For example, `compaction-instructions.txt` could contain:

```text
Under Critical Context, preserve exact paths or URLs for relevant skills,
applicable AGENTS.md files, plans, and user-referenced documentation.
Briefly explain each reference's relevance and whether it must be reread.
Preserve their task-relevant requirements under Constraints & Preferences.
```

Settings are read from:

| Scope   | File                                                                           |
| ------- | ------------------------------------------------------------------------------ |
| Global  | `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` when set. |
| Project | `<cwd>/.pi/settings.json`; no ancestor search.                                 |

Only [trusted projects](../../../node_modules/@earendil-works/pi-coding-agent/docs/security.md#project-trust) override global fields; omitted fields inherit. Apply changes with `/reload`. Remove `model` and `thinkingLevel` from all participating settings to restore native selection. No extension-specific environment variables or settings writes.

Unreadable, malformed, or oversized participating settings files (over 1 MiB), invalid values, and unknown keys inside `ext.pi-smart-compact` make the tool unavailable until corrected and reloaded; `context_window` remains available. A selected instruction file that is missing, unreadable, oversized, or not a regular file also fails initialization, rather than silently omitting the requested focus. Pi reports initialization errors; native manual and automatic compaction remain available without this extension's overrides.

An unavailable model, unsupported thinking level, authentication error, or summary failure does not silently fall back to another model. Failed summarization adds no compaction entry. The tool reports a failed compaction; native `/compact` and automatic compaction report their own errors. During overflow recovery, Pi may already have omitted the failed attempt from model context; those edits remain if compaction fails.

Hook-provided custom summaries ignore model and thinking overrides, which never switch the conversation model or thinking level.

Pi retains native retries and the active conversation model's retention/summary budgets, with output capped by the summary model's limit. Choose a summary model with enough capacity for Pi's prepared summary requests. Overflow recovery uses the same native preparation and serialization, not the unchanged failed request; a smaller summary model may still run out of context.

Summary requests preserve Pi's provider retry limits, HTTP idle and request timeouts, WebSocket connection timeout, and `before_provider_headers` hooks. Pi's native active-provider authentication still runs before compaction hooks. Header hooks run after selected-provider authentication, including on summary retries.

An explicit tool request bypasses the automatic token threshold and `compaction.enabled`. It does not change those settings. Native events and hooks report `reason: "manual"`; `isCompacting` remains native, and the run stays busy until it settles.

## Side effects

- Sends conversation history to the active or configured summary model through native summarization requests, with their usual provider usage and cost.
- Saves native compaction entries and metadata to the current session, plus context-free `pi-smart-compact.model` entries for default summaries and model-visible status messages for skipped, cancelled, or failed tool-requested attempts. Raw history remains in the session file.
- Patches private Pi methods in memory, with requests scoped to the session. Wrappers around native manual and automatic entry points supply file focus without changing their orchestration. A temporary `SessionManager.appendCompaction` wrapper inserts summary-model metadata after Pi's final abort check and is released on persistence, cancellation, completion, or disposal. Model, thinking, and instruction wrappers deactivate when compaction finishes; shared boundary, entry-point, and summary routing wrappers are released when the final session binding is disposed. Cleanup restores only methods it still owns, leaving later third-party replacements untouched.
- Does not modify installed Pi files, create configuration, send user prompts, or manufacture continuation requests. Outcome messages use Pi's default custom-message rendering; summary-model entries register their own entry renderer.

## Validation

From the workspace root:

```sh
vpr 'pi-smart-compact#check'
vpr 'pi-smart-compact#test'
```

See the [testing specification](docs/testing.md) for automated coverage and exclusions. Before changing supported fingerprints, follow the [compatibility checklist](docs/pi-compatibility.md), including manual checks of interactive progress, Escape behavior, and real-provider summary quality.
