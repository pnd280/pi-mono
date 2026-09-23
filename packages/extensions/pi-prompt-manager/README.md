# pi-prompt-manager

Private prompt history and saved drafts for Pi's interactive TUI. Restores without submitting. In RPC, print, and JSON modes, stays inactive without reading settings or storage.

Requires a trusted agent directory on local Linux, macOS, or WSL storage with POSIX owner checks and enforced permissions.

## Usage

### Commands

| Command                                     | Action                                                 |
| ------------------------------------------- | ------------------------------------------------------ |
| `/prompts` or `/prompts history`            | Open History                                           |
| `/prompts drafts` or `/prompts drafts list` | Open Saved drafts                                      |
| `/prompts save`                             | Save nonblank editor text; otherwise open drafts       |
| `/prompts drafts add <text>`                | Save trimmed literal arguments; leave editor unchanged |

`drafts add` treats quotes, escapes, variables, and flags literally. [Numbered commands](docs/controls.md#numbered-draft-commands) inspect, copy, restore, or delete without browsing.

### Save editor text

**Ctrl+Shift+S** saves expanded pastes and surrounding whitespace. If the terminal sends Ctrl+S instead, change [`saveDraft`](#configuration). Typing `/prompts save` usually opens drafts because Pi clears the command before handling it.

Repeated saves remain separate. Success clears the editor only if its text still matches and no explicit restore intervened; failure leaves it intact.

### Restore text

Restoration replaces editor text without submitting or adding native editor history. Pi may normalize tabs/line endings. Unsafe terminal controls prevent restoration; stored/copied source stays exact.

If **restore then delete** or `/prompts drafts restore-and-delete <n>` fails to delete, restored text stays in the editor.

### Browser

**Ctrl+R** opens History. Default browser keys:

- **Enter:** restore and close.
- **Ctrl+C:** copy and stay open; never cancel.
- **Escape:** close preview, then browser; close immediately during loading/deletion without undoing deletion.
- **Tab:** switch collections.
- **Ctrl+P:** full preview.
- **Delete twice within 1.5 seconds:** delete selection.

Below **40 columns × 10 rows**, resize or cancel. See [controls](docs/controls.md) for bindings, search, duplicates, and deletion rules.

## Configuration

Set literal `ext.pi-prompt-manager` in global `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` when set. Project settings are ignored. Defaults:

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

- `historyRetention`: finite numbers, floored and clamped to 1–5,000; numeric strings are invalid.
- Shortcuts use [Pi key syntax](../../../node_modules/@earendil-works/pi-coding-agent/docs/keybindings.md#key-syntax). Empty lists disable an action's launch shortcut; invalid lists use its default.
- Equivalent spellings deduplicate; History wins shared bindings.

Fields validate independently with warnings for invalid/unknown values. Pi may warn about built-in conflicts, including Ctrl+R session renaming.

Apply changes with `/reload`; settings are never rewritten. Lower retention prunes History only on the next committed capture.

## Side effects

### Capture and storage

Captures trimmed interactive submissions, including steering/follow-ups later withdrawn. Capture occurs before template/skill expansion but after earlier transforms. Intercepted slash commands, extension-generated input, and custom messages are excluded; existing session/editor history is not imported.

Collections persist with `--no-session`. Symlink aliases share storage; distinct directories/worktrees do not. Resolving real cwd is required.

Prompt text is unencrypted and permission-protected. See [storage and recovery](docs/storage.md) for paths, capacities, and repair. Browsing may create directories and repair permissions/ACLs; saves, captures, and deletions write collections. Notifications omit prompt text. No transcript copies or network requests.

### Clipboard

Copy replaces the native clipboard with complete source, including whitespace/controls, with a five-second deadline and session-expiry cancellation.

Requires macOS `pbcopy`, Wayland `wl-copy`, X11 `xclip`/`xsel`, or WSL `powershell.exe` with Windows Forms clipboard support. SSH and native Windows are unsupported; no OSC 52 fallback.

## Validation

[Coverage specification](docs/testing.md).

Use [focused checks](../../../docs/development.md#focused-validation) for `pi-prompt-manager` and [validation guidance](docs/validation.md) for prerequisites, offline fixtures, and platform checks.
