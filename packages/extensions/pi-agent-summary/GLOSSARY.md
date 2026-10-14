# pi-agent-summary

pi-agent-summary times agent runs and records a summary of each finished run that stays out of model context.

## Language

**Run**:
Everything from the user's prompt until the agent settles, including retries, follow-ups, and waits for user input.
_Avoid_: turn, loop, agent loop

**Summary**:
The saved record of one finished run, shown in the transcript.
_Avoid_: report, recap

**Milestone**:
One item of work that another extension declares for the active run, shown in that run's summary.
_Avoid_: important work, highlight, achievement, note

**Counter**:
A named count that another extension adds to during the active run, shown as one segment of the summary line.
_Avoid_: statistic (file statistics), metric, stat
