# pi-t3-skills

[T3 Code](https://github.com/pingdotgg/t3code) sends a skill chip to Pi as `$<name>` text, and its Pi integration then pastes the skill's contents into the prompt. With this extension, each chip becomes a link to the skill's file, in a format that you can configure, and the skill contents aren't added.

For a skill registered at `/skills/review/SKILL.md`, this prompt from T3 Code:

```text
Use $review on the parser
```

reaches the model as:

```text
Use [/skill:review](</skills/review/SKILL.md>) on the parser
```

## Usage

Install the extension in the Pi that T3 Code starts. It works only in Pi sessions where T3 Code loads its own Pi extension, which T3 Code shows by setting the `T3_PI_MCP_EXTENSION_PATH` environment variable. In other Pi sessions, the extension does nothing, and `$<name>` stays as you typed it.

Pick skills with T3 Code's composer as usual. Every chip that matches a registered skill becomes a reference, and T3 Code's `<skill>` blocks with the skill contents are removed.

The reference stays plain prompt text. The model isn't guaranteed to read the file. A chip changes only when it is separated by whitespace and matches a registered skill exactly.

Skills picked from T3 Code's `$` or `/` menu become `$<name>` chips and work. A `/skill:<name>` that you type yourself doesn't change; for it, install [pi-skills](../pi-skills/README.md).

## Configuration

Put the `ext.pi-t3-skills` key in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`), or in `.pi/settings.json` in the current directory of a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust). A trusted project's format overrides the global one. Settings load on session start, so run `/reload` after you edit them.

This example shows every field. Remove the comments before you copy it, because Pi reads `settings.json` as plain JSON:

```jsonc
{
  "ext.pi-t3-skills": {
    // Optional. What each chip becomes. Default: "[{command}](<{path}>)".
    // Must contain {path}, the skill file's path. Can contain {command}, which becomes /skill:<name>.
    // Up to 512 Unicode code points. An invalid format is ignored.
    "expansionFormat": "[{command}](<{path}>)"
  }
}
```

For file locations, limits, and the rules for leading references, read [expansion format](docs/rules.md#expansion-format).

## Side effects

- Only prompt text changes. Pi saves the changed prompt in its normal session storage.
- When a prompt contains a `<skill>` block, the extension reads the skill files of the prompt's chips, to recognise the blocks that T3 Code added.
- The extension writes no files and makes no network requests.

## Docs

| When you…                                                | Read                                                   |
| -------------------------------------------------------- | ------------------------------------------------------ |
| Wonder why a chip didn't change, or type `/skill:<name>` | [Matching](docs/rules.md#matching)                     |
| Still see skill contents in a prompt                     | [Skill blocks](docs/rules.md#skill-blocks)             |
| Want to know when the extension is active                | [Activation](docs/rules.md#activation)                 |
| Use the extension together with pi-skills                | [Use with pi-skills](docs/rules.md#use-with-pi-skills) |
| Need every format rule, limit, or settings location      | [Expansion format](docs/rules.md#expansion-format)     |
| Decide where a test belongs                              | [Test coverage](docs/testing.md)                       |
