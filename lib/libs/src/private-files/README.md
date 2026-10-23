# Private-file integration

[Library index](../../README.md#usage)

Extension records such as saved prompts must stay readable only by their owner, even when two Pi processes write them. [`@pi-mono/libs/private-files`](index.ts) enforces permissions and ACLs, resolves directory scopes, coordinates writers through locks, and replaces files atomically.

## Behaviour

Directories use mode `0700` and files use mode `0600`. Reads may repair permissions and ACLs. Checks reject foreign ownership and final-path symlinks. Files also reject hard links and nonregular types.

### Native Windows

Native Windows has no POSIX owner IDs. There, the library trusts the user profile's inherited ACL instead of the owner and permission checks. The check compares directory identities, not path text, so a mounted folder or a sibling that differs only in case is outside the profile. `privateScopedDirectory` refuses a directory outside the profile with `PrivateFileError` before it creates it. Checks still refuse final-path links and junctions, hard-linked files, and nonregular types, but they do not check owners, change permissions, or read ACLs. The [Windows storage decision](../../docs/adr/0001-windows-private-storage.md) gives the threat model.

## Caller responsibilities

- Translate raw OS exceptions before you display them, because they can expose paths. Only the library's [PrivateFileError diagnostics](errors.ts) use fixed messages.
- Define record schemas and storage policy in the consumer.

### Filesystem assumptions

Network filesystems and cross-machine coordination are unsupported.

- On Linux, macOS, or WSL, use trusted private parents on local storage with POSIX owner checks and enforced permissions.
- On native Windows, keep storage inside the user profile and on the profile's volume.
- Follow the [filesystem and scope requirements](transactions.md#filesystem-assumptions) before you store records.

### Mutation protocol

Mutate records through [serialised transactions](transactions.md#serialised-transactions), which state when not to retry a write.

## Validation

Use the [package validation commands and prerequisites](../../README.md#validation) and [isolated storage platform checks](../../../extensions/pi-prompt-manager/docs/validation.md#storage-permissions-and-writes).
