// Check workspace Markdown: relative links and heading anchors must resolve, and
// every "Last verified against Pi x.y.z" line must name the installed Pi version.
// Usage: node scripts/check-docs.ts [files...]   (default: all Git-visible Markdown)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

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

// Fenced blocks and inline code hold examples, not links.
function prose(text: string): string {
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "").replace(/`[^`\n]*`/g, "");
}

// GitHub-style heading slugs, numbered on repeats.
const anchorCache = new Map<string, Set<string>>();

function anchors(file: string): Set<string> {
  const cached = anchorCache.get(file);

  if (cached) return cached;

  const found = new Set<string>();
  const seen = new Map<string, number>();

  for (const [, heading = ""] of prose(readFileSync(file, "utf8")).matchAll(
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
  const text = readFileSync(file, "utf8");
  const problems: string[] = [];
  const name = relative(root, file);

  for (const [, target = ""] of prose(text).matchAll(
    /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g
  )) {
    // URLs and home-directory paths point outside the workspace.
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("~/")) continue;

    const [path = "", anchor] = target.split("#", 2);
    const destination = path ? resolve(dirname(file), decodeURI(path)) : file;

    if (!existsSync(destination)) {
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
