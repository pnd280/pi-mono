// Check workspace Markdown: relative links and heading anchors must resolve, and
// every "Last verified against Pi x.y.z" line must name the installed Pi version.
// Usage: node scripts/check-docs.ts [files...]   (default: all Git-visible Markdown)
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
    const count = seen.get(slug) ?? 0;

    found.add(count ? `${slug}-${count}` : slug);
    seen.set(slug, count + 1);
  }

  anchorCache.set(file, found);

  return found;
}

function checkFile(file: string): string[] {
  const text = readMarkdown(file);
  const problems: string[] = [];
  const name = relative(root, file);

  for (const [, target = ""] of prose(text).matchAll(
    /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g
  )) {
    // URLs and home-directory paths point outside the workspace.
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("~/")) continue;

    const [path = "", anchor] = target.split("#", 2);
    const destination = path ? resolve(dirname(file), decodeURI(path)) : file;

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
