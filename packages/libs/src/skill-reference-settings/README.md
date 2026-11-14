# Skill-reference settings

[Library index](../../README.md#usage)

Extensions that rewrite skill tokens into references let users choose the reference format in Pi's settings. [`loadSkillReferenceFormat(key, options)`](index.ts) (`@pi-mono/libs/skill-reference-settings`) loads that format from the extension's settings section.

## Behaviour

- The format is the `expansionFormat` field of the top-level `key` section, such as `ext.pi-skills`.
- A valid format from the current directory's project settings wins, then a valid global format, then `defaultSkillReferenceFormat` from [`@pi-mono/utils/skill-reference`](../../../utils/src/skill-reference.ts).
- Project settings apply only when `projectTrusted` is true; it defaults to false. Settings in parent directories never apply.
- An unreadable file, a section that is not an object, a section with unknown keys, and a format that fails `skillReferenceFormatSchema` are ignored without a warning.
- Loads never write.

## Usage

```ts
import { loadSkillReferenceFormat } from "@pi-mono/libs/skill-reference-settings";

pi.on("session_start", (_event, ctx) => {
  format = loadSkillReferenceFormat("ext.my-extension", {
    cwd: ctx.cwd,
    projectTrusted: ctx.isProjectTrusted()
  });
});
```

## Caller responsibilities

- Pass `ctx.isProjectTrusted()` as `projectTrusted`.
- Use a top-level key that your feature owns, and expand references with [`@pi-mono/utils/skill-reference`](../../../utils/src/skill-reference.ts).

Related: [pi-skills](../../../extensions/pi-skills/README.md) and [pi-t3-skills](../../../extensions/pi-t3-skills/README.md) use the library.
