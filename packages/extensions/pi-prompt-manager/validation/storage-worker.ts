import { FileRepository } from "../src/storage/repository.ts";

const [cwd, agentDir, label, countText, hold] = process.argv.slice(2);

if (!cwd || !agentDir || !label || !countText) throw new Error("Missing storage worker arguments.");
const repository = await FileRepository.create({
  cwd,
  agentDir,
  retention: 250,
  hooks:
    hold === "hold"
      ? {
          beforeRename: () =>
            new Promise<void>((resolve) => {
              process.once("message", () => resolve());
              process.send?.("locked");
            })
        }
      : {}
});

for (let index = 0; index < Number(countText); index++) {
  const result = await repository.mutate(
    "drafts",
    { kind: "add", text: `${label}-${index}`, recordedAt: "2026-01-01T00:00:00.000Z" },
    { signal: new AbortController().signal, atomic: (write) => write() }
  );

  if (result.status !== "committed") throw new Error("Worker mutation failed.");
}

process.send?.("finished");
process.disconnect();
