# [pi-tool-display](README.md) development

## Code navigation

- **Pi lifecycle:** [host/install.ts](src/host/install.ts) handles integration and teardown. [host/compatibility.ts](src/host/compatibility.ts) records inspected TUI contracts. [native-registry.ts](src/host/native-registry.ts) selects display observations through [native-tools](../../libs/src/native-tools/README.md) and [file-mutations](../../libs/src/file-mutations/README.md).
- **Transcript:** [coordinator.ts](src/transcript/coordinator.ts) owns call-state changes. [session.ts](src/transcript/session.ts) coordinates live events, history reconstruction, and saved-output eligibility. [history.ts](src/transcript/history.ts) and [metadata.ts](src/transcript/metadata.ts) handle reconstruction and persisted facts.
- **Assistant presentation:** [assistant.ts](src/host/assistant.ts) verifies Pi's assistant layout, marks prose, and hides completed collapsed thinking during streaming and replay.
- **Observation and rows:** [native.ts](src/observation/native.ts) observes verified operations. [output-policy.ts](src/observation/output-policy.ts) chooses live retention budgets, and [saved-output.ts](src/observation/saved-output.ts) sets preview and cache policy. [host/rows.ts](src/host/rows.ts) integrates Pi invalidation, expansion, and mouse routing.
- **Summary mode:** [summary/](src/summary/) derives run summaries from calls (categories, items, and the pure model); [summary-line.ts](src/rendering/summary-line.ts) renders them. The coordinator owns runs and the display mode; [host/install.ts](src/host/install.ts) owns mode transitions.
- **Rendering:** start at [cards.ts](src/rendering/cards.ts) for preparation across Pi slots, [format.ts](src/rendering/format.ts) for shared text and tree rendering, or [result-content.ts](src/rendering/result-content.ts) for result bodies and diff rendering. [diff.ts](src/diff.ts) requests shared patches and enforces retention limits. See the [standalone API](docs/renderers.md) for tool-author integration.
- **Offline launchers:** [validation/workspace.ts](validation/workspace.ts) supplies fixture data, provider loading, flags, and reuse checks.

## Constraints

Keep private Pi access under `host/`; trace callback deactivation and native-definition restoration before changing hooks. Display lookup and renderers must not access files, execute tools, or persist data.

- Native observation must preserve middleware, schemas, prompts, settings, active tool selection, operation results, and mutation ordering.
- Request observations only for definitions verified by shared [native-tools](../../libs/src/native-tools/README.md), in participating TUI sessions with specialized rendering selected. Do not disable other consumers when display observation stops.
- Never register tools for presentation or recreate unknown SDK or custom closures.
- Undo only this extension's hook and definition replacements. Preserve later wrappers and make disposed callbacks inert. Pending host events must not reattach old row/assistant hooks after disposal or transcript rebinding.

Treat Pi arguments/results as borrowed and read-only; derive operation facts separately from structured observations. Never restore omitted output from adapter metadata. Persist bounded facts and patches, not result bodies, images, or styled text. Reconstruct from retained data without reobserving files, rerunning tools, or animating missing results.

Use Pi's expansion, mouse routing, image handling, theme, highlighter, and width utilities.

- Keep result interpretation in its adapter under the [provenance limits](docs/adapters.md#built-in-adapters).
- Apply colors during rendering and keep omission ranges transient.
- Keep grouped calls and their notices in their corresponding Pi rows. When compact cards hide successful body text, retain diagnostics and image-bearing rows. Summary mode may hide images and diagnostics behind counts.
- Change compact and summary margins and mouse-coordinate adjustment together.

See [observation and saved history](README.md#observation-and-saved-history) for exclusions, side effects, and limits.

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Use [package validation](README.md#validation) and [terminal checks](docs/validation.md) for integration or interaction changes. Before accepting Pi upgrade fingerprints, reinspect construction, registry wrapping, reconstruction, expansion, and thinking layout. Check [API](src/host/install.test.ts) and [installed-CLI](src/host/install-cli.test.ts) fixtures.
