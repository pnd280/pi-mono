# Documentation quality checklist

Every item is a yes/no question you can answer by reading the docs.

The common failure is docs written as an exhaustive list of facts: each one true, all at equal weight, in the fewest words, recorded wherever it was discovered. Readers have to work out priority, order, and meaning on their own.

```text
reader question            what bad docs give them
──────────────────────     ───────────────────────────────────────────
"who is this for?"         every audience in one file
"what is this?"            feature inventory + 4 links in sentence 1
"how do I do X?"           rules about X, edge cases first
"what matters most?"       every rule at equal weight
"what does this mean?"     slash compounds + internal nouns
"does this link work?"     points into node_modules/
```

---

## 1. Audience and placement

Readers may be users, maintainers, or coding agents. The folder should say which one a doc is for.

```text
<package>/
├── README.md        # people: what it is, how to use it
├── AGENTS.md        # agents: non-obvious constraints + pointers
├── docs/            # people: guides, settings, controls
└── docs/agents/     # agents: testing, compatibility, architecture
```

- [ ] Each doc has one primary reader, visible from its location.
- [ ] User docs hold no private APIs, implementation details, or test policy. Crossover sections are labeled or moved.
- [ ] Agent instruction files (`AGENTS.md`, `CLAUDE.md`) don't repeat the README.
- [ ] A rule about writing a kind of doc lives where writers of that doc will see it.

## 2. Links and references

```text
link target
  if reader is a person
    published URL           # works on GitHub and before setup
  if reader is an agent
    installed copy ok       # matches the pinned version
  never in a user doc
    node_modules/ dist/ .venv/ build output, gitignored paths
```

```diff
-Only [trusted projects](../../../node_modules/<pkg>/docs/security.md#trust) can override …
+Only [trusted projects](https://example.dev/docs/latest/security#trust) can override …
```

- [ ] User-doc links work on the hosting site and before setup.
- [ ] The agent-doc exception for installed copies is written down.
- [ ] If published docs track `latest` but the project pins an older version, the drift is acknowledged.
- [ ] At most one or two inline links per paragraph, with the gist stated before the link.
- [ ] Routing lives in a "When you… / Read" table, not chained prose.
- [ ] Renamed or removed headings have their incoming anchor links updated.

## 3. Entry documents

```diff
-pi-foo: compact X, expandable Y, Z diffs, adapters for A, B, C ([1], [2], [3], [4]).
+Long agent runs scroll past what changed. pi-foo shows each tool call as one line:
+
+    ✓ Explored 3 files, 2 searches
+
+## Features
```

- [ ] Sentence one states the problem, not the feature list.
- [ ] One concrete example follows: a command, its output, or a screenshot.
- [ ] Setup every reader needs is inline. Specialized guidance sits behind a link that says when to follow it.
- [ ] Optional sections (Configuration, Side effects, Validation) appear only with real content.
- [ ] Generic instructions shared by all packages live once, at the root.

## 4. Structure for scanning

Order inside a contract section:

```text
## Settings file
  Example: one concrete case
  Must not regress          # security, data loss, trust, credentials
  Reads                     # normal behavior, in task order
  Updates
  Cleanup
  Edge cases:               # leftovers, labeled
```

- [ ] One subject per heading, one checkable claim per bullet.
- [ ] Rules whose violation causes harm come first, under an explicit heading.
- [ ] Normal behavior comes before exceptions.
- [ ] Option and flag combinations are a table.
- [ ] Manual procedures are a setup line plus a Do / Expect table, one observable result per row.
- [ ] Tables are for lookup or comparison. A table with one or two rows is a sentence.
- [ ] Every heading has its own text before any subheading.
- [ ] One H1, sentence-case headings, consecutive levels, language-tagged fences.

## 5. Sentences and vocabulary

```diff
-Read/write/cleanup paths bounded/BOM-tolerant; no retry on post-commit warn.
+Reads are bounded and accept a leading BOM.
+Warnings after a commit never turn into retries.
```

- [ ] Sentences are complete, with verbs and articles.
- [ ] A slash appears only for a true alternative (`read/write`), at most once per sentence.
- [ ] Project terms are defined on first use in user docs. Maintainer and agent docs link the glossary, if the project keeps one.
- [ ] Negations are kept for real prohibitions, not used to list everything a feature doesn't do.
- [ ] One emphasis convention, for example bold for keys, code for settings, quotes for on-screen labels.
- [ ] Bold marks something the reader acts on, not "key takeaways". Bullets aren't routinely shaped as `**Label:** text`; repeated labels become headings or a table.
- [ ] Em dashes are rare. A comma, colon, or parentheses usually reads better.
- [ ] One spelling variant throughout.

## 6. Single source of truth

```text
rule: "files over 1 MiB are truncated"
  defined in   README.md             # user-visible behavior
  linked from  AGENTS.md, docs/agents/testing.md
  never        restated in a third place
```

- [ ] Each rule is stated once; other docs link to it.
- [ ] The copy is removed from the layer that does not own the rule: packages drop restated workspace rules; root docs drop restated module details and link the owner.
- [ ] A doc that applies a shared rule keeps its specific facts (names, values, files, the exception) and drops only the restated general clause.
- [ ] A step in a numbered procedure is not a repeat. Keep "Run the checks" as a step; remove only restated commands or policy.
- [ ] Before removing an agent-doc copy, check how the agent reaches the original: an always-loaded "read X before Y" makes the copy redundant; a conditional routing row may not, so high-harm rules keep a one-line link where the agent works.
- [ ] Copies that already disagree are reported first.
- [ ] User-visible behavior is defined in user docs; maintainer docs link there.
- [ ] Cross-layer ownership is one table; each package names only its own part.
- [ ] Source links replace prose that repeats code, but non-obvious rationale and limits stay in prose.

## 7. Durability

```diff
 # Compatibility
+> Last verified against <dependency> 2.4.1. Not covered: Windows, live network services.
-## 2.3.0 run log
-- checked A, B, C …
-## 2.4.0 run log
-- checked A, B, D …
```

- [ ] Reference docs hold no version-by-version logs, only one "Last verified" line naming what wasn't covered.
- [ ] Version-specific quirks are labeled with the version they were observed in.
- [ ] Sample output, messages, and commands match what the code produces today.
- [ ] No placeholders remain: `TODO`, `<your-name>`, `2025-xx-xx`, `example.com` where a real value belongs.

## 8. Stock patterns

Generated text, and hurried human text, falls back on phrasing that fits any project. Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) catalogs these patterns. Its warning applies here too: they are signs of weak content, not the problem itself. Rewording a sign without adding the missing fact only hides it.

The most common one answers an objection nobody raised:

```diff
 # Documentation quality checklist

-A review checklist for project documentation, whoever wrote it. Every item is a yes/no
-question you can answer by reading the docs.
+Every item is a yes/no question you can answer by reading the docs.
```

The deleted clause defends the doc against an unstated accusation. It reads as if the writer expected a challenge, which is exactly what makes a reader suspicious.

For each sentence:

```text
if it would fit another project's README unchanged
  replace it with a fact about this project, or delete it
if it addresses the doc, its author, or a doubt the reader didn't have
  delete it
else
  keep it
```

- [ ] No preemptive disclaimers: "whoever wrote it", "regardless of your setup", "this isn't about X".
- [ ] No "not X, but Y" or "not just X, but also Y" unless a reader really holds belief X.
- [ ] No throat-clearing: the first sentence doesn't restate the title or announce what the doc will do.
- [ ] No meta-commentary about the doc: "this section explains", "this rule is defined here", "as mentioned above".
- [ ] No leftover chat: "Here is", "Certainly", "I hope this helps", "Let me know if".
- [ ] Hedges name a concrete limit. "Not tested on Windows" instead of "may not work in all environments".
- [ ] Facts are specific. "Retries three times, then exits with code 2" instead of "handles errors gracefully".
- [ ] Relationships are stated directly. "X calls Y" instead of "X integrates with Y" or "is associated with Y".
- [ ] Plain verbs: "is" instead of "serves as", "acts as", or "stands as".
- [ ] No promotional words: powerful, seamless, robust, effortless, comprehensive, crucial, enhance, leverage, showcase.
- [ ] No trailing "-ing" phrases that claim significance: "…, ensuring a smooth experience", "…, highlighting its flexibility".
- [ ] Lists of three appear only when there are exactly three things.

---

## Quick signals

Use these to find files worth reading, and compare them before and after a revision.

```sh
# Links into generated paths (any hit in a user doc is a bug)
rg -n '\]\([^)]*(node_modules|dist|\.venv)/' -g '*.md'

# Slash compounds (many hits outside paths and code)
rg -o '\b\w+/\w+(/\w+)?\b' -g '*.md' --stats

# Negation density (files far above the repo average)
rg -c -i '\b(not|never|no|without|unless)\b' -g '*.md'

# Links per file (look for paragraphs with 3+ links)
rg -c '\]\(' -g '*.md'

# Stock phrases, chat leftovers, and disclaimers (read each hit in context)
rg -n -i '\b(seamless(ly)?|robust|powerful|effortless(ly)?|comprehensive|crucial|leverag\w*|showcas\w*|serves as|whoever|regardless of|here is|let me know|i hope this helps|this section (explains|describes))\b' -g '*.md'

# Em dashes per file
rg -c '\x{2014}' -g '*.md'

# Package docs that link root rule docs (candidate restatements)
rg -n '\]\((\.\./)+docs/' -g '*.md' <package-dirs>

# Word growth after a rewrite (entry docs growing past their purpose)
git diff --stat -- '*.md'; wc -w README.md
```

Also run a Markdown link checker for broken relative links and anchors.
