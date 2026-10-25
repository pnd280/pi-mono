# pi-tool-display

pi-tool-display presents Pi tool calls in the transcript as cards, exploration groups, and run summaries without changing tool execution or saved results.

## Language

Adapters interpret individual calls; transcript groups and runs determine how those interpretations appear together.

### Interpretation

**Display adapter**:
A tool-specific contract that tells the display how to interpret one registered tool's arguments and results. See [adapter development](docs/adapters.md).
_Avoid_: renderer, handler, plain "adapter" when the architectural term could be meant

**Call interpretation**:
What a call means for display: its effective display adapter, pending state, outcome, and grouping and summary identities. See [failure handling](docs/adapters.md#failure-handling).
_Avoid_: projection, call state, call view

**Generic fallback**:
A call shown with the generic display adapter although its tool has a display adapter. A _rejection_ is the display adapter refusing one update's input. A _failure_ is an error from the display adapter or its card. See [invalid and partial input](docs/renderers.md#invalid-and-partial-input) and [failure handling](docs/adapters.md#failure-handling).
_Avoid_: plain "fallback", which also names behaviour for missing host contracts

**Native observation**:
Facts that supplement Pi's published results, collected about a verified native tool call in a live TUI, RPC, print, or JSON session, such as shell previews, outcomes, and pre-write contents. See [observation](docs/recording.md#observation).
_Avoid_: capture, tracking

**Saved call**:
Facts recorded for one live call that Pi's own entries do not hold. See [recorded data and replay](docs/recording.md).
_Avoid_: persisted call, call metadata

**Saved output**:
Pi's temporary full-output file for a call, which an expanded card previews. See [saved-output previews](docs/presentation.md#saved-output-previews).
_Avoid_: saved call (a different concept), archive

### Transcript structure

**Exploration group**:
Adjacent exploration calls sharing one scope and title, shown under a single heading. See [groups](docs/presentation.md#groups).
_Avoid_: batch, cluster

**Run**:
A maximal sequence of this extension's calls between visible non-thinking boundaries. See [what a run is](docs/presentation.md#what-a-run-is).
_Avoid_: turn, batch, group

**Summary line**:
The single line that replaces an ended run in summary mode. See [summary mode](docs/presentation.md#summary-mode).
_Avoid_: collapsed run, summary card

**Row chrome**:
Everything the host draws around or instead of a call's card in its Pi row: the summary line, hidden members, joined margins, and collapse controls. See [opening and closing a run](docs/presentation.md#opening-and-closing-a-run).
_Avoid_: frame, decoration, shell
