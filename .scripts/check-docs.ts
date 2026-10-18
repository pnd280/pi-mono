// Check workspace Markdown: relative links and heading anchors must resolve, inline
// `Class.prototype.member` names must exist, and every "Last verified against Pi x.y.z"
// line must name the installed Pi version.
// Usage: node .scripts/check-docs.ts [files...]   (default: all Git-visible Markdown)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const piManifest: unknown = JSON.parse(
  readFileSync(join(root, "node_modules/@earendil-works/pi-coding-agent/package.json"), "utf8")
);
const piVersion = String(Reflect.get(Object(piManifest), "version"));

function markdownFiles(): string[] {
  const listed = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"],
    { cwd: root, encoding: "utf8" }
  );

  return listed
    .split("\n")
    .filter((file) => file !== "" && existsSync(join(root, file)))
    .map((file) => join(root, file));
}

// Git for Windows checks out CRLF by default; the line-anchored patterns below expect LF.
function readMarkdown(file: string): string {
  return readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
}

// macOS and Windows file systems ignore case, but Linux and GitHub links do not. Inside the
// workspace, each path segment must match a directory entry exactly. Both sides use NFC because
// HFS+ lists names in decomposed form.
function exists(path: string): boolean {
  if (!existsSync(path)) return false;
  const local = relative(root, path);
  if (local === "" || isAbsolute(local) || local === ".." || local.startsWith(`..${sep}`))
    return true;
  let directory = root;

  for (const segment of local.split(sep)) {
    const name = segment.normalize("NFC");
    if (!readdirSync(directory).some((entry) => entry.normalize("NFC") === name)) return false;
    directory = join(directory, segment);
  }

  return true;
}

// Fenced blocks, including indented ones in list items, hold examples, not headings or links.
function withoutFences(text: string): string {
  return text.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[`~]*[ \t]*$/gm, "");
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

// Docs name test seams and patched host methods as `Class.prototype.member`. The class must exist
// in the Markdown file's package source or in the installed Pi declarations, and declare the member.
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

// The member names of `class name` in `text`, read from the class body at its own nesting level,
// without strings or comments. Undefined when the text declares no such class.
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

  for (const [reference, className = "", member] of withoutFences(text).matchAll(prototypeName)) {
    files ??= declarationFiles(file);
    const members = findClass(files, className);

    if (!members) problems.push(`${name}: missing class for ${reference}`);
    else if (member && !members.has(member)) problems.push(`${name}: missing member ${reference}`);
  }

  return problems;
}

function checkFile(file: string): string[] {
  const text = readMarkdown(file);
  const name = relative(root, file);
  const problems = checkPrototypeNames(file, text, name);

  for (const [, target = ""] of prose(text).matchAll(
    /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g
  )) {
    // URLs and home-directory paths point outside the workspace.
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("~/")) continue;

    const [path = "", anchor] = target.split("#", 2);
    const destination = path ? resolve(dirname(file), decodeURIComponent(path)) : file;

    if (!exists(destination)) {
      problems.push(`${name}: missing link target ${target}`);
      continue;
    }

    if (
      anchor &&
      destination.endsWith(".md") &&
      statSync(destination).isFile() &&
      !anchors(destination).has(decodeURIComponent(anchor).toLowerCase())
    ) {
      problems.push(`${name}: missing anchor ${target}`);
    }
  }

  for (const [, version] of text.matchAll(/Last verified against Pi (\d+\.\d+\.\d+)/g)) {
    if (version !== piVersion) {
      problems.push(`${name}: last verified against Pi ${version}, installed Pi is ${piVersion}`);
    }
  }

  return problems;
}

const files =
  process.argv.length > 2 ? process.argv.slice(2).map((file) => resolve(file)) : markdownFiles();
const problems = files.flatMap(checkFile);

for (const problem of problems) console.error(problem);

console.log(`Checked ${files.length} Markdown files: ${problems.length} problem(s).`);
process.exitCode = problems.length ? 1 : 0;
