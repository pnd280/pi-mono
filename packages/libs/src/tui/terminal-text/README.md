# Terminal text

[Shared TUI](../README.md#usage)

Untrusted terminal output can carry control sequences that corrupt the display. Use [`displayText`](index.ts) for untrusted plain text and `styledOutput` to retain only Select Graphic Rendition (SGR) styling.

## Behaviour

- `displayText` and `styledOutput` both normalise line endings and tabs.
- `displayText` removes complete control sequence introducer (CSI) commands. For unrecognised non-CSI escapes, printable payload text can remain after control bytes are removed.
- `styledOutput` keeps only the SGR styling that Pi 1.4.0 reconstructs on continuation rows and sliced suffixes, and removes the rest. The [terminal text styling rules](../../../docs/tui-terminal-text.md) list the retained parameters.
- `compactDisplayText` makes a single-line plain label without trimming or limiting length.
- `sliceTerminalText(text, start, end, options?)` returns `{ text, leadingSgr }` for the UTF-16 range from `start` (inclusive) to `end` (exclusive). It never splits graphemes or recognised escapes, and it omits a grapheme that straddles a boundary. Set `preserveSgr: true` to reconstruct leading styling with Pi's SGR tracker.
- `hasUnsafeTerminalControls` detects DEL and C0 and C1 controls except tab, LF, and CR without modifying the source.
- `sliceTerminalText` does not sanitise controls.
- Sanitised display text doesn't make the original safe to restore into an editor.

## Usage

```ts
import {
  displayText,
  hasUnsafeTerminalControls,
  sliceTerminalText,
  styledOutput
} from "@pi-mono/libs/tui/terminal-text";

const label = displayText(untrusted);
const slice = sliceTerminalText(output, 0, 200, { preserveSgr: true });
const row = styledOutput(slice.leadingSgr + slice.text);
if (hasUnsafeTerminalControls(source)) return refuseRestore();
```

## Caller responsibilities

- Keep exact source separate.
- Slice and sanitise complete snapshots, not chunks, because escape sequences can cross chunk boundaries.
- Before displaying a slice, use `displayText(slice.text)` for plain text or `styledOutput(slice.leadingSgr + slice.text)` to retain SGR styling.
- Choose refusal messages and editor policy.

Related: [text budgets](../text-budget/README.md) wrap and excerpt the sanitised text.
