# Supported tool cards

[pi-tool-display](../README.md) · [Tool card presentation](presentation.md) · [Glossary](../GLOSSARY.md)

Each supported tool gets a dedicated card. The shared layout, [exploration groups](presentation.md#groups), and [summary lines](presentation.md#summary-mode) are in tool card presentation.

When a tool is not the verified tool that a card expects, it keeps its own renderer, or gets a generic card if it has none. A verified tool whose arguments or result do not have the expected shape gets a generic card. [Renderer overrides](../README.md#configuration) can keep the tool's own renderer or force a generic card for any tool.

| Tool                                                                     | Section                                     |
| ------------------------------------------------------------------------ | ------------------------------------------- |
| Pi's `read`, `grep`, `find`, `ls`, `bash`, `powershell`, `edit`, `write` | [Native tools](#native-tools)               |
| Pi's built-in `codemode`                                                 | [Codemode](#codemode)                       |
| Pi's built-in MCP server tools                                           | [MCP tools](#mcp-tools)                     |
| Pi's built-in `tool_search`, and the one from pi-profiles                | [Tool search](#tool-search)                 |
| `@ff-labs/pi-fff`                                                        | [FFF](#fff)                                 |
| `pi-mcp-adapter`                                                         | [MCP adapter](#mcp-adapter)                 |
| `pi-read`                                                                | [Selective read](#selective-read)           |
| `pi-smart-compact`                                                       | [Smart compact](#smart-compact)             |
| `pi-subagents`                                                           | [Subagents](#subagents)                     |
| `pi-todo`                                                                | [Todo](#todo)                               |
| `pi-nested-instructions`                                                 | [Nested instructions](#nested-instructions) |

## Native tools

Pi's own tools get shell previews with status and duration, file diffs, and grouped reads and searches. They follow the shared card layout, group, and result rules of [tool card presentation](presentation.md).

- Observed shells show the recorded status and duration. A missing exit code stays unknown. Output text alone never sets the status.
- When the duration stayed on another machine, `Timing not on this machine` replaces it.
- Image omission warnings and fallbacks stay visible when Pi cannot display images.
- Pi's read continuation and byte-limit instructions stay visible in compact cards and groups, including fractional, negative, and exponent-form continuation values. Expansion shows them once, in the retained text.
- Diagnostic bodies and failure markers use error styling, without recolouring the process output before them.
- Text that exactly matches one of Pi's generated placeholders, trailers, or truncation notices looks like the generated text and gets its styling. It never changes the call's outcome. Similar phrases inside the content of a read file stay ordinary text.

## Codemode

Scripts from Pi's built-in `codemode` tool appear as cards with the highlighted script and a list of the calls that it made. Only the `codemode` of Pi's built-in extension gets this card. A `codemode` that the SDK or another extension registers keeps its own renderer.

- Headings read "Running script", "Ran script", or "Script failed".
- The script follows as JavaScript-highlighted code. Compact cards show up to 10 rows, or all 11 when only one row would be omitted, within the [heading formatting limit](presentation.md#resource-limits). An expansion hint marks omitted source.
- The result lists the calls that the script made, also while the script runs. Each row shows a status icon (`…` running, `✓` success, `✗` failure, `⊘` cancelled), the tool name, Pi's argument preview, and any reported duration or model-call cost.
- Compact cards show the latest 8 calls, one row each. Expansion shows every call with wrapped arguments and error previews.
- Multiple calls with positive costs add a "Model calls" total.
- The output follows without Pi's `Script completed` or `Script failed` header when that header is the first text block. Output from separate `text()` calls shares one compact preview. Failed scripts keep Pi's error output.
- Compact cards name Pi's saved output file as "Saved output", like other cards. Expanded output already ends with Pi's reference.

In summary lines, each script counts once as `ran 1 script`, with failures as `(1 failed)`. The calls that a script makes do not count, because they never reach the transcript and their truncated argument previews cannot identify files.

Limits:

- Edits that a script makes show no diffs, because their changes are not observed.
- A result without a valid call list shows no call list.

## MCP tools

MCP server tools from Pi's built-in MCP extension appear as cards with the server and tool name, the arguments, and an output preview. The card replaces Pi's own MCP renderer.

- Pending calls show Pi's tool name, such as `mcp__exa__web_search_exa`. Sanitised names can end in a hash and are never decoded.
- When a result or progress update names the server and tool, the heading switches to the unsanitised `server.tool`, even when the result has no content.
- Arguments always stay visible, regardless of `showParameters`.
- Output uses the ordinary [MCP output preview](renderers.md#mcp-facts). Returned MCP errors and thrown calls show as failures.
- Thrown or blocked calls keep Pi's tool name.
- When Pi truncated the output and saved it, compact cards add an "MCP output truncated; expand to inspect retained output." warning and a "Saved output" reference. Expanded cards keep Pi's warning and reference in the retained output, without adding them again.
- If saving failed, the card adds no notice, and the truncation text stays in the output.

Every call counts once in the shared MCP category of summary lines, together with [MCP adapter](#mcp-adapter) calls.

Limits:

- The resource tools `list_mcp_resources`, `list_mcp_resource_templates`, and `read_mcp_resource` get generic cards.
- Calls made inside codemode scripts appear only in the [codemode](#codemode) card's call list.
- In Pi 1.3.0, the registered tool names replace every character outside `[A-Za-z0-9_]` with `_` and add a hash suffix to colliding or overlong names. Exact-name [renderer overrides](../README.md#configuration) must use the registered names.

## Tool search

Calls to Pi's built-in `tool_search` appear as cards that name the tools each search loaded.

- Cards read "Searching tools" while pending and "Searched tools" afterwards, followed by the query after a spaced em dash.
- Raw parameters, including `limit`, stay hidden unless `showParameters: true`.
- After a successful search, the compact body reads "Loaded N tools: a, b" or "No matching tools". Expansion shows only the original text, without that line.
- Errors, cancellations, and results without valid loaded names keep the ordinary output preview. Unrecognised arguments fall back to generic cards.

Only ended [runs](../GLOSSARY.md#transcript-structure) have [summary lines](presentation.md#when-a-run-collapses). Loaded tools count once per name (`loaded 1 tool`, `loaded 3 tools`). Calls without a valid, nonempty list of loaded names, including Pi's error results, count as `tool_search ×N`.

A `tool_search` that the SDK registers through `createToolSearchExtension()`, or that another extension replaces, gets a generic card. The pi-profiles replacement is the exception.

### Tool search from pi-profiles

The `tool_search` that [pi-profiles](../../pi-profiles/README.md#tool-search) registers gets the same cards and summary counts as Pi's built-in tool search, because the tool and its result are Pi's.

- The loaded names include the tools that the current profile deferred, such as `bash`.
- Failure warnings name the adapter `pi-profiles:tool_search`.
- The card does not show which loaded tools a profile deferred, because the result does not record it.
- When a match belongs to a deferred [group](../../pi-profiles/docs/tools.md#groups), pi-profiles also loads the group's other tools. The result does not name them, so the card does not show them.

## FFF

FFF searches from [`@ff-labs/pi-fff`](https://github.com/dmtrKovalenko/fff/tree/main/packages/pi-fff) appear as compact cards with match counts, grouped by search filter.

- Adjacent calls [group](presentation.md#groups) by their exact literal `path` or multi-search `constraints`, which default to `.` when empty or omitted.
- `src/**` and `./src/**` are different filters, and filters never merge with native directories.
- An explicit empty pattern is valid. A call with no pattern cannot group, and it falls back to a generic card after its result arrives.
- Find calls with a nonempty `cursor` show `page <cursor>` in place of the pattern and filter. They stay outside exploration groups, because FFF resumes a saved query whose pattern and scope are not in the result. Result counts and notices stay available.
- Pagination, limit, query, and fallback notices stay visible in compact and expanded cards.

Completed successful calls with nonnegative whole-number counts show result summaries in place of match excerpts in compact cards, inside and outside groups:

- Grep and multi-grep summaries count the matches collected for the call.
- Find summaries count all matching files, which can exceed the current page.
- The index count is the unfiltered number of indexed files, not the number searched or the number with matches.

Missing or invalid counts give a bounded output preview. Failed and partial results get no summary. Calls with arguments or result details in an unexpected shape get generic cards and do not join exploration groups.

## MCP adapter

MCP tool calls from [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter) get cards that show the resolved `server.tool` name, the arguments, and script operation counts.

- Gateway summaries show the action and target.
- All MCP cards show arguments whatever `showParameters` says, because names alone may not identify the call. Long arguments and scripts use [previews](presentation.md#card-layout) until expanded.
- JSON strings are shown as given, never parsed or repaired.
- The heading shows the resolved `server.tool` when the result records it, and otherwise the requested name.
- MCP calls stay individual cards outside exploration groups. Calls other than scripts use output previews.
- A confirmed cancellation uses `warning`.
- Direct resource URIs and references to omitted raw MCP results appear on expansion.
- Truncation, saved-output references, and script operation failures stay visible when collapsed.
- Expanded cards keep the output guard's warning and saved-output reference in the published text, without adding them again. Script operation failures stay separate notices.

Completed scripts summarise their recorded operations. Calls, searches, descriptions, and evaluations each count as operations:

- When the script and all recorded operations succeed, a nonzero total replaces the emitted text in compact mode. Expansion restores that text.
- Failed or unfinished operations keep an output preview beside the total, with separate warning counts. An operation with `ok: false` and `error: "incomplete"` counts as unfinished, not failed.
- Scripts with no recorded operations show `0 MCP operations` and keep an output preview.
- Malformed operation records give an output preview without a summary.
- Failed or cancelled scripts keep their operation count and diagnostic output, even if their recorded operations succeeded.

Every call counts once in the shared MCP category of summary lines, together with built-in [MCP tools](#mcp-tools). MCP-like tools from the SDK or other packages get generic cards.

## Selective read

Selective reads from [`pi-read`](../../pi-read/README.md) group like native reads, and expanded cards highlight the selected lines.

- Headings separate read windows and selection ranges.
- Compatible reads [group](presentation.md#groups). Expansion highlights the selections without repeating the model's preview.
- Targets follow the [native path rules](presentation.md#target-paths) for headings, grouping, and summary counts.
- Notices stay visible, outside the selections.
- Pi's read trailers follow the [native text limits](#native-tools).
- Other result presentation follows the [native tools](#native-tools).
- Images, errors, cancellations, and partial results get no selection highlighting.
- Incompatible arguments or results get [generic cards](renderers.md#invalid-and-partial-input).

## Smart compact

Calls to the `compact` and `context_window` tools from [`pi-smart-compact`](../../pi-smart-compact/README.md) appear as cards with the compaction focus and readable context usage.

Both cards hide raw parameters by default, also on expansion. `showParameters: true` shows them. The compaction focus stays visible either way. Without a current verified tool definition, the calls get generic cards.

### Compaction cards

- Cards read "Requesting compaction" while pending and "Requested compaction" after the acknowledgement.
- The instruction focus follows the title, without JSON parameter syntax.
- The card confirms only the request, not a successful compaction. Native compaction and any later skip or failure status messages are unchanged.
- The card does not repeat a successful `Compaction requested.` acknowledgement in its body.
- When the result records them, the card shows the request-time model and thinking level. They describe the request-time selection, not confirmation that native default summarisation ran.
- Missing or invalid metadata, partial, failed, or cancelled results, and other output are shown unchanged.
- Display-only model information never changes the agent-facing acknowledgement or saved content.
- Replay uses the saved details, so later configuration changes cannot relabel earlier requests.

### Context-window cards

- Cards read "Checking context window" and "Checked context window".
- Valid token counts, context window, and percentage give a compact usage summary.
- Unknown token usage stays unknown. A missing percentage is not calculated, and usage over capacity is not clamped.
- Invalid details and errors keep the original text and diagnostics. Expansion shows the raw result.

## Subagents

Subagent tasks from [`pi-subagents`](../../pi-subagents/README.md) appear as progress cards with status, model, and usage. Background jobs appear as cards with the command and job ID. In fullscreen, a click opens the task or job, after pi-subagents checks that the card is current and that it owns the task or job.

### Task cards

- The first line shows the description and a status: queued, running, completed, failed, cancelled, or returned. Before details exist, it shows `preparing`, `waiting to run`, or `starting`.
- Elapsed time appears only when a start time is known.
- The second line shows the `model` and `thinking` that the call requested, if any, as `model:thinking` before details exist, then the resolved model, with `Waiting for capacity` or usage such as `↑48k ↓3.1k $0.21`.
- Usage omits cache counts and appears only when a value is positive.
- A failed or cancelled call shows usage before its error text. Line breaks in the error become spaces before wrapping.
- The card does not show running activity.
- A call that returned while its task keeps running shows a fixed `in background`, `steered`, or `input queued` status. Its task ID appears only when expanded.

### Results and expansion

- Results show the child's reply without the model-facing `<task>` envelope and its summary.
- Collapsed completed cards preview three reply lines, or all four when there are exactly four, under a `└` branch. Long lines end with `…`.
- Failed or cancelled cards show the recorded errors in place of a reply preview.
- Expanded cards show the task ID, non-default options, a ten-line prompt preview, and the retained results.

### Abort cards

- A `subagent_abort` card uses the task card layout: the task description, `⊘ aborted` with the task's elapsed time, the model, and usage.
- Before details exist, the description is the task ID.
- The abort call itself succeeded, so the card has no failure state.
- A click opens the aborted task.

### Background results

A delivered `pi-subagents.result` message uses the task card layout: the description, the final state and time, and the model and usage.

- Completed results add a reply preview. Failed or cancelled results show any recorded error.
- The task envelope is removed. Results have no prompt.
- Expansion adds the task ID, non-default options such as `background`, and the retained output.
- In fullscreen, a click opens the task.
- Invalid details keep Pi's default message box.
- Background results separate [exploration groups and runs](../GLOSSARY.md#transcript-structure) like other visible messages, and add no summary counts.

### Job cards

- A `job` call returns at once. Its card shows the description, `↗ returned; job continues in background`, the command, and the first eight characters of the job ID.
- Expansion shows the full job ID and the timeout, when the call sets one.
- The card does not show the later state of the job.
- If the job cannot start, the call has an error result without details, and the card is generic.
- A `job_abort` card uses the layout of an abort card. Before details exist, the description is the job ID. Then the card shows the job description, `⊘ aborted` with the job's run time, the command, and the exit code when it is known.
- If the command ended before the abort, the abort card shows the real outcome, including failure colouring for a failed job. The abort call succeeds.

### Job results

A delivered `pi-subagents.job-result` message shows the outcome, the run time, the command, the exit code, any recorded error, and the log path.

- A failed or cancelled job colours the card like a failed or cancelled call.
- Collapsed cards preview the first output lines. Expansion shows the job ID and the full retained output.
- The body has no `<job>` envelope.
- The card never reads the log file.
- In fullscreen, a click opens the job.
- Invalid details keep Pi's default message box.

### Subagents in summary lines

- Tasks count once per run by task ID (`ran 1 subagent`, `ran 3 subagents`). Aborted tasks count separately (`aborted 1 subagent`).
- Calls without a task ID count individually.
- Job and job abort calls count once each under their tool name.
- Job results add no summary counts.
- Incompatible results fall back to generic cards and counts.

## Todo

Todo calls from [`pi-todo`](../../pi-todo/README.md) appear as `Todos` cards with confirmed statuses and progress.

- Cards start with `Todos` and the action.
- Subject previews, status words, and progress summaries match the pi-todo widget and browser. Subjects use a 200-code-point budget, including any omission mark, and keep whole graphemes.
- Compact cards replace successful output with the confirmed status and progress. List cards keep the output preview beside the summary, so that pi-todo's omission notices stay visible.
- Progress excludes deleted todos. Snapshots with only deleted todos report their count and `no active todos`. Empty snapshots report `No todos`.
- Lists with a status filter or `includeDeleted: true` also report the number of matching todos in the full snapshot.
- Missing or invalid snapshots give an output preview.
- Failures omit the summary and show diagnostic bodies in `error`. A nonempty error in the result details marks the call as failed, even when Pi did not flag an error.
- Expansion restores the full result text. API labels stay literal, because unstructured output cannot reliably separate them from task content. Friendly labels apply only to generated headings and summaries.
- Adjacent `todo` calls form a collapsed `Todos` group with one member line per action and no call count. Each member keeps its result summary. Expansion restores each call's full card.
- After a result exists, incompatible arguments give ungrouped generic cards, for example `Call failed todo({})`.

Todo calls are left out of [summary lines](presentation.md#notices-and-todo-calls-in-runs), including incompatible calls with generic cards. They add no counts, and a run of only todo calls shows no line.

## Nested instructions

Instruction notices from [`pi-nested-instructions`](../../pi-nested-instructions/README.md) appear as compact cards that expand to the instruction text.

- Collapsed notices show `Loaded instructions`, `Updated instructions`, or `Removed instructions` and a path, in the shared [card style](presentation.md#card-layout). Paths wrap like card targets, in their saved cwd-relative spelling.
- Expand with Pi's tool-output shortcut (default **Ctrl+O**), or click the header in fullscreen, to read the formatted Markdown.
- Only header clicks toggle the card. Selection and scrolling in the body stay native.
- Notices with invalid details show their text beneath a generic heading.
- Notices join the preceding run of this extension's tool calls, but do not cross unrelated messages or tools that keep their own renderer. They separate exploration groups without ending a run. A collapsed run hides its notices, and a notice without a preceding run stays standalone.
- Valid notices add loaded, updated, and removed counts to the run's summary line. Each file path, or directory for removals, counts once per action within the run. Invalid and standalone notices add no counts to another run.
- Tool `rendererOverrides` and `showParameters` do not apply.
- Saved notices render even without pi-nested-instructions loaded. Without pi-tool-display, Pi shows the full messages in its default renderer.
- Custom rendering does not change model context or HTML export.
