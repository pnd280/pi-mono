# Nested instruction domain

[Package](README.md)

| Term        | Meaning                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope       | Directories strictly below cwd that a tool input addresses, plus exact instruction files it attempts to read. Inferred from issued inputs only.                                               |
| Direct read | A recognized content-read attempt on an exact instruction-file path. Recorded as a read marker, never as injected content.                                                                    |
| Read marker | Contentless metadata for a direct read: path, originating call identity, and filesystem revision (stamp). Valid only while its exact originating call remains in the session projection.      |
| Notice      | A visible custom message that loads, updates, or removes a directory's instructions. Carries the model-facing preamble, the instruction body, and details that fingerprint both.              |
| Ledger      | What the canonical session projection still shows the model: visible notices and valid read markers. Discovery and refresh query it, never raw entries; notices encode and decode themselves. |
| Snapshot    | The instruction content a visible notice or direct read delivered. Ordinary accesses retain snapshots; only startup, resume, and reload compare them with the filesystem.                     |
