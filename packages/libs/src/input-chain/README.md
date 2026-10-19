# Input chain

[Library index](../../README.md#usage)

Pi passes input through `input` handlers in extension load order, so an extension that records input can see raw or expanded text depending on that order. `@pi-mono/libs/input-chain` runs the participants' observers and transforms in a fixed order from one participant's `input` handler.

## Behaviour

1. Observers run first, in participant ID order. Each one receives the input as it reached the chain, and Pi waits for it.
2. Transforms run next, in ascending rank. Each one receives the text and images from the previous transform.
3. A `transform` result replaces the text, and its images replace the images when it has any. A `handled` result ends the chain at once, as Pi's own chain does.
4. The chain returns `transform` when the text or images changed, otherwise `continue`. Pi then passes that result to later extensions.

Each callback receives a fresh event object and the context of the emission. An error in an observer or transform is [reported](../coordination/README.md#errors), and the chain continues with the previous text.

Every participant registers an `input` handler, and the first one in each emission runs the chain. The chain therefore runs at the first live participant's place among Pi's `input` handlers. Extensions that do not participate still run in load order around it. For liveness, order rules, and disposal, see the [coordinator protocol](../coordination/README.md).

After a [version mismatch](../coordination/README.md#version-mismatch), each participant's `input` handler runs only its own observers and transforms, so participants run in load order.

## Usage

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { joinInputChain } from "@pi-mono/libs/input-chain";

export default function snippetsExtension(pi: ExtensionAPI) {
  const input = joinInputChain(pi, { id: "example-snippets" });

  input.transform(150, (event) =>
    event.text.startsWith(";sig")
      ? { action: "transform", text: event.text.replace(";sig", "Regards, Ada") }
      : undefined
  );
}
```

## Recommended ranks

Leave gaps between ranks so that new participants can fit between existing ones. Each participant states its reasons in its own documentation.

| Participant       | Registration       |
| ----------------- | ------------------ |
| pi-prompt-manager | Observer           |
| pi-skills         | Transform at `100` |

## Caller responsibilities

- Join once during the extension factory, with a stable ID such as the package name.
- Register `input` behaviour only through the chain. A separate `input` handler still runs in load order.
- Return `handled` only when the input must not reach the agent; later transforms and extensions do not see it.
