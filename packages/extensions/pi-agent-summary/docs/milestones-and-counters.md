# Milestones and counters for extension authors

[pi-agent-summary](../README.md)

Another extension adds [milestones and counters](../GLOSSARY.md) to the active [run's summary](../GLOSSARY.md) by emitting on Pi's event bus.

If pi-agent-summary is not loaded, emits do nothing. For how they look in the summary, see [milestones](../README.md#milestones) and [counters](../README.md#counters).

## Milestones

To declare a milestone, emit `{ text }`:

```ts
pi.events.emit("pi-agent-summary:milestone", { text: "Published v1.2.0" });
```

- A milestone joins only the active run. Milestones declared before the first `agent_start`, or after pi-agent-summary clears the run in its `agent_settled` handler, are dropped.
- Text is trimmed and must have 1 to 200 characters; other payloads are ignored. Whitespace is collapsed for display, and long text wraps with a two-column indent.
- Repeated text in one run is kept once. A run keeps its first 20 milestones and drops the rest.

## Counters

Each emit adds 1 to the counter:

```ts
pi.events.emit("pi-agent-summary:counter", {
  id: "pi-subagents.delegated",
  verb: "delegated",
  singular: "task",
  plural: "tasks"
});
```

Workspace packages can import `counterChannel` and the `Counter` type from `pi-agent-summary/counters`.

- A counter adds only to the run that is active when it is emitted, with the same rule as milestones.
- Emits with the same `id` share one count. The labels of the first emit in the run stay.
- `id` must have 1 to 64 characters, and `verb`, `singular`, and `plural` must have 1 to 32 characters after trimming; other payloads are ignored.
- Segments follow the order of each counter's first emit. A run keeps its first 10 counters and ignores new ids after that.
