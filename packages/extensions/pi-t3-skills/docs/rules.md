# T3 skill-chip rules

[pi-t3-skills](../README.md)

## Activation

The extension works only when the `T3_PI_MCP_EXTENSION_PATH` environment variable is set and not empty. T3 Code sets it only when it loads its own Pi extension, which adds the skill blocks. Without it, prompts reach the model unchanged. The variable is read when Pi loads extensions, at startup and on `/reload`.

## Matching

- A chip is a `$<name>` token separated by whitespace, as T3 Code reads it. This applies inside fenced code too.
- The name must match a registered skill exactly. Punctuation attached to a token, such as `$review,`, stops it from matching.
- Every matching chip changes, also when the same chip occurs more than once.
- Only `$<name>` chips change. A typed `/skill:<name>` stays; [pi-skills](../../pi-skills/README.md) handles it.
- Paths are inserted exactly as registered. References already in the current format, with the registered path, aren't changed again.
- An existing reference must be complete. If the format ends in a placeholder, the reference must be followed by whitespace or the end of the prompt.

Matching covers prompts, steering, and follow-up messages, and extension `sendUserMessage()` calls. It doesn't cover commands that Pi handles before extensions see the input, text produced by prompt templates, or messages that another extension sends from its `session_start` handler before this extension's handler runs.

## Skill blocks

T3 Code's Pi extension adds one `<skill name="…" location="…">` block with the skill contents for each chip. T3 Code loads its extension from its launch arguments, and Pi loads those extensions before installed ones, so T3 Code's extension normally runs first. The extension handles both load orders:

- When T3 Code's extension runs first, this extension removes the blocks only when the end of the prompt is exactly the text that T3 Code adds for the chips before it. It removes them before other pi-mono extensions change the prompt, and changes the chips later.
- When this extension runs first, for example in a custom launch through Pi's SDK, it changes the chips before T3 Code's extension sees the prompt. T3 Code's extension then finds no chips and adds no blocks, apart from the edge case below.

pi-mono extensions that read or change prompts, such as pi-skills and pi-prompt-manager, run their prompt steps together, at the place of the first of them that Pi loads. This extension therefore also runs first when any of them loads before T3 Code's extension.

If the end of the prompt isn't an exact match, the blocks stay, and the chips still change. This happens, for example, when a skill file changes between the two reads, or when an extension from outside pi-mono changes the prompt between T3 Code's extension and this one. Text that you typed and that only looks like a block stays.

Edge cases:

- A prompt that ends with exactly the blocks that T3 Code would add for its chips loses those blocks, also when you typed them.
- A registered skill path or an expansion format that contains a whitespace-separated `$<name>` of a registered skill isn't supported, for example the skill file `review $review notes.md` or the format `"{path} $review"`. When this extension runs first, T3 Code's extension reads that token in the reference as a chip and adds that skill's block. With pi-skills and a pi-skills format that differs from this extension's, such a token in a pi-skills reference changes too.

## Use with pi-skills

With [pi-skills](../../pi-skills/README.md), the steps run in this order, whatever the load order:

1. This extension removes T3 Code's blocks.
2. pi-skills changes `/skill:<name>` tokens.
3. This extension changes `$<name>` chips.

pi-skills therefore never changes removed blocks, also when a skill's text contains a `/skill:<name>` token. It also doesn't change the references that this extension adds.

This order needs the same input-chain version in both extensions. After a [version mismatch](../../../libs/src/input-chain/order.md#version-mismatch), they run in load order. If pi-skills then runs between T3 Code's extension and this one, and changes a `/skill:<name>` token in a block, the blocks stay.

## Expansion format

Put the `ext.pi-t3-skills` key in global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json` when set), or in `<cwd>/.pi/settings.json` of a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust). Parent directories aren't searched.

`expansionFormat` sets what each chip becomes. The default is `"[{command}](<{path}>)"`. The angle brackets keep paths with spaces or parentheses inside the Markdown link. Paths that contain `<`, `>`, or a line break don't make a valid link.

| Placeholder | Replaced with                          | Required |
| ----------- | -------------------------------------- | -------- |
| `{path}`    | The registered path of the skill file. | Yes      |
| `{command}` | The full `/skill:<name>` token.        | No       |

- Placeholders may repeat. Everything else, including spaces, is literal.
- If a leading reference could invoke a registered skill or prompt-template command, a space is added before it to keep it literal. This includes formats such as `"{command} ({path})"` with a leading chip.
- Formats are limited to 512 Unicode code points. Invalid sections, and settings files larger than 1 MiB, are ignored.
- A trusted project's format overrides the global one.
- Settings load on session start and `/reload`.
