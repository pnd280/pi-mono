# [pi-nested-instructions](README.md) development

See the [glossary](GLOSSARY.md) for domain terms, and [session lifetime](docs/design.md#session-lifetime) before changing discovery or persistence.

## Must not regress

- Infer scope from tool inputs alone. Never inspect results, enumerate glob matches, or run commands to infer scope.
- Never replace tools or modify Pi's native instruction loading. Keep Pi's filename precedence and the lexical cwd boundary.
- Deduplicate against the canonical projection, including context edits, and tie each marker to the exact call that created it.

## Constraints

- Collect all markers in a batch before reading instructions.
- Save only through public session APIs.
- Keep rendering in [pi-tool-display](../pi-tool-display/src/adapters/pi-nested-instructions/README.md).
- Document new adapter limits in [input discovery](docs/design.md#input-discovery).

## Validation

| When you…                                 | Read                                                |
| ----------------------------------------- | --------------------------------------------------- |
| Change discovery, persistence, or notices | [package validation](README.md#validation)          |
| Upgrade Pi                                | [compatibility checklist](docs/pi-compatibility.md) |
| Change shared scope extraction            | Also check utils and `pi-fff-guard`.                |
