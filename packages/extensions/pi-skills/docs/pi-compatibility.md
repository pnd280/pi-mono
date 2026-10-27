# Pi compatibility for maintainers

[pi-skills](../README.md)

> Last verified against Pi 1.4.0 with the package checks, the offline tests, and a source review of the Pi 1.3.0 to 1.4.0 changes. Not covered: the manual terminal checks and native slash completion after leading whitespace.

## Upgrade procedure

1. Run the [package checks](../../../../docs/development.md#focused-validation) and the [offline terminal checks](testing.md#manual-checks). Real-editor acceptance and installed-host input tests cover behaviour that provider-only fixtures can't.
2. Run the workspace [fingerprint check](../../../../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints). On a changed hash, review the new source of the method in both builds before you record the hash.
3. Work through the checklist below, then update the "Last verified" line.

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

### Editor trigger

The [editor wrapper](../src/editor.ts) composes with an earlier extension's editor factory and wraps the instance's `handleInput`. Pi's editor has no public way to open completion, so the wrapper calls the private `tryTriggerAutocomplete`. Its fingerprints also cover `requestAutocomplete`, which receives the request options.

- [ ] Pi's editor still opens its picker for a typed `/` only at the start of the message, and still removes `/` from provider `triggerCharacters`. If Pi adds a public way to open completion, replace the private call.
- [ ] `tryTriggerAutocomplete()` without arguments starts a request with `force: false`, so a single suggestion opens the picker instead of being inserted.
- [ ] While the picker is open, Pi's editor sends a new request after typing, **Backspace**, **Delete**, and arrow moves, but not after word or line deletion, undo, or a jump to the line start. The provider closes skill suggestions when the token ends, because Pi would list files there.
- [ ] An editor with other method source stays unchanged, and Pi shows one warning.

### Lifecycle

- [ ] After resource discovery and `/reload`, [expansion and completion](../src/index.ts) use the current skill paths, without duplicate providers or saved state.

## Limitations

- In Pi 1.4.0, native skill insertion runs only for prompts that begin exactly with `/skill:`, after the input hook. Prompt-template expansion also follows the input hook. The leading-reference checkboxes above cover both.
- In Pi 1.4.0, the editor removes `/` from provider `triggerCharacters` and has no public method that opens completion. The `/` trigger depends on the fingerprinted private call above.
- In Pi 1.4.0, Pi's editor submits after **Enter** accepts any suggestion whose prefix starts with `/`, and uses that same check to choose the slash-command list layout. Inline skill suggestions therefore return the prefix without its slash, so they don't submit, and their description column uses the editor's default width rather than the slash-command width.
