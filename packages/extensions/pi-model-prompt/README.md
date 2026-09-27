# pi-model-prompt

Selects a model-specific `APPEND_SYSTEM.md` variant for each agent run. Use it when different models need different appended instructions. Uses Pi **0.87.1**'s public `before_agent_start` prompt sections.

## Usage

1. Write variant files next to Pi's base file, named `APPEND_SYSTEM.<variant>.md`, for example `~/.pi/agent/APPEND_SYSTEM.gpt.md`.
2. Map models to variants in [settings](#configuration).
3. Switch models as usual. The matching variant applies from the next prompt.

A variant replaces the base text; it is not appended to it. A base file is optional, and an empty variant removes the append text. Models without a matching rule keep Pi's normal `APPEND_SYSTEM.md`.

### File precedence

For a selected variant, the first existing file wins:

| Priority | File                                     |
| -------- | ---------------------------------------- |
| 1        | `.pi/APPEND_SYSTEM.<variant>.md`         |
| 2        | `.pi/APPEND_SYSTEM.md`                   |
| 3        | `<agent-dir>/APPEND_SYSTEM.<variant>.md` |
| 4        | `<agent-dir>/APPEND_SYSTEM.md`           |

Project files count only in [trusted](../../../node_modules/@earendil-works/pi-coding-agent/docs/security.md#project-trust) projects. A project's own base file therefore outranks personal agent-level variants.

### Explicit append text

The extension replaces append text only when it equals the discovered base text (empty when no base exists). Different text from `--append-system-prompt` or an earlier extension is left untouched. Identical text cannot be distinguished from the base and may be replaced.

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

The `rules` array accepts at most 100 entries. Invalid rules, including those with unknown fields, are skipped. An invalid section, including unknown section fields or more than 100 rules, disables all rules.

Settings and files load on session start and `/reload`, like Pi's own `APPEND_SYSTEM.md`. Edits take effect after `/reload`.

Warnings appear once per load, only when a UI is available, for invalid settings, variants with no file at any level, and unreadable files. Unreadable or non-regular variant files fall back to the next file in precedence; an unreadable base file disables replacement. Variant changes are otherwise silent.

## Side effects

Only the append section of the system prompt changes. Pi records changes in the session transcript; prompt-cache reuse depends on the provider's support for mid-conversation prompt changes. The extension writes no files and makes no network requests.

## Validation

[Coverage specification](docs/testing.md). For Pi upgrades and SDK directory overrides, see [compatibility](docs/pi-compatibility.md).

Tests run offline. On Unix, the FIFO regression requires `mkfifo`.

From the repository root:

```sh
vpr 'pi-model-prompt#check'
vpr 'pi-model-prompt#test'
```

See [workspace development](../../../docs/development.md) for shared checks.
