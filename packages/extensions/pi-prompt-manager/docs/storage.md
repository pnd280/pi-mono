# Storage and recovery

[pi-prompt-manager](../README.md) · [Browser controls](controls.md)

## Location and privacy

```text
~/.pi/agent/pi-prompt-manager/<SHA-256 of real working directory>/
  history.json
  drafts.json
```

`PI_CODING_AGENT_DIR`, when set, replaces `~/.pi/agent`. Use a trusted local Linux, macOS, or WSL filesystem with POSIX owner checks and enforced permissions. Network filesystems/cross-machine coordination are unsupported.

The agent root may be a symlink. Opening collections may create managed directories and repair permissions/ACLs, leaving unrelated Pi directories unchanged. Directories use `0700`; data, temporary files, and locks use `0600`.

Foreign-owned storage, symlinks below the agent root, hard-linked data, and nonregular data files are refused.

## Manual backup and repair

1. Stop **all** sessions using the real working directory, including symlink aliases, before editing collections or removing locks.
2. Find the hash directory via the document's `cwd`, or compute it if unreadable:

   ```sh
   node -e '
   const { createHash } = require("node:crypto");
   const { realpathSync } = require("node:fs");
   console.log(createHash("sha256").update(realpathSync(process.argv[1])).digest("hex"));
   ' /absolute/path/to/project
   ```

   Look under the [storage location](#location-and-privacy).

3. Set the absolute collection path. Ensure `$collection.backup` does not exist before copying:

   ```sh
   collection='/absolute/path/to/history.json'
   umask 077
   cp -- "$collection" "$collection.backup"
   chmod 600 "$collection.backup"
   ```

4. Repair the [document](#document-format):
   - Retain `version: 1`, canonical `cwd`, and newest-first `entries`.
   - Preserve exact `text`, original `recordedAt`, and unknown record/top-level fields.
   - Give invalid/duplicate IDs unique UUIDs.
   - Remove records to meet [limits](#limits), never truncate retained text. Keep removed records in the backup.
5. Preserve [permissions](#location-and-privacy) and ACL restrictions. Restart/reopen to verify access. Keep prompt-bearing backups and diagnostics private.

For abandoned locks, stop all participating sessions and back up any collection before removing only its `history.json.lock` or `drafts.json.lock`. Age does not prove abandonment.

Inspect UUID-suffixed `.tmp` files before removal; they may contain uncommitted saves. No automatic repair, migration, or lock recovery exists.

## Document format

Collections are UTF-8 JSON with canonical `cwd` and newest-first entries:

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

Text must be nonblank. Readers preserve unknown fields and original timestamps; invalid timestamps remain inspectable. Documents with numeric literals that parse as non-finite JavaScript values remain inspectable but read-only because a mutation would otherwise rewrite them as `null`. IDs compare case-insensitively; invalid/duplicate IDs trigger [recovery states](#recovery-states).

## Limits

| Limit               | History                                            | Saved drafts                  |
| ------------------- | -------------------------------------------------- | ----------------------------- |
| Incoming UTF-8 text | 64 KiB                                             | 256 KiB                       |
| Stored occurrences  | [Configured retention](../README.md#configuration) | 1,000                         |
| Committed JSON      | 8 MiB                                              | 16 MiB                        |
| Capacity policy     | Drop oldest to meet both limits                    | Reject additions; never evict |

Escaping, metadata, unknown fields, and formatting count toward file size. Atomic replacement needs temporary disk space.

History suppresses captures matching the latest persisted trimmed text. Retention runs only on committed captures, not reads or suppressed duplicates.

Per session, at most 250 captures and 8 MiB of UTF-8 text may wait in the queue. Blank/oversized captures are skipped before queueing; new captures are skipped on overflow. Overflows/storage failures share one warning per active session; failed captures are not retried.

## Recovery states

- **Unavailable:** invalid UTF-8/JSON, unsupported documents, or exceeded read limits require manual repair; no overwrite. Missing files are empty.
- **Read-only:** usable records with invalid UUIDs or non-finite parsed numbers allow inspection, copying, and [safe restoration](../README.md#restore-text); mutations require repair.
- **Ambiguous deletion:** duplicate UUIDs retain every occurrence but prevent deleting those IDs. Unique IDs remain deletable if otherwise writable.

Unusable text records warn and are ignored; successful mutations may omit them. History also ignores oversized records. Collections fail independently.

Drafts over normal count, text, or file-size limits allow only recovery deletion, refusing additions even if reformatting would fit. Deletion must remove the selected occurrence, preserve other retained records, and shrink committed size; limits may remain exceeded. Size-increasing pretty-printing prevents deletion.

Both collections accept at most 64 MiB and 5,000 records during recovery. Each draft record may use at most 8 MiB in compact JSON. Repair larger files manually.

## Concurrency and crashes

Collections have separate `.json.lock` files. Save/delete lock acquisition times out after two seconds with contention feedback; capture uses its session warning. Locks are never reclaimed automatically.

Replacement is atomic across process crashes, not guaranteed durable after power loss. Post-commit cleanup warnings mean success: do not retry; another save creates another draft.

Browsing waits for neither locks nor queued captures. Copy/restore use the selected snapshot even if concurrently removed. Deletion requires a still-unique UUID, unchanged text, and original timestamp data; no text/index fallback.

Closing/switching cancels obsolete collection processing and item preparation, not started deletions. Reload, shutdown, and session replacement discard queued captures. Reading/lock-waiting mutations cannot commit after expiry; started writes may finish. Graceful teardown waits for those writes and lock cleanup.
