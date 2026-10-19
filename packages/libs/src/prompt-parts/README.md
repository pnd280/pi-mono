# Prompt parts

[Library index](../../README.md#usage)

Extensions that append to the system prompt in `before_agent_start` add their text in extension load order. `@pi-mono/libs/prompt-parts` appends the participants' parts in a fixed rank order from one participant's `before_agent_start` handler.

## Behaviour

1. The first participant handler of a run waits until every live participant's hold settles, including holds added while it waits. A rejected hold only ends the wait.
2. It calls each part in ascending rank with the context and the event, and skips `undefined` and empty results.
3. It appends the texts to `event.systemPromptOptions.appendSystemPrompt` once for the run, joined with a blank line. Text that Pi, `--append-system-prompt`, or earlier handlers put there stays first.

A part that throws is [reported](../coordination/README.md#errors), and the other parts are still appended. A hold that never settles delays the run, as an awaited handler would. When a `before_agent_start` handler returns `systemPrompt`, Pi uses that prompt for the run and ignores `appendSystemPrompt`, so no part reaches the model.

Every participant registers a `before_agent_start` handler, and the first one in each run appends the parts. The parts therefore arrive at the first live participant's place among Pi's `before_agent_start` handlers. Participants can keep their own `before_agent_start` handlers for other work. For liveness, order rules, and disposal, see the [coordinator protocol](../coordination/README.md).

After a [version mismatch](../coordination/README.md#version-mismatch), each participant's handler waits only for its own holds and appends only its own parts, so parts follow load order.

## Usage

```ts
import { readFile } from "node:fs/promises";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { joinPromptParts } from "@pi-mono/libs/prompt-parts";

export default function styleExtension(pi: ExtensionAPI) {
  const prompt = joinPromptParts(pi, { id: "example-style" });
  let style: string | undefined;

  prompt.part(300, () => style);
  pi.registerCommand("style", {
    description: "Append a file's text to the system prompt",
    handler: async (path) => {
      const loading = readFile(path, "utf8").then((text) => {
        style = text.trim();
      });
      // A run that starts now waits for the file, so it gets the new text.
      prompt.hold(loading);
      await loading;
    }
  });
}
```

## Recommended ranks

Each participant states its reasons in its own documentation.

| Participant     | Rank  |
| --------------- | ----- |
| pi-model-prompt | `100` |
| pi-profiles     | `200` |

## Caller responsibilities

- Join once during the extension factory, with a stable ID such as the package name.
- Return only your own text from a part. The coordinator adds the separator and keeps existing text.
- Hold work that must finish before the prompt is built, such as a model or profile switch. Handle the held promise's errors yourself.
- Keep parts synchronous and fast; they run once per run.
