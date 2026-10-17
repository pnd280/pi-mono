# Summary fields

[pi-agent-summary](../README.md)

For milestones and counters, see [milestones and counters](milestones-and-counters.md).

## Models

The prefix lists each model that answered, with the thinking level Pi requested, in order of first use, for example `openai-codex/gpt-5.5:high → openai-codex/gpt-5.5-mini:medium`.

- Under a Pi virtual model, these are the physical models it routed to.
- Interrupted responses count. Requests that ended in an error don't.
- Runs with no response have no prefix.

## Output throughput

`tok/s` is the reported output tokens, including reasoning, divided by the time the assistant spent streaming. Tool execution and gaps between responses are excluded.

It's an approximate rate seen from the client, not the provider's generation speed. Responses with no output usage or no streaming time are left out, and a run with nothing to measure shows no rate.

While the agent works, the working message refreshes the rate once a second in whole tokens per second, such as `160/s`:

- While a response streams text or tool input, it estimates that response at four characters per token, because most providers report output usage only at completion. The first non-empty update starts the clock; later updates supply the count. Thinking is excluded because providers hide or summarise it differently. During pauses, the estimate decreases until more visible output arrives or the response ends.
- Before a live estimate is available and between responses, it shows the run rate from completed responses, rounded to a whole number. If no response has reported measurable usage, no rate appears until a live estimate is available. The saved summary shows the final run rate to one decimal place.

## Commands

`ran N commands` counts each `bash` call the agent made once, including failed, cancelled, or blocked calls. Commands inside a script don't count separately, and commands you run yourself with `!` or `!!` are excluded.

## File changes

File statistics come from Pi's native `edit` and `write` tools only; changes made through `bash` or custom tools aren't counted.

- Counts compare each file's original and final content, so a change that was reverted disappears.
- Symlink aliases count as one file.
- Statistics are unavailable, not zero, for binary or unreadable files, files that changed during observation, failed writes, and comparisons that exceed the [diff limits](../../../libs/src/bounded-diff/README.md#behaviour). A large native edit can still use its tool-provided patch. Expand the summary to see why.
- Totals include only files with available statistics.
