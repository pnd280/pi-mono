# pi-tool-display

Presents Pi tool calls in the transcript as cards, exploration groups, and run summaries without changing tool execution or saved results.

## Design boundaries

The transcript owns call state and boundaries; adapters interpret verified tool contracts; rendering consumes that interpretation. This separation keeps presentation failures from changing tool behavior or silently turning output prose into operation facts. Native observations are opt-in facts for live TUI calls, not a substitute for Pi's published results. Saved history records only bounded evidence, so replay may say an outcome is unavailable rather than reconstructing one from text or the current filesystem.

Groups are adjacent calls sharing a scope; runs span owned calls until a visible non-thinking boundary. Thinking may split groups without ending a run. Preserve this distinction when adding message types or adapting Pi rows. See [presentation](docs/presentation.md#summary-mode) for user-visible behavior and [compatibility](docs/pi-compatibility.md) for host assumptions.

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
