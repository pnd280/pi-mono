# [pi-tool-display](README.md) development

## Code navigation

See the [workspace architecture](../../../docs/architecture.md#tool-display) for state ownership, dependency direction, and live/history flow.

- **Lifecycle/private Pi integration:** [src/index.ts](src/index.ts) and [host/install.ts](src/host/install.ts). Keep private host types/accesses under `host/`: [compatibility.ts](src/host/compatibility.ts) contains inspected contracts, [native-registry.ts](src/host/native-registry.ts) owns native replacements, and [rows.ts](src/host/rows.ts) binds Pi rows. Pi upgrades require re-inspecting construction, registry wrapping, reconstruction, and row expansion before accepting new method fingerprints. Check both the bundled executable and unbundled API; [install-cli.test.ts](src/host/install-cli.test.ts) exercises the installed manifest's `bin.pi` entry point.
- **Contracts/policy:** [contracts.ts](src/contracts.ts), [settings.ts](src/settings.ts), and internal [host/selection.ts](src/host/selection.ts). See [adapter development](docs/adapters.md). Shared FFF ownership/name classification is in [@pi-mono/utils](../../utils/README.md); filesystem guard policy stays in `pi-fff-guard`.
- **Transcript:** [coordinator.ts](src/transcript/coordinator.ts) exclusively updates call state and invalidation. [session.ts](src/transcript/session.ts) orchestrates messages, observations, and output loading; [history.ts](src/transcript/history.ts) indexes the selected ancestry and [metadata.ts](src/transcript/metadata.ts) validates persisted facts.
- **Observation:** [native.ts](src/observation/native.ts), [output-buffer.ts](src/observation/output-buffer.ts), and [saved-output.ts](src/observation/saved-output.ts).
- **Rendering:** [api.ts](src/rendering/api.ts) exposes the [standalone API](docs/renderers.md). [cards.ts](src/rendering/cards.ts) composes [components.ts](src/rendering/components.ts), [headings.ts](src/rendering/headings.ts), and [results.ts](src/rendering/results.ts). [layout.ts](src/rendering/layout.ts) alone assigns connectors; [diff-view.ts](src/rendering/diff-view.ts) renders diff bodies. Terminal-text normalization is separate in [terminal-text.ts](src/terminal-text.ts).

## Constraints

Keep the display lookup render-only. Native observation may reconstruct verified, unmodified Pi-native bash/PowerShell/edit/write definitions through Pi factories, only for participating TUI sessions and specialized selection. Preserve middleware, schemas/prompts, settings, active selection, operation results, and mutation ordering. Never register tools for presentation or recreate unknown SDK/custom closures automatically.

Renderers perform no filesystem work, tool execution, or persistence. Separate observed operation outcome from Pi's published result. Persist bounded additional facts, not output/image copies or styled text. Historical reconstruction must not observe today's files, rerun tools, or animate missing results.

Use Pi's expansion, mouse routing, image path, theme, highlighter, and width utilities. Keep tool-contract result interpretation inside its adapter and follow the provenance limits in its [contract documentation](docs/adapters.md#built-in-adapters). Keep omission ranges transient, applying colors only during rendering. Render published output without restoring omitted or pre-middleware content from adapter metadata. Derive operation outcomes from structured observations, not result text. Keep each grouped invocation and its notices in its own Pi row; collapse successful body text, never image-bearing rows. The host adapter joins compact row margins and adjusts Pi's mouse coordinates together. Keep one scheduler per coordinator and restoration limited to owned hooks/definitions. Preserve later wrappers and make disposed callbacks inert.

See the [README](README.md#observation-and-saved-history) for observation exclusions, side effects, and limits.

## Validation

Use the [terminal fixture and host checks](docs/validation.md) for integration and interaction changes.
