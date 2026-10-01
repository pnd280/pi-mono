# pi-model-prompt

Replaces Pi's `APPEND_SYSTEM.md` text with model-specific prompt files for each run when models need different appended instructions. Uses Pi **0.99.2**'s public `before_agent_start` prompt sections.

## Usage

1. Write prompt files anywhere.
2. List them per model in [settings](#configuration).
3. Switch models as usual. The matching files apply from the next prompt.

The listed files replace, rather than extend, the base text: their contents are joined in list order with a blank line (`\n\n`), as Pi joins multiple append sources. List `APPEND_SYSTEM.md` (relative to the settings directory) to keep the agent-level base. An empty list or empty files remove the append text. Models without a matching rule keep Pi's normal `APPEND_SYSTEM.md`, discovered from the [trusted](../../../node_modules/@earendil-works/pi-coding-agent/docs/security.md#understand-project-trust) project's `.pi/` first, then the agent directory.

### Explicit append text

Replacement requires append text equal to the discovered base (empty when no base exists). Different text from `--append-system-prompt` or another extension is left untouched; identical text cannot be distinguished and may be replaced.

## Configuration

Set the literal `ext.pi-model-prompt` key in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`). Project settings are ignored.

```json
{
  "ext.pi-model-prompt": {
    "rules": [
      { "match": "claude", "append": ["prompts/ant.md"] },
      { "match": "^openai-codex/gpt-", "append": ["APPEND_SYSTEM.md", "~/prompts/gpt.md"] }
    ]
  }
}
```

| Field    | Meaning                                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `match`  | Required JavaScript regular expression, 1-512 characters, tested against `provider/modelId`. Unanchored and case-sensitive; add `^` or `$` as needed.                                              |
| `append` | Optional array of up to 32 file paths, each 1-4096 characters, appended in order. A leading `~` expands to the home directory; other relative paths resolve against the settings file's directory. |

The first matching rule that sets `append` wins; matching rules without `append` do not block later rules. With no rules configured, Pi's append text is unchanged.

The `rules` array accepts at most 100 entries. Invalid rules are skipped; an invalid section disables all rules. Unknown fields are invalid at either level. Listed files may live anywhere, including inside projects; trust applies only to base discovery.

Settings and files load on session start and `/reload`, like Pi's own `APPEND_SYSTEM.md`. Edits take effect after `/reload`.

UI warnings report invalid settings and unreadable files on load. A rule listing a missing, unreadable, or non-regular file keeps the base text rather than applying a partial list; an unreadable base disables replacement.

## Side effects

Only the append section of the system prompt changes. Pi records changes in the session transcript; prompt-cache reuse depends on the provider's support for mid-conversation prompt changes. The extension writes no files and makes no network requests.

## Validation

Tests run offline; the Unix FIFO regression requires `mkfifo`. See [testing boundaries](docs/testing.md) and [Pi compatibility](docs/pi-compatibility.md) for SDK directory overrides and upgrades.
