# Pi compatibility for maintainers

[pi-skills](../README.md)

> Last verified against Pi 1.4.0 with the package checks, the offline tests, and a source review of the Pi 1.3.0 to 1.4.0 changes. Not covered: the manual terminal checks and native slash completion after leading whitespace.

## Upgrade procedure

1. Run the [package checks](../../../../docs/development.md#focused-validation) and the [offline terminal checks](testing.md#manual-checks). Real-editor acceptance and installed-host input tests cover behaviour that provider-only fixtures can't.
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

Input expansion and completion must compose with Pi's existing providers and registered skill paths.

### Input expansion

[Input expansion](../src/tokens.ts) owns catalogue projection, substitution, and the native-insertion guard. [Input-hook wiring](../src/index.ts) passes the current commands.

The [input chain](../../../libs/src/input-chain/README.md) runs the transform at rank `100` from one `input` handler.

- [ ] Pi's `input` event runs before native skill insertion and prompt-template expansion.
- [ ] `getCommands()` reports each skill with its registered file path, which expansion inserts exactly.
- [ ] Only whole whitespace-separated tokens expand, also in fenced text.
- [ ] References already in the configured format don't expand again.
- [ ] Leading references don't trigger Pi's native `<skill>` insertion or prompt-template expansion.
- [ ] Ordinary leading prompt-template commands still expand.
- [ ] Image attachments on an expanded prompt reach the model.
- [ ] Expanded steering and follow-up messages are delivered in TUI, print, JSON, and RPC modes.

### Settings and completion

[Format settings](../src/config.ts) and [completion](../src/autocomplete.ts) own this behaviour.

The user guide states the [format rules](rules.md#expansion-format) and the [completion rules](rules.md#completion) that users see.

- [ ] Pi's settings files and project trust give the documented format, and `/reload` updates it, without UI or settings writes.
- [ ] Skill suggestions come from Pi's current autocomplete provider, and Pi's `enableSkillCommands` setting turns them off.
- [ ] Skill names that an extension command or prompt template also uses aren't suggested.
- [ ] Accepting a suggestion replaces the token around the cursor.
- [ ] **Tab** and **Enter** accept a suggestion without submitting the prompt.
- [ ] File, attachment, and other command completion keep working.

### Lifecycle

- [ ] After resource discovery and `/reload`, [expansion and completion](../src/index.ts) use the current skill paths, without duplicate providers or saved state.

## Limitations

- In Pi 1.3.0, Pi inserts skill contents only for prompts that begin exactly with `/skill:`, and its input handler has no option to turn that off. Pi also expands leading prompt-template commands after the input hook. The leading-reference checkboxes above cover both. A source review of Pi 1.4.0 found the same input order and `/skill:` check.
- In Pi 1.3.0, Pi's editor submits after **Enter** accepts any suggestion whose prefix starts with `/`, and uses that same check to choose the slash-command list layout. Inline skill suggestions therefore return the prefix without its slash, so they don't submit, and their description column uses the editor's default width rather than the slash-command width. A source review of Pi 1.4.0 found Pi's editor unchanged.
