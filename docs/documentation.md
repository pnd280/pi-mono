# Documentation conventions

[Workspace development](development.md)

Correct inaccurate guidance and document what readers need to use or maintain the project. Keep entry documents short by moving task-specific detail, not by compressing facts into fragments. Purpose, practical setup, and constraints needed by all readers belong inline. Put substantial task-specific guidance behind a link that says when to follow it. Prefer source links over prose repeating implementation or configuration, but summarise the point inline before linking. Retain non-obvious rationale and observable limits.

Write skills, `AGENTS.md` files, and docs under `docs/agents/` to [writing for agents](../.agents/skills/_aux/writing-for-agents/SKILL.md).

Use one H1, sentence-case headings, consecutive heading levels, numbered procedures, bullets for unordered items, tables for lookup and comparison, and language-tagged fences. Give parent headings substantive text before subheadings; remove headings that add no structure.

## Writing for scanning

- Put one checkable claim in each bullet. Group related claims under a heading, ordered by phase (for example read, write, cleanup).
- State the normal behaviour before exceptions. Collect leftovers under a labelled "Edge cases" line, and use a table for flag or option matrices.
- Put the most important rule first. In contract lists, lead with invariants whose violation causes harm (trust, data loss, focus capture) under an explicit heading, and move cosmetic rules lower.
- Write full sentences with verbs and articles. Use a slash only for a true alternative such as read/write, and at most once per sentence.
- Keep one or two inline links per paragraph, and make each link label name what its target holds. Collect routing links into a "When you… / Read" table instead of prose.
- Define project terms on first use in user-facing docs; in maintainer docs, link the package `GLOSSARY.md` term on first use when the package has one.
- Write manual procedures as a setup line followed by a Do / Expect table. Each Expect cell names what the tester sees, such as "The footer shows two rows", never "It works". Merge a row into the row before when it repeats that row's action or result.
- State each rule in one place and link to it elsewhere. User-visible behaviour belongs in the README or the user guide that it links; maintainer and tool-author docs link there. A callback contract belongs only in the tool-author reference.
- A README section that summarises a guide gives the user-visible outcome in one or two sentences and links the guide for the conditions. A glossary entry defines the term and links the guide that owns its behaviour, without restating rules or limits.
- Keep version-specific validation logs out of reference docs and ADRs. Start the compatibility doc with one "Last verified against Pi x.y.z" line: the method in one clause, then "Not covered:" and the gaps. Put the line directly under the title and intro, in the form `> Last verified against Pi x.y.z with <method>. Not covered: <gap>, <gap>, and <gap>.`, and separate gaps that contain commas with semicolons. Put source-diff results and host quirks under `## Limitations`, labelled with the Pi version they were observed in. An ADR keeps the evidence for its decision; record later upgrade checks in the compatibility doc.
- Use British spelling in prose. Preserve spelling in API names, settings, commands, and literal output.
- Replace stock assurances with observable behaviour. Omit sentences that only announce what a section will explain.

Emphasis convention: bold for keys (**Ctrl+O**), code for setting names and values (`summary`), and quotes for on-screen labels ("Explored"). Do not bold versions or mode names. Use headings or lookup tables instead of repeated bold labels at the start of bullets. The one exception is the severity and layer label, such as `**Critical, e2e:**`, that starts each invariant in a "Must not regress" list of the [testing policy](agents/testing.md#coverage).

## Package READMEs

Every README is a preamble and a high-level manual for a person: what the package or module is for, one example, how to use it, and the outcomes that the reader sees. Keep deep technical detail in lower-level docs. Exhaustive user rules, edge cases, field limits, and error tables go in user guides under `docs/`. Internals, event order, Pi hooks, and design rationale go in maintainer docs, `AGENTS.md`, or ADRs.

Write each package README for users. Open with the problem it solves in one sentence, then one concrete example (output, a screenshot, a command, or, for an extension that the model drives, a prompt); put feature links after that. Include `Usage` for actual package steps, `Configuration` for choices not obvious from source, `Side effects` for important writes or requests, and `Validation` for package-specific prerequisites and a "When you… / Read" table to the maintainer docs, only when there is substantive content. Put check procedures in `docs/testing.md` or `docs/validation.md`, not in the README. Do not repeat generic extension-loading commands or workspace checks in every package. Move tool-author and implementation detail to `docs/`, or label the section by its audience. When a section is a rule list longer than one screen, keep a short summary and an example in the README, and move the list to `docs/<topic>.md` with a "When you… / Read" row.

User docs (the README and the user guides that it links) state what the user sees and every limit that applies. Keep coordinator ranks, lifecycle phases, renderer-author budgets, and the names of shared modules, classes, listeners, and hooks in maintainer docs, tool-author docs, or `AGENTS.md`. When a user-visible rule comes from a shared module or is stated only in a maintainer reference, state it in the user doc; link the source only as detail for callers or maintainers.

Optional headings exist for substantive content only; omit a heading rather than fill it with boilerplate. Package `docs/testing.md` files follow the [package testing guide](agents/testing.md#package-testing-guide).

### Extension READMEs

An extension README under `packages/extensions/` makes two questions quick to answer: what the extension can do, and how to configure it. The intro answers the first, and the Configuration section answers the second. Instead of the sections above, it uses these sections in this order, and leaves out a section that has no content:

1. The title, then one or two sentences that state the problem and name every capability that the user can turn on or configure. Then one concrete example of what the user sees.
2. `## Controls`: a Control / Effect table with every command, shortcut, CLI flag, and model tool that the extension adds, and every built-in command, flag, key, or mouse action whose effect the extension changes. Keys that work only inside a menu or dialog of the extension go in Usage or in the guide for that menu.
3. `## Usage`: only steps or behaviour that the Controls table and the Configuration block cannot show. A short, complete rule set can stay here, also under `###` subsections. Move a rule list longer than one screen to a guide, and link it.
4. `## Configuration`: the settings key, the settings files that it goes in, and when to run `/reload`. Name the global file as `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`), and the project file as `.pi/settings.json` in the current directory of a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust). Then one `jsonc` block that shows every user setting, with a comment for each field that gives required or optional, the default or the effect when omitted, the allowed values, and the limits that users are likely to reach. Say that readers must remove the comments, because Pi reads `settings.json` as plain JSON. The block must be valid JSON after the comments are removed. The comments summarise the limits; a linked configuration guide under `docs/` owns the merge rules, every limit, and the error table. Merge rules that fit in a short paragraph can stay in the README instead of a guide.
5. `## Side effects`: only effects that the user sees or must act on, such as files written, network requests, replaced built-ins, start-up warnings, and lost prompt caches.
6. `## Docs`: the only "When you… / Read" table in the README. It lists every user guide, and then the maintainer docs in the last rows.

## Package instructions

A package `AGENTS.md` is optional. Add one for non-obvious boundaries and conditional pointers to specialised guidance, not for an inventory of source files or a repeat of the README. State each instruction once, and link the README or the compatibility doc for its reason.

Maintain a Pi compatibility checklist when the package relies on Pi contracts that need rechecking on upgrade; do not require an empty checklist for packages without such contracts. Give each checkbox one Pi contract, as a sentence that names the contract and its expected result, so that a maintainer can confirm it as true or false. Put rationale and failure behaviour in prose under the same heading as the checkbox, and link user-visible behaviour instead of restating it.

## Guides and references

Give each guide one primary task or topic and a link to its package or workspace entry document. Keep short, cohesive topics together; use headings only for content that benefits from separation.

Keep user guides in package `docs/`; existing `docs/testing.md`, `docs/pi-compatibility.md`, and `docs/validation.md` are maintainer references. Make that audience explicit in their titles or opening instructions. Shared-module and adapter READMEs address library callers and maintainers; `.agents/` skills and `AGENTS.md` address coding agents.

A shared-module README opens with the caller's problem, then names the entry point once. Summarise module behaviour, including what the module does not do, under "Behaviour", and give a usage example. "Caller responsibilities" holds only imperative caller duties. Put ownership pointers in one "Related" sentence. When the behaviour detail grows past what a caller needs to start, such as phase order, ranks, version-mismatch handling, or failure matrices, move it to a topic file next to the README, such as [working-message ordering](../packages/libs/src/working-message/ordering.md), and link it from a "When you… / Read" row.

Follow the [Pi link policy](agents/pi-docs.md#linking-pi-documentation): published pages for users, installed references for agents checking pinned contracts. Fetch new external targets and check their anchors. Update incoming fragment links when renaming or removing headings.

When revising docs, compare inline-code tokens and numbers with the previous text, check that moved facts keep their conditions, and run link and formatting checks. Preserve verified example output and distinguish placeholders in templates from commands readers can run as written.

## Code comments

Explain non-obvious constraints and design decisions near the code; omit obvious implementation narration.
