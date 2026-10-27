---
name: audit-docs-v2
description: Audit a repository's documentation for readability, navigation, audience mix-ups, broken references, and stock phrasing, then report findings as before → after examples. Also reviews a documentation revision for lost facts and regressions. Use for documentation sweeps, README or AGENTS.md reviews, or checking a docs rewrite.
disable-model-invocation: true
metadata:
  opencode/autoinvoke: false
references:
  - references/checklist.md
  - ../show-me/SKILL.md
---

# Documentation audit

Find what makes the docs hard to read or navigate, and show each problem as a concrete before → after. Read [the checklist](references/checklist.md) first; every finding should map to one of its items.

With no scope given, audit tracked Markdown: root and package `README.md`, agent instruction files (`AGENTS.md`, `CLAUDE.md`), `docs/`, and module READMEs. Exclude changelogs, generated files, and dependencies.

## 1. Learn the project's conventions

Before flagging anything, read the project's documentation guidelines and agent instruction files.

- A deliberate convention is not a finding. A shared `GLOSSARY.md` linked from agent docs is an example.
- If a guideline causes a problem (for example "keep entry docs short" producing compressed shorthand), report the guideline as a contributing cause and propose a change to it.
- Match the project's spelling variant and emphasis convention in your own report and edits.

## 2. Map the audiences

Classify every file in scope by its primary reader. The audience decides which checklist items apply, especially link targets.

| Audience               | Files                                                     |
| ---------------------- | --------------------------------------------------------- |
| People (users)         | `README.md`, `docs/settings.md`, …                        |
| Agents and maintainers | `AGENTS.md`, `docs/agents/`, `docs/testing.md`, …         |
| Unclear                | `docs/validation.md` (a person runs it; agents follow it) |

Files in the Unclear row are a finding: the audience should be visible from the location.

## 3. Take baseline signals

Run the commands under "Quick signals" in the checklist. Record the counts for a before/after comparison, and use them to choose files to read. Counts never become findings on their own.

## 4. Read and compare against the checklist

Read whole files in context. Sample across file types instead of reading only READMEs; problems usually repeat by file type (`docs/testing.md`, compatibility docs, `AGENTS.md`).

- Before calling a claim wrong, check it against code, configuration, or the dependency's docs. Report unverified doubts as unresolved.
- For links to external docs, fetch the target and confirm any anchor exists before recommending it.
- Treat stock patterns (checklist section 8) as signs of missing content. Propose the missing fact, not a synonym.

## 5. Report

Save a single report where the user asks, or in the project's artifacts or temporary folder. Follow [show-me](../show-me/SKILL.md): short prose, one small visual per point.

Open with the shared root cause and a "reader question → what the docs give them" sketch. Then give one numbered section per issue:

````markdown
## 3. Exceptions come before normal behavior

One sentence on the reader consequence.

**Before** (`path/to/file.md:42`):

```text
exact passage
```

**After:**

```markdown
proposed rewrite that keeps every fact
```

Fix pattern: one line a writer can apply elsewhere.
````

- Report one root cause as one issue, with its most representative examples. Say whether it is widespread or local.
- Every "after" keeps every fact from the "before".
- End with proposed guideline changes as a diff, and a sketch of where issues concentrate by file type.
- State the scope actually read and what was sampled rather than read in full.

## 6. Review a revision

When the user has rewritten docs from the report, check the result rather than re-auditing from scratch:

1. Compare signal counts before and after. A large rise in word count is worth reporting against the project's length guidance.
2. Look for lost facts. Compare every inline-code token and number in the old version of each file against all current docs, and confirm each one that moved still says the same thing.
3. Check relative links, heading anchors, and external URLs. Run the project's formatter check.
4. Read a sample of rewritten sections against the report's fix patterns and against checklist section 8. Rewrites often introduce new stock phrasing or the wrong spelling variant.
5. Confirm example output in the docs matches what the code produces.

Lead the reply with what to fix before committing, then the decisions the user needs to make, then what was verified.

## Apply changes

Edit documentation only when the user asks. Keep each fact and its conditions, update incoming links when moving or renaming headings, and rerun the link and format checks afterward.

When parallel workers apply fixes, give each a disjoint set of files, keep shared root docs read-only, and make borderline decisions the same across workers before finishing.
