# Private-file integration

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/private-files`](index.ts) enforces permissions and ACLs, resolves directory scopes, coordinates writers through locks, and atomically replaces files.

Directories use `0700`, files `0600`; reads may repair permissions/ACLs. Checks reject foreign ownership and final-path symlinks; files also reject hard links and nonregular types.

## Caller responsibilities

Define record schemas and storage policy in the consumer. Translate raw OS exceptions before displaying them because they can expose paths. Only the library's [PrivateFileError diagnostics](errors.ts) use fixed messages.

### Filesystem assumptions

Use trusted private parents on local Linux, macOS, or WSL storage with POSIX owner checks and enforced permissions. Network filesystems and cross-machine coordination are unsupported. Follow the [filesystem and scope requirements](transactions.md#filesystem-assumptions) before storing records.

### Mutation protocol

Use [serialized transactions](transactions.md#serialized-transactions) or the [lower-level mutation protocol](transactions.md#mutation-protocol). Never retry a committed write solely because cleanup failed.

## Validation

Use the [package validation commands and prerequisites](../../README.md#validation) and [isolated storage platform checks](../../../extensions/pi-prompt-manager/docs/validation.md#storage-permissions-and-writes).
