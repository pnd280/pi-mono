# pi-utils

Pure utilities shared by workspace packages. `pi-utils/fff-tools` classifies official `@ff-labs/pi-fff` ownership and recognized tool aliases for `pi-fff-guard` and `pi-tool-display`.

```ts
import { fffAdapter } from "pi-utils/fff-tools";

const kind = fffAdapter(toolInfo); // "find", "grep", "multi", or undefined
```

The helper checks provenance and names only. Consumers validate their own schemas and apply display or blocking policy. Built-in/SDK provenance and lookalike owners are not official FFF ownership.

There is no configuration, environment dependency, filesystem access, persistence, or network access.

Use the [focused validation commands](../../docs/development.md#focused-validation) with `pi-utils`; verify both extension consumers when changing classification.
