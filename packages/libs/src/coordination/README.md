# Coordinator protocol

[Library index](../../README.md#usage)

Pi runs extension handlers in load order, so extensions that share an event can get different results when users install them in a different order. The coordinators in this package remove that dependency for the [input chain](../input-chain/README.md), [prompt parts](../prompt-parts/README.md), [lifecycle](../lifecycle/README.md), and [working message](../working-message/README.md). Callers start from those READMEs; the rules below apply to all four.

## Rendezvous

- Participants join during the extension factory. Each join sends a callback on the coordinator's own channel of `pi.events`, Pi's event bus for the runtime.
- The first participant of a protocol version creates the shared state, and later participants of that version join it. Every participant answers on the channel, so the state stays reachable while any participant that joined it remains.
- Each participant registers the coordinator's Pi handlers through its own `pi`. For shared work, the first participant handler of an emission works for every participant, and the other participant handlers of that emission do nothing.
- Pi removes a runtime's bus subscriptions when the runtime ends and runs the factories again, so `/reload` and session replacement start a new coordinator.

## Order and liveness

- Callbacks run in ascending rank. Equal ranks run in participant ID order, and then in registration order within the participant. Join and load order never decide.
- A participant becomes live when its own `session_start` handler runs. Only callbacks of live participants run.
- Pi runs no handler of an extension whose factory failed, or of an extension that the loader leaves out after its factory ran. Neither extension becomes live, so neither changes the result for live participants.
- Participant IDs start with a letter or digit, use only letters, digits, and `._:/-`, and have up to 200 characters. When a second live participant has the same ID, its `session_start` handler throws, and no participant with that ID takes part.
- Each registration returns a function that removes it. A removed callback does not run, also when another callback removed it earlier in the same dispatch. Other participants keep their registrations.

## Errors

Pi reports a handler error only for the extension that registered the handler. A coordinator runs other participants' callbacks inside one participant's handler, so it catches each callback error, continues the chain, and reports `<participant>: <callback> failed: <message>`. With a UI, the report is an error notification; without one, it goes to standard error. Pi's own error output, such as the RPC `extension_error` event, does not include these reports.

## Version mismatch

The join callback receives an envelope with the protocol version, the shared state, and callbacks that tell whether a participant of that version is live and has warned. The envelope's shape never changes, so copies of this library from different releases still find each other.

- Each protocol version has its own coordinator.
- A coordinator stops shared work while a live participant uses another version. Participants that never become live do not stop it.
- The first participant that becomes live while another version is live warns once for the runtime.
- Without shared work, each participant does only its own work in its own handlers, at its place in Pi's load order. Each coordinator's README states what changes.

Increase a coordinator's protocol version whenever the shape or behaviour of its shared state changes.
