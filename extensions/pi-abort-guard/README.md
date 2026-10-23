# pi-abort-guard

A stray **Escape** stops a running Pi agent. pi-abort-guard replaces the working message with a hint on the first press and stops the agent only on the second:

```text
escape again to interrupt
```

## Behaviour

- While Pi works on an agent run, a retry, a compaction, or a branch summary, the first **Escape** in the editor does not interrupt. For up to 1.5 seconds, the hint replaces the whole working message, including text from other extensions. The hint uses the theme's warning colour, which is yellow in Pi's built-in themes.
- A second **Escape** before the hint clears interrupts as usual. After the hint clears, the next press counts as a first press again.
- Finishing a run, ending a compaction, or completing tree navigation clears the confirmation.
- When Pi is idle, **Escape** works as usual. This includes the double press in an empty editor that opens `/tree` or `/fork` (the `doubleEscapeAction` [setting](https://pi.dev/docs/latest/settings)) and stopping a `!` shell command.
- **Escape** closes dialogs, selectors, and the autocomplete list on the first press.
- The extension protects whichever keys are bound to `app.interrupt`, so a remapped [keybinding](https://pi.dev/docs/latest/keybindings) gets the same protection. Extension shortcuts and image-paste bindings keep Pi's normal priority over interrupts.

Edge cases:

- Retries, compactions, and branch summaries show their own status line instead of the working message, so the hint does not appear there. The extension still holds back the first press.
- After the hint clears, the current working message returns. When no other contribution or override has text, Pi shows "Working".

## Limitations

The extension holds back the first press by wrapping the input handling of Pi's editor, or of the editor that another extension set. Status moves from the editor border to a separate line. Extensions that also wrap the earlier editor, such as [pi-profiles](../pi-profiles/README.md), keep the protection in either load order. Other editors limit it:

- If another extension replaces the editor and discards the earlier one, the protection stops without a warning.
- An editor that is not built on Pi's `CustomEditor` gets no interrupt handler from Pi. **Escape** does what that editor does with it, and the extension cannot hold it back.
- An editor that handles **Escape** itself, without calling Pi's interrupt handler, is not protected.

Only the interactive terminal is affected. RPC, JSON, and print modes are unchanged.
