# Abort-guard test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package has no listed invariants yet. Pi owns the abort itself. The shared [timed confirmation](../../../libs/src/timed-confirmation/README.md) owns the confirmation window, and the [working-message coordinator](../../../libs/src/working-message/README.md) owns the hint's display.

## Must not regress

No invariants are listed.

## Not tested

- The hint text, its colour, and its replacement of the working message are below the severity bar.

## Manual checks

Launch `vp exec pi -e ./packages/extensions/pi-abort-guard` from the repository root, then send a prompt that runs for several seconds.

| Do                                                          | Expect                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Press **Escape** once while the agent works.                | The run continues. The working message reads "escape again to interrupt" in the warning colour. |
| Press **Escape**, wait two seconds, and press it again.     | The run continues. The previous working message returns, then the hint shows again.             |
| Press **Escape** twice quickly while the agent works.       | The run stops.                                                                                  |
| Type `/` while the agent works, then press **Escape** once. | The autocomplete list closes and the run continues without a hint.                              |
| Press **Escape** twice quickly with an empty idle editor.   | Pi's `doubleEscapeAction` runs, as without the extension.                                       |
| Load an editor-replacing extension before this one.         | A "pi-abort-guard:" warning appears, and one **Escape** stops a run.                            |
