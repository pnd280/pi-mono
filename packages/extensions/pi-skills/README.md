# pi-skills

Expands registered skill commands into configurable file references (Markdown links by default) and adds native skill completion anywhere in Pi's prompt. Uses Pi **0.87.1**'s public extension and autocomplete APIs.

## Usage

Submit standalone `/skill:<name>` tokens anywhere in your text:

```text
Use /skill:review then /skill:review
```

For a skill registered at `/skills/review/SKILL.md`, this becomes:

```text
Use [/skill:review](/skills/review/SKILL.md) then [/skill:review](/skills/review/SKILL.md)
```

References remain literal prompt text: Pi does not inject the skill body, and **the model is not guaranteed to read the file**.

### Matching

Matching is exact and whitespace-delimited, including inside fenced code. Attached punctuation or backticks prevent matching unless the whole token is a registered command. Paths are inserted verbatim; references using the current format and registered path are not expanded again.

### Completion

In the TUI, type `/skill:` at the start of a token and press Tab, including mid-prompt or on later lines. Accept with Enter or Tab without submitting the prompt; Escape cancels the picker. Suggestions follow Pi's registered skills and completion ordering.

Completion replaces the whole token, including any suffix after the cursor, and adds one space.

Skill names shared with an extension or prompt template are not suggested. Other completion remains available.

### Input processing

Expansion runs through Pi's input hook, including extension `sendUserMessage()` calls with `expandPromptTemplates: false`. A custom format beginning with a recognized `/skill:` command gets a leading space so Pi does not inject the skill body.

Commands handled before the hook, later prompt-template text, and custom `sendMessage()` messages are not scanned.

## Configuration

Set the literal `ext.pi-skills` key in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`) or the current directory's [trusted](../../../node_modules/@earendil-works/pi-coding-agent/docs/security.md#project-trust) `.pi/settings.json`:

```json
{
  "ext.pi-skills": {
    "expansionFormat": "[{command}]({path})"
  }
}
```

`expansionFormat` defaults to `"[{command}]({path})"`. `{command}` is the full `/skill:<name>` token; `{path}` is the registered skill file path and is required. `{command}` is optional, placeholders may repeat, and other text (including spaces) is literal. A format such as `"{command} ({path})"` gets a leading space at prompt start to prevent skill-body injection.

Formats are limited to 512 characters; invalid sections and settings files over 1 MiB are ignored. A trusted project's format overrides the global format. Settings load on session start and `/reload`; there is no extension-specific environment variable.

Pi's `enableSkillCommands` setting (toggle in `/settings`) controls completion, **not expansion on submission**. Both use Pi's current registered skills.

## Side effects

Only prompt text changes. Pi persists transformed prompts through its normal session storage; the extension adds no persistent state or network requests.

## Validation

[Coverage specification](docs/testing.md).

From the repository root:

```sh
vpr 'pi-skills#check'
vpr 'pi-skills#test'
```

For manual checks, launch an isolated offline Pi session:

```sh
vpr 'pi-skills#validate:terminal'
```

The launcher provides `review` and `release` skills and `sample.txt`. Submissions are displayed and recorded in `work/inputs.jsonl` under the printed fixture directory, without making model requests. The fixture is retained after exit.

1. Complete `Use /skill:re` and a later line beginning `/skill:re` with Tab.
2. Place the cursor after `re` in `/skill:reBAD rest`; accept and confirm the suffix is replaced while `rest` remains.
3. Accept with Enter and Tab without submission, cancel another picker with Escape, and undo an insertion.
4. Toggle skill commands off/on in `/settings`; completion follows the setting while submitted `/skill:review` still becomes a Markdown link to its file without a leading space.
5. Change the printed fixture's `agent/settings.json` to include `"ext.pi-skills": {"expansionFormat": "{command} ({path})"}`. Run `/reload` and submit `/skill:review`; check the new format and absence of injected skill content.
6. Rename `skills/review.md` to `skills/fresh.md` and change its frontmatter `name` to `fresh`. Run `/reload`; check `/skill:fresh` completion and its submitted path.
7. Check file (`./sam`), attachment (`@sam`), native command (`/settings`), and fixture extension (`/fixture`, `#fi`) completion outside skill contexts.
