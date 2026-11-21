# Pi compatibility for maintainers

[Package](../README.md) · [Glossary](../GLOSSARY.md)

> Last verified against Pi 1.6.0 with package checks, offline host tests that include real codemode cases, a source review of the Pi 1.5.2 to 1.6.0 changes, and a tmux run of pi-tool-display's [listing checks](../../pi-tool-display/docs/validation.md#nested-skill-listings). Not covered: manual [notice](../GLOSSARY.md#delivery) presentation, skill listings in Pi's default renderer, `/skill:<name>` expansion and completion in an interactive terminal, and Windows paths.

## Checklist

Nested discovery must preserve Pi's native instruction loading and system prompt, and deduplicate against the surviving session context.

### Native discovery

- [ ] Native context discovery still prefers `AGENTS.override.md`, `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, then `CLAUDE.MD`.
- [ ] Native context discovery strips a UTF-8 BOM.
- [ ] Native context discovery follows file symlinks.
- [ ] Native context discovery skips unreadable and non-regular candidates.

### Tool inputs

- [ ] `turn_end.message` exposes the inputs of tool calls the assistant made directly, including blocked or rejected calls.
- [ ] `turn_end.messageEntryId` identifies the exact source entry for each direct call.
- [ ] Public `tool_execution_start` events with `parentToolCallId` supply nested inputs before validation and interception.
- [ ] Boundary drafts are saved after tool results and before the next model request, without implicit steering or continuation.
- [ ] The selective-read and native path schemas still match the fields that the adapters read.
- [ ] On Windows, native tools still map `/c/…`, `/mnt/c/…`, and `/cygdrive/c/…` to `C:\…`, as `nativePath()` in the [scope extraction](../src/scopes.ts) does.

Discovery collects nested inputs until the same `turn_end`, without reading results. Only direct calls create [read markers](../GLOSSARY.md#discovery), because nested output may never reach the model.

### Session

- [ ] `turn_end.context.contextEntries` includes earlier boundary drafts and applies their compaction and context edits.
- [ ] Returning boundary entries replaces the accumulated draft list.
- [ ] `buildSessionProjection()` keeps source entry IDs and applies compaction and context edits.
- [ ] `getBranch()` supplies metadata for the branch.
- [ ] `session_start` fires for startup, resume, reload, new sessions, and forks.
- [ ] Pi awaits each `session_start` handler and then emits `resources_discover`, for every `session_start` reason, including `reload`.
- [ ] The first lifecycle participant handler of `resources_discover` runs the startup commit, which sends refreshed notices and skill listings.
- [ ] An idle `sendMessage(..., { triggerTurn: false })` appends the message at once, so the commit rank decides its place among startup entries.
- [ ] `sendMessage(..., { triggerTurn: false })` doesn't interrupt a running batch.
- [ ] Metadata-only custom entries stay out of model context.
- [ ] Visible notices and skill listings keep their content and details without a registered renderer.

Discovery preserves `turn_end.entries` when it adds notices or markers, because returned entries replace the draft list. Replaced content doesn't keep its loaded status just because its details are unchanged, and no pending discovery state is kept across turns or sessions. Presentation belongs to the [pi-tool-display adapter](../../pi-tool-display/src/adapters/pi-nested-instructions/README.md).

### Skills

- [ ] Pi loads the `skillPaths` that `resources_discover` returns after its own skills, so its own skill wins a name collision.
- [ ] Pi loads extension `skillPaths` under `--no-skills`.
- [ ] `pi.getCommands()` lists each skill of those paths as `skill:<name>` with `sourceInfo.path`.
- [ ] Inside a `resources_discover` handler, `pi.getCommands()` lists only the skills that Pi loaded without extension `skillPaths`, also after a reload.
- [ ] Removing a skill from `before_agent_start`'s `systemPromptOptions.skills` removes it from the system prompt of every request of that run, including retries.
- [ ] Each skill in `systemPromptOptions.skills` has the `filePath` of its skill file below the registered folder.
- [ ] `ctx.isProjectTrusted()` reports Pi's effective trust for the project, including trust that Pi grants without a prompt.
- [ ] `loadSkillsFromDir` reads a folder as the resource loader reads a configured skill path: a `SKILL.md` at any depth, with no search below it, and a `.md` file with a `description` directly inside the folder.
- [ ] `formatSkillsForPrompt(skills, "indirect")` omits skills with `disable-model-invocation`.
- [ ] `formatSkillsForPrompt(skills, "indirect")` returns an empty string when no skill remains.
- [ ] Pi's skill scanner still skips dot directories and `node_modules`, as the [skill folder search](../src/skill-folders.ts) does.
- [ ] Pi's skill scanner still reads `.gitignore`, `.ignore`, and `.fdignore`, the files that the skill folder search reads.

The `resources_discover` order is the [session checkbox](#session) above. Pi has no API that registers a skill during a session, so every nested skill folder registers when a session starts. The [nested skills design](design.md#nested-skills) explains why the prompt filter and the listings replace the system prompt entry.

## Persisted contracts

The [notice interface](../src/notices.ts) writes version 3. Display extensions decode notices with the `pi-nested-instructions/notices` export. A note identifies Pi as the sender, and loaded and updated notices wrap the instruction body in a `<project_instructions path="…">` tag. The `messageDigest` validates the full canonical model-facing message before the [ledger](../GLOSSARY.md#delivery) decodes and compares its instruction body.

The reader validates the current schema strictly:

- Notices with a version other than 3 or unknown metadata keys do not validate.
- The [invalid-notice behaviour](loading.md#invalid-notice-metadata) applies when validation fails.
- Direct-read markers use version 1 and hold filesystem revision stamps, originating-call identity, and call fingerprints.

The [listing interface](../src/skill-listings.ts) writes `pi-nested-instructions.skills` messages at version 1. Display extensions decode them with the `pi-nested-instructions/skill-listings` export. The details hold the directory, its display path, the action, the name and description of each listed skill, and a `messageDigest` of the full message. The message content holds the note and Pi's skill list, which the ledger compares on refresh. The reader validates this schema strictly too, and an [invalid listing](skills.md#invalid-listing-metadata) contributes nothing.

## Limitations

The extension uses only public Pi APIs, with no host patches or tool overrides. The local filename list, input adapters, and skill folder search still need checking on upgrades, because Pi has no public API for discovering only nested files that also avoids reading instruction files the model read directly, and none for its skill scanner.

- Discovery doesn't follow result paths, opaque scripts, or temporary context rewrites by other extensions.
- In Pi 1.6.0, Pi's base prompt and `ctx.getSystemPrompt()` outside a run include nested skills, because Pi applies `before_agent_start` only to a run's prompt.
- In Pi 1.6.0, a `before_agent_start` handler that runs before this extension's and returns `systemPrompt` sets `forceSystemPrompt` on the shared options. The prompt text is then fixed before the filter runs, so nested skills stay in that run's prompt. The [nested skill rules](skills.md#system-prompt-replacement) tell users to load this extension first.
- In Pi 1.6.0, Pi trusts a project whose only skill folders are nested without a prompt, as the [project trust rules](skills.md#project-trust) explain.
- A [direct read](../GLOSSARY.md#discovery) is an attempt, not proof that the content was delivered in full.
- In Pi 1.5.0 to 1.5.2, a saved "Do not trust" decision makes `ctx.isProjectTrusted()` false even for a folder with only `AGENTS.md`. Pi still loads context files regardless of project trust, and discovery also ignores trust, so both stay aligned.
- In Pi 1.4.0 to 1.5.2, discovery reads inputs as issued, before Pi coerces them. A path that Pi converts to a string, such as a number, gives no scope.
- In Pi 1.5.1 to 1.6.0 on Windows, native `find` reads `\` in a pattern as a path separator. Discovery [reads a pattern's directories only with `/`](input-discovery.md#windows).

Replace local behaviour only if a public Pi API keeps these boundaries and metadata-only markers. Don't replace it with the startup loader, which also reads global and ancestor content.
