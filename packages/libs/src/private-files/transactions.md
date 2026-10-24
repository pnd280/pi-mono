# Private-file storage and transactions

[Private-file integration](README.md)

This reference is for library callers who place private storage and mutate records. The [README](README.md#behaviour) summarises the permission checks.

## Filesystem assumptions

Network filesystems and cross-machine coordination are unsupported.

- On Linux, macOS, or WSL, use trusted private parents on local storage with POSIX owner checks and enforced permissions.
- On native Windows, keep storage inside the user profile and on the profile's volume. The [native Windows rules](#native-windows) explain why.

Final-descriptor checks cannot secure untrusted parents. Create or validate storage directories with [`privateScopedDirectory`](#scoped-directories) under a trusted root that already exists. It does not create the root.

Use [`boundedRead`](privacy.ts) to read file contents. It returns `undefined` for a missing file and rejects unsafe files or input above the byte limit. Choose the byte limit and validate the contents.

### Native Windows

Native Windows has no POSIX owner IDs. There, the library trusts the user profile's inherited ACL instead of the owner and permission checks.

- The check compares directory identities, not path text, so a mounted folder or a sibling that differs only in case is outside the profile.
- `privateScopedDirectory` refuses a directory outside the profile with `PrivateFileError` before it creates it.
- Checks still refuse final-path links and junctions, hard-linked files, and nonregular types.
- Checks do not check owners, change permissions, or read ACLs.

The [Windows storage decision](../../docs/adr/0001-windows-private-storage.md) gives the threat model.

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
