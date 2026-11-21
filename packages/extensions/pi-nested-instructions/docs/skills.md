# Nested skill rules

[Package](../README.md) · [Instruction loading rules](loading.md)

A nested skill is a skill in `.agents/skills/` or `.pi/skills/` of a directory below the session's working directory. pi-nested-instructions registers nested skills with Pi when a session starts, and lists a directory's skills for the model when a tool input reaches that directory. The [input discovery guide](input-discovery.md) lists the tool inputs that give directories.

## Project trust

pi-nested-instructions follows Pi's [trust decision](https://pi.dev/docs/latest/security#understand-project-trust) for the project.

- When Pi treats the project as untrusted, no nested skill is registered or listed. Nested instruction files still load.
- Pi makes a trust decision only when the working directory's `.pi/` folder holds settings or resources, or when the working directory or a directory above it has an `.agents/skills/` folder. It doesn't look at subdirectories. Otherwise, Pi trusts the project without asking, unless you saved a decision for it. So the nested skills of a project whose only skill folders are nested load without a trust prompt.
- When a refresh finds the project untrusted and an earlier listing is still in context, it adds a removal listing.

## Which skill folders are found

A search below the working directory finds the skill folders when a session starts: at startup, and on `/reload`, `/new`, `/resume`, and `/fork`. Pi waits for the search before the first prompt.

- Only `.agents/skills/` and `.pi/skills/` count. The search does not read `.claude/skills/`, nested `.pi/settings.json` files, or nested Pi packages.
- The working directory's own skill folders are Pi's, not nested.
- The search has no depth limit.
- The search skips directories whose names start with a dot, and `node_modules`.
- A skill folder that appears after the search is found by the next search, such as on `/reload`.

These rules differ from the [instruction rules](loading.md#which-files-load), which load from git-ignored directories and in untrusted projects.

### Ignore files

The search skips directories that a `.gitignore`, `.ignore`, or `.fdignore` file excludes.

- It reads these files in the working directory, in every directory that it searches, and in the directories above the working directory up to the repository root. Outside a repository, it reads none above the working directory.
- A nearer ignore file can re-include a directory that a farther one excludes, but nothing inside an excluded directory is found.
- Matching ignores case.
- The `.agents` and `.pi` folders themselves are not tested against the rules, only the directory that holds them.
- The search doesn't read git's global excludes file or `.git/info/exclude`.

### Symlinks

- The search never enters a symlinked directory.
- A skill folder that is a symlink counts only when it resolves to a directory inside the working directory. The search checks this when it runs, not again later.
- Inside an accepted skill folder, Pi follows symlinks, also to targets outside the working directory.

### Which files count as skills

Pi reads each nested skill folder as it reads a skill path that you configure:

- A `SKILL.md` in a subdirectory at any depth is a skill. A directory with a `SKILL.md` is not searched further.
- A `.md` file with a `description` directly inside the folder is a skill.

Pi's own `.pi/skills/` folder follows the same rules. Pi's own `.agents/skills/` folders differ: there, a `.md` file directly inside the folder doesn't count, but a `.md` file with a `description` in a subdirectory without a `SKILL.md` does. In a nested `.agents/skills/` folder, it is the other way round.

## Commands and name collisions

- The skills that the search finds when a session starts are Pi skills before the first prompt, so `/skill:<name>` and its completion work without a listing.
- A skill added later to a known skill folder can appear in a listing, but it becomes a command only after `/reload`.
- When two skill files have the same name, Pi keeps the one that it loaded first and reports its usual collision warning.
- Skills that Pi loads on its own come before nested skills.
- Among nested skills, the directory nearest the working directory comes first, and directories at the same depth come in alphabetical order. In one directory, `.pi/skills/` comes before `.agents/skills/`.

## When the model sees a skill

Nested skills are announced in session messages and kept out of the skill list of the system prompt during model runs. A skill that Pi loads on its own stays in the prompt, also when its file lies in a nested skill folder.

Tool inputs select the directories; the search alone posts nothing. After a tool batch, a directory gets a skill listing when all of these hold:

- The batch reached the directory or a path below it.
- The search found a skill folder in the directory.
- The directory has at least one skill to list.
- No list of the directory's skills is still in context.

The listing follows the directory's instruction notice when the same batch adds one.

- One listing covers both skill folders of a directory. It is Pi's `<available_skills>` list, with each skill's name, description, and file location, and an instruction to load a skill from its file that names no tool.
- The skills are read from disk when they are listed, so a listing can show a skill added to a known folder after the search.
- A skill with `disable-model-invocation: true` is not listed, but `/skill:<name>` still loads it.
- A listing includes skills that lost a name collision. The model can load them from their file location, but `/skill:<name>` loads the skill that won.
- Reading a skill file does not replace the listing of its directory.

### Limits

A directory gets no listing when it has more than 4,096 skills to list, or a skill with a name over 1,024 characters or a description over 65,536 characters. These limits apply to the listing, not to registration, so the skills remain commands. A refresh that hits a limit adds no listing, so an earlier listing can stay in context.

### System prompt replacement

An extension that loads before pi-nested-instructions and replaces the system prompt for a run keeps the nested skills in that run's prompt. Load pi-nested-instructions before such an extension.

## Compaction, branching, and reload

- If compaction, branch navigation, or a context edit removes a listing from the model's context, or changes its text, a later tool input that reaches the directory lists its skills again.
- During normal turns, a listing keeps the skills that it delivered.
- When a session starts, discovery compares each directory's current skill list with the latest listing whose message is still unchanged in context. It skips directories outside the working directory.
- A refresh adds an updated listing when the list differs, and a removal listing when a list that had skills has none left. A removal also follows when the project is no longer trusted, or the search no longer finds the directory's skill folders.
- When skills return after a removal, a refresh or a later tool input adds a new listing.

## Invalid listing metadata

Listings use persisted format version 1, which the [persisted contracts](pi-compatibility.md#persisted-contracts) define. A listing with invalid metadata keeps its text in the session and in the model's context. It doesn't suppress a new listing, take part in refresh, or add structured display and summary counts. pi-tool-display shows its text under a generic heading.
