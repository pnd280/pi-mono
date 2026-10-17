// Hash every fingerprinted private Pi method in the workspace API build and the
// bundled CLI build, then report whether each owner file already lists the hash.
// It also fails when a workspace source file lists a hash that no method in
// `owners` produces, so a new or stale fingerprint cannot go unnoticed. Version-
// aware hook owners must also pin the public version reported by both builds.
// Usage: node .agents/skills/pi-update/scripts/fingerprints.ts
// Keep this file TypeScript: the bundled CLI maps Pi imports in .ts extensions to
// its bundled classes, but loads .mjs natively, which would hash the API build twice.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import * as pi from "@earendil-works/pi-coding-agent";
import { TuiAltScreen, TuiMainScreen } from "@earendil-works/pi-tui";

import { inspectedPiVersion as widgetVersion } from "../../../../packages/extensions/pi-editor-widgets/src/host.ts";
import { inspectedPiVersion as displayVersion } from "../../../../packages/extensions/pi-tool-display/src/host/compatibility.ts";

type Methods = Record<string, unknown>;

type Fingerprints = { version: string; hashes: Record<string, Record<string, string>> };

const session = (name: string): unknown => Reflect.get(pi.AgentSession.prototype, name);
const mode = (name: string): unknown => Reflect.get(pi.InteractiveMode.prototype, name);
const row = (name: string): unknown => Reflect.get(pi.ToolExecutionComponent.prototype, name);
const assistant = (name: string): unknown =>
  Reflect.get(pi.AssistantMessageComponent.prototype, name);

const owners: Record<string, () => Methods> = {
  "packages/libs/src/native-tools/compatibility.ts": () => ({
    _buildRuntime: session("_buildRuntime"),
    _refreshToolRegistry: session("_refreshToolRegistry")
  }),
  "packages/extensions/pi-smart-compact/src/compatibility.ts": () => ({
    _compactBeforeNextAssistantResponse: session("_compactBeforeNextAssistantResponse"),
    _runAutoCompaction: session("_runAutoCompaction"),
    _runDefaultCompaction: session("_runDefaultCompaction"),
    _appendCustomMessage: session("_appendCustomMessage"),
    compact: pi.compact,
    manualCompact: session("compact")
  }),
  "packages/extensions/pi-editor-widgets/src/host.ts": () => ({
    switchTuiMode: mode("switchTuiMode"),
    setExtensionStatus: mode("setExtensionStatus"),
    renderWidgets: mode("renderWidgets"),
    setExtensionFooter: mode("setExtensionFooter"),
    createExtensionUIContext: mode("createExtensionUIContext"),
    mainScreenDoRender: Reflect.get(TuiMainScreen.prototype, "doRender"),
    altScreenDoRender: Reflect.get(TuiAltScreen.prototype, "doRender")
  }),
  "packages/extensions/pi-tool-display/src/host/compatibility.ts": () => ({
    getRegisteredToolDefinition: mode("getRegisteredToolDefinition"),
    renderSessionItems: mode("renderSessionItems"),
    handleEvent: mode("handleEvent"),
    addMessageToChat: mode("addMessageToChat"),
    addCustomEntryToChat: mode("addCustomEntryToChat"),
    maybeShowThinkingDropNotice: mode("maybeShowThinkingDropNotice"),
    addCacheMissNotice: mode("addCacheMissNotice"),
    addCacheWarmingUsage: mode("addCacheWarmingUsage"),
    showExtensionNotify: mode("showExtensionNotify"),
    switchTuiMode: mode("switchTuiMode"),
    updateThinkingBlockVisibility: mode("updateThinkingBlockVisibility"),
    getStartupExpansionState: mode("getStartupExpansionState"),
    showStatus: mode("showStatus"),
    toggleToolOutputExpansion: mode("toggleToolOutputExpansion"),
    setToolsExpanded: mode("setToolsExpanded"),
    render: row("render"),
    handleMouse: row("handleMouse")
  }),
  "packages/extensions/pi-tool-display/src/host/assistant.ts": () => ({
    updateContent: assistant("updateContent")
  })
};

const inspectedVersions: Partial<Record<string, string>> = {
  "packages/extensions/pi-editor-widgets/src/host.ts": widgetVersion,
  "packages/extensions/pi-tool-display/src/host/compatibility.ts": displayVersion
};

// Every 64-hex string literal in non-test workspace TypeScript, by file.
function listedHashes(): Map<string, Set<string>> {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "packages/*.ts"], {
    encoding: "utf8"
  })
    .split("\n")
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
  const listed = new Map<string, Set<string>>();

  for (const file of files) {
    // The index still lists unstaged deletions and moves. Missing declared owners
    // are diagnosed separately below; there is no working-tree source to scan here.
    if (!existsSync(file)) continue;
    const hashes = new Set(Array.from(readFileSync(file, "utf8").matchAll(/["']([0-9a-f]{64})["']/g), ([, hash = ""]) => hash));

    if (hashes.size > 0) listed.set(file, hashes);
  }

  return listed;
}

function fingerprints(): Fingerprints {
  const hashes: Fingerprints["hashes"] = {};

  for (const [owner, methods] of Object.entries(owners)) {
    hashes[owner] = Object.fromEntries(
      Object.entries(methods()).map(([name, method]) => [
        name,
        typeof method === "function"
          ? createHash("sha256").update(Function.prototype.toString.call(method)).digest("hex")
          : "missing"
      ])
    );
  }

  return { version: pi.VERSION, hashes };
}

// Loaded by the bundled CLI as an extension: print that build's hashes.
export default function (): void {
  process.stderr.write(`FINGERPRINTS ${JSON.stringify(fingerprints())}\n`);
}

function parse(stderr: string): Fingerprints {
  const line = stderr.split("\n").find((entry) => entry.startsWith("FINGERPRINTS "));
  if (!line) throw new Error(`The bundled CLI printed no fingerprints:\n${stderr}`);

  // The line comes from this script's own extension pass.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return JSON.parse(line.slice("FINGERPRINTS ".length)) as Fingerprints;
}

/** Build an inspection-only invocation without inheriting credentials or project resources. */
export function fingerprintProbe(
  cli: string,
  extension: string,
  home: string,
  parentEnv: Readonly<NodeJS.ProcessEnv>
) {
  return {
    args: [cli, "--no-extensions", "-e", extension, "--help"],
    cwd: home,
    // os.homedir() reads USERPROFILE on Windows; Node also requires SystemRoot there.
    env: {
      PATH: parentEnv.PATH,
      SystemRoot: parentEnv.SystemRoot,
      HOME: home,
      USERPROFILE: home,
      PI_CODING_AGENT_DIR: join(home, "agent"),
      PI_OFFLINE: "1",
      PI_TELEMETRY: "0"
    }
  };
}

function cliFingerprints(): Fingerprints {
  const cli = fileURLToPath(new URL("../../../../node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js", import.meta.url));
  const home = mkdtempSync(join(tmpdir(), "pi-fingerprints-"));

  try {
    // Help loads explicit extensions, then exits without sending a model request.
    const { args, ...options } = fingerprintProbe(cli, fileURLToPath(import.meta.url), home, process.env);
    const probe = spawnSync(process.execPath, args, {
      ...options,
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 60_000
    });

    if (probe.error) throw probe.error;
    if (probe.status !== 0) throw new Error(`The bundled CLI failed (${probe.status}):\n${probe.stderr}`);

    return parse(probe.stderr);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

// The module URL is a real path; argv[1] keeps symlinks such as macOS /tmp -> /private/tmp.
// Without realpath the check would print nothing and pass.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const builds = { api: fingerprints(), cli: cliFingerprints() };
  const listed = listedHashes();
  let changed = 0;
  let unclaimed = 0;
  let missing = 0;
  let versionMismatches = 0;

  console.log(`Pi API ${builds.api.version}, bundled CLI ${builds.cli.version}`);

  for (const owner of new Set([...Object.keys(owners), ...listed.keys()])) {
    const inFile = listed.get(owner) ?? new Set<string>();
    const produced = new Set<string>();

    console.log(`\n${owner}${owner in owners ? "" : "  (not in owners)"}`);

    if (!existsSync(owner)) {
      missing++;
      console.log("  MISSING owner file: remove its entry from `owners`, or update the path.");
      continue;
    }

    for (const [build, { version, hashes }] of Object.entries(builds)) {
      const pin = inspectedVersions[owner];

      if (pin !== undefined && pin !== version) {
        versionMismatches++;
        console.log(`  VERSION   ${build.padEnd(3)} inspected ${pin}, installed ${version}: review the version pin and fingerprints.`);
      }

      for (const [name, hash] of Object.entries(hashes[owner] ?? {})) {
        const known = inFile.has(hash);

        produced.add(hash);

        if (!known) changed++;

        console.log(`  ${known ? "ok       " : "CHANGED  "} ${build.padEnd(3)} ${name} ${hash}`);
      }
    }

    for (const hash of inFile) {
      if (produced.has(hash)) continue;

      unclaimed++;
      console.log(`  UNCLAIMED         ${hash}`);
    }
  }

  console.log(
    `\n${changed} changed, ${unclaimed} unclaimed fingerprint(s), ${missing} missing owner file(s), ${versionMismatches} version mismatch(es).`
  );

  if (unclaimed) {
    console.log("Unclaimed: add the hooked method to `owners`, or remove the stale hash.");
  }

  process.exitCode = changed || unclaimed || missing || versionMismatches ? 1 : 0;
}
