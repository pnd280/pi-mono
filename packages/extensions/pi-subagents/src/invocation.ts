import { existsSync } from "node:fs";
import { basename } from "node:path";

export type PiInvocation = { command: string; args: string[] };

/** Same three launch cases as Pi's installed subagent example. */
export function getPiInvocation(): PiInvocation {
  const script = process.argv[1];

  if (script && !script.startsWith("/$bunfs/root/") && existsSync(script)) {
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
  taskId?: string;
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
  if (selection.sessionFile !== undefined) args.push("--session", selection.sessionFile);

  return args;
}
