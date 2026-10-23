# Trust the user profile for private storage on Windows

[Private-file integration](../../src/private-files/README.md) · [Coverage](../testing.md)

On Linux and macOS, [private files](../../src/private-files/README.md) require the current user to own storage directories and files, and set directory mode `0700` and file mode `0600`. Linux restricts extended ACL access through the mode bits; macOS removes extended ACLs. Native Windows has no POSIX owner IDs: `process.getuid` is undefined, and Node's `chmod` changes only the read-only attribute. Before this decision, private storage threw `PrivateFileError` there. Prompt manager could not save prompts, and tool display kept details in memory only.

A new directory or file in a Windows user profile inherits the profile's ACL. By default, that ACL gives access only to the user, `SYSTEM`, and the Administrators group. `SYSTEM` and administrators can always read the user's files, as root can on POSIX. Other standard users cannot.

## Decision

When `process.getuid` is undefined, private storage trusts the inherited ACL of the user profile:

- `privateDirectory` refuses a storage directory outside the profile with "On Windows, private storage must be inside the user profile." Path text cannot decide this. `path.relative` ignores case, also in case-sensitive NTFS folders, and libuv's `lstat` follows a mounted folder to the root of its volume. So the check compares identities. Before `mkdir`, it walks up from the real path of the parent, which may be the profile itself. Each directory must have the `dev` of the profile until one also has its `ino`. A parent below a mounted folder or in a sibling that differs only in case fails, so a refused directory is never created.
- After the open, the opened directory must be on the profile's volume and must not be the profile. The parent of its real path must pass the same walk. On Windows, `realpath` returns the final path of the opened file, so a mounted folder resolves to its own volume, and a mount of the profile's volume resolves to the path on that volume. The real path must still have the identity of the opened directory, so a replacement after the open fails. Files rely on these directories, as callers already must use trusted parents.
- Checks do not compare owner IDs, change permissions, or check modes.
- Checks still refuse nonregular files, hard-linked files, and nondirectories. Windows has no `O_NOFOLLOW`, so `lstat` runs before `open`, and the opened descriptor must have the same `dev` and `ino`. A link or junction at the final path therefore fails. libuv takes `dev` from the same 32-bit volume serial number in `lstat` and `fstat`. Big integers keep 64-bit NTFS file IDs exact, also in `sameFile`.
- Linux and macOS behaviour is unchanged.

## Considered options

The alternatives cost a process per check, need a native build for every install, or leave native Windows without private storage.

### Check ACLs with PowerShell `Get-Acl` or `icacls`

Rejected. Each check starts a process, which adds a large cost to every read and write. The commands take a path, not the open descriptor, so a file that replaces the path between the check and the open escapes the check.

### Read the security descriptor with a native add-on

Rejected. An add-on could check the ACL of the open descriptor, but every install would need a native build for its Node version and architecture. The workspace packages have no build step.

### Keep refusing private storage on Windows

Rejected. Prompt manager stays unavailable, and tool display never saves details, on every native Windows install.

## Consequences

- The checks do not detect an ACL that the user or an administrator explicitly broadens inside the profile.
- The checks do not detect a profile on a shared or network drive. Private storage does not support network filesystems.
- On ReFS, such as a Dev Drive, libuv reports a 64-bit file ID, which Windows does not guarantee to be unique there. Node cannot read the 128-bit ID or the filesystem type. So a directory outside the profile with the same reported ID would pass the containment check. This needs a storage root that the user configured outside the profile; the default profile volume is NTFS. Volumes with the same 32-bit serial number, such as cloned disks, have the same limit.
- A storage root outside the profile, such as a `PI_CODING_AGENT_DIR` on another drive, a junction to another location, or a mounted folder inside the profile, is refused. Prompt manager reports its storage as unavailable.
- A read without the lock can fail once with `PrivateFileError` when another process replaces the file between `lstat` and `open`. Prompt manager then reports that read as unavailable.
- Automated tests simulate missing owner IDs on Linux. Mounted folders and case-sensitive folders need native Windows. Native Windows needs the [platform checks](../../../extensions/pi-prompt-manager/docs/validation.md#platform-checks), and tests there need the system temporary directory inside the profile, as is the default `%LOCALAPPDATA%\Temp`.
- Reopen this decision if Node exposes the security descriptor of an open file.
