# pi-prompt-manager

Private prompt history and saved drafts for Pi's interactive TUI. Restore text without submitting it. In RPC, print, or JSON mode, the extension stays inactive and reads neither settings nor storage.

Storage requires a trusted agent directory on a local Linux, macOS, or WSL filesystem that supports POSIX file-owner checks and enforces permissions.

## Usage

### Commands

| Command                                     | Action                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| `/prompts` or `/prompts history`            | Open History                                                   |
| `/prompts drafts` or `/prompts drafts list` | Open Saved drafts                                              |
| `/prompts save`                             | Save nonblank editor text; otherwise open drafts               |
| `/prompts drafts add <text>`                | Save trimmed literal argument text; leave the editor unchanged |

`drafts add` treats quotes, escapes, variables, and flags literally. To inspect, copy, restore, or delete a draft without browsing, use the [numbered draft commands](docs/controls.md#numbered-draft-commands).

### Save editor text

Use **Ctrl+Shift+S** to save the editor contents, including expanded pastes and surrounding whitespace. If your terminal sends Ctrl+S for that key combination, configure another [`saveDraft` shortcut](#configuration).

Typing `/prompts save` normally opens drafts because Pi clears the command before running its handler.

Repeated saves remain separate occurrences. A successful save clears the editor only if its text still matches the saved text and no explicit restoration intervened. A failed save leaves the editor intact.

### Restore text

Restoration replaces editor text without submitting it or adding it to Pi's native editor history. Pi may normalize tabs and line endings. The extension refuses to restore text containing unsafe terminal controls. Stored and copied source remains unchanged. Restore-and-remove leaves restored text in the editor if deletion fails.

### Browser

**Ctrl+R** opens History by default. In the browser, with Pi's default bindings:

- **Enter** restores the selection and closes the browser.
- **Ctrl+C** copies the selection and stays open. It never cancels this view.
- **Escape** closes full preview first, then the browser. During deletion, it closes the browser immediately but does not undo the deletion.
- **Tab** switches collections.
- **Ctrl+P** opens full preview.
- **Delete** twice within 1.5 seconds removes the selected occurrence.

Browsing requires at least **40 columns × 10 rows**; below that size, resize or cancel.

See [browser controls](docs/controls.md) for custom bindings, search and duplicate handling, and deletion rules.

## Configuration

Set the literal `ext.pi-prompt-manager` key in Pi's global `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` if that environment variable is set. Project settings are not read. Defaults:

```json
{
  "ext.pi-prompt-manager": {
    "historyRetention": 250,
    "shortcuts": {
      "history": ["ctrl+r"],
      "saveDraft": ["ctrl+shift+s"]
    }
  }
}
```

- `historyRetention` accepts finite numbers, rounds them down, and clamps them to 1–5,000. Numeric strings are invalid.
- Shortcut lists use [Pi key syntax](../../../node_modules/@earendil-works/pi-coding-agent/docs/keybindings.md#key-format). An empty list disables that launch shortcut. An invalid list falls back to that action's default.
- Equivalent shortcut spellings count as one binding. If both actions use the same shortcut, History takes precedence.

The extension validates each field independently and warns about invalid values and unknown fields. Pi may also warn about conflicts with built-in shortcuts, including Ctrl+R for session renaming.

Changes apply after `/reload`; the file is never rewritten. Lowering retention does not prune existing History until a new capture is committed.

## Side effects

### Capture and storage

History captures interactive user submissions and trims surrounding whitespace. Steering and follow-up submissions remain captured even if later withdrawn.

The extension captures input before template and skill expansion but after earlier transforms. It excludes intercepted slash commands, extension-generated input, and custom messages. It does not import existing session or native editor history.

Collections persist even with `--no-session`. Symlink aliases share a collection; distinct directories and worktrees remain separate. The extension must be able to resolve the real working directory. Collection files contain unencrypted prompt text, protected by filesystem permissions. See [storage and recovery](docs/storage.md) for paths, capacities, and manual repair.

Browsing can create storage directories and repair permissions and ACLs. Saves, captures, and deletions write collection files. Notifications contain no prompt text. The extension creates no transcript copies and makes no network requests.

### Clipboard

Copying replaces the native clipboard with the complete selected source, including whitespace and controls. It has a five-second deadline and is cancelled on session expiry.

Copying requires `pbcopy` on macOS, `wl-copy` on Wayland, `xclip` or `xsel` on X11, or `powershell.exe` in WSL with Windows Forms clipboard support. SSH sessions and native Windows are unsupported; there is no OSC 52 fallback.

## Validation

Use the [focused validation commands](../../../docs/development.md#focused-validation) with `pi-prompt-manager`. See [validation](docs/validation.md) for test prerequisites, offline fixtures, and platform checks.
