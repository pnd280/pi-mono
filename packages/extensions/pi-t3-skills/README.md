# pi-t3-skills

[T3 Code](https://github.com/pingdotgg/t3code) sends a skill chip to Pi as `$<name>` text, and its Pi integration then pastes the skill's contents into the prompt. With this extension, each chip becomes a link to the skill's file, and the skill contents aren't added.

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

| When you…                            | Read                                       |
| ------------------------------------ | ------------------------------------------ |
| Wonder why a chip didn't change      | [matching](docs/rules.md#matching)         |
| Type `/skill:<name>` in T3 Code      | [matching](docs/rules.md#matching)         |
| Still see skill contents in a prompt | [skill blocks](docs/rules.md#skill-blocks) |

### Only `$<name>` chips are supported

Skills picked from T3 Code's `$` or `/` menu become `$<name>` chips and work. A `/skill:<name>` that you type yourself doesn't change; for it, install [pi-skills](../pi-skills/README.md).

## Configuration

Set `expansionFormat` under the `ext.pi-t3-skills` key in Pi's global settings or a trusted project's `.pi/settings.json`:

```json
{
  "ext.pi-t3-skills": {
    "expansionFormat": "[{command}](<{path}>)"
  }
}
```

The format must contain `{path}`, and can contain `{command}`, which becomes `/skill:<name>`. The value above is the default. For file locations, limits, and the rules for leading references, read [expansion format](docs/rules.md#expansion-format).

## Side effects

- Only prompt text changes. Pi saves the changed prompt in its normal session storage.
- When a prompt contains a `<skill>` block, the extension reads the skill files of the prompt's chips, to recognise the blocks that T3 Code added.
- The extension writes no files and makes no network requests.

## Validation

| When you…                   | Read                             |
| --------------------------- | -------------------------------- |
| Decide where a test belongs | [test coverage](docs/testing.md) |
