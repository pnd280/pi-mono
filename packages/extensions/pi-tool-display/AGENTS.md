# [pi-tool-display](README.md) development

## Code navigation

See the [workspace architecture](../../../docs/architecture.md#tool-display) for state ownership, dependency direction, and live/history flow.

- **Lifecycle/private Pi integration:** [host/install.ts](src/host/install.ts) and the inspected contracts in [host/compatibility.ts](src/host/compatibility.ts). Keep private host types/accesses under `host/`. Pi upgrades require re-inspecting construction, registry wrapping, reconstruction, and row expansion before accepting new method fingerprints. Check both the bundled executable and unbundled API; [install-cli.test.ts](src/host/install-cli.test.ts) exercises the installed manifest's `bin.pi` entry point.
- **Transcript:** [coordinator.ts](src/transcript/coordinator.ts) exclusively updates call state and invalidation. [session.ts](src/transcript/session.ts) orchestrates messages and observations, and owns saved-output eligibility and retry independently of attached rows.
- **Rendering:** [cards.ts](src/rendering/cards.ts) owns lazy row preparation and invalidation across both Pi slots. [result-content.ts](src/rendering/result-content.ts) prepares result bodies and grouped diagnostics; [headings.ts](src/rendering/headings.ts) and [results.ts](src/rendering/results.ts) consume prepared data. [layout.ts](src/rendering/layout.ts) alone assigns connectors. Terminal-text normalization is separate in [terminal-text.ts](src/terminal-text.ts). See the [standalone API](docs/renderers.md).

## Constraints

Keep the display lookup render-only. Native observation may reconstruct verified, unmodified Pi-native bash/PowerShell/edit/write definitions through Pi factories, only for participating TUI sessions and specialized selection. Preserve middleware, schemas/prompts, settings, active selection, operation results, and mutation ordering. Never register tools for presentation or recreate unknown SDK/custom closures automatically. Keep restoration limited to owned hooks/definitions. Preserve later wrappers and make disposed callbacks inert.

Renderers perform no filesystem work, tool execution, or persistence. Separate observed operation outcome from Pi's published result. Derive operation outcomes from structured observations, not result text. Render published output without restoring omitted or pre-middleware content from adapter metadata. Persist bounded additional facts, not output/image copies or styled text. Historical reconstruction must not observe today's files, rerun tools, or animate missing results.

Use Pi's expansion, mouse routing, image path, theme, highlighter, and width utilities. Keep tool-contract result interpretation inside its adapter and follow the provenance limits in its [contract documentation](docs/adapters.md#built-in-adapters). Keep omission ranges transient, applying colors only during rendering. Keep each grouped invocation and its notices in its own Pi row; collapse successful body text, never image-bearing rows. The host adapter joins compact row margins and adjusts Pi's mouse coordinates together.

See the [README](README.md#observation-and-saved-history) for observation exclusions, side effects, and limits.

## Validation

Use the [terminal fixture and host checks](docs/validation.md) for integration and interaction changes.
