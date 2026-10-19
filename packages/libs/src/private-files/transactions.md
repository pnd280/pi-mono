# Private-file storage and transactions

[Private-file integration](README.md)

## Filesystem assumptions

Final-descriptor checks cannot secure untrusted parents. Create or validate storage directories with [`privateScopedDirectory`](#scoped-directories) under a trusted root that already exists. It does not create the root.

Use [`boundedRead`](privacy.ts) to read file contents. It returns `undefined` for a missing file and rejects unsafe files or input above the byte limit. Choose the byte limit and validate the contents.

## Scoped directories

Use [`resolveDirectoryScope`](scoped-directory.ts) for a canonical directory storage key; symlink aliases share it. `privateScopedDirectory({ root, namespace, key })` creates or validates a scope under a trusted root. The root may be a symlink, but the namespace and key directories may not. Namespace and key must be single path components. Choose the namespace and collection filenames.

## Serialised transactions

[`PrivateFileTransactions`](transaction.ts) serialises by key, locks, reads the latest bytes up to a limit, and applies updates. Cooperating instances and processes share `<path>.lock`. Acquisition never reclaims an existing lock.

### Must not break

- Never retry a write solely because cleanup failed after a commit.
- Within a consumer, use one instance and one key for all mutations of one file.
- Recover abandoned locks in the consumer.

### Updates

Supply a `path()` resolver that establishes trusted private parents, a `maxReadBytes` read limit, a contention `timeoutMs`, and `update(raw)`. Missing files give `undefined`. Validate schema, identity, and capacity, and return `unchanged` or `replace` with a result. Only `replace` writes.

### Cancellation

Pass a [`WriteLifetime`](lifetime.ts) as `scope`.

- `dispose()` aborts the signal, then waits for atomic writes and lock cleanup that already started. It does not wait for path resolution, reads, or `update`.
- The transaction checks cancellation before it replaces the file.
- Long callbacks should check the signal themselves.
- A custom `WriteScope` must check cancellation synchronously before it calls its atomic callback, and must track the whole returned promise.

### Results

Results distinguish `committed`, `unchanged`, and `failed`. They report write warnings and lock-cleanup errors separately. Translate errors and warnings in the consumer.

Replacement is atomic across process crashes. The library does not fsync the containing directory, so power-loss durability is not guaranteed.
