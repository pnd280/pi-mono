# [pi-tool-display](README.md) development

## Code navigation

See the [workspace architecture](../../../docs/architecture.md#tool-display) for state ownership, dependency direction, and live/history flow.

- **Lifecycle/private Pi integration:** [host/install.ts](src/host/install.ts) and the inspected contracts in [host/compatibility.ts](src/host/compatibility.ts). Keep private host types/accesses under `host/`. Pi upgrades require re-inspecting construction, registry wrapping, reconstruction, and row expansion before accepting new method fingerprints. Check both the bundled executable and unbundled API; [install-cli.test.ts](src/host/install-cli.test.ts) exercises the installed manifest's `bin.pi` entry point.
- **Contracts/policy:** [contracts.ts](src/contracts.ts), [settings.ts](src/settings.ts), and internal [host/selection.ts](src/host/selection.ts). See [adapter development](docs/adapters.md).
- **Transcript:** [coordinator.ts](src/transcript/coordinator.ts) exclusively updates call state and invalidation. [session.ts](src/transcript/session.ts) orchestrates messages, observations, and output loading.
- **Observation:** [native operations](src/observation/native.ts) and [saved-output previews](src/observation/saved-output.ts).
- **Rendering:** [cards.ts](src/rendering/cards.ts) composes cards; [layout.ts](src/rendering/layout.ts) alone assigns connectors. Terminal-text normalization is separate in [terminal-text.ts](src/terminal-text.ts). See the [standalone API](docs/renderers.md).

## Constraints

Keep the display lookup render-only. Native observation may reconstruct verified, unmodified Pi-native bash/PowerShell/edit/write definitions through Pi factories, only for participating TUI sessions and specialized selection. Preserve middleware, schemas/prompts, settings, active selection, operation results, and mutation ordering. Never register tools for presentation or recreate unknown SDK/custom closures automatically.

Renderers perform no filesystem work, tool execution, or persistence. Separate observed operation outcome from Pi's published result. Persist bounded additional facts, not output/image copies or styled text. Historical reconstruction must not observe today's files, rerun tools, or animate missing results.

Use Pi's expansion, mouse routing, image path, theme, highlighter, and width utilities. Keep tool-contract result interpretation inside its adapter and follow the provenance limits in its [contract documentation](docs/adapters.md#built-in-adapters). Keep omission ranges transient, applying colors only during rendering. Render published output without restoring omitted or pre-middleware content from adapter metadata. Derive operation outcomes from structured observations, not result text. Keep each grouped invocation and its notices in its own Pi row; collapse successful body text, never image-bearing rows. The host adapter joins compact row margins and adjusts Pi's mouse coordinates together. Keep one scheduler per coordinator and restoration limited to owned hooks/definitions. Preserve later wrappers and make disposed callbacks inert.

See the [README](README.md#observation-and-saved-history) for observation exclusions, side effects, and limits.

## Validation

Use the [terminal fixture and host checks](docs/validation.md) for integration and interaction changes.
