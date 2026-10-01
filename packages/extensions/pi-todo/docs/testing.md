# Todo coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

Maintainer coverage boundary: shared algorithms are tested in libs and utils (see the [workspace ownership rules](../../../../docs/agents/testing.md#ownership)). This package tests the todo graph and state policy, replay schemas, activation, task selection and presentation, and adapter wiring. Todo cards are tested in [tool display](../../pi-tool-display/docs/testing.md).

## Must not regress

- Mutations are atomic, and return complete replayable snapshots on both success and domain failure.
- A real call issued by the model can't find or change todos through nested execution. A direct model call saves a replayable snapshot.
- Over-limit snapshots are rejected, and replay falls back to the previous valid result.
- Widget and working-message cleanup keeps other contributors.

## Schema

- Model-facing parameters use the shared [tool-schema profile](../../../libs/src/tool-schema/README.md). Action and field types, strict keys, nullable parent IDs, and field and dependency limits are kept, without runtime metadata or integer bounds.
- Execution still rejects out-of-range parent IDs without changing state.
- Metadata preflight and replayable errors stay intact.
- Raw/domain fields and the bounded model view share [one input-contract owner](../src/tool-schema.ts). Recursive metadata parsing runs only after preflight; legacy replay keeps its separate budget policy.
- Being model-only is separate from interactive activation.

## Mutations

- Parameter arrays and metadata in snapshots are copied, not shared with the caller.
- The controller returns content and independent details, keeps reducer state private, and advances its presentation revision only for mutations or reconstruction.
- IDs advance only on creation. `clear` resets state.
- Deleted tasks remain as tombstones. Completed tasks can't reopen.

## Hierarchy and dependencies

- Hierarchy, status, and dependencies are independent.
- Reparenting moves whole subtrees, keeping their order.
- Cycles and excessive depth are rejected. Deleting a task with live descendants is refused.
- Dependency updates validate their own graph.

## Limits

- Field, dependency, metadata, task-count, and serialised-state limits apply to inputs and results. This includes versioned state after replay sanitisation expands tabs in descriptions.
- Result overhead is bounded separately, so emitted snapshots stay replayable.
- Metadata copies stay independent, keep literal keys, and serialise without losing values or changing prototypes.

## Replay

- Replay picks the latest valid result on the branch, and skips malformed snapshots and host errors.
- Version 2 keeps its nested structure. Only bounded older flat formats are accepted.
- Oversized legacy state stays readable, without allowing new over-limit state or dropping hierarchy.

## Output

- Model-facing lists are bounded, but always include the first task line, even if it's oversized. Details keep the complete snapshot.
- Compact fields shown in the terminal are sanitised without flattening descriptions.
- Legacy display excerpts keep complete graphemes at their code-point limits without changing stored text or model-facing results.

## Activation and UI

- The extension activates only for interactive TTY CLI sessions, using Pi's parsed arguments so option values aren't mistaken for mode or informational flags.
- Session and branch changes rebuild state and widget settings, without effects from stale callbacks.
- Commands and tool execution share one controller, with no renderer registration or separate persistence.
- Forced **Tab** completes `/todos` arguments with or without leading whitespace, while other commands keep Pi's file-completion behaviour.
- Widget collapse and suppression have a lifetime independent of working-message activity.
- Regular-mode clicks leave the fullscreen collapse preference unchanged.
- Within the widget's space, complete active paths come first and context is kept. Obsolete widget factories are ignored.
- One revision-keyed prepared snapshot supplies widget rows and activity. Rows respond to width, collapse and mode changes; theme invalidation discards styled rows without rebuilding the hierarchy.
- List and detail layouts fit short terminals, including the separator before footer hints.
- The regular-mode overlay preserves the view's controls without a second height limit.
- The read-only browser navigates hierarchy snapshots and respects configured controls. **Ctrl+C** is reserved, and the browser owns only the paging input it actually uses. Closing or cancelling releases suppression exactly once.

## Not covered here

- Full snapshots of shared tree and layout output, and Pi's session persistence internals.
- Cache identity and private refresh counts, unless they prove bounded work or a visible stale-state bug.

Keep the replay tests for documented older formats.
