# @pi-mono/utils

Workspace extensions and libraries need common transformations for source text, paths, and patches without file access or shared state. For example, `parsePatch` validates a unified patch and returns its hunks:

```ts
import { parsePatch } from "@pi-mono/utils/patch";

const patch = parsePatch("@@ -1 +1 @@\n-old\n+new\n", 1024);
console.log(patch?.hunks.length); // 1
```

Callers supply inputs and policy: the helpers do not read files, resolve symlinks, or decide what to block.

## Usage

Choose the [exported module](package.json) for your task:

- File and display text: [patches](src/patch.ts), [output notices](src/output-text.ts), [UTF-8 windows](src/utf8.ts).
- Discovery: [FFF provenance](src/fff-tools.ts), [search scopes](src/search-scopes.ts), [lexical paths](src/paths.ts).
- Commands: [POSIX argument quoting](src/shell.ts).
- Model settings: [`provider/model-id` references](src/model-reference.ts), [thinking levels](src/thinking-levels.ts).
- Subagent results: [task envelopes](src/task-envelope.ts) format task and job results and extract their bodies.

| When you…                                         | Read                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Call a helper                                     | Its [caller boundaries](docs/caller-boundaries.md): inputs, failure results, and the duties that stay with the caller     |
| Sanitise terminal text or normalise shortcut keys | [Terminal text](../libs/src/tui/terminal-text/README.md) and [keybindings](../libs/src/tui/keybindings/README.md) in libs |
