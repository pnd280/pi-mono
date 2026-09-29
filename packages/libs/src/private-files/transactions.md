# Private-file storage and transactions

[Private-file integration](README.md)

## Filesystem assumptions

Final-descriptor checks cannot secure untrusted parents. Create or validate each caller-managed directory with [`privateDirectory`](privacy.ts); the parent must already exist and be trusted. It does not create parents recursively.

Use [`boundedRead`](privacy.ts) to read file contents. It returns `undefined` for a missing file and rejects unsafe files or input above the byte limit. Choose the byte limit and validate the contents. When using `privateOpen` directly, close the returned handle in `finally`.

## Scoped directories

Use [`resolveDirectoryScope`](scoped-directory.ts) for a canonical directory storage key; symlink aliases share it. `privateScopedDirectory({ root, namespace, key })` creates or validates a scope under a trusted root. The root may be a symlink, but namespace/key directories may not; namespace and key must be single path components. Choose the namespace and collection filenames.

## Serialized transactions

[`PrivateFileTransactions`](transaction.ts) serializes by key, locks, reads bounded latest bytes, and applies updates. Within a consumer, mutations of one file must share an instance/key; cooperating instances/processes share `<path>.lock`.

Supply a resolver establishing trusted private parents, read limit, contention timeout, and `update(raw)`. Missing files give `undefined`. Validate schema, identity, and capacity and return `unchanged` or `replace` with a result; only `replace` writes.

Use [`WriteLifetime`](lifetime.ts) for `scope`. `dispose()` aborts its signal and waits for started atomic writes and lock cleanup, not resolution, reads, or `update`. Cancellation is checked before replacement; long callbacks should observe the signal cooperatively. A custom `WriteScope` must check cancellation synchronously before invoking its atomic callback and track the entire returned promise.

Results distinguish `committed`, `unchanged`, and `failed`, with write warnings and lock-cleanup errors reported separately. Translate errors and warnings in the consumer; never retry solely because cleanup failed after a commit.

## Mutation protocol

For other storage formats or coordination needs, use the lower-level APIs in this order:

1. Establish the trusted parent directories.
2. Acquire an [exclusive lock](lock.ts) with a cancellation signal and contention deadline. All writers of a file must use the same lock path. Acquisition never reclaims existing locks; the caller handles abandoned-lock recovery.
3. Read the latest document under that lock, enforcing the byte limit. Apply the consumer's schema, identity, and capacity checks.
4. Check cancellation before [atomicReplace](atomic.ts); let started writes finish. Rename commits: earlier errors throw, later failures warn. Report warnings without retrying.
5. Release the lock exactly once in cleanup; report release errors separately without changing the write outcome, as in prompt manager's [repository](../../../extensions/pi-prompt-manager/src/storage/repository.ts).

Replacement is atomic across process crashes. Power-loss durability is not guaranteed because the containing directory is not fsynced.
