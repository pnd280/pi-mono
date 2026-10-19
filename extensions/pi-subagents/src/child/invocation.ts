import { existsSync } from "node:fs";
import { basename } from "node:path";

export type PiInvocation = { command: string; args: string[] };

/** The virtual entry of a compiled Bun executable on Unix and on Windows; it is not a script. */
const BUN_ENTRY = /^(?:\/\$bunfs\/root\/|B:[\\/]~BUN[\\/]root[\\/])/;

/** Same three launch cases as Pi's installed subagent example. */
export function getPiInvocation(): PiInvocation {
  const script = process.argv[1];

  if (script && !BUN_ENTRY.test(script) && existsSync(script)) {
    return { command: process.execPath, args: [script] };
  }

  if (!/^(node|bun)(\.exe)?$/.test(basename(process.execPath).toLowerCase())) {
    return { command: process.execPath, args: [] };
  }

  return { command: "pi", args: [] };
}

export type ChildSelection = {
  model: string;
  thinking: string;
  trusted: boolean;
  /** The supervisor's own extension entry; Pi loads a path that settings also name only once. */
  extension?: string;
  sessionFile?: string;
};

export function childArgs(selection: ChildSelection): string[] {
  const args = [
    "--mode",
    "rpc",
    "--model",
    selection.model,
    "--thinking",
    selection.thinking,
    selection.trusted ? "--approve" : "--no-approve"
  ];
  if (selection.extension !== undefined) args.push("--extension", selection.extension);
  if (selection.sessionFile !== undefined) args.push("--session", selection.sessionFile);

  return args;
}
