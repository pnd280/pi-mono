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

- Retries, compactions, and branch summaries show their own status line instead of the working message, so the hint does not appear there. The first press is still held back.
- After the hint clears, the current working message returns. When no other contribution or override has text, Pi shows "Working".

## Limitations

The extension holds back the first press by replacing Pi's editor. Status moves from the editor border to a separate line. Only one extension can replace the editor:

- If another extension replaced the editor first, pi-abort-guard shows a warning and changes nothing. One press still interrupts.
- If another extension replaces the editor later, the protection stops without a warning.

Only the interactive terminal is affected. RPC, JSON, and print modes are unchanged.
