export function expandSkillTokens(text: string, paths: ReadonlyMap<string, string>): string {
  return text.replace(/\S+/gu, (token) => {
    const path = paths.get(token);

    return path === undefined ? token : `/skill:${path}`;
  });
}

export function findSkillToken(line: string, cursorCol: number) {
  const query = line.slice(0, cursorCol).match(/\S+$/u)?.[0];

  if (!query?.startsWith("/skill:")) return undefined;

  const start = cursorCol - query.length;
  const suffix = line.slice(cursorCol).match(/^\S*/u)?.[0] ?? "";

  return { start, end: cursorCol + suffix.length, query };
}
