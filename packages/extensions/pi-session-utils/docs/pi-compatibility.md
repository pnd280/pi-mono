# Pi compatibility for maintainers

[pi-session-utils](../README.md)

> Last verified against Pi 1.2.0 (package checks and offline tests, including API and process startup, persistence, the naming lifecycle, virtual-model requests routed to physical limits below and above the title budget, and offline payload probes for per-level sampling through physical and virtual title models; no runtime changes needed). Not covered: title quality with live providers, and manual checks of the session picker.

## Upgrade procedure

1. Run the [package checks](../README.md#validation). Model requests use offline fixture providers. The [coverage specification](testing.md) lists the unit, runtime, and installed-process checks for startup hooks, session replacement, naming, and clean protocol output.
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

Session replacement must preserve saved data and parent links while giving naming callbacks a fresh context.

### Persistence

[Persistence](../src/persist.ts):

- [ ] `SessionManager.create()` provides a new header and path.
- [ ] `getBranch()` keeps the order of the active path.
- [ ] Pi can reopen the resulting JSONL and keep appending to it.
- [ ] `getSessionName()` reads the latest session-wide metadata, including an explicit clear, regardless of the active branch. That name, and any existing `parentSession`, are kept.

### Commands

[Commands](../src/commands.ts):

- [ ] `isIdle()` reports active runs and other busy states, so persistence and child creation can reject them at once.
- [ ] Naming stays independent of idle checks and session-operation locking.
- [ ] `switchSession()` and `newSession({ parentSession })` supply a fresh `withSession` context, and report cancellation before replacement.
- [ ] `newSession()` leaves out the parent's conversation and name.

### Startup hook

[Startup hook](../src/startup.ts):

- [ ] Pi and extension imports share the `SessionManager` prototype.
- [ ] CLI flag values aren't available while extension factories run.
- [ ] The first `buildSessionContext()` runs after flags are filled in, but before JSON headers, extension binding, or prompts.
- [ ] `getHeader()` returns the live, writable header before a new session file is written.
- [ ] Pi turns failures while building the startup context into nonzero exits.
- [ ] The one-shot hook is restored before forwarding or throwing. Reload and replacement don't apply the CLI flag again.

### Parent lookup

[Parent lookup](../src/parent.ts):

- [ ] Default session groups are still under `getAgentDir()/sessions/`.
- [ ] Headers identify exact IDs and the session cwd.
- [ ] Lookup never triggers migration or modifies parents.

### Generation

[Generation](../src/auto-title/generate.ts):

- [ ] Registry normalisation, authentication, supported thinking levels, complete responses, safe errors, and bounded request and cache defaults.
- [ ] Pi applies the title model's `samplingParamsByThinkingLevel` using its effective physical level, including `off`. The extension leaves sampling selection to the registry and keeps its token budget, disabled cache retention, and no-retry policy.
- [ ] The configured model is validated, with no fallback and no retries.
- [ ] `MODEL_THINKING_LEVELS` from `@earendil-works/pi-ai/providers/model-schema` lists every level that the `thinkingLevel` setting accepts, including `off`, and matches the levels in the [README](../README.md#configuration).
- [ ] A virtual model's unknown output limit never becomes a zero-token request. The extension supplies the 1,024-token title budget, registry dispatch caps it to the routed physical model, and any smaller known limit is kept.

### Naming

- [ ] [Naming lifecycle](../src/auto-title/runtime.ts): one automatic attempt; cancellation on branch change, session change, and reload; manual and external name changes; and stale results discarded.
- [ ] [Naming adapter](../src/auto-title/index.ts): naming events and metadata-only updates work in TUI, print, JSON, and RPC modes, with no conversation messages or custom stdout.
- [ ] Persistence and child creation replace sessions without leaking old naming callbacks.

## Limitations

These limits come from current Pi behaviour. Recheck each one when Pi changes the behaviour it describes.

### Startup parent

Pi has no public way to set the parent at startup, so the CLI flag uses a scoped prototype hook and changes the live header. If Pi adds an API for startup session options, use it, while still rejecting resumed or non-empty sessions and failing before any model request.

### Option order

Pi resolves its built-in session-selection options before extensions load. A conflicting option may open or migrate a session, or show the `--resume` picker, before the extension rejects it.

### Custom directories

In-memory session managers don't remember a custom directory. `/sesh persist` uses the default directory. Parent ID lookup can also use directory overrides from the CLI or the environment.

### Copying JSONL

If Pi adds a public API to save in-memory sessions, use it instead of copying JSONL. Keep the branch state, the current session-wide name, lineage, and cleanup after a cancelled switch.

### Cancellation

[Authentication and providers may ignore cancellation](../src/auto-title/generate.ts). Revisit request cancellation before simplifying the outer deadline, and keep bounded waiting and stale-result protection.

### Naming APIs

Compare any new naming APIs with the [source selection and naming policy](../README.md#automatic-session-names). Adopting one must keep the text limits, the explicit model choice, and the request side effects.
