# [pi-tool-display](README.md) development

## Code navigation

- **Extension lifecycle:** [src/index.ts](src/index.ts) installs the display hook before history reconstruction, warns when unavailable, and disposes it on shutdown or non-TUI startup.
- **Live/history lookup or Pi upgrades:** [src/replay.ts](src/replay.ts) decorates render-definition copies; [src/replay.test.ts](src/replay.test.ts) exercises Pi's real lookup, components, and session lifecycle. Verify the private lookup and restoration order against the installed Pi implementation before changing this hook.
- **Rendering:** [src/renderers.ts](src/renderers.ts) owns components and previews; [src/presentation.ts](src/presentation.ts) owns tool-family interpretation; [src/layout.ts](src/layout.ts) owns terminal normalization and row budgets.

## Constraints

- Keep the extension scoped to individual tool-call rows. Cross-call exploration grouping, transcript pagers, user `!` shell cards, and HTML exports are outside its scope.
- Keep state local to each host row and derive previews from supplied arguments/results. Leave inline images to Pi; do not retain image bytes separately, accumulate streamed deltas, or introduce timers.
- Keep the lookup render-only and reversible. Never register replacement tools, mutate stored definitions, reconstruct execution settings, or write the active-tool list for automatic presentation. Preserve later wrappers when disposing it.
- Keep automatic eligibility limited to known built-in names with CLI built-in provenance. The `builtin` source label also covers SDK base-tool overrides; SDK hosts must use the public renderer factory instead of the default extension.

## Validation

Follow the workspace [verification workflow](../../../docs/agents/verification.md) and the package's [manual checks](docs/validation.md).
