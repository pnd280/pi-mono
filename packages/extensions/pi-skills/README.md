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

References remain literal prompt text, including at the start: Pi does not inject the skill body. This **does not guarantee that the model reads the file**. The extension itself does not read skill content.

### Matching

- Matching is exact and whitespace-delimited. Tabs, newlines, and standalone tokens inside fenced code are included.
- Unknown names and tokens with attached punctuation, backticks, prefixes, or suffixes remain unchanged unless the whole token is a registered command.
- By default, each matched command becomes `[/skill:<name>](registered-path)`. Paths are inserted verbatim, including spaces; surrounding text and whitespace are preserved except for any whitespace in the configured format. Resubmitting a reference with the same format and registered path leaves it unchanged, including skill-like text inside the path.

### Completion

In the TUI, type `/skill:` at the start of a token and press Tab, including mid-prompt or on later lines. Suggestions keep Pi's fuzzy ordering and descriptions. Accept with Enter or Tab without submitting the prompt; Escape cancels the picker. The extension adds no automatic popup triggers.

Completion replaces the whole token, including any suffix after the cursor, and adds one space without consuming existing whitespace.

The extension omits suggestions for command names shared by a skill and an extension or prompt template. File, attachment, and unrelated completion use the existing provider.

### Input processing

Expansion runs through Pi's input hook in TUI, RPC, print, and JSON modes, and for extension `sendUserMessage()` calls even with `expandPromptTemplates: false`. A default leading link cannot trigger Pi's skill-body expansion. If a custom format starts with a recognized `/skill:` command, the extension adds a leading space to keep it literal. Other input handlers retain Pi's normal [registration order](../../../node_modules/@earendil-works/pi-coding-agent/docs/extensions.md#events-and-concurrency) and chaining.

Commands handled before the hook, text generated later by prompt templates, and custom `sendMessage()` messages are not scanned.

## Configuration

Set the literal `ext.pi-skills` key in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`) or the current directory's [trusted](../../../node_modules/@earendil-works/pi-coding-agent/docs/security.md#project-trust) `.pi/settings.json`:

```json
{
  "ext.pi-skills": {
    "expansionFormat": "[{command}]({path})"
  }
}
```

`expansionFormat` defaults to `"[{command}]({path})"`. `{command}` is the full `/skill:<name>` token and `{path}` is the registered skill file path. `{path}` is required; `{command}` may be omitted. Placeholders may repeat, and other text (including spaces) is literal. For example, `"{command} ({path})"` produces the command followed by its path; when used at the start of a prompt, the extension adds a leading space to keep it literal.

Formats are limited to 512 characters; invalid sections are ignored. Settings files over 1 MiB are ignored, including unrelated fields. A trusted project's format overrides the global format. Settings load on session start and `/reload`; no UI or extension-specific environment variable is provided.

Pi's `enableSkillCommands` setting (enabled by default; toggle in `/settings`) controls completion, **not expansion on submission**. Expansion remains active whenever the extension receives input. Both use Pi's current registered skills, including changes from resource discovery and `/reload`.

## Side effects

Only prompt text changes. Images, steering/follow-up delivery, and queue behavior are preserved. Pi persists transformed prompts through its normal session storage. No additional persistent state or network requests.

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

See [workspace development](../../../docs/development.md) for shared checks.
