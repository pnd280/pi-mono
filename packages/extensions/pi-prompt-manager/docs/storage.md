# Storage and recovery

[Commands and settings](../README.md) · [Controls](controls.md)

## Location and privacy

```text
getAgentDir()/pi-prompt-manager/<SHA-256 of real working directory>/
  history.json
  drafts.json
```

Each version-1 JSON document contains `version`, the canonical `cwd`, and newest-first `entries`. Each new occurrence has a fresh UUID `id`, exact `text` (trimmed for history and explicit `add`), and an ISO `recordedAt`. Time is captured when the operation begins; serialized mutation order determines collection order. Unknown fields and original timestamp information survive retained records.

The designated Pi agent root can resolve through a symlink. Symlinks below the extension-owned root are rejected. Extension directories use `0700`; data, temporary files, and lock files use `0600`. Owned accessible artifacts have private permissions repaired. Effective POSIX ACL access is restricted by the mode/ACL mask; macOS extended ACLs are removed through a descriptor passed to `/bin/chmod -N`. Unrelated Pi directories are not repaired. Unexpected ownership, hard-linked data files, nonregular files, and filesystems that cannot establish private permissions cause refusal. Reads use bounded, no-follow, nonblocking opens with descriptor validation.

## Limits

| Limit                      | History                                    | Saved drafts                  |
| -------------------------- | ------------------------------------------ | ----------------------------- |
| Incoming UTF-8 text        | 64 KiB                                     | 256 KiB                       |
| Stored occurrences         | 250 by default; configurable 1–5,000       | 1,000                         |
| Entire committed JSON file | 8 MiB                                      | 16 MiB                        |
| Capacity policy            | Keep the newest prefix fitting both limits | Reject additions; never evict |

JSON escaping, metadata, unknown fields, and formatting count toward committed size. Atomic replacement requires additional temporary disk space; locks and temporary files do not count toward collection limits. Explicit repeated draft saves have distinct UUIDs. History suppresses only a capture equal to the latest persisted text after trimming; case and internal whitespace remain significant. Retention applies only on a successful capture mutation, never on reads or a suppressed duplicate.

Automatic history capture has a per-session waiting queue of at most 250 entries and 8 MiB of UTF-8 text. New captures are skipped at either bound. Accepted work remains FIFO. Failed captures are not retried. Queue overflow and automatic storage failures share one generic warning per active session. Blank, consecutive-duplicate, and individually oversized captures are silent.

## Concurrency and crashes

Each collection has a separate `.json.lock` file created atomically with an ownership token. Local mutations are serialized before acquiring this cross-process lock. Lock waits are asynchronous and limited to two seconds. A conflicting explicit operation reports contention; automatic capture skips through its warning path. No lock is stolen based on age or process liveness.

A mutation reads the latest complete document under its lock, validates capacity or deletion identity, writes and flushes a private temporary file beside the destination, and atomically renames it over the destination. Rename is the commit point. Pre-commit failures leave the previous file intact. Cleanup warnings after commit do not turn a successful save/deletion into a reported failure.

Browsing never takes a mutation lock or waits for the capture queue. It sees a complete old or new snapshot. Ordinary copy and restoration use that selected snapshot even if another process later removes it. Deletion requires the selected UUID to remain unique and the text and original timestamp information to remain unchanged. It never falls back to text matching or an index.

Reload, shutdown, or session replacement expires queued/read-stage/lock-waiting work immediately. A write phase already started may finish, including owned lock cleanup. Graceful teardown waits for that phase, not the capture queue. The guarantee covers cooperating sessions on supported local filesystems. It is process-crash atomicity, **not a power-loss durability guarantee**.

## Corruption and recovery states

- A missing file is empty. Empty, truncated, invalid-UTF-8, or invalid-JSON files are unavailable and will not be overwritten.
- Unsupported versions, wrong `cwd`, or invalid document structure refuse collection access.
- Invalid or missing timestamps remain unchanged and display `Unknown time`.
- Records without usable nonblank text are ignored with a warning; successful mutations may omit them. History also ignores records outside its normal text limit.
- Usable records without valid occurrence UUIDs remain inspectable/copyable, but make the collection read-only until manual repair.
- Duplicate UUIDs retain all occurrences. Deletion of an ambiguous UUID is refused; other unique occurrences can still be deleted if the collection is otherwise writable.
- A damaged collection does not block the other collection.

Drafts enter deletion-only recovery when the existing file exceeds normal count, text, or file-size capacity. Additions are refused even when merely reformatting the file would bring it under capacity. A recovery deletion must remove the selected occurrence, preserve other retained records, and strictly reduce the committed byte size. It can leave the collection above normal capacity. If pretty-printing would increase size, deletion is refused.

Recovery is bounded to **64 MiB of input file data**, **5,000 records**, and **8 MiB per record's compact JSON encoding**. History reads also stop at 64 MiB. Beyond a hard bound, collection operations are refused rather than attempting an unbounded parse or partial recovery.

## Manual backup and repair

1. Stop **all** Pi sessions using the affected real working directory, including sessions opened through symlink aliases. Do not edit files while sessions may capture or mutate them.
2. Locate the hash directory by inspecting `cwd` in its collection document. Copy the affected file to a private backup before editing. For example, with `collection` set to the absolute file path:

   ```sh
   umask 077
   cp -- "$collection" "$collection.backup"
   chmod 600 "$collection.backup"
   ```

3. Use a local editor to repair valid UTF-8/JSON, `version: 1`, and the correct canonical `cwd`. Keep each retained occurrence's source text and timestamp data. Assign unique UUIDs to records with invalid/duplicate IDs. Reduce record count and file/text sizes to the limits above, retaining any removed drafts in the private backup.
4. Preserve private permissions (`0700` directories, `0600` files) and applicable ACL restrictions. Restart Pi and reopen the affected collection. Do not share backups or diagnostics containing prompt text.

For an abandoned lock, first stop every participating session, back up the collection, then remove only that collection's `history.json.lock` or `drafts.json.lock`. Inspect any UUID-suffixed `.tmp` files before removing them: they are uncommitted remnants, not automatically recovered drafts. Do not remove active locks or rely on their timestamps. There is no reset, migration, import, or automatic lock-recovery command.
