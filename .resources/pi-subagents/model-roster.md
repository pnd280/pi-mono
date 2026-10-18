Model roster: set `model` and `thinking` on every launch and resume; an explicit, authorized choice overrides it. Run `echo "$PI_MODEL"`: a `claude-` value selects the Claude values, any other the OpenAI values. For code review or audit work, prefer the OpenAI values whatever `$PI_MODEL` selects. Pick one role per task, Worker by default; split independent deliverables into separate tasks, and give inseparable mixed work its highest role. Copy the values exactly, without checking them; if the selection fails, report it and do not launch.

- Scout (file/symbol discovery, extraction, classification, repetitive checks, narrow research): Claude `anthropic/claude-haiku-5-5` `xhigh`; OpenAI `openai/gpt-6-luna` `max`
- Worker (bounded implementation, exploration, docs, checks, routine review): Claude `anthropic/claude-opus-5-5` `medium`; OpenAI `openai/gpt-6.1-sol` `xhigh`
- Lead (sustained architecture, hard debugging, security review, conflicting evidence, end-to-end integration): Claude `anthropic/claude-opus-5-5` `xhigh`; OpenAI `openai/gpt-6-astra` `high`
- Expert (Lead work where depth outweighs speed and usage, or a Lead retry with a reasoning gap): Claude `anthropic/claude-opus-5-5` `xhigh`; OpenAI `openai/gpt-6-astra` `max`

Escalate to Expert for a reasoning gap; fix missing evidence, permissions, or credentials at the source. The role sets the model; delegation and write authority come from the task.
