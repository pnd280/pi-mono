# Private-file integration

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/private-files`](index.ts) enforces permissions and ACLs, resolves directory scopes, coordinates writers through locks, and atomically replaces files.

Directories use `0700`, files `0600`; reads may repair permissions/ACLs. Checks reject foreign ownership and final-path symlinks; files also reject hard links and nonregular types.

## Caller responsibilities

Define record schemas and storage policy in the consumer. Translate raw OS exceptions before displaying them because they can expose paths. Only the library's [PrivateFileError diagnostics](errors.ts) use fixed messages.

### Filesystem assumptions

Use trusted private parents on local Linux, macOS, or WSL storage with POSIX owner checks and enforced permissions. Final-descriptor checks cannot secure untrusted parents. Network filesystems/cross-machine coordination are unsupported.

Create or validate each caller-managed directory with [`privateDirectory`](privacy.ts). The parent must already exist and be trusted. `privateDirectory` does not create parents recursively.

Use [`boundedRead`](privacy.ts) to read file contents. It returns `undefined` for a missing file and rejects unsafe files or input above the byte limit. Choose the byte limit and validate the contents. When using `privateOpen` directly, close the returned handle in `finally`.

### Scoped directories

Use [`resolveDirectoryScope`](scoped-directory.ts) for a canonical directory storage key; symlink aliases share it.

`privateScopedDirectory({ root, namespace, key })` creates or validates a scope under a trusted root. The root may be a symlink, but namespace/key directories may not; namespace and key must be single path components. Choose the namespace and collection filenames.

### Serialized transactions

[`PrivateFileTransactions`](transaction.ts) serializes by key, locks, reads bounded latest bytes, and applies updates. Within a consumer, mutations of one file must share an instance/key; cooperating instances/processes share `<path>.lock`.

Supply a resolver establishing trusted private parents, read limit, contention timeout, and `update(raw)`. Missing files give `undefined`. Validate schema/identity/capacity and return `unchanged` or `replace` with a result; only `replace` writes.

Use [`WriteLifetime`](lifetime.ts) for `scope`. `dispose()` aborts its signal and waits for started atomic writes/lock cleanup, not resolution, reads, or `update`. Cancellation is checked before replacement; long callbacks should observe the signal cooperatively.

A custom `WriteScope` must check cancellation synchronously before invoking its atomic callback and track the entire returned promise.

Results distinguish `committed`, `unchanged`, and `failed`, with write warnings and lock-cleanup errors reported separately.

Translate errors and warnings in the consumer. Never retry solely because cleanup failed after a commit. To use the lower-level APIs with other storage formats or coordination needs, follow the [mutation protocol](#mutation-protocol).

### Mutation protocol

1. Establish the trusted parent directories.
2. Acquire an [exclusive lock](lock.ts) with a cancellation signal and contention deadline. All writers of a file must use the same lock path. Acquisition never reclaims existing locks. The caller handles abandoned-lock recovery.
3. Read the latest document under that lock, enforcing the byte limit. Apply the consumer's schema, identity, and capacity checks.
4. Check cancellation before [atomicReplace](atomic.ts); let started writes finish. Rename commits: earlier errors throw, later failures warn. Report warnings without retrying.
5. Release the lock exactly once in cleanup; report release errors separately without changing the write outcome, as in prompt manager's [repository](../../../extensions/pi-prompt-manager/src/storage/repository.ts).

Replacement is atomic across process crashes. Power-loss durability is not guaranteed because the containing directory is not fsynced.

## Validation

Use the [package validation commands and prerequisites](../../README.md#validation) and [isolated storage platform checks](../../../extensions/pi-prompt-manager/docs/validation.md#storage-permissions-and-writes).
