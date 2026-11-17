# Pi compatibility for maintainers

[pi-model-prompt](../README.md)

> Last verified against Pi 1.5.2 with the package checks, the offline host tests, and a source review of the Pi 1.5.1 to 1.5.2 changes. Not covered: live providers, including Anthropic requests that continue a message thread; and manual terminal checks.

## Checklist

The extension adds to the public `before_agent_start` prompt options of Pi 1.5.2. It leaves `APPEND_SYSTEM.md` discovery to Pi.

### Prompt files

The [session snapshot](../src/model-prompt.ts) reads the listed files the way Pi reads its append files, so it must follow these Pi contracts.

- [ ] Pi strips a byte-order mark from append files.
- [ ] Pi joins several append sources with `\n\n`.

### Prompt and lifecycle

The [prompt adapter](../src/index.ts) supplies the rank `100` part and relies on these contracts. The libs [prompt-parts](../../../libs/src/prompt-parts/README.md) coordinator owns the [append checks](../../../libs/docs/pi-compatibility.md#coordinators).

- [ ] In `before_agent_start`, `ctx.model` is the model for the run when the coordinator calls the part.
- [ ] Under a virtual model, `ctx.model` in `before_agent_start` is the selected virtual model, and Pi routes later, per request.
- [ ] `session_start` fires on startup and `/reload`.
- [ ] `getAgentDir()` honours `PI_CODING_AGENT_DIR`.

The settings and file reads run in `session_start`.

## Limitations

- Rules match the selected virtual model, not the physical model it routes to; see [virtual models](virtual-models.md). In Pi 1.4.0 to 1.5.2, `context` and `context_with_system` run after routing, but their `ctx.model` is still the selected virtual model. `context_with_system` can change system messages per request without knowing the routed model, and `before_provider_request` receives only a provider-specific payload. If Pi exposes the routed model to a provider-neutral hook, reconsider physical-model rules, keeping in mind that changing system text between requests can reduce prompt-cache reuse.
- In Pi 1.5.0 to 1.5.2, assistant messages from some providers carry `responseModel`, the model ID reported by the provider. It arrives only with the response, so it cannot select files for that request.
- In Pi 1.5.1 and 1.5.2, a request to Anthropic's own endpoint can continue a message thread, and then it leaves out the system prompt. Pi starts a new thread, with the complete system prompt, when the system prompt or the model differs from the previous request's. Only thread continuations leave out the system prompt; every other request, including one that starts a thread, carries it.
- The extension uses `getAgentDir()`, not the SDK resource loader's directory override, so SDK hosts with a custom `agentDir` must set `PI_CODING_AGENT_DIR` to match.
- If Pi adds native model-specific prompt files, remove this extension.
