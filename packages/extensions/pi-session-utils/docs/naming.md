# Automatic session naming

[pi-session-utils](../README.md) · [Configuration](../README.md#configuration)

The README describes [what text is sent](../README.md#automatic-session-names) and how to configure the model.

## Cancellation and retries

An unnamed session gets at most one automatic attempt per load. These events cancel a generation that is in progress:

| Event                                                | Effect on automatic naming                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Setting or clearing a name                           | Stops automatic naming until the session is loaded or reloaded.                     |
| Navigating the session tree                          | No other automatic attempt. Use `/sesh auto-name` for the selected branch.          |
| Aborting the agent run                               | Cancels its automatic attempt, without another attempt.                             |
| Running `/sesh auto-name` or `/sesh auto-name clear` | A new generation replaces any earlier one. Both commands work while the agent runs. |

## Output modes

- In interactive and RPC modes, `/sesh auto-name` reports progress and results through Pi notifications.
- Naming also works in print, JSON, and RPC modes.
- Print and JSON modes don't wait for automatic naming on exit, so the title may not be saved.

## Settings errors

Any of these turn off naming, but not saving or child sessions:

- An unreadable or malformed settings file.
- A settings file over 1 MiB.
- An invalid value.
- An unknown key in `ext.pi-session-utils` or `auto-title`.

Automatic naming then fails silently, and `/sesh auto-name` reports the error. Clearing still works.
