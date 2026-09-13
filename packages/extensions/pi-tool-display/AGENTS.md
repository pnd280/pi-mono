# [pi-tool-display](README.md) development

## Code navigation

- **Lifecycle/private Pi integration:** [src/index.ts](src/index.ts) and [src/host-integration.ts](src/host-integration.ts). Keep private host types/accesses here. Pi upgrades require re-inspecting construction, registry wrapping, reconstruction, and row expansion before accepting new method fingerprints. Check both the bundled executable and unbundled API; [src/host-integration-cli.test.ts](src/host-integration-cli.test.ts) exercises the installed manifest's `bin.pi` entry point.
- **Contracts/policy:** [src/display-model.ts](src/display-model.ts), [src/settings.ts](src/settings.ts), and [src/adapters/types.ts](src/adapters/types.ts). See [adapter development](docs/adapters.md) for selection and provider integrations. Shared FFF ownership/name classification is in [@pi-mono/utils](../../utils/README.md); filesystem guard policy stays in `pi-fff-guard`.
- **Coordination:** [src/transcript-coordinator.ts](src/transcript-coordinator.ts) owns ordering, lifecycle, groups, expansion, and the single animation scheduler independently of Pi.
- **Observation/history:** [src/native-observation.ts](src/native-observation.ts), [src/output-buffer.ts](src/output-buffer.ts), [src/diff.ts](src/diff.ts), [src/session-metadata.ts](src/session-metadata.ts), and [src/saved-output.ts](src/saved-output.ts).
- **Rendering:** [src/renderers.ts](src/renderers.ts) builds tree items and attached continuations; [src/layout.ts](src/layout.ts) alone assigns connectors from visible sibling positions. [src/diff-view.ts](src/diff-view.ts) renders unprefixed diff content at the supplied body width. The public owner API and layout rules are documented in [renderer integration](docs/renderers.md).

## Constraints

Keep the display lookup render-only. Native observation may reconstruct verified, unmodified Pi-native bash/PowerShell/edit/write definitions through Pi factories, only for participating TUI sessions and specialized selection. Preserve middleware, schemas/prompts, settings, active selection, operation results, and mutation ordering. Never register tools for presentation or recreate unknown SDK/custom closures automatically.

Renderers perform no filesystem work, tool execution, or persistence. Separate observed operation outcome from Pi's published result. Persist bounded additional facts, not output/image copies or styled text. Historical reconstruction must not observe today's files, rerun tools, or animate missing results.

Use Pi's expansion, mouse routing, image path, theme, highlighter, and width utilities. Assign semantic colors at known prose/metadata sources; never use arbitrary result text to invent statuses. Keep omission ranges transient and apply colors only during rendering. Keep each grouped invocation and its notices in its own Pi row; collapse successful body text, never image-bearing rows. The host adapter joins compact row margins and adjusts Pi's mouse coordinates together. Keep one scheduler per coordinator, bounded saved-output work, and restoration limited to owned hooks/definitions. Preserve later wrappers and make disposed callbacks inert.

Automatic observation and animation are disabled in print/JSON/RPC. See the [README](README.md#observation-and-saved-history) for observation exclusions, side effects, and limits.

## Validation

Follow the workspace [verification workflow](../../../docs/agents/verification.md) and package [validation guide](docs/validation.md). Run manual host checks for integration/interaction changes.
