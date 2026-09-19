# Storage and recovery

[pi-prompt-manager](../README.md) · [Browser controls](controls.md)

## Location and privacy

```text
~/.pi/agent/pi-prompt-manager/<SHA-256 of real working directory>/
  history.json
  drafts.json
```

If `PI_CODING_AGENT_DIR` is set, it replaces `~/.pi/agent` in this path.

Use a trusted agent directory on a local Linux, macOS, or WSL filesystem that supports POSIX file-owner checks and enforces permissions. Network filesystems and cross-machine coordination are unsupported.

The Pi agent root may be a symlink. Opening a collection can create extension-managed directories and repair storage permissions and ACLs. Unrelated Pi directories remain unchanged. Directories use `0700`; data, temporary files, and locks use `0600`.

The extension refuses storage belonging to another user, symbolic links below the agent root, hard-linked data files, and nonregular data files.

## Manual backup and repair

1. Stop **all** Pi sessions using the affected real working directory, including symlink aliases, before editing collections or removing locks.
2. Locate the hash directory by inspecting `cwd` in its collection document. If that document is unreadable, compute the directory name from the project path:

   ```sh
   node -e '
   const { createHash } = require("node:crypto");
   const { realpathSync } = require("node:fs");
   console.log(createHash("sha256").update(realpathSync(process.argv[1])).digest("hex"));
   ' /absolute/path/to/project
   ```

   Look for that name under the [storage location](#location-and-privacy).

3. Set `collection` to the absolute `history.json` or `drafts.json` path. Check that `$collection.backup` does not exist before copying:

   ```sh
   collection='/absolute/path/to/history.json'
   umask 077
   cp -- "$collection" "$collection.backup"
   chmod 600 "$collection.backup"
   ```

4. Repair the [collection document](#document-format):
   - Keep `version: 1`, the canonical working-directory path in `cwd`, and a newest-first `entries` array.
   - Preserve exact `text`, original `recordedAt` data, and unknown fields in retained records. Preserve unknown top-level fields too.
   - Assign unique UUIDs to invalid or duplicate `id` fields.
   - Remove records as needed to meet the [text, count, and file-size limits](#limits). Do not truncate retained text. Keep removed records in the backup.
5. Preserve the [private permissions](#location-and-privacy) and applicable ACL restrictions. Restart Pi and reopen the collection to verify access. Keep backups and diagnostics containing prompt text private.

For an abandoned lock, stop every participating session and back up the collection if it exists. Then remove only its `history.json.lock` or `drafts.json.lock`. Lock age does not establish abandonment.

Inspect UUID-suffixed `.tmp` files before removing them. A temporary file can contain a save that never committed. There is no automatic repair, migration, or lock-recovery command.

## Document format

Both collection files use UTF-8 JSON with `version: 1`, the canonical directory path in `cwd`, and newest-first `entries`:

```json
{
  "version": 1,
  "cwd": "/absolute/path/to/project",
  "entries": [
    {
      "id": "7f22dce2-61f2-41b5-86bf-92076b94c123",
      "text": "Review the storage changes.\n",
      "recordedAt": "2026-01-01T12:00:00.000Z"
    }
  ]
}
```

Stored text must be nonblank. Readers preserve unknown fields and original timestamp data. Invalid timestamps do not prevent inspection.

ID comparison is case-insensitive. See [recovery states](#recovery-states) for invalid or duplicate IDs.

## Limits

| Limit                      | History                                            | Saved drafts                  |
| -------------------------- | -------------------------------------------------- | ----------------------------- |
| Incoming UTF-8 text        | 64 KiB                                             | 256 KiB                       |
| Stored occurrences         | [Configured retention](../README.md#configuration) | 1,000                         |
| Entire committed JSON file | 8 MiB                                              | 16 MiB                        |
| Capacity policy            | Drop oldest entries to fit both limits             | Reject additions; never evict |

JSON escaping, metadata, unknown fields, and formatting count toward committed size. Atomic replacement requires additional temporary disk space.

History suppresses captures equal to the latest persisted text after trimming. Retention applies only when a capture is committed, never on reads or suppressed duplicates.

Automatic capture queues at most 250 waiting entries and 8 MiB of UTF-8 text per session. It skips new captures when either limit is reached, and skips blank or individually oversized captures before queueing.

Queue overflows and storage failures share one warning per active session. Failed captures are not retried.

## Recovery states

- **Unavailable:** invalid UTF-8 or JSON, an unsupported document, or input above the read limits requires manual repair. The extension does not overwrite the file. A missing file is treated as empty.
- **Read-only:** usable records with invalid UUIDs remain available for inspection, copying, and [safe restoration](../README.md#restore-text). Collection changes require identity repair first.
- **Ambiguous deletion:** duplicate UUIDs retain all occurrences but prevent deleting those identities. Unique occurrences can still be deleted if the collection is otherwise writable.

The extension warns about and ignores unusable text records. A successful mutation may omit them. History also ignores oversized records. Damage to one collection does not block the other.

Drafts enter deletion-only recovery when they exceed normal count, text, or file-size limits. Additions are refused even if reformatting would bring the file within those limits.

A recovery deletion must remove the selected occurrence, preserve other retained records, and reduce the committed file size. The collection may still exceed its limits afterward. The extension refuses deletion if pretty-printing would increase the file size.

Draft recovery accepts at most 64 MiB of input and 5,000 records. Each record's compact JSON encoding must fit within 8 MiB. History reads also stop at 64 MiB. Beyond these limits, repair the file manually.

## Concurrency and crashes

Each collection has a separate `.json.lock`. If a save or deletion cannot acquire the lock within two seconds, it reports contention. Automatic capture reports the failure through its session warning. Locks are never reclaimed automatically.

File replacement is atomic across process crashes, but durability after power loss is not guaranteed.

A cleanup warning after commit means the save or deletion succeeded. Do not retry a committed mutation; saving again creates another draft.

Browsing does not wait for mutation locks or the capture queue. Copy and restoration use the selected snapshot even if another process later removes the occurrence.

Deletion requires the selected UUID to remain unique, with unchanged text and original timestamp data. It never falls back to text matching or an index.

Closing the browser or switching collections cancels obsolete collection processing and item preparation. It does not cancel a deletion already started.

Reload, shutdown, or session replacement discards queued captures. Mutations still reading or waiting for a lock cannot commit after expiry. Writes already started may finish; graceful teardown waits for those writes and lock cleanup.
