# pi-prompt-manager

Private prompt history and saved drafts for Pi's interactive TUI. Browse, search, inspect, copy, or restore text without submitting it. Views use `ctx.ui.custom`, inline when space permits and as an overlay on short terminals, without installing a custom editor or changing native Up/Down history. RPC, print, and JSON modes do not activate the feature or read its settings/storage.

## Commands

| Command                                     | Action                                                     |
| ------------------------------------------- | ---------------------------------------------------------- |
| `/prompts` or `/prompts history`            | Open History                                               |
| `/prompts drafts` or `/prompts drafts list` | Open Saved drafts                                          |
| `/prompts save`                             | Save nonblank editor text; otherwise open drafts           |
| `/prompts drafts add <text>`                | Save trimmed literal argument text; leave editor unchanged |
| `/prompts drafts show <n>`                  | Inspection only; confirm/cancel closes                     |
| `/prompts drafts copy <n>`                  | Copy the current numbered occurrence                       |
| `/prompts drafts restore <n>`               | Replace editor text, keeping the saved occurrence          |
| `/prompts drafts restore-and-remove <n>`    | Restore first, then attempt identity-checked deletion      |
| `/prompts drafts delete <n>`                | Delete directly, without browser confirmation              |

Numbers are one-based positive decimal integers, without leading zeros or trailing arguments. They address the full saved-draft order, not filtered search positions. Rows omit numeric indices; the browser's position counter describes the current search results. Each numbered command reloads the collection: another session can change its order before invocation. After selection, deletion uses UUID, exact text, and original timestamp information, never a new index lookup. `add` does not interpret quotes, escapes, variables, or flags.

**Saving editor text:** Pi normally clears a typed slash command before running its handler, so `/prompts save` normally opens drafts. Use **Ctrl+Shift+S** to save an existing draft, including expanded paste contents and surrounding whitespace. Repeated saves remain separate occurrences. A successful save clears the editor only if its text is unchanged and no explicit restoration intervened. A failed save leaves it intact.

**Restoration:** Pi may normalize tabs and line endings. Unsafe terminal controls cause refusal before editor replacement; stored/copyable source is never sanitized. Restoration replaces, never submits or adds native editor history. Restore-and-remove leaves restored text in the editor if deletion fails.

## Browser

Views use Pi's settings-style search input and selection rows, with `/model`-style `history | drafts` tabs: the active collection is accented and the other muted. A switching hint appears below the tabs, or in the footer at compact sizes. Unnumbered rows start with a compact age followed by the prompt text, such as `5h   prompt text`, and expand with terminal width. Footer hints wrap only when needed. Pi-style `↑ N more` / `↓ N more` border labels indicate hidden rows only in full preview and inspection; lists use their `(selected/total)` counter. Ctrl+P opens the full text; no preview appears beneath the list.

**Ctrl+R** opens History by default. One prompt-manager view can be open per session, including loading and standalone inspection. Search covers complete terminal-safe plain text: literal phrases rank first, then all literal terms, then Pi fuzzy matches. History shows the first stored occurrence of each equal trimmed text; drafts show every save, including duplicates.

Use configured Pi confirm/copy/cancel/navigation/page bindings, Tab or Shift+Tab to switch collections, Ctrl+P for full preview, and Delete twice within 1.5 seconds to remove an occurrence. Alt+Enter restores and removes a draft. Copy stays in the browser. Confirm restores and closes. Cancel closes full preview first, then the browser. **Ctrl+C never cancels this view.**

Views are capped at **75% of available height**, rounded down. Inline space excludes Pi's three default footer/spacer rows. If that budget is below **12 rows**, the view switches to an overlay capped at 75% of the full terminal height. Resizing updates both the cap and presentation without losing browser state.

The minimum size is **40 columns × 10 rows**. Additional widgets or taller custom footers may reduce inline space further. Below the minimum, resize or cancel. See [control semantics](docs/controls.md) for precedence, conflicts, selection, and deletion rules.

## Configuration

Only the designated global `getAgentDir()/settings.json` is read, including Pi's `PI_CODING_AGENT_DIR` override. Project settings are never chosen independently. An explicit agent-directory override can locate this user-level storage inside a project.

```json
{
  "ext.pi-prompt-manager": {
    "historyRetention": 250,
    "customMessageTypes": [],
    "shortcuts": {
      "history": ["ctrl+r"],
      "saveDraft": ["ctrl+shift+s"]
    }
  }
}
```

- Retention defaults to 250. Finite numbers are floored and clamped to 1–5,000; numeric strings are invalid.
- Custom-message capture requires a valid nonempty allowlist. Type strings are preserved and matched case-sensitively. Invalid lists disable this path. A narrowly guarded, reversible SessionManager append adapter covers appends inside and outside agent execution; an incompatible host disables only this path with a warning.
- Shortcut lists use [Pi key syntax](../../../node_modules/@earendil-works/pi-coding-agent/docs/keybindings.md#key-format). Empty lists disable that launch shortcut. Invalid lists fall back per action. Equivalent spellings are deduplicated; History wins a collision with saving. Pi may separately warn about conflicts with built-in shortcuts, including Ctrl+R's session-renaming binding.
- Fields are validated independently. Invalid values and unknown fields produce warnings; settings are never rewritten. Changes apply after `/reload`. Lowering retention or opening a view does not prune history.

## Capture, storage, and side effects

History records observed interactive submissions, including steering/follow-up submissions later withdrawn. Input is observed before template/skill expansion but after earlier transforms; intercepted slash commands do not reach that event. Extension-origin user input qualifies only when the actual branch leaf is a custom-message entry, even if hidden or unlisted. No existing session or native history is imported.

Collections persist even with `--no-session`, under `getAgentDir()/pi-prompt-manager/<SHA-256 of real cwd>/`. Symlink aliases share a collection; distinct directories and worktrees remain separate. Resolving the real working directory must succeed.

Saves, captures, deletions, permission/ACL repair, and native clipboard operations are side effects. Browsing/inspection never sends prompt text to model context or creates persistent transcript copies. Notifications contain no prompt text. There are no feature network requests and no automatic installation or enabling.

Native clipboard prerequisites: `pbcopy` on macOS; `wl-copy` on Wayland or `xclip`/`xsel` on X11; Windows PowerShell with Windows Forms clipboard support in WSL. SSH clipboard access and native Windows are unsupported. Helpers are asynchronous with a five-second deadline; there is **no OSC 52 fallback**. Complete source text, including whitespace and controls, is sent to the helper.

See [storage, capacities, and manual recovery](docs/storage.md) before editing collection files or removing locks. Supported storage is local Linux, macOS, and WSL filesystems on which private access can be established. Network filesystems and cross-machine locking are outside this version.

## Validation

Use the [focused validation commands](../../../docs/development.md#focused-validation) with `pi-prompt-manager`. Linux ACL checks require `getfacl`, `setfacl`, and `mkfifo`. See [offline host and terminal validation](docs/validation.md) for isolated fixtures and platform checks.
