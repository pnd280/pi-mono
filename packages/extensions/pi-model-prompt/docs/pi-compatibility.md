# Pi compatibility for maintainers

[pi-model-prompt](../README.md)

> Last verified against Pi 1.3.0 with the package checks and the offline host tests. Not covered: live providers and manual terminal checks.

## Upgrade procedure

1. Run the [workspace checks](../../../../docs/development.md#focused-validation). The host suite runs the installed Pi offline.
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

The extension adds to the public `before_agent_start` prompt options of Pi 1.3.0. It leaves `APPEND_SYSTEM.md` discovery to Pi.

### Prompt files

The [session snapshot](../src/model-prompt.ts) reads the listed files the way Pi reads its append files, so it must follow these Pi contracts.

- [ ] Pi strips a byte-order mark from append files.
- [ ] Pi joins several append sources with `\n\n`.

### Prompt and lifecycle

The [prompt adapter](../src/index.ts) relies on these contracts. The [prompt-parts](../../../libs/src/prompt-parts/README.md) coordinator appends the rank `100` part to `systemPromptOptions.appendSystemPrompt`.

- [ ] `before_agent_start`, for both user and custom-message runs, exposes a writable `systemPromptOptions.appendSystemPrompt` that holds Pi's append text and earlier extensions' changes.
- [ ] In `before_agent_start`, `ctx.model` is the model for the run when the coordinator calls the part.
- [ ] Under a virtual model, `ctx.model` in `before_agent_start` is the selected virtual model, and Pi routes later, per request.
- [ ] Pi builds new `systemPromptOptions` from its loaded append text for each run.
- [ ] `session_start` fires on startup and `/reload`.
- [ ] `getAgentDir()` honours `PI_CODING_AGENT_DIR`.

If Pi reused `systemPromptOptions` across runs, the additions would build up. The settings and file reads run in `session_start`, and the agent directory comes from `getAgentDir()`.

## Limitations

- Rules match the selected virtual model, not the physical model it routes to; see [virtual models](virtual-models.md). In Pi 1.3.0, `context` and `context_with_system` run after routing, but their `ctx.model` is still the selected virtual model. `context_with_system` can change system messages per request without knowing the routed model, and `before_provider_request` receives only a provider-specific payload. If Pi exposes the routed model to a provider-neutral hook, reconsider physical-model rules, keeping in mind that changing system text between requests can reduce prompt-cache reuse.
- The extension uses `getAgentDir()`, not the SDK resource loader's directory override, so SDK hosts with a custom `agentDir` must set `PI_CODING_AGENT_DIR` to match.
- If Pi adds native model-specific prompt files, remove this extension.
