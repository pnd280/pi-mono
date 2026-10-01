# Pi compatibility

[pi-model-prompt](../README.md)

## Contracts to verify

- [ ] [Base discovery](../src/append-files.ts): Pi still loads one `APPEND_SYSTEM.md` (trusted project first, then agent directory), strips a byte-order mark, skips discovery when `--append-system-prompt` is given, and passes a single source unjoined to `systemPromptOptions.appendSystemPrompt`. Pi still joins multiple append sources with `\n\n`, which listed files mirror.
- [ ] [Prompt adapter](../src/index.ts): `before_agent_start` exposes mutable `systemPromptOptions.appendSystemPrompt` and `ctx.model` reflects the model for the run.
- [ ] [Lifecycle](../src/index.ts): `session_start` fires after the resource loader rereads files on startup and `/reload`; `ctx.isProjectTrusted()` matches the loader's trust decision.
- [ ] [Settings](../src/config.ts): `getAgentDir()` honors `PI_CODING_AGENT_DIR`.

## Limitations and replacement opportunities

- Extensions cannot see which file produced the append text, so the extension re-derives it and compares contents. Explicit CLI text or earlier extension edits identical to the base can still be replaced. Replace the guard if Pi exposes append sources to extensions.
- SDK hosts must align `PI_CODING_AGENT_DIR` with a custom `agentDir`: the extension uses `getAgentDir()`, not the SDK resource loader's directory override.
- If Pi adds native model-specific prompt files, remove this extension.

## Validation

Pi **0.99.2** package checks and offline host tests passed without runtime changes. The public prompt-section, trust, model-switch, and reload contracts remain compatible. No live-provider or manual checks were run.

Use [workspace checks](../../../../docs/development.md#focused-validation). The host suite exercises the installed Pi runtime offline.
