# Abort-guard test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package has no automated tests. Pi owns the abort itself. The shared [timed confirmation](../../../libs/src/timed-confirmation/README.md) owns the confirmation window, and the [working-message coordinator](../../../libs/src/working-message/README.md) owns the hint's display.

## Must not regress

No automated tests cover the [input behaviour](../README.md#behaviour) or [editor-ownership limits](../README.md#limitations). Use the manual checks below.

## Not tested

- The hint text, its colour, and its replacement of the working message are below the severity bar.

## Manual checks

Launch `vp exec pi -e ./packages/extensions/pi-abort-guard` from the repository root. Start a prompt that runs for several seconds whenever a row needs a running agent.

| Do                                                           | Expect                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| Press **Escape** once while the agent works.                 | The run continues.                                          |
| Inspect the working message after that press.                | It reads "escape again to interrupt" in the warning colour. |
| Wait two seconds.                                            | The previous working message returns.                       |
| Press **Escape** again after that wait.                      | The hint shows again.                                       |
| Watch the agent after that press.                            | The run continues.                                          |
| Press **Escape** twice quickly while the agent works.        | The run stops.                                              |
| Type `/` while the agent works, then press **Escape** once.  | The autocomplete list closes.                               |
| Watch the agent after closing autocomplete.                  | The run continues.                                          |
| Inspect the working message after closing autocomplete.      | No interrupt hint appears.                                  |
| Press **Escape** twice quickly with an empty idle editor.    | Pi's `doubleEscapeAction` runs, as without the extension.   |
| Load an editor-replacing extension before this one.          | A "pi-abort-guard:" warning appears.                        |
| Start a run with those extensions and press **Escape** once. | The run stops.                                              |
