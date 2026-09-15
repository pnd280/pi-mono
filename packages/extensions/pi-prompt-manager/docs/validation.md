# Offline validation

[Package usage](../README.md) · [Workspace commands](../../../../docs/development.md#focused-validation)

## Automated checks

```sh
vpr 'pi-prompt-manager#format' --check
vpr 'pi-prompt-manager#check'
vpr 'pi-prompt-manager#test'
```

Tests use isolated temporary directories and stdin-capturing clipboard helpers, not the user's settings, collections, or clipboard. Linux privacy tests require `getfacl`, `setfacl`, and `mkfifo`. The storage worker uses Node's `--experimental-transform-types` to execute local TypeScript in separate processes. The bundled-CLI fixture resolves the installed manifest's `bin.pi`; API-only tests cannot establish its method shape.

Coverage includes strict settings/commands, exact saving, queue limits, identity deletion, recovery/capacity, pre/post-rename faults, lock contention across processes, expired work, browser state and action precedence, clipboard deadlines/cancellation, passive non-TUI activation, reload, expanded native pastes, native history, and the private append adapter. These tests do not replace real platform clipboard and terminal checks.

## Terminal launcher

From the repository root:

```sh
vpr 'pi-prompt-manager#validate:terminal' regular
vpr 'pi-prompt-manager#validate:terminal' fullscreen
```

The launcher creates and prints a disposable fixture directory. It isolates `HOME`, the designated agent directory, temporary files, and clipboard helpers. Helpers write complete stdin only to `clipboard.txt` in the fixture. Collections persist while Pi uses `--no-session`. A deterministic offline provider never sends network requests.

For the native `/model` comparison, append `--models prompt-fixture/offline` to a launcher command so its all/scoped row is shown.

Reuse the printed directory to check reload/reopening or cooperating sessions:

```sh
vpr 'pi-prompt-manager#validate:terminal' regular --reuse /tmp/pi-prompt-manager-terminal-EXAMPLE
```

Fixtures remain after exit for inspection. Remove only your printed fixture directory when finished. Do not use the launcher to point at real agent directories.

### Scenarios

1. At 80×24, run `/prompts`, cancel, type a draft, and press Ctrl+Shift+S. Inspect Saved drafts, filter, copy, preview, restore, and delete. Compare the `history | drafts` active/muted labels and switching hint with `/model`'s all/scoped row. Switch collections in both directions and check remembered queries and selection; inspection must have no tabs. Check that both collections show an aligned age before each prompt, without numeric row indices, including at 40×10. Include different-length ages, future times, and unknown timestamps. At wide sizes, check that longer prompt rows use the available width and footer hints share one row. Resize narrower and back to check truncation and hint wrapping. At each size, move between short, long, and multiline prompts: the visible row count and footer position must stay unchanged, with no preview beneath the list. Verify that copying only updates the fixture's `clipboard.txt`. Save a multiline bracketed paste and confirm storage contains expanded text, not visual paste markers.
2. Test `/prompts save` from a typed slash command, literal `drafts add`, invalid indices, numbered inspection, restore, and restore-and-remove. Restoration must not submit. Ordinary native Up/Down behavior remains unchanged.
3. Submit `/raw-template` and confirm History stores the command before expansion. Submit `with-custom` for an allowlisted message during a turn; `/fixture-custom` appends one outside a turn. Steering/follow-up captures remain even if later withdrawn.
4. Run `/reload` repeatedly. Verify `/prompts` and both launch shortcuts still work without replaying existing history. Open another fixture session sharing the real cwd, including through a symlink; a distinct cwd remains isolated. Check callbacks retained from old managers through the API fixture.
5. Repeat normal/full-preview interactions in regular and fullscreen modes at 40×10 and below minimum. Check the 15-row cap at 80×24; resize through 19 rows (12-row inline budget) and 18 rows (13-row overlay cap) in both directions. Verify search cursor, selection, and preview position survive transitions, while deletion confirmation is cancelled. Open inspection directly on a short terminal, then resize and close. Check `↑ N more` / `↓ N more` border counts at the start, middle, and end of wrapped previews, including 40×10 and a compact Delete confirmation. Lists must use only the position counter when space permits, including after closing preview. Preview counts must disappear when resizing makes all content fit. Test cancellation during loading/deletion and fresh retry after read/deletion failures.
6. Edit only the fixture's `agent/keybindings.json`, then reload. Rebind confirm/copy/cancel/navigation, shadow Ctrl+P/Delete/Tab with configured actions, remove Ctrl+C from copying, and configure cancel with only Ctrl+C or a key shadowed by copy. The last configuration must refuse opening, without an Escape override.
7. With fixture sessions stopped, back up and edit its collection files to exercise deletion-only recovery, invalid UUIDs/timestamps, duplicate IDs, and unsafe terminal controls. Copy source must differ from sanitized display where appropriate; unsafe restoration must leave the editor intact. Restart sessions to exercise changed/missing deletion targets.

## Platform checks

On **each of Linux, macOS, and WSL**, use an isolated clipboard environment to verify the actual native helper, complete Unicode/large/control-bearing stdin, dependency failures, cancellation, and timeout. The fixture's stdin capturers validate the subprocess boundary, not the operating system's native clipboard implementation. Do not overwrite a user's live clipboard for validation.

Verify mode and ACL repair, ownership/type/link refusal, lock artifacts, and atomic rename behavior on each supported local filesystem. In WSL, include the filesystem used for the designated agent directory; storage that cannot enforce private permissions must be refused. Native Windows, network filesystems, and cross-machine coordination are unsupported.

## Interaction measurement

```sh
node --experimental-transform-types packages/extensions/pi-prompt-manager/validation/measure-interaction.ts
```

This measures a recovery-sized record, a roughly 64 MB collection, 5,000 records, and a newline-dense recovery preview at 40 columns. It reports elapsed work and maximum sampled event-loop delay without printing source text. Large search normalization and preview preparation yield between bounded chunks; search yields by processed text volume as well as item count. Render paths consume cached full-record layout and bounded row summaries.
