# pi-abort-guard

In Pi, one press of **Escape** stops a running agent, so a stray press ends the turn. pi-abort-guard makes the first press replace the working message with a hint, and stops the agent only on a second press:

```text
escape again to interrupt
```

## Behaviour

- While Pi works on an agent run, a retry, or a compaction, the first **Escape** in the editor does not interrupt. For 1.5 seconds, the hint replaces the whole working message, including text from other extensions. The hint uses the theme's warning colour, which is yellow in Pi's built-in themes.
- A second **Escape** before the hint clears interrupts as usual. After the hint clears, the next press counts as a first press again.
- When Pi is idle, **Escape** works as usual. This includes the double press that opens `/tree` or `/fork` (the `doubleEscapeAction` [setting](https://pi.dev/docs/latest/settings)) and stopping a `!` shell command.
- **Escape** closes dialogs, selectors, and the autocomplete list on the first press.
- The extension protects whichever keys are bound to `app.interrupt`, so a remapped [keybinding](https://pi.dev/docs/latest/keybindings) gets the same protection.

Edge cases:

- Retries and compactions show their own status line instead of the working message, so the hint does not appear there. The first press is still held back.
- Outside the hint, Pi's working message still says "escape to interrupt".

## Limitations

The extension replaces Pi's editor with a copy that holds back the first press, and only one extension can replace the editor:

- If another extension replaced the editor first, pi-abort-guard shows a warning and changes nothing. One press still interrupts.
- If another extension replaces the editor later, the protection stops without a warning.

Only the interactive terminal is affected. RPC, JSON, and print modes are unchanged.
