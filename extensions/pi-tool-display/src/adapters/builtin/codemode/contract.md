# Built-in codemode adapter contract

[Built-in codemode adapter](README.md) · [Adapter development](../../../../docs/adapters.md)

Adapter maintainers use this contract when they change how results become cards. [Codemode cards](../../../../docs/tools.md#codemode) describes what users see.

## Display

- The call list comes from `details.calls`, also in partial results. A result without valid `details.calls` shows no call list.
- The compact truncation warning and "Saved output" reference come from `details.fullOutputPath`, which Pi sets only for truncated output that it saved.
- The script time comes from Pi's `durationMs`, not from the `Wall time` line of Pi's script header.

## Limitations

The adapter does not parse Pi's argument previews. The shared [prohibited actions](../../../../docs/adapters.md#prohibited-actions) apply.
