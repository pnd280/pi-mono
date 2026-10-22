# pi-prompt-manager

Prompts you submit in Pi's TUI scroll out of reach just when you want to reuse one. pi-prompt-manager keeps a private history of those prompts and lets you save drafts to come back to. Press **Ctrl+R** to search past prompts and put one back in the editor; it is never submitted for you.

It runs only in a trusted agent directory on local storage, on Linux, macOS, WSL, or native Windows. The [storage safety rules](docs/storage.md#storage-safety) give the filesystem requirements for each platform. In RPC, print, and JSON modes the extension stays inactive and reads neither settings nor storage.

## Usage

| Command                                     | Action                                                            |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `/prompts` or `/prompts history`            | Open "History".                                                   |
| `/prompts drafts` or `/prompts drafts list` | Open "Saved drafts".                                              |
| `/prompts save`                             | Save the editor text if it isn't blank; otherwise open drafts.    |
| `/prompts drafts add <text>`                | Save the arguments, trimmed, as a draft. The editor is unchanged. |

`drafts add` takes quotes, escapes, variables, and flags literally. To inspect, copy, restore, or delete a draft by number, use the [numbered draft commands](docs/controls.md#numbered-draft-commands).

### Save editor text

**Ctrl+Shift+S** saves the editor text, with pastes expanded and surrounding whitespace kept. If your terminal sends **Ctrl+S** instead, change [`saveDraft`](#configuration). Typing `/prompts save` usually opens drafts instead, because Pi clears the command from the editor before handling it.

- Each save creates a separate draft, even for the same text.
- After a successful save, the editor is cleared only if its text hasn't changed and you haven't restored anything since.
- A failed save leaves the editor as it was.

### Restore text

Restoring replaces the editor text. It doesn't submit, and doesn't add to Pi's native editor history.

- Pi may normalise tabs and line endings.
- Text containing unsafe terminal controls isn't restored. The stored and copied text is unaffected.
- If "restore then delete" (or `/prompts drafts restore-and-delete <n>`) fails to delete, the restored text stays in the editor.

### Browser

By default, **Ctrl+R** opens "History". The default browser bindings are:

| Key                                 | Action                               |
| ----------------------------------- | ------------------------------------ |
| **Enter**                           | Restore the selection.               |
| **Ctrl+C**                          | Copy without closing.                |
| **Tab**                             | Switch between collections.          |
| **Ctrl+P**                          | Preview.                             |
| **Delete** twice within 1.5 seconds | Delete the selection.                |
| **Escape**                          | Close the preview, then the browser. |

The browser needs at least 40 columns by 10 rows; below that, resize or cancel. See [controls](docs/controls.md) for search, duplicates, and deletion rules.

## Configuration

Add an `ext.pi-prompt-manager` key to the global `~/.pi/agent/settings.json`, or to `$PI_CODING_AGENT_DIR/settings.json` when that's set. Project settings are ignored. Defaults:

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

| Setting            | Meaning                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `historyRetention` | How many history entries to keep. Numbers are floored and clamped to 1–5,000; numeric strings are invalid. Lowering it prunes on the next captured prompt. |
| `shortcuts`        | Keys in [Pi key syntax](https://pi.dev/docs/latest/keybindings#key-syntax). An empty list disables the action, and an invalid list uses the default.       |

- Shortcuts must be valid Pi keys. Pi 1.4.0 can't dispatch modified **Escape** or modified function keys, so these keys are invalid.
- When keys can match the same keypress, such as `tab` and `ctrl+i`, only the first is used. `history` keys come before `saveDraft` keys, so `history` wins a shared key, with a warning.
- Each invalid field falls back to its default with a warning. Unreadable or oversized settings use all defaults.
- Run `/reload` to apply changes. The extension never rewrites settings.
- Pi may warn about conflicts with built-in keys, such as **Ctrl+R** for session renaming.
- If a shortcut can match the same keypress as a shortcut of another [pi-mono](../../../README.md) extension, such as pi-profiles, neither extension registers it, and a warning names the conflict.

## Side effects

The extension writes only to its own per-directory storage, and to the system clipboard when you copy. It makes no network requests and never adds prompt text to the transcript.

### Capture and storage

- Captures each interactive submission, trimmed, before templates and skills expand. This includes steering and follow-up messages you later withdraw.
- Captures record the typed text before other pi-mono extensions change it, such as by pi-skills expansion, whatever the load order. Other extensions that change input run in load order, so they can change it first.
- Doesn't capture slash commands handled by extensions, extension-generated input, or custom messages. Existing session and editor history isn't imported.
- Collections persist even with `--no-session`. Symlink aliases of a directory share storage; different directories and worktrees don't.
- Prompt text is stored unencrypted, protected by file permissions. See [storage and recovery](docs/storage.md) for paths, capacities, and repair.
- Browsing may create directories and repair permissions and ACLs. Saving, capturing, and deleting write collections.
- Notifications never include prompt text.

### Clipboard

Copying replaces the system clipboard with the complete text, including whitespace and control characters. It times out after five seconds, and is cancelled if the session ends.

Requires macOS `pbcopy`, Wayland `wl-copy`, X11 `xclip` or `xsel`, or WSL `powershell.exe` with Windows Forms clipboard support. SSH and native Windows aren't supported, and there's no OSC 52 fallback, even when Pi's `PI_CLIPBOARD_OSC52` is set.

## Validation

This section is for maintainers. The [coverage specification](docs/testing.md) defines what the tests protect. Prerequisites, offline fixtures, and platform checks are in the [validation guidance](docs/validation.md).
