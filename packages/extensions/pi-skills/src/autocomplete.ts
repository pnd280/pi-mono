import type { ExtensionAPI, SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions
} from "@earendil-works/pi-tui";

type SuggestionOptions = Parameters<AutocompleteProvider["getSuggestions"]>[3];

const skillPrefix = "/skill:";

function getCompletableSkillNames(commands: SlashCommandInfo[]): Set<string> {
  const collisions = new Set(
    commands.filter((command) => command.source !== "skill").map((command) => command.name)
  );

  // Native items have no provenance. Even identical descriptions cannot disambiguate them.
  return new Set(
    commands
      .filter((command) => command.source === "skill" && !collisions.has(command.name))
      .map((command) => command.name)
  );
}

function findToken(line: string, cursorCol: number) {
  const query = line.slice(0, cursorCol).match(/\S+$/u)?.[0];

  if (query === undefined) return undefined;

  const start = cursorCol - query.length;
  const suffix = line.slice(cursorCol).match(/^\S*/u)?.[0] ?? "";

  return { start, end: cursorCol + suffix.length, query };
}

/** Pi's editor treats the first line as a slash command while it starts with a slash. */
function isCommandLine(lines: string[], cursorLine: number, cursorCol: number): boolean {
  return cursorLine === 0 && (lines[0] ?? "").slice(0, cursorCol).trimStart().startsWith("/");
}

export function createSkillAutocompleteProvider(
  current: AutocompleteProvider,
  getCommands: ExtensionAPI["getCommands"]
): AutocompleteProvider {
  const ownedItems = new WeakSet<AutocompleteItem>();
  // Pi's editor re-queries an open picker after typing, deletion, and arrow moves; this lets skill suggestions close with their token.
  let showingSkills = false;

  async function suggestSkills(
    query: string,
    options: SuggestionOptions
  ): Promise<AutocompleteSuggestions | null> {
    const suggestions = await current.getSuggestions([query], 0, query.length, {
      ...options,
      force: false
    });

    if (options.signal.aborted || !suggestions) return null;

    const names = getCompletableSkillNames(getCommands());
    const items = suggestions.items
      .filter((item) => names.has(item.value))
      .map((item) => {
        // Do not mark borrowed items: another provider may reuse them in delegated results.
        const owned = { ...item };
        ownedItems.add(owned);

        return owned;
      });

    // A slash prefix makes Pi submit immediately after Enter accepts the selection.
    return items.length > 0 ? { items, prefix: query.slice(1) } : null;
  }

  async function suggest(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: SuggestionOptions
  ): Promise<AutocompleteSuggestions | null> {
    const query = findToken(lines[cursorLine] ?? "", cursorCol)?.query;

    if (query?.startsWith(skillPrefix)) return suggestSkills(query, options);
    // Tab keeps Pi's completion of other tokens, such as absolute paths.
    if (options.force) return current.getSuggestions(lines, cursorLine, cursorCol, options);

    if (isCommandLine(lines, cursorLine, cursorCol)) {
      // Pi completes slash commands at the start of the message, and their arguments.
      const native = await current.getSuggestions(lines, cursorLine, cursorCol, options);
      if (native || !query?.startsWith("/")) return native;

      return suggestSkills(query, options);
    }

    if (query?.startsWith("/")) return suggestSkills(query, options);

    // After the whitespace that ends a token, Pi would replace skill suggestions with files for an
    // empty prefix. Escape doesn't reset this state, so keep Pi's other results, such as a quoted @ path.
    if (query === undefined && showingSkills) {
      const native = await current.getSuggestions(lines, cursorLine, cursorCol, options);

      return native?.prefix === "" ? null : native;
    }

    return current.getSuggestions(lines, cursorLine, cursorCol, options);
  }

  return {
    ...(current.triggerCharacters ? { triggerCharacters: current.triggerCharacters } : {}),
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const suggestions = await suggest(lines, cursorLine, cursorCol, options);

      // Requests run one at a time; an aborted one leaves the open picker unchanged.
      if (!options.signal.aborted)
        showingSkills = suggestions?.items.some((item) => ownedItems.has(item)) === true;

      return suggestions;
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      // Later-line Tab takes Pi's forced file-completion path, even for skill commands.
      if (findToken(lines[cursorLine] ?? "", cursorCol)?.query.startsWith(skillPrefix)) return true;

      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      if (!ownedItems.has(item)) {
        return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
      }

      const line = lines[cursorLine] ?? "";
      const token = findToken(line, cursorCol);

      if (!token?.query.startsWith("/") || token.query.slice(1) !== prefix) {
        return { lines, cursorLine, cursorCol };
      }

      const insertion = `/${item.value} `;
      const completed = [...lines];
      completed[cursorLine] = line.slice(0, token.start) + insertion + line.slice(token.end);

      return { lines: completed, cursorLine, cursorCol: token.start + insertion.length };
    }
  };
}
