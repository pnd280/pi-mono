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

**Generic fallback**:
A call shown with the generic display adapter although its tool has a display adapter. A _rejection_ refuses one update's input and is checked again on the next update; a _failure_ is an error from the display adapter or its card, and lasts while the call keeps that display adapter.
_Avoid_: plain "fallback", which also names behaviour for missing host contracts

**Native observation**:
Facts collected about a verified native tool call in a live TUI, RPC, print, or JSON session, such as shell previews, timing, outcomes, and pre-write contents. Supplements Pi's published results; never replaces them.
_Avoid_: capture, tracking

**Local details**:
Observed call data that stays on the machine that observed it: timing, saved-output references, and diagnostics. Session entries keep the portable facts.
_Avoid_: metadata, telemetry

**Writer**:
One collection lifetime within a session, ending at reload, session change, or shutdown. Its writer entry identifies the local file for saved call facts and results that follow it.
_Avoid_: process, store

**Saved call**:
Recorded facts for one live call that Pi's entries do not hold: at most one call entry on the branch and one local line from its writer. Disposal saves the facts known for unfinished calls. Replay applies them only to the matching historical call.
_Avoid_: persisted call, call metadata

**Saved output**:
Pi's temporary full-output file for a call, which an expanded card previews. This extension never stores or archives it.
_Avoid_: saved call (a different concept), archive

### Transcript structure

**Exploration group**:
Adjacent exploration calls sharing one scope and title, shown under a single heading. Thinking may split a group.
_Avoid_: batch, cluster

**Run**:
A maximal sequence of this extension's calls between visible non-thinking boundaries. Thinking never splits or ends a run.
_Avoid_: turn, batch, group

**Summary line**:
The single line that replaces an ended run in summary mode. An opened run keeps it as its header.
_Avoid_: collapsed run, summary card

**Row chrome**:
Everything the host draws around or instead of a call's card in its Pi row: the summary line, hidden members, joined margins, and collapse controls placed after images.
_Avoid_: frame, decoration, shell
