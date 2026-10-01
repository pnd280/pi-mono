# Model-prompt coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

## Contracts

- Rules match unanchored, case-sensitive regex against `provider/modelId`; the first matching rule that sets `append` wins. `append` paths expand a leading `~` and resolve relative paths against the settings directory. Limits are 100 rules, 512 characters per pattern, 32 files per rule, and 4096 characters per path. Invalid rules are skipped with warnings that do not echo settings content, invalid sections or unreadable settings disable all rules, and absent settings are silent.
- Base text mirrors Pi's discovery: trusted project file, then agent file, with a byte-order mark stripped; no file means empty text. Listed files are byte-order-mark stripped and joined in order with `\n\n`; other whitespace is preserved, and empty lists or files can remove the base append text.
- Untrusted projects contribute no base file. Missing, unreadable, or non-regular listed files warn with their path and leave matching rules on the base text without blocking startup; an unreadable base disables replacement.
- Replacement happens only when the current append text equals the loaded base text. Different explicit `--append-system-prompt` text or earlier extension edits survive; identical text is indistinguishable from the base.
- In a real host, the effective provider prompt changes between the selected files and base as models switch. Project base files require trust; project settings are always ignored. Files and settings stay cached until `/reload`; `ctx.ui.notify` warns once per load in TUI/RPC and stays silent without a UI.

## Coverage boundaries

Behavior suites own rule parsing, path resolution, base discovery, and joining, including a timed subprocess for FIFO rejection. The host suite covers event wiring, trust, model switching, CLI and earlier-extension append text, and reload with Pi's faux provider and transcript replay helper. [Libraries](../../../libs/docs/testing.md) own bounded settings reads.

## Exclusions

Pi's transcript-delta recording, prompt caching, and project-trust resolution are delegated to Pi and not retested.
