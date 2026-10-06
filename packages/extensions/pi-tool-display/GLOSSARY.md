# pi-tool-display

pi-tool-display presents Pi tool calls in the transcript as cards, exploration groups, and run summaries without changing tool execution or saved results.

## Language

Adapters interpret individual calls; transcript groups and runs determine how those interpretations appear together.

### Interpretation

**Display adapter**:
A tool-specific contract that tells the display how to interpret one registered tool's arguments and results.
_Avoid_: renderer, handler, plain "adapter" when the architectural term could be meant

**Call interpretation**:
What a call means for display: its effective display adapter, pending state, outcome, and grouping and summary identities.
_Avoid_: projection, call state, call view

**Native observation**:
Facts collected about a verified native tool call in a live TUI, RPC, print, or JSON session, such as shell previews, timing, outcomes, and pre-write contents. Supplements Pi's published results; never replaces them.
_Avoid_: capture, tracking

### Transcript structure

**Collector generation**:
The identity of one session-owned collection lifetime. Portable records share this identity; live consumers reject records from a previous connection's generation.

**Foreign viewer**:
A read-only model and component over supplied entries and public events. It uses supported recorded contracts instead of the viewing host's tool registry.

**Exploration group**:
Adjacent exploration calls sharing one scope and title, shown under a single heading. Thinking may split a group.
_Avoid_: batch, cluster

**Run**:
A maximal sequence of this extension's calls between visible non-thinking boundaries. Thinking never splits or ends a run.
_Avoid_: turn, batch, group

**Summary line**:
The single line that replaces an ended run in summary mode.
_Avoid_: collapsed run, summary card

**Row chrome**:
Everything the host draws around or instead of a call's card in its Pi row: the summary line, hidden members, joined margins, and collapse controls placed after images.
_Avoid_: frame, decoration, shell
