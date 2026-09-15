# Private-file integration

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/private-files`](index.ts) enforces permissions and ACLs, resolves directory scopes, coordinates writers through file locks, and atomically replaces files.

Directories use `0700`, and regular files use `0600`. Permission and ACL repair can occur during reads. Private directory and file checks reject paths belonging to another user and final-path symlinks. File checks also reject hard-linked and nonregular files.

## Caller responsibilities

Define record schemas and storage policy in the consumer. Translate raw OS exceptions before displaying them because they can expose paths. Only the library's [PrivateFileError diagnostics](errors.ts) use fixed messages.

### Filesystem assumptions

Use caller-managed paths under trusted private parent directories. Storage must be on a local Linux, macOS, or WSL filesystem that supports POSIX file-owner checks and enforces permissions. Checks on the final file or directory descriptor do not make untrusted parent directories safe. Network filesystems and cross-machine coordination are unsupported.

Create or validate each caller-managed directory with [`privateDirectory`](privacy.ts). The parent must already exist and be trusted. `privateDirectory` does not create parents recursively.

Use [`boundedRead`](privacy.ts) to read file contents. It closes its handle, returns `undefined` for a missing file, and rejects unsafe files or input above the byte limit. Choose the byte limit and validate the contents. When using `privateOpen` directly, close the returned handle in `finally`.

### Scoped directories

Use [`resolveDirectoryScope`](scoped-directory.ts) to canonicalize a directory and derive a SHA-256 storage key. Symlink aliases share the same key. Different real paths do not.

`privateScopedDirectory({ root, namespace, key })` resolves the trusted root, then creates or validates `<root>/<namespace>/<key>`. The root may be a symlink, but its namespace and key directories may not. `namespace` and `key` must be single path components. Check platform support and choose the namespace and collection filenames.

### Serialized transactions

Use [`PrivateFileTransactions`](transaction.ts) to serialize mutations by key. Each transaction acquires a file lock, reads the latest bytes within a size limit, and applies the caller's update. Within a consumer, all mutations of one file must use the same instance and key. Cooperating instances and processes also coordinate through `<path>.lock`.

Supply a path resolver that establishes trusted private parents, a read limit, a contention timeout, and an `update(raw)` callback. The callback validates schema, identity, and capacity, then returns `unchanged` or `replace` with a result value. `raw` is `undefined` when the file is missing. Only `replace` results write bytes.

Provide a [`WriteLifetime`](lifetime.ts) as the transaction's `scope`. Its `dispose()` aborts the scope's signal and waits for atomic writes already in progress, including their lock cleanup.

Disposal neither interrupts nor waits for path resolution, reads, or `update` callbacks. The transaction checks cancellation before starting a replacement. Make long-running callbacks observe the signal when they can stop cooperatively.

A custom `WriteScope` must check cancellation synchronously before invoking its atomic callback and track the entire returned promise.

Results distinguish `committed`, `unchanged`, and `failed`. Committed results include atomic-write warnings. Every result includes separate lock-cleanup errors.

Translate errors and warnings in the consumer. Never retry solely because cleanup failed after a commit. To use the lower-level APIs with other storage formats or coordination needs, follow the [mutation protocol](#mutation-protocol).

### Mutation protocol

1. Establish the trusted parent directories.
2. Acquire an [exclusive lock](lock.ts) with a cancellation signal and contention deadline. All writers of a file must use the same lock path. Acquisition never reclaims existing locks. The caller handles abandoned-lock recovery.
3. Read the latest document under that lock, enforcing the byte limit. Apply the consumer's schema, identity, and capacity checks.
4. Check cancellation before calling [atomicReplace](atomic.ts). Once started, let it finish. The rename commits the write. Errors before rename throw. Failures afterward return warnings. Report those warnings without retrying the committed mutation.
5. Release the acquired lock exactly once in cleanup. If release fails, report it separately without changing the write outcome. Prompt manager's [repository](../../../extensions/pi-prompt-manager/src/storage/repository.ts) keeps these outcomes separate.

Replacement is atomic across process crashes. Power-loss durability is not guaranteed because the containing directory is not fsynced.

## Validation

Use the [package validation commands and prerequisites](../../README.md#validation) and [isolated storage platform checks](../../../extensions/pi-prompt-manager/docs/validation.md#storage-permissions-and-writes).
