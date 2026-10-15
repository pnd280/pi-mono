# Private-file storage and transactions

[Private-file integration](README.md)

## Filesystem assumptions

Final-descriptor checks cannot secure untrusted parents. Create or validate storage directories with [`privateScopedDirectory`](#scoped-directories) under a trusted root that already exists. It does not create the root.

Use [`boundedRead`](privacy.ts) to read file contents. It returns `undefined` for a missing file and rejects unsafe files or input above the byte limit. Choose the byte limit and validate the contents.

## Scoped directories

Use [`resolveDirectoryScope`](scoped-directory.ts) for a canonical directory storage key; symlink aliases share it. `privateScopedDirectory({ root, namespace, key })` creates or validates a scope under a trusted root. The root may be a symlink, but the namespace and key directories may not. Namespace and key must be single path components. Choose the namespace and collection filenames.

## Serialised transactions

[`PrivateFileTransactions`](transaction.ts) serialises by key, locks, reads bounded latest bytes, and applies updates. Within a consumer, mutations of one file must share one instance and key. Cooperating instances and processes share `<path>.lock`. Acquisition never reclaims an existing lock; the consumer handles abandoned-lock recovery.

Supply a `path()` resolver that establishes trusted private parents, a `maxReadBytes` read limit, a contention `timeoutMs`, and `update(raw)`. Missing files give `undefined`. Validate schema, identity, and capacity, and return `unchanged` or `replace` with a result. Only `replace` writes.

Use [`WriteLifetime`](lifetime.ts) for `scope`. `dispose()` aborts its signal and waits for started atomic writes and lock cleanup, not resolution, reads, or `update`. Cancellation is checked before replacement. Long callbacks should observe the signal cooperatively. A custom `WriteScope` must check cancellation synchronously before invoking its atomic callback and track the entire returned promise.

Results distinguish `committed`, `unchanged`, and `failed`. Write warnings and lock-cleanup errors are reported separately. Translate errors and warnings in the consumer; never retry solely because cleanup failed after a commit.

Replacement is atomic across process crashes. Power-loss durability is not guaranteed because the containing directory is not fsynced.
