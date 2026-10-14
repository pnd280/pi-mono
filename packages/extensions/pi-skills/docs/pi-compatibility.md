# Pi compatibility for maintainers

[pi-skills](../README.md)

> Last verified against Pi 1.0.2 (workspace checks, offline host input tests, real-editor acceptance tests, formats, settings, resource reload, and provider composition; no runtime changes needed). Not covered: manual terminal checks, including native slash completion after leading whitespace (added in Pi 1.0.0).

## Upgrade procedure

1. Run the [package and offline terminal checks](../README.md#validation). Real-editor acceptance and installed-host input tests cover behaviour that provider-only fixtures can't.
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

Input expansion and completion must compose with Pi's existing providers and registered skill paths.

### Input expansion

[Input expansion](../src/tokens.ts) owns catalogue projection, substitution, and the native-insertion guard; [input-hook wiring](../src/index.ts) passes the current commands:

- [ ] Hook registration order and chaining.
- [ ] Registered skill paths, and name collisions.
- [ ] Exact token boundaries, including in fenced text. Configured references aren't expanded twice.
- [ ] Custom formats never trigger Pi's native `<skill>` insertion.
- [ ] Images are kept.
- [ ] Steering and follow-up messages are delivered in TUI, print, JSON, and RPC modes.

### Settings and completion

- [ ] [Format settings](../src/config.ts): bounded JSON validation, trusted project overrides, the default Markdown link, and `/reload` updates, without UI or settings writes.
- [ ] [Completion](../src/autocomplete.ts): suggestions from Pi's current provider, and `enableSkillCommands`.
- [ ] Replacement is relative to the cursor, and **Tab** and **Enter** accept without submitting.
- [ ] File, attachment, and other command completion keep working.

### Lifecycle

- [ ] [Lifecycle](../src/index.ts): resource discovery and `/reload` update paths and completion, without duplicate providers or saved state.

## Limitations

- Pi expands only prompts that begin exactly with `/skill:`, and its input handler has no option to turn that off. On upgrades, check that the default leading Markdown link stays literal, and that custom formats starting with the command are still guarded.
- Pi's editor submits after **Enter** accepts any suggestion whose prefix starts with `/`, and uses that same check to choose the slash-command list layout. Inline skill suggestions therefore return the prefix without its slash, so they don't submit, and their description column uses the editor's default width rather than the slash-command width.
- Keep composing with native autocomplete rather than adding another matcher or file discovery.
