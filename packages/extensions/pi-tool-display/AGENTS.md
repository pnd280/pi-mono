# [pi-tool-display](README.md) development

## Code navigation

- **Session settings or tool registration:** [src/index.ts](src/index.ts) and [src/builtins.ts](src/builtins.ts).
- **Replay or Pi upgrades:** [src/replay.ts](src/replay.ts). Verify the private lookup and restoration order against the installed Pi implementation before changing this hook.
- **Rendering:** [src/renderers.ts](src/renderers.ts) owns components and previews; [src/presentation.ts](src/presentation.ts) owns tool-family interpretation; [src/layout.ts](src/layout.ts) owns terminal normalization and row budgets.

## Constraints

- Keep the extension scoped to individual tool-call rows. Cross-call exploration grouping, transcript pagers, user `!` shell cards, and HTML exports are outside its scope.
- Keep state local to each host row and derive previews from supplied arguments/results. Leave inline images to Pi; do not retain image bytes separately, accumulate streamed deltas, or introduce timers.
- Keep replay integration render-only and reversible. Preserve later wrappers when disposing it.
