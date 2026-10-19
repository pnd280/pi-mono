# Storage and recovery

[pi-prompt-manager](../README.md) · [Browser controls](controls.md)

## Location and privacy

```text
~/.pi/agent/pi-prompt-manager/<SHA-256 of real working directory>/
  history.json
  drafts.json
```

`PI_CODING_AGENT_DIR`, when set, replaces `~/.pi/agent`.

### Storage safety

Use a trusted local Linux, macOS, or WSL filesystem with POSIX owner checks and enforced permissions, or, on native Windows, an agent directory inside the user profile. Network filesystems and coordination across machines aren't supported.

- On POSIX systems, storage owned by another user is refused.
- Symlinks below the agent root, hard-linked data, and data files that aren't regular files are refused.
- On native Windows, storage outside the user profile is refused before any directory is created.
- On native Windows, junctions below the agent root are also refused.

### Directory access

- The agent root may be a symlink.
- Opening collections may create the directories the extension manages and repair their permissions and ACLs. Other Pi directories are left alone.
- On POSIX systems, directories use `0700`; data, temporary files, and locks use `0600`.
- On native Windows, storage relies on the user profile's inherited ACL: owners aren't checked, and permissions aren't changed. See the [Windows storage decision](../../../libs/docs/adr/0001-windows-private-storage.md).

## Manual backup and repair

Setup: stop all sessions using the real working directory, including through symlink aliases, before editing collections or removing locks. Keep backups and diagnostics that contain prompts private.

| Do                                                                                                                                                                         | Expect                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Find the hash directory from the document's `cwd`. If the document is unreadable, run the hash command below and look under the [storage location](#location-and-privacy). | The directory identifies the real working directory's collections.         |
| Set the absolute collection path, check that `$collection.backup` doesn't exist yet, and run the backup commands below.                                                    | A private backup preserves the original file.                              |
| Repair the [document](#document-format), keeping `version: 1`, the canonical `cwd`, and `entries` in newest-first order.                                                   | The document still identifies the same working directory and record order. |
| Keep each `text` exactly, the original `recordedAt`, and unknown fields on records and at the top level.                                                                   | The retained source data is unchanged.                                     |
| Give invalid or duplicate IDs new unique UUIDs.                                                                                                                            | Each ID is valid and unique.                                               |
| Remove whole records to meet the [limits](#limits); never shorten text you keep.                                                                                           | The removed records remain in the backup.                                  |
| Keep the [permissions](#location-and-privacy) and ACL restrictions, then restart or reopen the browser.                                                                    | The collection is accessible.                                              |

Hash command:

```sh
node -e '
const { createHash } = require("node:crypto");
const { realpathSync } = require("node:fs");
console.log(createHash("sha256").update(realpathSync(process.argv[1])).digest("hex"));
' /absolute/path/to/project
```

Backup commands:

```sh
collection='/absolute/path/to/history.json'
umask 077
cp -- "$collection" "$collection.backup"
chmod 600 "$collection.backup"
```

### Locks and temporary files

Recovery is manual: the extension never migrates collection documents or reclaims abandoned locks and temporary files. Opening collections can still create managed directories and repair permissions and ACLs.

Stop all sessions that use the collection and back it up before cleanup. An old lock isn't necessarily abandoned.

After confirming that a lock is abandoned, remove only its `history.json.lock` or `drafts.json.lock` to unblock changes to that collection. Inspect `.tmp` files with UUID suffixes before removing them; they may hold saves that weren't committed.

## Document format

Collections are UTF-8 JSON with the canonical `cwd` and entries in newest-first order:

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

- Text must not be blank.
- Readers keep unknown fields and original timestamps. Entries with invalid timestamps can still be inspected.
- A document with a number that JavaScript parses as non-finite can be inspected but is read-only, because writing it would turn that number into `null`.
- IDs are compared without regard to case. Invalid or duplicate IDs lead to [recovery states](#recovery-states).

## Limits

| Limit               | History                                            | Saved drafts                  |
| ------------------- | -------------------------------------------------- | ----------------------------- |
| Incoming UTF-8 text | 64 KiB                                             | 256 KiB                       |
| Stored occurrences  | [Configured retention](../README.md#configuration) | 1,000                         |
| Committed JSON      | 8 MiB                                              | 16 MiB                        |
| When full           | Drop the oldest to meet both limits                | Reject additions; never evict |

- Escaping, metadata, unknown fields, and formatting all count toward file size. Atomic replacement needs temporary disk space.
- "History" skips a capture whose trimmed text matches the latest saved entry. Retention runs only when a capture is committed, not on reads or skipped duplicates.

### Capture queue

- Each session queues at most 250 captures and 8 MiB of UTF-8 text.
- Blank and oversized captures are skipped before queueing. When the queue is full, new captures are skipped.
- Queue overflows and storage failures share one warning per active session. Failed captures aren't retried.

## Recovery states

| State              | Cause                                                                    | What still works                                                                                                             |
| ------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Unavailable        | Invalid UTF-8 or JSON, an unsupported document, or read limits exceeded. | Nothing; repair by hand. The file is never overwritten. A missing file counts as empty.                                      |
| Read-only          | Usable records with invalid UUIDs, or numbers that parse as non-finite.  | Inspecting, copying, and [safe restoring](../README.md#restore-text). Changes need a repair.                                 |
| Ambiguous deletion | Duplicate UUIDs.                                                         | Every occurrence is kept, but those IDs can't be deleted. Unique IDs can still be deleted if the file is otherwise writable. |

- Records with unusable text produce a warning and are ignored. A successful change may drop them.
- "History" also ignores oversized records.
- Each collection fails independently of the other.

### Oversized drafts

When drafts exceed the normal count, text, or file-size limits, only recovery deletion is allowed. Additions are refused, even if reformatting would make them fit.

- A deletion must remove the selected occurrence, keep all other records, and make the committed file smaller. The limits may still be exceeded afterwards.
- If pretty-printing would make the file larger, deletion isn't possible.
- During recovery, both collections accept at most 64 MiB and 5,000 records, and each draft record at most 8 MiB as compact JSON. Repair larger files by hand.

## Concurrency and crashes

Sessions coordinate changes to each collection through lock files and atomic replacement.

### Locks

- Each collection has its own `.json.lock` file.
- Saving or deleting waits at most two seconds for the lock, then reports contention. Captures report through the session warning.
- Locks are never reclaimed automatically.

### Crashes

- Replacing a file is atomic across process crashes, but isn't guaranteed to survive a power loss.
- A cleanup warning after a commit means the change succeeded. Don't retry; saving again creates another draft.

### Concurrent sessions

- Browsing waits for neither locks nor queued captures.
- Copying and restoring use the selected snapshot, even if another session removed it.
- Deletion needs the UUID to still be unique, and the text and original timestamp to be unchanged. There's no fallback to matching by text or position.

### Cancellation

- Closing the browser or switching collections cancels processing and preparation that are no longer needed, but not deletions that have started.
- Reload, shutdown, and replacing the session discard queued captures.
- Changes still reading or waiting for a lock can't commit after the session ends. Writes that have started may finish, and a graceful shutdown waits for them and for lock cleanup.
