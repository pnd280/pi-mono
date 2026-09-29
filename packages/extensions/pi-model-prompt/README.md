# pi-model-prompt

Selects a model-specific `APPEND_SYSTEM.md` variant for each run when models need different appended instructions. Uses Pi **0.87.1**'s public `before_agent_start` prompt sections.

## Usage

1. Write variant files next to Pi's base file, named `APPEND_SYSTEM.<variant>.md`.
2. Map models to variants in [settings](#configuration).
3. Switch models as usual. The matching variant applies from the next prompt.

A variant replaces, rather than extends, the base text. An empty variant removes the append text. Models without a matching rule keep Pi's normal `APPEND_SYSTEM.md`.

### File precedence

For a selected variant, the first existing file wins:

| Priority | File                                     |
| -------- | ---------------------------------------- |
| 1        | `.pi/APPEND_SYSTEM.<variant>.md`         |
| 2        | `.pi/APPEND_SYSTEM.md`                   |
| 3        | `<agent-dir>/APPEND_SYSTEM.<variant>.md` |
| 4        | `<agent-dir>/APPEND_SYSTEM.md`           |

Project files count only in [trusted](../../../node_modules/@earendil-works/pi-coding-agent/docs/security.md#understand-project-trust) projects. A project's own base file therefore outranks personal agent-level variants.

### Explicit append text

Replacement requires append text equal to the discovered base (empty when no base exists). Different text from `--append-system-prompt` or another extension is left untouched; identical text cannot be distinguished and may be replaced.

## Configuration

Set the literal `ext.pi-model-prompt` key in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`). Project settings are ignored.

```json
{
  "ext.pi-model-prompt": {
    "rules": [
      { "match": "claude", "append": "ant" },
      { "match": "^openai-codex/gpt-", "append": "gpt" }
    ]
  }
}
```

| Field    | Meaning                                                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `match`  | Required JavaScript regular expression, 1-512 characters, tested against `provider/modelId`. Unanchored and case-sensitive; add `^` or `$` as needed. |
| `append` | Optional variant name selecting `APPEND_SYSTEM.<append>.md`: 1-64 ASCII letters, digits, `_`, or `-`.                                                 |

The first matching rule that sets `append` wins; matching rules without `append` do not block later rules. With no rules configured, Pi's append text is unchanged.

The `rules` array accepts at most 100 entries. Invalid rules are skipped; an invalid section disables all rules. Unknown fields are invalid at either level.

Settings and files load on session start and `/reload`, like Pi's own `APPEND_SYSTEM.md`. Edits take effect after `/reload`.

UI warnings report invalid settings, missing variants, and unreadable files on load. Unreadable or non-regular variants fall back to the next file in precedence; an unreadable base disables replacement.

## Side effects

Only the append section of the system prompt changes. Pi records changes in the session transcript; prompt-cache reuse depends on the provider's support for mid-conversation prompt changes. The extension writes no files and makes no network requests.

## Validation

Tests run offline; the Unix FIFO regression requires `mkfifo`. See [testing boundaries](docs/testing.md) and [Pi compatibility](docs/pi-compatibility.md) for SDK directory overrides and upgrades.
