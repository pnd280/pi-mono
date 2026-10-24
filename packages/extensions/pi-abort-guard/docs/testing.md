# Abort-guard test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests interrupt routing and confirmation isolation in an offline Pi host. Pi owns the abort itself, the shared [timed confirmation](../../../libs/src/timed-confirmation/README.md) owns the confirmation window, and the [working-message coordinator](../../../libs/src/working-message/README.md) owns the hint's display.

## Must not regress

- **High, e2e:** The first interrupt during an active operation arms a hint, and the second delegates once to `CustomEditor.handleInput`.
- **High, e2e:** A key consumed by a shortcut, paste handler, autocomplete, or dialog does not arm confirmation.
- **High, e2e:** An armed confirmation cannot affect a later run, manual compaction, tree operation, session, or reload.

## Not tested

- The exact hint text, its colour, and its replacement of the working message are below the severity bar.

## Manual checks

Launch `vp exec pi -e ./packages/extensions/pi-abort-guard` from the repository root. Start a prompt that runs for several seconds whenever a row needs a running agent.

| Do                                                                                                                                                           | Expect                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Press **Escape** once while the agent works.                                                                                                                 | The run continues. The working message reads "escape again to interrupt" in the warning colour. |
| Wait two seconds.                                                                                                                                            | The current working message returns.                                                            |
| Press **Escape** again after that wait.                                                                                                                      | The hint shows again, and the run continues.                                                    |
| Press **Escape** twice quickly while the agent works.                                                                                                        | The run stops.                                                                                  |
| Press **Escape** near the end of a run. Start another run and press **Escape** before the first press's 1.5-second window ends.                              | The new run continues.                                                                          |
| Press **Escape** during manual `/compact`. After it ends, start a run and press **Escape** before the first press's 1.5-second window ends.                  | The new run continues.                                                                          |
| Press **Escape** during a branch summary. After tree navigation completes, start a run and press **Escape** before the first press's 1.5-second window ends. | The new run continues.                                                                          |
| Type `/` while the agent works, then press **Escape** once.                                                                                                  | The autocomplete list closes, the run continues, and no interrupt hint appears.                 |
| Press **Escape** twice quickly with an empty idle editor.                                                                                                    | Pi's `doubleEscapeAction` runs, as without the extension.                                       |
| Load pi-profiles with a configured profile before this one, select the profile, start a run, and press **Escape** once.                                      | The run continues. The editor's top border shows the profile name, without the status.          |
