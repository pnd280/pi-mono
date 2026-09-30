# Todo coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

## Contracts

- Model-facing parameters use the shared [tool-schema profile](../../../libs/src/tool-schema/README.md), preserving action/field types, strict keys, nullable parent IDs, and field/dependency limits without runtime metadata or integer bounds. Execution still rejects out-of-range parent IDs without changing state; metadata preflight and replayable errors remain intact.
- The tool is model-only: a real issued call cannot find or mutate todos through nested execution, while a direct model call persists a replayable snapshot. Interactive activation remains separate from exposure.
- Mutations are atomic and return complete replayable snapshots on success and domain failure, including parameter arrays and metadata detached from caller-owned values. IDs advance only on creation; clear resets state; deleted tasks remain tombstones and completed tasks cannot reopen.
- Hierarchy, status, and dependencies are independent. Reparent complete subtrees without losing order, reject cycles/depth overflow, and refuse deletion with live descendants. Dependency updates validate their own graph.
- Field, dependency, metadata, task-count, and serialized-state limits apply to inputs and results, including versioned state after replay sanitization expands description tabs. Reject over-limit snapshots and fall back to the previous valid result. Bound result overhead separately so emitted snapshots remain replayable. Metadata copies remain independent, retain literal keys, and serialize without value loss or prototype mutation.
- Replay selects the latest valid branch result, skips malformed/host-error snapshots, preserves version-2 forests, and accepts only bounded older flat formats. Oversized legacy state stays readable without permitting new over-limit state or dropping hierarchy.
- Model-facing lists are bounded but always include the first task line, even if oversized; details retain the complete snapshot. Terminal-facing compact fields are sanitized without flattening descriptions.
- Activate only for interactive TTY CLI sessions; session/branch changes rebuild state and widget settings without effects from stale callbacks. Commands and tool execution share the controller without renderer registration or separate persistence.
- Widget collapse/suppression and working-message activity have independent lifetimes; cleanup must preserve other contributors. Prioritize complete active paths within the widget budget, preserve context, and ignore obsolete widget factories.
- The read-only browser navigates hierarchy snapshots, respects configured controls, reserves Ctrl+C, and owns only its effective paging input. Closing/cancelling releases suppression once.

## Coverage boundaries

This package owns todo graph/state policy, replay schemas, activation, task selection/presentation, and adapter wiring. [Libraries](../../../libs/docs/testing.md) own schema projection, terminal sanitization, tree rails, low-level key normalization, custom-UI mounting/focus routing, and shared working messages. [Tool display](../../pi-tool-display/docs/testing.md) owns todo cards.

## Exclusions

Do not repeat full shared tree/layout snapshots or test Pi session persistence internals. Retain replay tests for documented older formats. Cache identity and private refresh counts are not contracts unless they establish bounded work or a visible stale-state defect.
