# Prompt manager validation

[pi-prompt-manager](../README.md)

## Automated checks

Use [focused checks and prerequisites](../../../../docs/development.md#focused-validation) for `pi-prompt-manager`. Tests cover prompt policy, storage, editor effects, and nonvisual SDK integration using temporary directories and captured clipboard input, never user settings, collections, or clipboard contents.

Run shared [browser/sizing/remount tests](../../../libs/src/tui/README.md#validation) with `vpr '@pi-mono/libs#test' src/tui/`.

## Terminal launcher

From the repository root:

```sh
vpr 'pi-prompt-manager#validate:terminal' regular
vpr 'pi-prompt-manager#validate:terminal' fullscreen
```

Work only in the printed `Fixture:` directory. Storage/provider are isolated and offline; copy writes `clipboard.txt`, not the native clipboard. Collections persist with `--no-session`; the directory remains for reuse/inspection. Remove it only after all fixture sessions exit.

New fixtures have 40 entries per collection and long previews. Submit `pages` for a scrollable transcript. Reused fixtures keep their collections.

### Scenarios

In both modes:

1. Run `/prompts`, then cancel.
2. Type a draft; save with Ctrl+Shift+S.
3. Run `/prompts drafts`; filter, copy, preview, and restore. Compare `clipboard.txt` with saved text; restore must close without submitting.
4. Reopen drafts and delete the occurrence.

Add checks relevant to the change:

#### Presentation, preview, or responsive mounting

Append `--models prompt-fixture/offline` to enable `/model`'s all/scoped row for tab comparison.

- At wide, 80×24, and 40×10 sizes, compare `/model` tabs and the [presentation contract](controls.md#presentation). Use short, long, and multiline prompts to check stable list height, age alignment, truncation, and footer wrapping.
- Resize both ways between 19 rows (12-row inline) and 18 rows (13-row overlay). Preserve query, search cursor, selection, and preview scroll; cancel deletion confirmation. At 80×24, inline height is 15 rows.
- In preview, Tab/Shift+Tab between collections: retain queries/selections, start selected previews at the top, and cancel confirmation. Empty/no-match/unreadable collections return to the list. Escape leaves preview before closing.
- Open inspection on a short terminal, resize, and close.
- Scroll wrapped previews fully; compare border counts with hidden rows, including compact confirmation. Counts disappear when resized to fit; cancel works below minimum size.
- Cancel during loading/deletion; retry read/deletion failures. Completion must not reopen closed views.

#### Fullscreen paging

Use the fullscreen fixture and submit `pages` before opening the browser.

1. Check PageUp/PageDown in lists, preview, and `/prompts drafts show 1`. Only the focused view should move; at its scroll boundaries the transcript must stay fixed. Close the browser and confirm that paging reaches the transcript again.
2. Resize between 19-row inline and 18-row overlay presentations in both directions; paging must continue to move only the view.
3. Open transcript search with `tui.altScreen.search` (Ctrl+Shift+F; Ctrl+F on WSL). Paging must not reach the browser until Escape closes search.
4. In the fixture's `agent/keybindings.json`, set `tui.select.pageUp` and `tui.altScreen.pageUp` to `ctrl+pageUp`, and both `pageDown` actions to `ctrl+pageDown`. Run `/reload` and repeat the paging checks. Edit only fixture settings, never real agent settings.
5. Close and reopen repeatedly, then check after `/reload` and `/new`. Submit `pages` again after `/new`; verify editor focus and restoration without submission or duplicate effects.

Unsupported-host diagnostics and listener interference are covered by the [shared routing tests](../../../libs/src/tui/responsive-custom-ui/README.md#validation).

#### Commands, keys, or editor integration

- Exercise typed `/prompts save`, literal `drafts add <text>`, invalid indices, numbered inspection, and `restore-and-delete <n>`. Native editor history must stay unchanged.
- Save multiline bracketed paste; storage must contain expanded text, not paste markers.
- In fixture `agent/keybindings.json`, bind confirm/copy/cancel/navigation to fixed-control keys. Reload; check [precedence/hints](controls.md#keys-and-precedence).
- Disable paging with `[]`. Separately, restore paging and assign the same key to copy, cancel, or confirm. Reload after each change; disabled or overridden bindings must not be reserved as paging.
- Bind cancel only to Ctrl+C, then only to a copy key. After each reload, opening must fail without an Escape override.

#### Capture, reload, or session isolation

- Submit `/raw-template`: History must retain pre-expansion text under the [capture contract](../README.md#capture-and-storage). Withdraw submitted steering/follow-up input; captures must remain.
- Reload repeatedly; retry `/prompts` and both shortcuts without replaying history.
- Run concurrent fixtures in the same real cwd and a symlink alias: collections must be shared, unlike a different cwd.
- Switch collections; check retained queries/selections.

#### Storage, recovery, or exact-source handling

Use only fixture collections for [backup/repair](storage.md#manual-backup-and-repair). Exercise [recovery states](storage.md#recovery-states), future/unknown timestamps, and unsafe controls. Copy preserves source despite display differences; unsafe restore leaves the editor intact. Restart to check changed/missing deletion targets.

### Reuse a fixture

For reload, reopening, or concurrency:

```sh
vpr 'pi-prompt-manager#validate:terminal' regular --reuse /tmp/pi-prompt-manager-terminal-EXAMPLE
```

Reuse only launcher-created fixtures, never real agent directories. Use `--help` instead of a mode for syntax.

## Platform checks

### Native clipboard

On **Linux, macOS, and WSL**, use isolated clipboards, never a user's live clipboard. Check complete Unicode, large-text, and terminal-control delivery, plus dependency failures, cancellation, and timeout. Fixture stdin capture does not test OS clipboard behavior.

### Storage permissions and writes

On each supported local filesystem, including WSL's agent-directory filesystem:

- Verify mode/ACL repair, lock artifacts, and atomic rename.
- Check refusal of foreign-owned paths, unsafe types, and links.
- Check refusal when [filesystem assumptions](../../../libs/src/private-files/README.md#filesystem-assumptions) cannot be met.

## Interaction measurement

For collection processing, cooperative search, or preview preparation changes, run from the root:

```sh
node --experimental-transform-types packages/extensions/pi-prompt-manager/validation/measure-interaction.ts
```

Measures decoding/validation, item preparation, single-/multi-term search, preview layout, near-capacity History updates, and maximum sampled event-loop delay without printing source. Includes transfer/worker startup, excludes fixture construction and filesystem I/O. No pass/fail thresholds; also check terminal responsiveness.
