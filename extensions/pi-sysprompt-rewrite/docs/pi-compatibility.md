# Pi compatibility for maintainers

[pi-sysprompt-rewrite](../README.md)

> Last verified against Pi 1.6.1 with package checks, the e2e test, and a source review of the prompt section builder. Not covered: the docs-collapse manual checks, which last ran on Pi 1.5.2; the other manual offline host checks; and live Anthropic acceptance of the README example, including requests that continue a message thread.

## Upgrade procedure

Run the e2e test and the [manual checks](testing.md#manual-checks).

## Checklist

[Extension](../src/index.ts):

- [ ] Each `match` of the [README example](../README.md#configuration) still matches a line of Pi's `docs` section.
- [ ] Pi still builds its prompt from the sections that the [README](../README.md#usage) lists.
- [ ] Pi stores each section except `preamble` as `<name>\n…\n</name>`.
- [ ] The bash and PowerShell tools' guideline is still `You can inspect PI_* environment variables for current model and session details.`, and Pi still renders it in `rules` as a bullet of its own line.
- [ ] The `docs` section still holds only documentation paths and reading hints, which the [docs collapse](../README.md#docs-collapse) moves to the file.

If Pi changes the wrapper, rules see the tags and `^` or `$` stop matching the start and end of the section body. If the example stops matching, it rewrites nothing, and the user sees Pi's wording without a warning. If the guideline changes, the docs collapse leaves it in `rules` and the pointer line omits the PI_* hint, also without a warning.

## Limitations

- In Pi 1.5.0, the "Tightened system prompt" change reworded both lines that the README example matches. Pi 1.5.1 to 1.6.1 keep that wording.
- Pi 1.5.1 and 1.5.2 can continue a message thread on Anthropic's own endpoint. In Pi 1.6.0 and 1.6.1, the default applies to any provider whose `baseUrl` contains `api.anthropic.com`. The model's `compat.supportsMessageThreads` setting can override that default. A continuation leaves out the system prompt. A change to the prompt or model starts a new thread with the complete prompt when threading is enabled.
