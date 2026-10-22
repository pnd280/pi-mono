// Build the tree of the `release` branch: one Pi package that holds every extension and that
// `pi install git:…` can install with npm, pnpm, or Bun. Then install a copy as Pi does and start
// the Pi CLI with every extension.
// Usage: node .scripts/build-release.ts [output-directory]   (default: .tmp/release)
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, posix, relative, resolve } from "node:path";

import { z } from "zod";

const root = resolve(import.meta.dirname, "..");
const scratch = join(root, ".tmp");
const output = resolve(process.argv[2] ?? join(scratch, "release"));

// Only clear an existing directory inside .tmp/, so a mistyped argument cannot delete other work.
// Resolve both paths first, so a symlink in the output path cannot lead outside .tmp/.
if (existsSync(output)) {
  const local = existsSync(scratch) ? relative(realpathSync(scratch), realpathSync(output)) : "..";

  if (local === "" || local.startsWith("..") || isAbsolute(local)) {
    throw new Error(`${output} exists; remove it or choose another directory`);
  }

  rmSync(output, { recursive: true });
}

function packageNames(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(directory, entry.name, "package.json"))
    )
    .map((entry) => entry.name)
    .sort();
}

// Shared packages go under lib/ and extensions under extensions/. Package names stay the same, so
// imports between packages resolve through the links that the package manager creates.
const sources = [
  ...packageNames(join(root, "packages")).map((name) => ({
    directory: join(root, "packages", name),
    target: posix.join("lib", name),
    extension: false
  })),
  ...packageNames(join(root, "packages/extensions")).map((name) => ({
    directory: join(root, "packages/extensions", name),
    target: posix.join("extensions", name),
    extension: true
  }))
];

function readObject(path: string): object {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));

  if (typeof value !== "object" || value === null) throw new Error(`${path}: expected an object`);

  return value;
}

function writeJson(path: string, value: object): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

// Lint keeps runtime modules from importing tests, test fixtures, and validation fixtures.
const developmentFile = /\.test\.ts$|^test-fixture\.ts$|^AGENTS\.md$|^tsconfig\.json$/;

function prune(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "validation") rmSync(path, { recursive: true });
      else prune(path);
    } else if (developmentFile.test(entry.name)) {
      rmSync(path);
    }
  }
}

// `pnpm pack` replaces `workspace:` and `catalog:` specifiers, which npm rejects, with versions.
const packResult = z.object({ filename: z.string() });
const extensionManifest = z.object({ pi: z.object({ extensions: z.array(z.string()) }) });
const extensionEntries: string[] = [];
const tarballs = mkdtempSync(join(tmpdir(), "pi-mono-release-"));

try {
  for (const { directory, target, extension } of sources) {
    const packed = execFileSync("pnpm", ["pack", "--json", "--pack-destination", tarballs], {
      cwd: directory,
      encoding: "utf8"
    });
    const { filename } = packResult.parse(JSON.parse(packed));
    const destination = join(output, target);

    mkdirSync(destination, { recursive: true });
    execFileSync("tar", ["-xzf", filename, "-C", destination, "--strip-components=1"]);
    prune(destination);

    const manifest = readObject(join(destination, "package.json"));
    Reflect.deleteProperty(manifest, "scripts");
    Reflect.deleteProperty(manifest, "devDependencies");
    writeJson(join(destination, "package.json"), manifest);

    if (extension) {
      for (const entry of extensionManifest.parse(manifest).pi.extensions) {
        extensionEntries.push(`./${posix.join(target, entry)}`);
      }
    }
  }
} finally {
  rmSync(tarballs, { recursive: true, force: true });
}

// npm and Bun read `workspaces`; pnpm reads pnpm-workspace.yaml. pnpm 12 ignores the
// `--config.auto-install-peers=false` flag that Pi passes, then installs the Pi host packages and
// fails on their build scripts, so the workspace file turns peer installs off.
const { version } = z.object({ version: z.string() }).parse(readObject(join(root, "package.json")));

writeJson(join(output, "package.json"), {
  name: "pi-mono",
  version,
  private: true,
  workspaces: ["extensions/*", "lib/*"],
  pi: { extensions: extensionEntries }
});
writeFileSync(
  join(output, "pnpm-workspace.yaml"),
  "packages:\n  - extensions/*\n  - lib/*\nlinkWorkspacePackages: true\nautoInstallPeers: false\n"
);
writeFileSync(
  join(output, ".gitignore"),
  "node_modules/\npackage-lock.json\npnpm-lock.yaml\nbun.lock\nbun.lockb\n"
);
writeFileSync(
  join(output, "README.md"),
  [
    "# pi-mono release",
    "",
    "CI generates this branch from the default branch. Do not edit it.",
    "",
    "Read the README on the default branch for the extension list and install commands.",
    ""
  ].join("\n")
);

// Check a copy outside the workspace, where imports cannot fall back to the workspace's
// node_modules. Pi supplies only some entry points of its host packages to extensions.
const check = mkdtempSync(join(tmpdir(), "pi-mono-release-check-"));

try {
  const release = join(check, "release");
  const agentDir = join(check, "agent");
  cpSync(output, release, { recursive: true });

  // Pi runs this command after it clones a git package, unless the user sets `npmCommand`.
  execFileSync("npm", ["install", "--omit=dev", "--legacy-peer-deps"], {
    cwd: release,
    stdio: "inherit"
  });

  // Use the CLI because it maps host packages differently from the SDK. The CLI exits with an
  // error when an extension fails to load. The offline model lets a good run finish, and it
  // replies "ok" only when the worker threads start in the installed tree.
  const pi = join(root, "node_modules/.bin/pi");
  const provider = join(import.meta.dirname, "release-check-provider.ts");
  const reply = execFileSync(
    pi,
    ["-e", release, "-e", provider, "--no-session", "--model", "release-check/model", "-p", "ok"],
    {
      cwd: release,
      env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"]
    }
  ).trim();

  if (reply !== "ok") throw new Error(`Release check failed:\n${reply}`);
} finally {
  rmSync(check, { recursive: true, force: true });
}

console.log(`Built ${output} with ${extensionEntries.length} extensions`);
