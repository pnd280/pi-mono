# Pi compatibility

[pi-skills](../README.md)

## Contracts to verify

- [ ] [Input expansion](../src/index.ts): registration order and chaining, registered skill paths and collisions, exact token boundaries, idempotent configured references, fenced text, prevention of native `<skill>` injection for custom formats, preserved images, and steering/follow-up delivery in TUI, print, JSON, and RPC modes.
- [ ] [Format settings](../src/config.ts): bounded JSON validation, trusted project overrides, default Markdown link, and `/reload` updates without UI or settings writes.
- [ ] [Completion](../src/autocomplete.ts): current Pi provider suggestions, `enableSkillCommands`, cursor-relative replacement, Tab/Enter acceptance without submission, and coexistence with file, attachment, and other commands.
- [ ] [Lifecycle](../src/index.ts): resource discovery and `/reload` update paths and completion without duplicate providers or persistence.

## Limitations and replacement opportunities

- Keep native autocomplete composition rather than adding another matcher or file discovery. Pi currently expands only prompts beginning exactly `/skill:` and offers no input-handler option to disable that expansion. Recheck that default leading Markdown links stay literal and custom command-first formats remain guarded on Pi upgrades.

## Validation

Pi **0.99.1** package checks, offline host input tests, and real-editor acceptance tests passed without runtime changes. Public input/autocomplete composition remains compatible. Manual terminal checks were not run.

Use [package and offline terminal checks](../README.md#validation). Real-editor acceptance and installed-host input tests cover behavior that provider-only fixtures cannot establish.
