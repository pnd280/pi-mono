# Automatic session naming

[pi-session-utils](../README.md) · [Configuration](../README.md#configuration)

The README describes [what text is sent](../README.md#automatic-session-names) and how to configure the model.

## Cancellation and retries

The README states the [one-attempt rule](../README.md#automatic-session-names). These events cancel a generation that is in progress:

| Event                           | Effect on automatic naming                                                 |
| ------------------------------- | -------------------------------------------------------------------------- |
| Setting or clearing a name      | Stops automatic naming until the session is loaded or reloaded.            |
| Completing a tree navigation    | No other automatic attempt. Use `/sesh auto-name` for the selected branch. |
| Aborting the agent run          | Discards its automatic title, even a generated one, with no other attempt. |
| Running `/sesh auto-name`       | A new generation replaces any earlier one, even while the agent runs.      |
| Running `/sesh auto-name clear` | Cancels generation and clears the title, even while the agent runs.        |
| Ending or replacing the session | Cancels generation without saving its title.                               |

A generation that finishes while a tree navigation is still in progress, for example during its branch summary, saves its title as if it had finished just before the navigation. A navigation that another extension cancels doesn't affect naming.

## Output modes

- In interactive and RPC modes, `/sesh auto-name` reports progress and results through Pi notifications.
- Naming also works in print, JSON, and RPC modes.
- Print and JSON modes don't wait on exit for an automatic title that is still generating when the agent finishes, so that title may not be saved.

## Settings errors

Any of these turn off naming, but not saving or child sessions:

- An unreadable or malformed settings file.
- A settings file over 1 MiB.
- An invalid value.
- An unknown key in `ext.pi-session-utils` or `auto-title`.

Automatic naming then fails silently, and `/sesh auto-name` reports the error. Clearing still works.
