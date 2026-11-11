# [pi-nested-instructions](README.md) development

## Must not regress

- Infer [scope](GLOSSARY.md#discovery) from tool inputs alone. Never inspect results, enumerate glob matches, or run commands to infer scope.
- Never replace tools or modify Pi's native instruction loading. Keep Pi's filename precedence and the lexical cwd boundary.
- Deduplicate against the canonical projection, including context edits, and tie each [marker](GLOSSARY.md#discovery) to the exact call that created it.

## Constraints

- Save only through public session APIs.
- Keep rendering in [pi-tool-display](../pi-tool-display/src/adapters/pi-nested-instructions/README.md).

## References

| When you…                                   | Read                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Change discovery or persistence             | [Session lifetime](docs/design.md#session-lifetime)                                             |
| Change shared scope extraction              | [Shared scope extraction](docs/design.md#shared-scope-extraction), then check the utils helpers |
| Validate discovery, persistence, or notices | [Package docs](README.md#docs)                                                                  |
| Upgrade Pi                                  | [Compatibility checklist](docs/pi-compatibility.md)                                             |
