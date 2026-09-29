# Private-file integration

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/private-files`](index.ts) enforces permissions and ACLs, resolves directory scopes, coordinates writers through locks, and atomically replaces files.

Directories use `0700`, files `0600`; reads may repair permissions/ACLs. Checks reject foreign ownership and final-path symlinks; files also reject hard links and nonregular types.

## Caller responsibilities

Define record schemas and storage policy in the consumer. Translate raw OS exceptions before displaying them because they can expose paths. Only the library's [PrivateFileError diagnostics](errors.ts) use fixed messages.

Use trusted private parents on local Linux, macOS, or WSL storage with POSIX owner checks and enforced permissions. Network filesystems and cross-machine coordination are unsupported. Before storing records, read the applicable [filesystem, scope, and transaction guidance](transactions.md).

### Filesystem assumptions

If callers manage parent directories or follow symlinks, read the [filesystem assumptions](transactions.md#filesystem-assumptions).

### Serialized transactions

If multiple writers update a record, use the [serialized transaction guidance](transactions.md#serialized-transactions). Never retry a committed write solely because cleanup failed.

### Mutation protocol

If using lower-level storage APIs instead of `PrivateFileTransactions`, follow the [mutation protocol](transactions.md#mutation-protocol).

## Validation

Use the [package validation commands and prerequisites](../../README.md#validation) and [isolated storage platform checks](../../../extensions/pi-prompt-manager/docs/validation.md#storage-permissions-and-writes).
