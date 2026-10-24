# Private-file integration

[Library index](../../README.md#usage)

Extension records such as saved prompts must stay readable only by their owner, even when two Pi processes write them. [`@pi-mono/libs/private-files`](index.ts) enforces permissions and ACLs, resolves directory scopes, coordinates writers through locks, and replaces files atomically.

## Behaviour

- Directories use mode `0700` and files use mode `0600`.
- Reads may repair permissions and ACLs.
- Checks reject foreign ownership and final-path symlinks. Files also reject hard links and nonregular types.
- Native Windows has no POSIX owner IDs, so there the library trusts the user profile's inherited ACL instead, and refuses storage outside the profile. The [native Windows rules](transactions.md#native-windows) give the details.
- Replacement is atomic across process crashes, but power-loss durability is not guaranteed.
- Network filesystems and cross-machine coordination are unsupported.

| When you…                                                       | Read                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Choose a storage location or check platform support             | [Filesystem assumptions](transactions.md#filesystem-assumptions)           |
| Create a storage directory or derive a storage key              | [Scoped directories](transactions.md#scoped-directories)                   |
| Write a record, cancel writes, or interpret transaction results | [Serialised transactions](transactions.md#serialised-transactions)         |
| Need the Windows threat model                                   | [Windows storage decision](../../docs/adr/0001-windows-private-storage.md) |

## Usage

```ts
import { join } from "node:path";

import {
  PrivateFileTransactions,
  WriteLifetime,
  boundedRead,
  privateScopedDirectory
} from "@pi-mono/libs/private-files";

const maxBytes = 1024 * 1024;
const transactions = new PrivateFileTransactions();
const lifetime = new WriteLifetime();
const path = async () => {
  const scope = await privateScopedDirectory({ root: agentDir, namespace: "my-extension", key });
  return join(scope, "records.json");
};

// Buffer, or undefined when the file is missing. Validate it before use.
const raw = await boundedRead(await path(), maxBytes);

// "committed", "unchanged", or "failed", with cleanup errors reported separately.
const result = await transactions.run("records", {
  path,
  scope: lifetime,
  maxReadBytes: maxBytes,
  timeoutMs: 2000,
  update: (current) => ({ status: "replace", content: addRecord(current), value: undefined })
});

// On shutdown: abort, then wait for started writes and lock cleanup.
await lifetime.dispose();
```

## Caller responsibilities

- Translate raw OS exceptions before you display them, because they can expose paths. Only the library's [PrivateFileError diagnostics](errors.ts) use fixed messages.
- Define record schemas and storage policy in the consumer.
- Store records only in the locations that the [filesystem assumptions](transactions.md#filesystem-assumptions) allow.

### Mutation protocol

Mutate records through [serialised transactions](transactions.md#serialised-transactions), which state when not to retry a write.

Related: [pi-prompt-manager](../../../extensions/pi-prompt-manager/docs/storage.md) owns the saved-prompt schema, limits, and recovery on top of this library.

## Validation

Use the [package validation commands and prerequisites](../../README.md#validation) and [isolated storage platform checks](../../../extensions/pi-prompt-manager/docs/validation.md#storage-permissions-and-writes).
