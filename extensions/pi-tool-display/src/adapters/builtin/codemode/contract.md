# Built-in codemode adapter contract

[Built-in codemode adapter](README.md) · [Adapter development](../../../../docs/adapters.md)

Adapter maintainers use this contract when they change how results become cards. [Codemode cards](../../../../docs/tools.md#codemode) describes what users see.

## Display

- The call list comes from `details.calls`, also in partial results. A result without valid `details.calls` shows no call list.
- The "Saved output" reference comes from `details.fullOutputPath`.
- The card hides Pi's `Script completed` or `Script failed` header only when it is the first text block.
- The script time comes from Pi's `durationMs`, not from that header.

## Limitations

The adapter never runs scripts, reads saved output, or parses argument previews.
