# pi-sysprompt-rewrite

Pi's system prompt has fixed wording that you can't change without replacing the whole prompt, and some providers can use that wording to identify Pi. pi-sysprompt-rewrite rewrites the system prompt sections before each request, with regex rules that you list in the settings.

With the [example configuration](#configuration), the documentation section that the provider receives changes like this:

```diff
- Pi documentation (read only when the user asks about the harness itself, its SDK, extensions, themes, skills, or TUI):
+ Pi documentation (read only for questions about the agent, its SDK, extensions, themes, skills, or TUI):
```

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
- With no rules, the extension changes nothing.

## Configuration

Put the `ext.pi-sysprompt-rewrite` section in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`). pi-sysprompt-rewrite reads only the global settings and ignores project settings, so a project can't change your system prompt. Run `/reload` after you edit the settings.

This example shows every field, and rewrites two lines of the `docs` section. Remove the comments before you copy it, because Pi reads `settings.json` as plain JSON:

```jsonc
{
  "ext.pi-sysprompt-rewrite": {
    // Optional. Up to 100 rules, applied in list order.
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
    ]
  }
}
```

## Side effects

- The extension changes only the system prompt of the request that Pi sends. Saved sessions keep Pi's original wording.
- A complete `systemPrompt` override from another extension takes precedence over the rules.
- In modes with a UI, pi-sysprompt-rewrite shows a warning at session start for each invalid rule, and skips it. Invalid settings, or a `settings.json` that it can't read, disable every rule with one warning. Warnings don't show the rule's text.
- No live request has verified that Anthropic accepts the rewritten example prompt.

## Docs

| When you…                   | Read                                                |
| --------------------------- | --------------------------------------------------- |
| Decide where a test belongs | [Testing](docs/testing.md)                          |
| Upgrade Pi                  | [Compatibility checklist](docs/pi-compatibility.md) |
