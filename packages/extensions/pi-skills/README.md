# pi-skills

Replaces registered skill commands with literal file references and adds native skill completion anywhere in Pi's prompt. Uses Pi **0.87.0**'s public extension and autocomplete APIs.

## Usage

Submit standalone `/skill:<name>` tokens anywhere in your text:

```text
Use /skill:review then /skill:review
```

For a skill registered at `/skills/review/SKILL.md`, this becomes:

```text
Use /skill:/skills/review/SKILL.md then /skill:/skills/review/SKILL.md
```

These references are literal text, not file-loading commands. The extension does not inject skill content and **does not guarantee that the model reads the file**.

### Matching

- Matching is exact and whitespace-delimited. Tabs, newlines, and standalone tokens inside fenced code are included.
- Unknown names and tokens with attached punctuation, backticks, prefixes, or suffixes remain unchanged unless the whole token is a registered command.
- Registered Markdown paths are inserted verbatim, including spaces. Surrounding text and whitespace are preserved; inserted paths are not rescanned.

### Completion

In the TUI, type `/skill:` at the start of a token and press Tab, including mid-prompt or on later lines. Suggestions keep Pi's fuzzy ordering and descriptions. Accept with Enter or Tab without submitting the prompt; Escape cancels the picker. The extension adds no automatic popup triggers.

Completion replaces the whole token, including any suffix after the cursor, and adds one space without consuming existing whitespace.

The extension omits suggestions for command names shared by a skill and an extension or prompt template. File, attachment, and unrelated completion use the existing provider.

### Input processing

Expansion runs through Pi's input hook in TUI, RPC, print, and JSON modes, and for extension `sendUserMessage()` calls even with `expandPromptTemplates: false`. Other input handlers retain Pi's normal [ordering and chaining](../../../node_modules/@earendil-works/pi-coding-agent/docs/extensions.md#input).

Commands handled before the hook, text generated later by prompt templates, and custom `sendMessage()` messages are not scanned.

## Configuration

No extension-specific settings or environment variables.

Pi's `enableSkillCommands` setting (enabled by default; toggle in `/settings`) controls completion, **not expansion on submission**. Expansion remains active whenever the extension receives input. Both use Pi's current registered skills, including changes from resource discovery and `/reload`.

## Side effects

Only prompt text changes. Images, steering/follow-up delivery, and queue behavior are preserved. Pi persists transformed prompts through its normal session storage. No additional persistent state or network requests.

## Validation

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
4. Toggle skill commands off/on in `/settings`; completion follows the setting while submitted `/skill:review` still expands.
5. Rename `skills/review.md` to `skills/fresh.md` and change its frontmatter `name` to `fresh`. Run `/reload`; check `/skill:fresh` completion and its submitted path.
6. Check file (`./sam`), attachment (`@sam`), native command (`/settings`), and fixture extension (`/fixture`, `#fi`) completion outside skill contexts.

See [workspace development](../../../docs/development.md) for shared checks.
