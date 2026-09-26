# Pi compatibility

[pi-todo](../README.md)

## Contracts to verify

- [ ] [Activation](../src/runtime.ts) and [tool](../src/tool.ts): interactive TTY eligibility, model-facing schema, atomic mutations, and fully replayable result details; no custom tool renderers.
- [ ] [Tool-schema projection](../../../libs/src/tool-schema/README.md): serialized parameters preserve optional/nullable parent IDs and field limits without exposing runtime metadata or unsupported integer bounds; out-of-range parent IDs remain nonmutating domain errors.
- [ ] [Session state](../src/session-state.ts): branch/compaction reconstruction, malformed/error result handling, and bounded snapshots.
- [ ] [UI integration](../src/index.ts): widget/overlay lifecycle, remapped navigation, session cleanup, and independently owned working-message contributions.
- [ ] [Fullscreen paging](../../../libs/src/tui/responsive-custom-ui/README.md#fullscreen-input-ownership): `/todos` stays non-overlay at every size; list/detail paging leaves the transcript fixed only while focused. Unsupported routing warns once per opening without closing the view; arrow navigation and widget restoration still work.

## Limitations and replacement opportunities

- Revisit public todo-state, widget, and contribution APIs against current replay/ownership semantics. Shared [working-message composition](../../../libs/src/working-message/README.md#behavior) cannot prevent nonparticipants from overwriting the message; resolve that boundary in libs if upstream support appears.

## Validation

Use [package checks](../README.md#validation) and [interactive checks](validation.md), including the offline working-message fixture with other contributors, reload, new sessions, and regular/fullscreen modes.
