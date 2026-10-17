# Pi compatibility for maintainers

[pi-model-prompt](../README.md)

> Last verified against Pi 1.3.0 (package checks and offline host tests). Not covered: live providers and manual terminal checks.

## Upgrade procedure

1. Run the [workspace checks](../../../../docs/development.md#focused-validation). The host suite runs the installed Pi offline.
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

The extension uses the public `before_agent_start` prompt sections of Pi 1.3.0. Keep file discovery and prompt-section merging consistent with Pi when applying model-specific additions.

### Base discovery

[Session snapshot and base discovery](../src/model-prompt.ts):

- [ ] Pi still loads one `APPEND_SYSTEM.md`: the trusted project's first, then the agent directory's.
- [ ] Pi strips a byte-order mark, and skips discovery when `--append-system-prompt` is given.
- [ ] A single source is passed to `systemPromptOptions.appendSystemPrompt` without joining.
- [ ] Pi still joins several append sources with `\n\n`, which the listed files mirror.

### Prompt and lifecycle

- [ ] [Prompt adapter](../src/index.ts): `before_agent_start`, for both user and custom-message runs, exposes a writable `systemPromptOptions.appendSystemPrompt`, and `ctx.model` is the model for the run. Under a virtual model, it is the selected virtual model, and routing still happens later, per request.
- [ ] [Lifecycle](../src/index.ts): `session_start` fires after the resource loader rereads files on startup and `/reload`.
- [ ] `ctx.isProjectTrusted()` matches the loader's trust decision.
- [ ] [Agent directory](../src/index.ts): `getAgentDir()` honours `PI_CODING_AGENT_DIR`.

## Limitations

- Extensions can't see which file produced the append text, so the extension works it out again and compares contents. Explicit CLI text or earlier extension edits identical to the base can still be replaced. If Pi exposes append sources to extensions, use them instead.
- Rules match the selected virtual model, not the physical model it routes to; see [virtual models](replacement.md#virtual-models). The `context` and `context_with_system` hooks run before routing, and only `before_provider_request` runs after it, with a provider-specific payload. If Pi adds a provider-neutral prompt hook after routing, reconsider this, keeping in mind that per-request prompts lose prompt caching.
- The extension uses `getAgentDir()`, not the SDK resource loader's directory override, so SDK hosts with a custom `agentDir` must set `PI_CODING_AGENT_DIR` to match.
- If Pi adds native model-specific prompt files, remove this extension.
