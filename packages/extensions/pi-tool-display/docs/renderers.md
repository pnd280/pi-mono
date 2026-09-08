# Renderer integration

Spread the display renderers after your custom/MCP tool or SDK definition to preserve its execution, schema, and metadata:

```ts
import { createToolDisplayRenderers } from "pi-tool-display/renderers";

pi.registerTool({
  ...original,
  ...createToolDisplayRenderers(original.name, "invocation"),
});
```

Use `"invocation"` for arbitrary argument/result shapes. Specialized families expect Pi-compatible [arguments](../src/presentation.ts) and [result details](../src/renderers.ts).

SDK hosts must use this factory: the [CLI-only default extension](../src/builtins.ts) cannot recover custom execution definitions or in-memory settings.
