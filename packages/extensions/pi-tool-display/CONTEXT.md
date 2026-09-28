# pi-tool-display

Presents Pi tool calls in the transcript as cards, exploration groups, and run summaries without changing tool execution or saved results.

## Language

**Display adapter**:
A tool-specific contract that tells the display how to interpret one registered tool's arguments and results.
_Avoid_: renderer, handler, plain "adapter" when the architectural term could be meant

**Call interpretation**:
What a call means for display: its effective display adapter, pending state, outcome, and grouping and summary identities.
_Avoid_: projection, call state, call view

**Row chrome**:
Everything the host draws around or instead of a call's card in its Pi row: the summary line, hidden members, joined margins, and collapse controls placed after images. Owned by `host/row-layout.ts`; disabled when Pi's row contract is unrecognized.
_Avoid_: frame, decoration, shell
