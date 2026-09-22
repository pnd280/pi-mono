import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

type Command = ReturnType<ExtensionAPI["getCommands"]>[number];

export function command(
  name: string,
  source: Command["source"] = "skill",
  path = `/skills/${name}/SKILL.md`
): Command {
  return {
    name,
    source,
    description: "Shared description",
    sourceInfo: { path, source: "fixture", scope: "temporary", origin: "top-level" }
  };
}
