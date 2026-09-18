type Runtime = {
  argv: readonly string[];
  stdinIsTTY: boolean | undefined;
  stdoutIsTTY: boolean | undefined;
  title: string;
};

/** Preserve the source package's CLI activation boundary, before tool registration. */
export function shouldActivate({ argv, stdinIsTTY, stdoutIsTTY, title }: Runtime): boolean {
  if (!stdinIsTTY || !stdoutIsTTY || title.endsWith("-rpc")) return false;
  const args = argv.slice(2);

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--") break;
    if (arg === "--mode") {
      if (["rpc", "json"].includes(args[++index] ?? "")) return false;
    } else if (arg.startsWith("--mode=")) {
      if (["rpc", "json"].includes(arg.slice(7))) return false;
    } else if (
      ["--print", "-p", "--help", "-h", "--list-models", "--version", "-v", "--export"].includes(
        arg
      )
    )
      return false;
  }

  return true;
}
