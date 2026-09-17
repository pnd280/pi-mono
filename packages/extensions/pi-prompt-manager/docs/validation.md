# Prompt manager validation

[pi-prompt-manager](../README.md)

## Automated checks

Use the [focused checks and test prerequisites](../../../../docs/development.md#focused-validation) with package name `pi-prompt-manager`.

Tests cover prompt policies, storage, editor effects, and nonvisual SDK integration. They use temporary directories and capture clipboard input without accessing user settings, collections, or clipboard contents.

Browser interaction, sizing, and remount tests live in [shared TUI](../../../libs/src/tui/README.md#validation). Run them with `vpr '@pi-mono/libs#test' src/tui/`.

## Terminal launcher

From the repository root, choose a terminal mode:

```sh
vpr 'pi-prompt-manager#validate:terminal' regular
vpr 'pi-prompt-manager#validate:terminal' fullscreen
```

Work only in the printed `Fixture:` directory. The launcher isolates storage and loads an offline provider. Copying writes to `clipboard.txt` there, not to the native clipboard. Collections persist despite `--no-session`. The directory remains after exit for reopening and inspection.

Wait for all fixture sessions to exit before removing the printed directory.

### Scenarios

Run these checks in both terminal modes:

1. Run `/prompts`, then cancel.
2. Type a draft and save it with Ctrl+Shift+S.
3. Run `/prompts drafts`, then filter, copy, preview, and restore the draft. Compare `clipboard.txt` with the saved text; restoration must close the browser without submitting.
4. Reopen Saved drafts and delete the occurrence.

Choose additional checks for the changed behavior:

#### Presentation, preview, or responsive mounting

To compare tabs with Pi's `/model` view, append `--models prompt-fixture/offline` to the launcher command to show its all/scoped row.

- At wide, 80×24, and 40×10 sizes, compare tabs with `/model` and inspect the [presentation contract](controls.md#presentation). Select short, long, and multiline prompts to check stable list height, age alignment, truncation, and footer wrapping.
- Resize between 19 terminal rows (12-row inline view) and 18 rows (13-row overlay) in both directions. The query, search cursor, selection, and preview scroll must remain unchanged. Deletion confirmation must cancel. At 80×24, the inline view is capped at 15 rows.
- Open inspection directly on a short terminal, resize, then close.
- Scroll wrapped previews from start to end and compare border counts with hidden rows, including during compact deletion confirmation. Resize until all text fits and check that the counts disappear. Resize below minimum size and check that cancellation remains available.
- Cancel during loading and deletion. Retry after read and deletion failures. Check that completion does not reopen a closed view.

#### Commands, keys, or editor integration

- Exercise typed `/prompts save`, literal `drafts add`, invalid indices, numbered inspection, and restore-and-remove. Native editor history must remain unchanged.
- Save a multiline bracketed paste. Confirm that storage contains expanded text rather than visual paste markers.
- In the fixture's `agent/keybindings.json`, rebind confirm, copy, cancel, and navigation to keys used by fixed controls. Reload and check [action precedence and hints](controls.md#keys-and-precedence).
- Bind cancel only to Ctrl+C and reload. The browser must refuse to open without adding an Escape override. Repeat with cancel bound only to a key used by copy.

#### Capture, reload, or session isolation

- Submit `/raw-template` and compare History with the [capture contract](../README.md#capture-and-storage): it must retain the command before expansion. Submit steering and follow-up input, then withdraw it; the capture must remain.
- Reload repeatedly and retry `/prompts` and both launch shortcuts without replaying existing history.
- Start concurrent fixture sessions in the same real working directory, including through a symlink alias. Check that they share collections and that a different working directory stays isolated.
- Switch collections and check remembered queries and selection.

#### Storage, recovery, or exact-source handling

Follow [backup and repair](storage.md#manual-backup-and-repair) using only fixture collections. Exercise the [recovery states](storage.md#recovery-states), future and unknown timestamps, and unsafe terminal controls. Copy must preserve source even when display differs; unsafe restoration must leave the editor intact. Restart sessions to exercise changed or missing deletion targets.

### Reuse a fixture

Reuse the printed directory to check reloads, reopening, or concurrent sessions:

```sh
vpr 'pi-prompt-manager#validate:terminal' regular --reuse /tmp/pi-prompt-manager-terminal-EXAMPLE
```

Reuse only launcher-created fixtures, never real agent directories. Run the launcher with `--help` instead of a mode for argument syntax.

## Platform checks

### Native clipboard

On **each of Linux, macOS, and WSL**, use an isolated clipboard environment to verify the native helper. Do not overwrite a user's live clipboard for validation. Check complete input delivery with Unicode, large text, and terminal controls. Also check dependency failures, cancellation, and timeout.

The fixture captures helper stdin but does not exercise the operating system's clipboard implementation.

### Storage permissions and writes

On each supported local filesystem:

- Verify mode and ACL repair, lock artifacts, and atomic rename behavior.
- Check refusal of paths belonging to another user, unsafe file types, and links.
- Check refusal of storage that cannot satisfy the [filesystem assumptions](../../../libs/src/private-files/README.md#filesystem-assumptions).

In WSL, include the filesystem used for the agent directory.

## Interaction measurement

When changing collection processing, cooperative search, or preview preparation, run from the repository root:

```sh
node --experimental-transform-types packages/extensions/pi-prompt-manager/validation/measure-interaction.ts
```

The script measures elapsed time for collection decoding and validation, item preparation, single- and multi-term search, preview layout, and near-capacity history updates. Timings include worker startup when needed and message transfer, but exclude fixture construction and filesystem I/O.

It also reports the maximum sampled event-loop delay without printing source text. There are no pass or fail thresholds. Also check terminal responsiveness.
