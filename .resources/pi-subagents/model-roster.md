Generic model roster: for a launch or resume that no template covers, set `model` and `thinking` from this list. Copy the values exactly, without checking them. For a reasoning gap, move up one entry in the same list.

GPT reviews code and plans; a GPT task changes no files and reports findings with source pointers.

- `openai/gpt-6-astra` `xhigh`: security, cross-module audit, subtle correctness, concurrency
- `openai/gpt-6.1-sol` `xhigh`: default review
- `openai/gpt-6-luna` `max`: narrow checks of code, diffs, or output against explicit criteria

Claude writes documentation and prose:

- `anthropic/claude-fable-5-2` `xhigh`

Claude does everything else:

- `anthropic/claude-opus-5-5` `xhigh`: depth outweighs speed and usage
- `anthropic/claude-opus-5-5` `high`: sustained architecture, hard debugging, orchestration
- `anthropic/claude-opus-5-5` `medium`: default
- `anthropic/claude-haiku-5-5` `xhigh`: file and symbol discovery, extraction, narrow test or lint runs
