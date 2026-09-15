# @pi-mono/utils

Pure utilities shared by workspace packages. `@pi-mono/utils/fff-tools` classifies official `@ff-labs/pi-fff` ownership and recognized tool aliases for `pi-fff-guard` and `pi-tool-display`.

```ts
import { fffAdapter } from "@pi-mono/utils/fff-tools";

const kind = fffAdapter(toolInfo); // "find", "grep", "multi", or undefined
```

The helper checks provenance and names only. Consumers validate their own schemas and apply display or blocking policy. Built-in/SDK provenance and lookalike owners are not official FFF ownership.

`@pi-mono/utils/terminal-text` exports `displayText(text)` for `pi-tool-display` and `pi-prompt-manager`. It removes recognized terminal sequences and residual C0/C1 controls, normalizes CR/CRLF to LF, and expands tabs to four spaces without changing the source string. Apply trusted styling afterward. It imports Pi TUI through a peer contract. Specialized styled-output filtering remains in tool display; restoration refusal and clipboard policy remain in prompt manager.

```ts
import { displayText } from "@pi-mono/utils/terminal-text";

const plain = displayText(untrustedText);
```

There is no configuration, filesystem access, persistence, or network access.

Use the [focused validation commands](../../docs/development.md#focused-validation) with `@pi-mono/utils`.
