# pi-sysprompt-rewrite

Pi's system prompt has fixed wording that you can't change without replacing the whole prompt, and some providers can use that wording to identify Pi. pi-sysprompt-rewrite rewrites the system prompt sections before each request, with regex rules that you list in the settings. It can also move Pi's documentation section into a temporary file, so each request carries one line instead of the whole section.

With the rules of the [example configuration](#configuration) and the docs collapse off, the documentation section that the provider receives changes like this:

```diff
- Pi documentation (read only when the user asks about the harness itself, its SDK, extensions, themes, skills, or TUI):
+ Pi documentation (read only for questions about the agent, its SDK, extensions, themes, skills, or TUI):
```

With the docs collapse on, the rewritten lines reach the docs file instead, and the section holds one line that points to the file.

## Usage

Pi builds its system prompt from named sections, and each rule rewrites the sections that it lists.

| Section           | Content                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `preamble`        | The opening "You are a coding assistant…" line, or your `SYSTEM.md` or `--system-prompt` text. |
| `tools`           | One line for each tool.                                                                        |
| `rules`           | The rule bullets for tools and extensions.                                                     |
| `docs`            | The paths of Pi's documentation.                                                               |
| `addendum`        | Text from `APPEND_SYSTEM.md`, `--append-system-prompt`, or extensions.                         |
| `project_context` | `AGENTS.md` and other context files.                                                           |
| `skills`          | The list of available skills.                                                                  |
| `cwd`             | The working directory.                                                                         |

Extensions can add sections of their own, such as `mcp_servers`. A custom `SYSTEM.md` or `--system-prompt` replaces the `tools`, `rules`, and `docs` sections.

- Rules run in list order, and each rule receives the text that the rules before it produced.
- A rule sees the body of one section at a time, without the `<docs>` and `</docs>` tags around it. A match can't span two sections.
- Without the `m` flag, `^` and `$` match the start and the end of the section body.
- Rules also rewrite the section updates that Pi sends when a section changes during a session.
- With no rules and the docs collapse off, the extension changes nothing.

### Docs collapse

With `piDocsCollapse` enabled, the extension writes the body of the `docs` section to a file in the system temporary directory (`/tmp` on Linux), and replaces the body with one line that points to the file. It also removes the bash and PowerShell guideline "You can inspect PI_* environment variables…" from the `rules` section, and keeps its hint in that line while the guideline is present:

```text
<docs>
Read /tmp/pi-docs.md only when asked about Pi or before extending or changing the Pi harness. PI_* env vars hold current model and session details.
</docs>
```

- The collapse runs after the rules, so the file holds the rewritten `docs` body, and the rules don't change the pointer line. A rule that rewrites the PI_* guideline keeps it in the `rules` section.
- The file is rewritten before a request only when its content differs. It is never deleted, because other Pi sessions can use the same file.
- Without a `docs` section, such as with a custom `SYSTEM.md`, the collapse changes nothing.

## Configuration

Put the `ext.pi-sysprompt-rewrite` section in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`). Run `/reload` after you edit the settings.

Projects can't supply regex rules, so a project can't rewrite your system prompt; the extension ignores a project's `rules`. A [trusted project's](https://pi.dev/docs/latest/security#understand-project-trust) `.pi/settings.json` in the current directory can override `piDocsCollapse` fields, and each field that it sets overrides the global one.

This example shows every field. It turns on the docs collapse, and rewrites two lines of the `docs` section, which then reach the file. Remove the comments before you copy it, because Pi reads `settings.json` as plain JSON:

```jsonc
{
  "ext.pi-sysprompt-rewrite": {
    // Optional. Up to 100 rules, applied in list order. Global settings only.
    "rules": [
      {
        // Required. A JavaScript regular expression, 1 to 4096 characters. Every match is replaced.
        "match": "^Pi documentation \\(read only when the user asks about the harness itself, ",
        // Required. Up to 4096 characters, and may be empty. $1, $<name>, and $& insert the groups and the match.
        "replace": "Pi documentation (read only for questions about the agent, ",
        // Optional. Up to 100 section names. Omit it to apply the rule to every section; an empty list or a name that matches no section does nothing.
        "sections": ["docs"]
      },
      {
        "match": "^- When asked about: .*$",
        // Optional. Any of i, m, s, and u. g is always added.
        "flags": "m",
        "replace": "- Choose the reference for the requested topic: extensions (docs/extensions.md, examples/extensions/); themes (docs/themes.md); skills (docs/skills.md); prompt templates (docs/prompt-templates.md); terminal UI components (docs/tui.md); keybindings (docs/keybindings.md); SDK integrations (docs/sdk.md); custom providers (docs/custom-provider.md); adding models (docs/models.md); packages (docs/packages.md); environment variables (docs/environment-variables.md); MCP servers (docs/mcp.md); codemode scripts and non-LLM models, including classifiers and image models (docs/codemode.md).",
        "sections": ["docs"]
      }
    ],
    // Optional. Global or trusted project settings.
    "piDocsCollapse": {
      // Optional. Defaults to false.
      "enabled": true,
      // Optional. A file name without a directory: 1 to 128 ASCII letters, digits, dots, underscores, and hyphens, followed by .md. Defaults to pi-docs.md.
      "fileName": "pi-docs.md"
    }
  }
}
```

## Side effects

- The extension changes only the system prompt of the request that Pi sends. Saved sessions keep Pi's original wording.
- With the docs collapse on, the extension can replace an existing file at the docs file's path, so use a file name that no other program uses.
- A complete `systemPrompt` override from another extension takes precedence over the rules and the docs collapse.
- In modes with a UI, pi-sysprompt-rewrite shows a warning at session start for each invalid rule, and skips it. An invalid `rules` list disables every rule with one warning. Warnings don't show the rule's text.
- An invalid global section or a global `settings.json` that the extension can't read disables both the rules and the docs collapse, with one warning.
- An invalid `piDocsCollapse` in either scope, or an invalid or unreadable project section, turns the docs collapse off with one warning, and leaves valid global rules on. A project's invalid value never falls back to the global one.
- When the docs file can't be written, for example because another user owns a file with that name, the extension shows one warning and turns the docs collapse off for the session. The request keeps Pi's documentation section.
- On Linux and macOS, the extension creates the docs file readable by your user only. Sessions with different rules that share a file name rewrite it in turn, so a model can read the other session's wording.
- No live request has verified that Anthropic accepts the rewritten example prompt.

## Docs

| When you…                   | Read                                                |
| --------------------------- | --------------------------------------------------- |
| Decide where a test belongs | [Testing](docs/testing.md)                          |
| Upgrade Pi                  | [Compatibility checklist](docs/pi-compatibility.md) |
