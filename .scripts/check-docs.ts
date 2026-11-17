// Check workspace Markdown: relative links and heading anchors must resolve, inline `Class.prototype.member` names must exist, and every "Last verified against Pi x.y.z" line must name the installed Pi version. Docs outside agent skills and prompt resources must also follow the structural conventions checked by checkConventions(). Every run also checks that each "N extensions" count in the README and the hero image source matches packages/extensions/.
// Usage: node .scripts/check-docs.ts [files...]   (default: all Git-visible Markdown)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { z } from "zod";

const root = resolve(import.meta.dirname, "..");
const { version: piVersion } = z
  .object({ version: z.string() })
  .parse(
    JSON.parse(
      readFileSync(join(root, "node_modules/@earendil-works/pi-coding-agent/package.json"), "utf8")
    )
  );

function markdownFiles(): string[] {
  const listed = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "*.md"],
    { cwd: root, encoding: "utf8" }
  );

  return listed
    .split("\0")
    .filter((file) => file !== "" && existsSync(join(root, file)))
    .map((file) => join(root, file));
}

// The 1-based line of a match index.
function lineAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

// Git for Windows checks out CRLF by default; the line-anchored patterns below expect LF.
function readMarkdown(file: string): string {
  return readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
}

// macOS and Windows file systems ignore case, but Linux and GitHub links do not. Inside the workspace, each path segment must match a directory entry exactly.
function exists(path: string): boolean {
  if (!existsSync(path)) return false;
  const local = relative(root, path);
  if (local === "" || isAbsolute(local) || local === ".." || local.startsWith(`..${sep}`))
    return true;
  let directory = root;

  for (const segment of local.split(sep)) {
    if (!readdirSync(directory).includes(segment)) return false;
    directory = join(directory, segment);
  }

  return true;
}

// Fenced blocks, including indented ones in list items, hold examples, not headings or links. Blank lines replace them, so line numbers stay valid.
function withoutFences(text: string): string {
  return text.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[`~]*[ \t]*$/gm, (block) =>
    block.replace(/[^\n]/g, "")
  );
}

// Inline code holds examples, not links.
function prose(text: string): string {
  return withoutFences(text).replace(/`[^`\n]*`/g, "");
}

// GitHub-style heading slugs, numbered on repeats. Inline code text stays in the slug.
const anchorCache = new Map<string, Set<string>>();

function anchors(file: string): Set<string> {
  const cached = anchorCache.get(file);

  if (cached) return cached;

  const found = new Set<string>();
  const seen = new Map<string, number>();

  for (const [, heading = ""] of withoutFences(readMarkdown(file)).matchAll(
    /^#{1,6}\s+(.+?)\s*#*$/gm
  )) {
    const slug = heading
      .toLowerCase()
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    let count = seen.get(slug) ?? 0;
    let anchor = count ? `${slug}-${count}` : slug;

    while (found.has(anchor)) anchor = `${slug}-${++count}`;
    found.add(anchor);
    seen.set(slug, count);
  }

  anchorCache.set(file, found);

  return found;
}

// Docs name test seams and patched host methods as `Class.prototype.member`. The class must exist in the Markdown file's package source or in the installed Pi declarations, and declare the member.
const prototypeName = /`([A-Za-z_$][\w$]*)\.prototype(?:\.([A-Za-z_$][\w$]*))?(?:\(\))?`/g;
const memberName =
  /(?:^|[;\n])\s*(?:(?:public|private|protected|static|readonly|declare|abstract|override|async|accessor|get|set)\s+)*\*?([A-Za-z_$][\w$]*)\s*[?!]?\s*[(<:=;]/g;
const typeScriptCache = new Map<string, string[]>();

function typeScriptFiles(directory: string, pattern: RegExp): string[] {
  const key = `${directory}\0${pattern.source}`;
  const cached = typeScriptCache.get(key);

  if (cached) return cached;

  const files = existsSync(directory)
    ? readdirSync(directory, { recursive: true, encoding: "utf8" })
        .filter((file) => pattern.test(file) && !file.split(sep).includes("node_modules"))
        .map((file) => join(directory, file))
    : [];
  typeScriptCache.set(key, files);

  return files;
}

// The package source, then the Pi host declarations.
function declarationFiles(file: string): string[] {
  const files: string[] = [];

  for (let directory = dirname(file); directory.startsWith(`${root}${sep}`);) {
    if (existsSync(join(directory, "package.json"))) {
      files.push(...typeScriptFiles(join(directory, "src"), /(?<!\.test)\.ts$/));
      break;
    }

    directory = dirname(directory);
  }

  const hosts = join(root, "node_modules/@earendil-works");

  for (const host of readdirSync(hosts)) {
    files.push(...typeScriptFiles(join(hosts, host, "dist"), /\.d\.ts$/));
  }

  return files;
}

// Index just past the closing quote of the string or template literal that starts at `start`.
function stringEnd(text: string, start: number): number {
  const quote = text[start];
  let index = start + 1;

  while (index < text.length && text[index] !== quote) index += text[index] === "\\" ? 2 : 1;

  return index + 1;
}

// The member names of `class name` in `text`, read from the class body at its own nesting level, without strings or comments. Undefined when the text declares no such class.
function classMembers(text: string, name: string): Set<string> | undefined {
  const declaration = new RegExp(String.raw`\bclass ${name}\b[^{]*\{`).exec(text);

  if (!declaration) return undefined;

  let outline = "";
  let depth = 1;
  let index = declaration.index + declaration[0].length;

  while (index < text.length && depth > 0) {
    const character = text[index];
    const pair = text.slice(index, index + 2);

    if (pair === "//") {
      const end = text.indexOf("\n", index);
      index = end < 0 ? text.length : end;
    } else if (pair === "/*") {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length : end + 2;
    } else if (character === '"' || character === "'" || character === "`") {
      index = stringEnd(text, index);
    } else {
      if (character === "{") depth++;
      else if (character === "}") depth--;
      else if (depth === 1) outline += character;
      index++;
    }
  }

  return new Set(Array.from(outline.matchAll(memberName), ([, member = ""]) => member));
}

const textCache = new Map<string, string>();

function findClass(files: string[], name: string): Set<string> | undefined {
  const declaration = new RegExp(String.raw`\bclass ${name}\b`);

  for (const path of files) {
    const text = textCache.get(path) ?? readFileSync(path, "utf8");
    textCache.set(path, text);

    if (!declaration.test(text)) continue;

    const members = classMembers(text, name);

    if (members) return members;
  }

  return undefined;
}

function checkPrototypeNames(file: string, text: string, name: string): string[] {
  const problems: string[] = [];
  let files: string[] | undefined;

  const scanned = withoutFences(text);

  for (const { 0: reference, 1: className = "", 2: member, index } of scanned.matchAll(
    prototypeName
  )) {
    files ??= declarationFiles(file);
    const members = findClass(files, className);
    const at = `${name}:${lineAt(scanned, index)}`;

    if (!members) problems.push(`${at}: missing class for ${reference}`);
    else if (member && !members.has(member)) problems.push(`${at}: missing member ${reference}`);
  }

  return problems;
}

// The documentation conventions (docs/documentation.md) allow a bold label at the start of a bullet only as the severity and layer of a "Must not regress" invariant (docs/agents/testing.md#coverage), with Critical invariants before High ones in each group.
const bulletLabel = /^[ \t]*(?:[-*+]|\d+\.)[ \t]+\*\*([^*\n]+?)(?::\*\*|\*\*:)/;
const severityLabel = /^(Critical|High), (?:e2e|integration|unit)$/;

type RegressScope = {
  /** Heading level of the open "Must not regress" section, or 0. */
  level: number;
  /** The list after a "Must not regress (...):" paragraph, before and after its first bullet. */
  intro: "pending" | "open" | undefined;
  seenHigh: boolean;
};

// Update the scope for this line, and return the bold label that starts its bullet, if any.
function trackRegressScope(scope: RegressScope, line: string): string | undefined {
  const heading = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);

  if (heading) {
    const [, marks = "", title] = heading;
    const level = marks.length;

    if (title === "Must not regress") scope.level = level;
    else if (level <= scope.level) scope.level = 0;
    scope.intro = undefined;
    scope.seenHigh = false;

    return undefined;
  }

  if (line.trim() === "") {
    if (scope.intro === "open") scope.intro = undefined;

    return undefined;
  }

  if (/^\S/.test(line) && !/^(?:[-*+]|\d+\.)\s/.test(line)) {
    scope.intro = line.startsWith("Must not regress") ? "pending" : undefined;
    scope.seenHigh = false;

    return undefined;
  }

  if (scope.intro === "pending") scope.intro = "open";

  return bulletLabel.exec(line)?.[1];
}

function labelProblem(scope: RegressScope, label: string): string | undefined {
  const severity = severityLabel.exec(label)?.[1];

  if (!severity) return `bold bullet label "${label}"; use a heading or a table`;

  if (scope.level === 0 && scope.intro !== "open") {
    return `severity label "${label}" outside a "Must not regress" list`;
  }

  if (severity === "High") scope.seenHigh = true;
  else if (scope.seenHigh) return "Critical invariant after a High one";

  return undefined;
}

function checkLabels(lines: string[], name: string): string[] {
  const problems: string[] = [];
  const scope: RegressScope = { level: 0, intro: undefined, seenHigh: false };

  for (const [index, line] of lines.entries()) {
    const label = trackRegressScope(scope, line);
    const problem = label === undefined ? undefined : labelProblem(scope, label);

    if (problem) problems.push(`${name}:${index + 1}: ${problem}`);
  }

  return problems;
}

// Package testing guides follow the template in docs/agents/testing.md#package-testing-guide.
const testingSections = ["Must not regress", "Not tested", "Manual checks"];

function checkTestingGuide(lines: string[], name: string): string[] {
  const problems: string[] = [];
  const sections = lines.flatMap((line, index) =>
    line.startsWith("## ") ? [{ title: line.slice(3).trim(), index }] : []
  );
  let previous = -1;

  if (!/^# .+ test coverage for maintainers$/.test(lines[0] ?? "")) {
    problems.push(`${name}:1: title is not "# <Package> test coverage for maintainers"`);
  }

  if (sections[0]?.title !== "Must not regress") {
    problems.push(`${name}: first section is not "Must not regress"`);
  }

  for (const { title, index } of sections) {
    const order = testingSections.indexOf(title);

    if (order <= previous) problems.push(`${name}:${index + 1}: unexpected section "${title}"`);
    else previous = order;
  }

  return problems;
}

// A compatibility doc opens with one "Last verified" quote line before its first section (docs/documentation.md#writing-for-scanning).
const verifiedLine = /^> Last verified against Pi \d+\.\d+\.\d+\b.* with .+\. Not covered: .+\.$/;

function checkCompatibilityDoc(lines: string[], name: string): string[] {
  const problems: string[] = [];
  const verified = lines.flatMap((line, index) =>
    line.includes("Last verified against Pi") ? [index] : []
  );
  const firstSection = lines.findIndex((line) => line.startsWith("## "));

  if (verified.length !== 1) {
    problems.push(`${name}: ${verified.length} "Last verified" lines; expected one`);
  }

  for (const index of verified) {
    const quoted = (offset: number) => (lines[index + offset] ?? "").startsWith(">");
    const at = `${name}:${index + 1}`;

    if (!verifiedLine.test(lines[index] ?? "") || quoted(-1) || quoted(1)) {
      problems.push(
        `${at}: "Last verified" is not one quote line "> Last verified against Pi x.y.z with <method>. Not covered: <gaps>."`
      );
    }

    if (firstSection !== -1 && index > firstSection) {
      problems.push(`${at}: "Last verified" line is not before the first section`);
    }
  }

  return problems;
}

// docs/documentation.md#extension-readmes: a jsonc block must be valid JSON once its comment lines are removed, because Pi reads settings.json as plain JSON. Only whole-line `//` comments are removed.
function checkJsonc(text: string, name: string): string[] {
  return Array.from(text.matchAll(/^```jsonc\n([\s\S]*?)^```$/gm), ({ 1: body = "", index }) => {
    try {
      JSON.parse(body.replace(/^[ \t]*\/\/.*$/gm, ""));

      return "";
    } catch (error) {
      return `${name}:${lineAt(text, index)}: jsonc block is not valid JSON after removing whole-line // comments; put each comment on a line of its own: ${error instanceof Error ? error.message : String(error)}`;
    }
  }).filter(Boolean);
}

function checkConventions(text: string, name: string): string[] {
  const path = name.split(sep).join("/");

  if (/^\.(?:agents|resources)\//.test(path)) return [];

  const lines = withoutFences(text).split("\n");
  const problems = checkLabels(lines, name);

  if (/^packages\/extensions\/[^/]+\/README\.md$/.test(path))
    problems.push(...checkJsonc(text, name));

  if (/^packages\/(?:.+\/)?docs\/testing\.md$/.test(path)) {
    problems.push(...checkTestingGuide(lines, name));
  }

  if (/^packages\/(?:.+\/)?docs\/pi-compatibility\.md$/.test(path)) {
    problems.push(...checkCompatibilityDoc(lines, name));
  }

  return problems;
}

function checkFile(file: string): string[] {
  const text = readMarkdown(file);
  const name = relative(root, file);
  const problems = [...checkPrototypeNames(file, text, name), ...checkConventions(text, name)];

  const linkText = prose(text);

  for (const { 1: target = "", index } of linkText.matchAll(
    /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g
  )) {
    const at = `${name}:${lineAt(linkText, index)}`;

    // URLs point outside the workspace.
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;

    const [path = "", anchor] = target.split("#", 2);
    const destination = path ? resolve(dirname(file), decodeURIComponent(path)) : file;

    if (!exists(destination)) {
      problems.push(`${at}: missing link target ${target}`);
      continue;
    }

    if (
      anchor &&
      destination.endsWith(".md") &&
      !anchors(destination).has(decodeURIComponent(anchor).toLowerCase())
    ) {
      problems.push(`${at}: missing anchor ${target}`);
    }
  }

  for (const { 1: version, index } of text.matchAll(/Last verified against Pi (\d+\.\d+\.\d+)/g)) {
    if (version !== piVersion) {
      problems.push(
        `${name}:${lineAt(text, index)}: last verified against Pi ${version}, installed Pi is ${piVersion}; verify with .agents/skills/pi-update/SKILL.md before changing the line`
      );
    }
  }

  return problems;
}

// A new extension must raise the count in the README and in the hero image source.
function checkExtensionCount(): string[] {
  const directory = join(root, "packages/extensions");
  const count = readdirSync(directory).filter((entry) =>
    existsSync(join(directory, entry, "package.json"))
  ).length;

  return ["README.md", "docs/assets/hero.html"].flatMap((file) => {
    const text = readFileSync(join(root, file), "utf8");

    return Array.from(text.matchAll(/\b(\d+) extensions\b/g), ({ 1: found, index }) =>
      Number(found) === count
        ? ""
        : `${file}:${lineAt(text, index)}: "${found} extensions"; packages/extensions/ has ${count}. After you fix hero.html, make the PNGs again with the command in its comment.`
    ).filter(Boolean);
  });
}

const files =
  process.argv.length > 2 ? process.argv.slice(2).map((file) => resolve(file)) : markdownFiles();
const problems = [...files.flatMap(checkFile), ...checkExtensionCount()];

for (const problem of problems) console.error(problem);

console.log(`Checked ${files.length} Markdown files: ${problems.length} problem(s).`);
process.exitCode = problems.length ? 1 : 0;
