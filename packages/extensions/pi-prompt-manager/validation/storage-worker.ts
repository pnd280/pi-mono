import { z } from "zod";

import { FileRepository } from "../src/storage/repository.ts";

const argumentsSchema = z.tuple([
  z.string().min(1),
  z.string().min(1),
  z.string().min(1),
  z.string().regex(/^\d+$/).transform(Number).pipe(z.int().nonnegative())
]);
const [cwd, agentDir, label, count] = argumentsSchema.parse(process.argv.slice(2));
const repository = await FileRepository.create({
  cwd,
  agentDir,
  retention: 250
});

for (let index = 0; index < count; index++) {
  const result = await repository.mutate(
    "drafts",
    { kind: "add", text: `${label}-${index}`, recordedAt: "2026-01-01T00:00:00.000Z" },
    { signal: new AbortController().signal, atomic: (write) => write() }
  );

  if (result.status !== "committed") throw new Error("Worker mutation failed.");
}

process.disconnect?.();
