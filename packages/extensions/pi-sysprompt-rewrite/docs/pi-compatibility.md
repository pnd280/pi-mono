# Pi compatibility for maintainers

[pi-sysprompt-rewrite](../README.md)

> Last verified against Pi 1.5.2 with package checks, the e2e test, and a source review of the prompt section builder. Not covered: the manual offline host checks, and live Anthropic acceptance of the README example, including requests that continue a message thread.

## Upgrade procedure

Run the e2e test and the [manual checks](testing.md#manual-checks).

## Checklist

[Extension](../src/index.ts):

- [ ] Each `match` of the [README example](../README.md#configuration) still matches a line of Pi's `docs` section.
- [ ] Pi still builds its prompt from the sections that the [README](../README.md#usage) lists.
- [ ] Pi stores each section except `preamble` as `<name>\n…\n</name>`.

If Pi changes the wrapper, rules see the tags and `^` or `$` stop matching the start and end of the section body. If the example stops matching, it rewrites nothing, and the user sees Pi's wording without a warning.

## Limitations

- In Pi 1.5.0, the "Tightened system prompt" change reworded both lines that the README example matches. Pi 1.5.1 and 1.5.2 keep that wording.
- In Pi 1.5.1 and 1.5.2, a request to Anthropic's own endpoint can continue a message thread, and then it leaves out the system prompt. Pi starts a new thread, with the complete system prompt, when the rewritten prompt differs from the previous request's. Only thread continuations leave out the system prompt; every other request, including one that starts a thread, carries it.
