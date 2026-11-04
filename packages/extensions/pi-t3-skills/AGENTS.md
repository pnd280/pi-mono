# [pi-t3-skills](README.md) development

## Constraints

- Register input behaviour only through the [input chain](../../libs/src/input-chain/README.md), as two transforms of one participant. A separate `input` handler would run in load order.
  - Remove T3 Code's blocks at rank `90`, before every transform that changes text. Today pi-skills at rank `100` is the first of these. A text change before the removal, for example pi-skills expanding a `/skill:<name>` token in a skill's body, stops the exact match. Keep this rank below every new text transform; ranks `91` to `99` stay free for transforms that need the prompt without T3 Code's blocks.
  - Rewrite chips at rank `110`, after pi-skills, so pi-skills never expands this extension's references.
- Join the input chain only when `T3_PI_MCP_EXTENSION_PATH` is set and not empty, as stated in the [activation rules](docs/rules.md#activation).
- Match chips with T3 Code's server rule in [chips.ts](src/chips.ts). Keep only this token matcher local. The shared [skill-reference module](../../utils/src/skill-reference.ts) owns the format schema, formatting, existing-reference detection, and the leading-reference guard.
- Remove T3 Code's blocks only on an exact suffix match, in [t3-suffix.ts](src/t3-suffix.ts). Never remove other user text. The [skill-block rules](docs/rules.md#skill-blocks) state the result for users.
- Read skill files only to rebuild T3 Code's suffix. Unlike pi-skills, this extension must read them, because an exact match needs the same file text that T3 Code reads. Use Pi's exported `stripFrontmatter`, as T3 Code does.
- Mirror T3 Code's hook at commit `8b44f42b14c8e273156474a924ccf29680dd7857`. When T3 Code changes its hook, update the [hook fixture](validation/t3-input-hook.ts) and the suffix reconstruction in the same change.

## Validation

For test coverage, read [docs/testing.md](docs/testing.md).
