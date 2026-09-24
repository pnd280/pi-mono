# pi-smart-compact

Adds model-callable `context_window` and `compact` tools to inspect context usage and compact with Pi's native orchestration while continuing the current task. Supports additional summary instructions, including summaries of a long ongoing turn. Requires the inspected Pi **0.87.1** runtime; see [compatibility](docs/pi-compatibility.md).

## Usage

After [loading the extension](../../../README.md#load-an-extension), these tools are available:

```typescript
context_window({});
compact({});
compact({ instructions: "Preserve decisions, modified files, and remaining tests." });
```

`context_window({})` returns `ctx.getContextUsage()` unchanged as JSON: `tokens` (estimated context usage), `contextWindow` (total capacity), and `percent` (usage percentage). Unknown usage preserves `null` tokens and percent, for example after compaction before fresh model usage. If Pi returns `undefined`, the tool reports `Context usage unavailable.` It does not calculate extra fields or trigger compaction.

`compact` acknowledges the request, not successful compaction. Pi finishes and saves the entire tool batch, then attempts compaction before the next model response. Success uses Pi's native compaction entry and summary, without an extra success message. Skipped attempts and cancellations or failures reported by Pi save a visible `smart-compaction-result` status. Skips include a reason; failures include an error. The model sees that status before continuing, and it remains in session history without requesting an extra turn. Print mode waits for the task's final response.

If Pi returns without an outcome event, the skip reason may only say `Pi did not start compaction.` Unexpected exceptions propagate without a status message and can stop continuation.

Instructions add focus to Pi's default history and split-turn summary prompts; they do not replace the native format. Existing `session_before_compact` handlers receive the same instructions and may cancel or supply their own summaries. Custom summarizers remain responsible for their output.

Duplicate requests in one tool batch become one compaction attempt and at most one status message. The last executed request's instructions win; omitting instructions clears an earlier focus. If Pi reports cancellation or summarization failure, existing context is preserved and ordinary task continuation remains possible. Aborting the whole agent run prevents continuation; Escape during compaction only cancels compaction. The built-in `/compact` command is unchanged.

## Configuration

No extension settings. Native model selection, authentication, retention/summary budgets, retries, and compaction hooks remain in effect.

An explicit tool request bypasses the automatic token threshold and `compaction.enabled`. It does not change those settings. Native events and hooks report `reason: "manual"`; `isCompacting` remains native, and the run stays busy until it settles.

## Side effects

- Generates normal native summarization requests, with their usual provider usage and cost.
- Saves native compaction entries and metadata to the current session, plus model-visible status messages for skipped, cancelled, or failed attempts. Raw history remains in the session file.
- Patches private Pi methods in memory, with requests scoped to the session. Instruction wrappers deactivate when compaction finishes; the shared boundary is released after the last session binding shuts down. Cleanup restores only methods it still owns, leaving later third-party replacements untouched.
- Does not modify installed Pi files, create configuration, send user prompts, or manufacture continuation requests. Outcome messages use Pi's default custom-message rendering.

## Validation

From the workspace root:

```sh
vpr 'pi-smart-compact#check'
vpr 'pi-smart-compact#test'
```

See the [testing specification](docs/testing.md) for automated coverage and exclusions. Before changing supported fingerprints, follow the [compatibility checklist](docs/pi-compatibility.md), including manual checks of interactive progress, Escape behavior, and real-provider summary quality.
