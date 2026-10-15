# Prompt manager validation for maintainers

[pi-prompt-manager](../README.md)

## Automated checks

Use the [focused checks and prerequisites](../../../../docs/development.md#focused-validation) for `pi-prompt-manager`. Tests cover prompt policy, storage, editor effects, and SDK integration without visuals. They use temporary directories and captured clipboard input, never your settings, collections, or clipboard.

Run the shared [browser, sizing, and remount tests](../../../libs/src/tui/README.md#validation) with `vpr '@pi-mono/libs#test' src/tui/`.

## Terminal launcher

From the repository root:

```sh
vpr 'pi-prompt-manager#validate:terminal' regular
vpr 'pi-prompt-manager#validate:terminal' fullscreen
```

Work only in the printed `Fixture:` directory.

- Storage and the provider are isolated and offline. Copying writes `clipboard.txt`, not the system clipboard.
- Collections persist with `--no-session`, and the directory is kept so you can reuse or inspect it. Remove it only after every fixture session has exited.
- A new fixture has 40 entries per collection and long previews. A reused fixture keeps its collections.
- Submit `pages` to get a scrollable transcript.

### Basic scenario

Run these in both modes.

| Do                                                         | Expect                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Run `/prompts`, then cancel.                               | The browser opens on "History" and closes back to the editor.                |
| Type a draft and press **Ctrl+Shift+S**.                   | The draft is saved and the editor clears.                                    |
| Run `/prompts drafts`; search, copy, preview, and restore. | `clipboard.txt` matches the saved text. Restoring closes without submitting. |
| Reopen drafts and delete the entry.                        | The entry is gone.                                                           |

Then add the checks below that match your change.

### Presentation, preview, or responsive mounting

Setup: append `--models prompt-fixture/offline` to the launch command, so `/model` has its all and scoped row for comparing tabs. Use short, long, and multiline prompts.

| Do                                                                                         | Expect                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| At a wide size, 80×24, and 40×10, compare with the `/model` tabs.                          | Matches the [presentation contract](controls.md#presentation): stable list height, aligned ages, truncation, wrapped footers.                  |
| Resize between 19 rows (12-row inline) and 18 rows (13-row overlay), both ways.            | Search text, search cursor, selection, and preview scroll are kept. A deletion confirmation is cancelled. At 80×24 the inline view is 15 rows. |
| In the preview, press **Tab** and **Shift+Tab**.                                           | Searches and selections are kept, the selected preview starts at the top, and confirmation is cancelled.                                       |
| Switch to an empty, unmatched, or unreadable collection in the preview.                    | You return to the list.                                                                                                                        |
| Press **Escape** in the preview.                                                           | The preview closes before the browser does.                                                                                                    |
| Open inspection on a short terminal, resize, and close.                                    | Inspection survives the resize and closes cleanly.                                                                                             |
| Scroll a wrapped preview fully, including while confirming a deletion in a compact layout. | Border counts match the hidden rows, and disappear when resized to fit. Cancel works below the minimum size.                                   |
| Cancel while loading and while deleting; retry failed reads and deletions.                 | Completion never reopens a closed view.                                                                                                        |

### Fullscreen paging

Setup: use the fullscreen fixture, and submit `pages` before opening the browser.

| Do                                                                                                                                                                                              | Expect                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Press **PageUp** and **PageDown** in the list, the preview, and `/prompts drafts show 1`.                                                                                                       | Only the focused view moves; at its limits the transcript stays still.      |
| Close the browser and page.                                                                                                                                                                     | The transcript pages again.                                                 |
| Resize between the 19-row inline and 18-row overlay layouts, both ways, and page.                                                                                                               | Paging still moves only the view.                                           |
| Open transcript search with `tui.altScreen.search` (**Ctrl+Shift+F**; **Ctrl+F** on WSL) and page.                                                                                              | Paging doesn't reach the browser until **Escape** closes the search.        |
| In the fixture's `agent/keybindings.json` only, bind `tui.select.pageUp` and `tui.altScreen.pageUp` to `ctrl+pageUp`, and both `pageDown` actions to `ctrl+pageDown`. Run `/reload` and repeat. | The same results with the new keys.                                         |
| Close and reopen several times, then repeat after `/reload` and after `/new` (submit `pages` again).                                                                                            | The editor gets focus back, and restoring never submits or repeats effects. |

Diagnostics for unsupported hosts and interference with other listeners are covered by the [shared routing tests](../../../libs/src/tui/responsive-custom-ui/README.md#validation).

### Commands, keys, or editor integration

Setup: edit only the fixture's `agent/keybindings.json`, and run `/reload` after each change.

| Do                                                                                                                  | Expect                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Type `/prompts save`, `drafts add <text>` with quotes, an invalid number, `show <n>`, and `restore-and-delete <n>`. | Each behaves as documented. Native editor history is unchanged.                     |
| Save a multiline bracketed paste.                                                                                   | Storage holds the expanded text, not paste markers.                                 |
| Bind confirm, copy, cancel, and navigation to keys used by fixed controls.                                          | Behaviour and hints follow the [precedence rules](controls.md#keys-and-precedence). |
| Disable paging with `[]`. Separately, restore it and bind the same key to copy, cancel, or confirm.                 | Disabled or overridden bindings aren't reserved for paging.                         |
| Bind cancel only to **Ctrl+C**, then only to a copy key.                                                            | The browser refuses to open, and no **Escape** override is added.                   |

### Capture, reload, or session isolation

| Do                                                                                      | Expect                                                                                                |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Submit `/raw-template`.                                                                 | "History" keeps the text before expansion, per the [capture rules](../README.md#capture-and-storage). |
| Submit steering and follow-up input, then withdraw it.                                  | The captures remain.                                                                                  |
| Reload several times, then run `/prompts` and both shortcuts.                           | Nothing is captured twice.                                                                            |
| Run fixtures at once in the same real cwd, through a symlink alias, and in another cwd. | The first two share collections; the other cwd doesn't.                                               |
| Switch collections.                                                                     | Searches and selections are kept.                                                                     |

### Storage, recovery, or exact text

Setup: use only fixture collections for [backup and repair](storage.md#manual-backup-and-repair).

| Do                                                                | Expect                                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Create each of the [recovery states](storage.md#recovery-states). | Each state allows exactly what its table row says.                                                              |
| Add future and unknown timestamps, and unsafe terminal controls.  | Copying keeps the original text despite display differences. Restoring unsafe text leaves the editor as it was. |
| Change or remove a deletion target, restart, and delete it.       | Deletion is refused.                                                                                            |

### Reuse a fixture

For reload, reopening, or concurrency checks:

```sh
vpr 'pi-prompt-manager#validate:terminal' regular --reuse /tmp/pi-prompt-manager-terminal-EXAMPLE
```

Reuse only fixtures the launcher created, never a real agent directory. For the full syntax, pass `--help` instead of a mode.

## Platform checks

Run these on real operating systems and filesystems. Fixture stdin and Linux-only tests cannot prove native delivery or permission handling.

### Native clipboard

On **Linux, macOS, and WSL**, use isolated clipboards, never someone's live clipboard. Check delivery of complete Unicode, large text, and terminal controls, plus missing dependencies, cancellation, and timeout. Capturing fixture stdin doesn't test the OS clipboard.

### Storage permissions and writes

On each supported local filesystem, including the filesystem holding the agent directory on WSL:

- Check that modes and ACLs are repaired, lock files behave, and renames are atomic.
- Check that paths owned by another user, unsafe file types, and links are refused.
- Check refusal when the [filesystem assumptions](../../../libs/src/private-files/README.md#filesystem-assumptions) aren't met.

## Interaction measurement

After changes to collection processing, cooperative search, or preview preparation, run from the root:

```sh
node --experimental-transform-types packages/extensions/pi-prompt-manager/validation/measure-interaction.ts
```

It measures decoding and validation, item preparation, single-term and multi-term search, preview layout, updates to a nearly full "History", and the largest sampled event-loop delay, without printing prompt text. Timings include transfer and worker startup, but not fixture construction or filesystem I/O. There are no pass or fail thresholds, so also check that the terminal stays responsive. [Native wrapping of one long logical line](../../../libs/src/tui/components/text-preview/README.md#behaviour) remains synchronous and can block the event loop.
