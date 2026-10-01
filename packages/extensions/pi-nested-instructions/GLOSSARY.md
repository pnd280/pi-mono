# Nested instruction domain

The extension loads instruction files from directories below cwd when tool inputs reach into them. See the [package](README.md).

## Language

Discovery uses tool inputs; delivery records what instruction content remains in the model's context.

### Discovery

**Scope**:
Directories strictly below cwd that a tool input addresses, plus exact instruction files it attempts to read. Inferred from issued inputs only.
_Avoid_: match, target

**Direct read**:
A recognised content-read attempt on an exact instruction-file path.
_Avoid_: explicit load, manual read

**Read marker**:
Contentless metadata recording a direct read: its path, originating call, and filesystem revision. Valid only while that call remains in the session projection.
_Avoid_: read record, suppression entry

### Delivery

**Notice**:
A visible custom message that loads, updates, or removes a directory's instructions.
_Avoid_: injection, instruction message

**Snapshot**:
The instruction content a visible notice or direct read delivered.
_Avoid_: cached instructions, copy

**Ledger**:
What the canonical session projection still shows the model: visible notices and valid read markers.
_Avoid_: history, raw entries, state
