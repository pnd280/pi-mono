import type { ExtensionAPI, SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";

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

function findSkillToken(line: string, cursorCol: number) {
  const query = line.slice(0, cursorCol).match(/\S+$/u)?.[0];

  if (!query?.startsWith("/skill:")) return undefined;

  const start = cursorCol - query.length;
  const suffix = line.slice(cursorCol).match(/^\S*/u)?.[0] ?? "";

  return { start, end: cursorCol + suffix.length, query };
}

export function createSkillAutocompleteProvider(
  current: AutocompleteProvider,
  getCommands: ExtensionAPI["getCommands"]
): AutocompleteProvider {
  const ownedItems = new WeakSet<AutocompleteItem>();

  return {
    ...(current.triggerCharacters ? { triggerCharacters: current.triggerCharacters } : {}),
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const token = findSkillToken(lines[cursorLine] ?? "", cursorCol);

      if (!token) return current.getSuggestions(lines, cursorLine, cursorCol, options);

      const suggestions = await current.getSuggestions([token.query], 0, token.query.length, {
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
      return items.length > 0 ? { items, prefix: token.query.slice(1) } : null;
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      // Later-line Tab takes Pi's forced file-completion path, even for skill commands.
      if (findSkillToken(lines[cursorLine] ?? "", cursorCol)) return true;

      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      if (!ownedItems.has(item)) {
        return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
      }

      const line = lines[cursorLine] ?? "";
      const token = findSkillToken(line, cursorCol);

      if (!token || token.query.slice(1) !== prefix) return { lines, cursorLine, cursorCol };

      const insertion = `/${item.value} `;
      const completed = [...lines];
      completed[cursorLine] = line.slice(0, token.start) + insertion + line.slice(token.end);

      return { lines: completed, cursorLine, cursorCol: token.start + insertion.length };
    }
  };
}
