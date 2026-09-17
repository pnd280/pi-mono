# [pi-tool-display](README.md) development

## Code navigation

- **Pi lifecycle:** [host/install.ts](src/host/install.ts) handles integration and teardown. [host/compatibility.ts](src/host/compatibility.ts) records inspected contracts, and [native-registry.ts](src/host/native-registry.ts) verifies and restores native definitions.
- **Transcript:** [coordinator.ts](src/transcript/coordinator.ts) owns call-state changes. [session.ts](src/transcript/session.ts) coordinates live events, history reconstruction, and saved-output eligibility. [history.ts](src/transcript/history.ts) and [metadata.ts](src/transcript/metadata.ts) handle reconstruction and persisted facts.
- **Thinking visibility:** [thinking.ts](src/host/thinking.ts) verifies Pi's assistant layout and hides collapsed thinking placeholders after completion.
- **Observation and rows:** [native.ts](src/observation/native.ts) observes verified operations. [output-policy.ts](src/observation/output-policy.ts) chooses live retention budgets, and [saved-output.ts](src/observation/saved-output.ts) sets preview and cache policy. [host/rows.ts](src/host/rows.ts) integrates Pi invalidation, expansion, and mouse routing.
- **Rendering:** start at [cards.ts](src/rendering/cards.ts) for preparation across Pi slots, [format.ts](src/rendering/format.ts) for shared text and tree rendering, or [result-content.ts](src/rendering/result-content.ts) for result bodies and diff rendering. [diff.ts](src/diff.ts) generates patches and enforces retention limits. See the [standalone API](docs/renderers.md) for tool-author integration.
- **Offline launchers:** [validation/workspace.ts](validation/workspace.ts) supplies fixture data, provider loading, flags, and reuse checks.

## Constraints

Keep private host access under `host/`. Before changing shared hooks, trace how callbacks are deactivated and native definitions are restored.

Keep display lookup and renderers free of filesystem work, tool execution, and persistence.

- Native observation must preserve middleware, schemas, prompts, settings, active tool selection, operation results, and mutation ordering.
- Observe only definitions whose provenance [NativeRegistry](src/host/native-registry.ts) verifies, in participating TUI sessions with specialized rendering selected.
- Never register tools for presentation or recreate unknown SDK or custom closures.
- Undo only this extension's hook and definition replacements. Preserve later wrappers and make disposed callbacks inert.

Treat Pi arguments and published results as borrowed, read-only data. Derive operation facts from structured observations, separately from published results. Never restore omitted output from adapter metadata. Persist bounded additional facts, not output copies, image copies, or styled text. Reconstruct history from retained data without repeating file observations, rerunning tools, or animating missing results.

Use Pi's expansion, mouse routing, image handling, theme, highlighter, and width utilities.

- Keep result interpretation in its adapter under the [provenance limits](docs/adapters.md#built-in-adapters).
- Apply colors during rendering and keep omission ranges transient.
- Keep grouped calls and their notices in their corresponding Pi rows. Collapse successful body text, never image-bearing rows.
- Change compact margins and mouse-coordinate adjustment together.

See [observation and saved history](README.md#observation-and-saved-history) for exclusions, side effects, and limits.

## Validation

Use [package validation](README.md#validation) and the [terminal procedure](docs/validation.md) for integration or interaction changes. On Pi upgrades, reinspect construction, registry wrapping, reconstruction, row expansion, and the assistant's thinking layout before accepting new fingerprints. Check both [API](src/host/install.test.ts) and [installed-CLI](src/host/install-cli.test.ts) fixtures.
