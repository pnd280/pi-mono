# pi-prompt-manager

Prompts you submit in Pi's TUI scroll out of reach just when you want to reuse one. pi-prompt-manager keeps a private history of those prompts, with a retention that you set, and lets you save drafts to come back to, with launch shortcuts that you can change.

Press **Ctrl+R** to search past prompts and put one back in the editor; it is never submitted for you.

## Controls

| Control                                     | Effect                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Ctrl+R**                                  | Open "History". Change the key with [`shortcuts.history`](#configuration).                                               |
| **Ctrl+Shift+S**                            | Save the editor text as a draft. Change the key with [`shortcuts.saveDraft`](#configuration).                            |
| `/prompts` or `/prompts history`            | Open "History".                                                                                                          |
| `/prompts drafts` or `/prompts drafts list` | Open "Saved drafts".                                                                                                     |
| `/prompts save`                             | Save the editor text if it isn't blank; otherwise open drafts.                                                           |
| `/prompts drafts add <text>`                | Save the arguments, trimmed, as a draft. The editor is unchanged.                                                        |
| `/prompts drafts show <n>`                  | Inspect a draft by number without restoring it. See [numbered draft commands](docs/controls.md#numbered-draft-commands). |
| `/prompts drafts copy <n>`                  | Copy a draft by number.                                                                                                  |
| `/prompts drafts restore <n>`               | Replace the editor text with a draft and keep the draft.                                                                 |
| `/prompts drafts restore-and-delete <n>`    | Restore a draft, then try to delete it.                                                                                  |
| `/prompts drafts delete <n>`                | Delete a draft without the browser's confirmation.                                                                       |

## Usage

The extension runs only in a trusted agent directory on local storage, on Linux, macOS, WSL, or native Windows. The [storage safety rules](docs/storage.md#storage-safety) give the filesystem requirements for each platform. In RPC, print, and JSON modes the extension stays inactive and reads neither settings nor storage.

`drafts add` takes quotes, escapes, variables, and flags literally.

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

The default browser bindings are:

| Key                                 | Action                               |
| ----------------------------------- | ------------------------------------ |
| **Enter**                           | Restore the selection.               |
| **Ctrl+C**                          | Copy without closing.                |
| **Tab**                             | Switch between collections.          |
| **Ctrl+P**                          | Preview.                             |
| **Delete** twice within 1.5 seconds | Delete the selection.                |
| **Escape**                          | Close the preview, then the browser. |

The browser needs at least 40 columns by 10 rows; below that, resize or cancel. The [browser controls](docs/controls.md) guide tells how to rebind browser keys, and gives the search, duplicate, and deletion rules.

## Configuration

Add an `ext.pi-prompt-manager` key to the global `~/.pi/agent/settings.json`, or to `$PI_CODING_AGENT_DIR/settings.json` when that's set. Project settings are ignored. Run `/reload` to apply changes. The extension never rewrites settings.

This example shows every field with its default. Remove the comments before you copy it, because Pi reads `settings.json` as plain JSON:

```jsonc
{
  "ext.pi-prompt-manager": {
    // Optional. How many history entries to keep. Default: 250. Numbers are floored and clamped to 1–5,000; numeric strings are invalid. Lowering it takes effect on the next committed capture; reads and skipped consecutive duplicates do not prune.
    "historyRetention": 250,
    // Optional. Keys in Pi key syntax for each action. An empty list disables the action, and an invalid list uses the default.
    "shortcuts": {
      // Optional. The keys that open "History". Default: ["ctrl+r"].
      "history": ["ctrl+r"],
      // Optional. The keys that save the editor text as a draft. Default: ["ctrl+shift+s"].
      "saveDraft": ["ctrl+shift+s"]
    }
  }
}
```

Shortcuts use [Pi key syntax](https://pi.dev/docs/latest/keybindings#key-syntax).

- Each invalid field falls back to its default with a warning. An unreadable global settings file, or one larger than 1 MiB, uses all defaults with a warning.
- Some keys are refused or shared with other extensions or Pi's built-in keys. [Launch shortcuts](docs/controls.md#launch-shortcuts) says which key wins and when a warning appears.

## Side effects

The extension writes only to its own per-directory storage, and to the system clipboard when you copy. It makes no network requests and never adds prompt text to the transcript.

### Capture and storage

- Each prompt that you submit in the TUI is captured, trimmed, before templates and skills expand. Slash commands that extensions handle and extension-generated input aren't captured. [Capture rules](docs/storage.md#capture) give the full list.
- Collections persist even with `--no-session`. Each real working directory has its own collections.
- Prompt text is stored unencrypted, protected by file permissions. See [storage and recovery](docs/storage.md) for paths, capacities, and repair.
- Browsing may create directories and repair permissions and ACLs. Saving, capturing, and deleting write collections.
- Notifications never include prompt text.

### Clipboard

Copying sends the stored text, including whitespace and control characters, to the native clipboard helper. On WSL, the Windows clipboard ends the text at the first NUL character. On macOS, `pbcopy` stores text that begins with an RTF or EPS file header as that format, not as plain text. Copying times out after five seconds, and is cancelled if the session ends.

Requires macOS `pbcopy`, Wayland `wl-copy`, X11 `xclip` or `xsel`, or WSL `powershell.exe` with Windows Forms clipboard support. SSH and native Windows aren't supported, and there's no OSC 52 fallback, even when Pi's `PI_CLIPBOARD_OSC52` is set.

## Docs

| When you…                                                             | Read                                           |
| --------------------------------------------------------------------- | ---------------------------------------------- |
| Rebind browser keys, or want search, duplicate, and deletion rules    | [Browser and draft commands](docs/controls.md) |
| Need storage paths, capacities, backup, or repair after a failed read | [Storage and recovery](docs/storage.md)        |
| Check what the tests protect                                          | [Coverage specification](docs/testing.md)      |
| Need prerequisites, fixtures, or platform checks                      | [Validation guidance](docs/validation.md)      |
| Upgrade Pi                                                            | [Pi compatibility](docs/pi-compatibility.md)   |
