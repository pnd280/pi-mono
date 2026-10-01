import { parseArgs } from "@earendil-works/pi-coding-agent";

type Runtime = {
  argv: readonly string[];
  stdinIsTTY: boolean | undefined;
  stdoutIsTTY: boolean | undefined;
  title: string;
};

/** Preserve the source package's CLI activation boundary, before tool registration. */
export function shouldActivate({ argv, stdinIsTTY, stdoutIsTTY, title }: Runtime): boolean {
  if (!stdinIsTTY || !stdoutIsTTY || title.endsWith("-rpc")) return false;
  const args = parseArgs(argv.slice(2));

  return (
    args.mode !== "rpc" &&
    args.mode !== "json" &&
    !args.print &&
    !args.help &&
    !args.version &&
    args.listModels === undefined &&
    args.export === undefined
  );
}
