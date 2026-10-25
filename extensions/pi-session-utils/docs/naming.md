# Automatic session naming

[pi-session-utils](../README.md) · [Configuration](../README.md#configuration)

Naming needs the `auto-title` [configuration](../README.md#configuration); saving and child sessions don't.

## Attempts

- An unnamed session gets at most one automatic attempt per load, made silently when a user message with non-empty text arrives. Loading or reloading allows another attempt, at the next user message.
- An automatic title is saved only when the agent finishes running without an abort.
- `/sesh auto-name` generates a new title at any time, even while the agent is running.
- Setting or clearing a name yourself stops automatic naming. [Cancellation and retries](#cancellation-and-retries) says when naming resumes.
- Generation times out after 15 seconds and isn't retried. If it fails, the name is unchanged.

## What is sent

| Trigger           | Text from the current branch sent to the model                                  |
| ----------------- | ------------------------------------------------------------------------------- |
| Automatic         | The first 4,000 characters of the first non-empty user request.                 |
| `/sesh auto-name` | The newest 4,000 characters of user and assistant text, in chronological order. |

Images, tool output, and thinking are never sent. Titles are at most 80 characters.

## Cancellation and retries

These events cancel a generation that is in progress:

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
