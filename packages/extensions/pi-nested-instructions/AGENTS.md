# [pi-nested-instructions](README.md) development

## Constraints

Keep inference input-only and collect all batch markers before reading instructions. Do not inspect results, enumerate glob matches, execute inference commands, replace tools, or modify Pi's native instruction loading.

Persist through public session APIs; keep rendering in [pi-tool-display](../pi-tool-display/src/adapters/pi-nested-instructions/README.md). Deduplicate against the canonical projection, including context edits, and tie markers to the exact originating call. Preserve Pi filename precedence and lexical cwd boundaries. See [domain terms](CONTEXT.md) and [session lifetime](docs/design.md#session-lifetime) when changing discovery or persistence. Document new adapter limits in [input discovery](docs/design.md#input-discovery).

## Validation

Use [package validation](README.md#validation). For Pi upgrades, use the [compatibility checklist](docs/pi-compatibility.md); for shared scope changes, check utils and `pi-fff-guard` too.
