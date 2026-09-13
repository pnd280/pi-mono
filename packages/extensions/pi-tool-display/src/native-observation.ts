import { constants } from "node:fs";
import { access, mkdir, open, readFile, writeFile } from "node:fs/promises";

import {
  createBashToolDefinition,
  createEditToolDefinition,
  createLocalBashOperations,
  createLocalPowerShellOperations,
  createPowerShellToolDefinition,
  createWriteToolDefinition,
  type BashOperations,
  type ToolDefinition
} from "@earendil-works/pi-coding-agent";

import { computeChange, OBSERVATION_BYTES, parsePatch } from "./diff.ts";
import type { DisplayFact, Outcome } from "./display-model.ts";
import { OutputBuffer } from "./output-buffer.ts";
import type { OutputText } from "./output-text.ts";
import { record } from "./presentation.ts";

export interface ObservationSink {
  started(): void;
  fact(fact: DisplayFact): void;
  preview(output: OutputText): void;
}

export interface NativeSettings {
  cwd: string;
  shellPath?: string | undefined;
  commandPrefix?: string | undefined;
}

const ignoreFailure = (action: () => void): void => {
  try {
    action();
  } catch {
    /* Display failure cannot fail execution. */
  }
};

async function beforeWrite(
  path: string
): Promise<{ text: string; change: "creation" | "modification" } | undefined> {
  let file;

  try {
    // O_NONBLOCK prevents a FIFO from blocking an observation read before fstat.
    file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > OBSERVATION_BYTES) return undefined;
    const buffer = Buffer.alloc(Math.min(stat.size + 1, OBSERVATION_BYTES + 1));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== stat.size) return undefined;

    return {
      text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        buffer.subarray(0, bytesRead)
      ),
      change: "modification"
    };
  } catch (error) {
    return record(error).code === "ENOENT" ? { text: "", change: "creation" } : undefined;
  } finally {
    await file?.close().catch(() => {});
  }
}

async function executeWithSavedReference(
  definition: Pick<ToolDefinition, "execute">,
  [id, args, signal, onUpdate, context]: Parameters<ToolDefinition["execute"]>,
  fact: (fact: DisplayFact) => void
) {
  let savedPath: string | undefined;

  const update: NonNullable<typeof onUpdate> = (value) => {
    ignoreFailure(() => {
      const path = record(value.details).fullOutputPath;
      if (typeof path === "string") savedPath = path;
    });
    onUpdate?.(value);
  };

  try {
    const result = await definition.execute(
      id,
      args,
      signal,
      onUpdate ? update : undefined,
      context
    );
    if (record(result.details).fullOutputPath === savedPath) savedPath = undefined;

    return result;
  } finally {
    if (savedPath) fact({ kind: "saved-output", availability: "available", path: savedPath });
  }
}

/** Call-scoped operations: callbacks without IDs never share mutable current-call state. */
export function observeNativeDefinition(
  original: ToolDefinition,
  settings: NativeSettings,
  begin: (id: string) => ObservationSink | undefined
): ToolDefinition {
  return {
    ...original,
    async execute(id, args, signal, onUpdate, context) {
      let sink: ObservationSink | undefined;
      ignoreFailure(() => {
        sink = begin(id);
      });
      if (!sink) return original.execute(id, args, signal, onUpdate, context);
      const observer = sink;
      const fact = (value: DisplayFact) => ignoreFailure(() => observer.fact(value));

      const start = () => {
        ignoreFailure(() => observer.started());

        return performance.now();
      };

      const terminal = (started: number, outcome: Outcome, extra = {}) =>
        fact({
          kind: "operation",
          availability: "available",
          durationMs: Math.max(0, performance.now() - started),
          outcome,
          ...extra
        });
      const proposal = (
        path: string,
        before: string | undefined,
        after: string,
        change: "creation" | "modification"
      ) =>
        ignoreFailure(() => {
          fact(
            before === undefined
              ? {
                  kind: "change",
                  availability: "unavailable",
                  reason: "Before-state unavailable or exceeds the observation budget."
                }
              : computeChange(path, before, after, change)
          );
        });
      let recordFallbackChange: (() => void) | undefined;
      let definition: Pick<ToolDefinition, "execute">;
      if (original.name === "bash" || original.name === "powershell") {
        const local =
          original.name === "bash"
            ? createLocalBashOperations(settings.shellPath ? { shellPath: settings.shellPath } : {})
            : createLocalPowerShellOperations();
        const buffer = new OutputBuffer();
        const operations: BashOperations = {
          async exec(command, cwd, options) {
            const started = start();

            try {
              const result = await local.exec(command, cwd, {
                ...options,
                onData(data) {
                  options.onData(data);
                  ignoreFailure(() => {
                    buffer.append(data);
                    observer.preview(buffer.snapshot());
                  });
                }
              });
              terminal(
                started,
                result.exitCode === null
                  ? "unavailable"
                  : result.exitCode === 0
                    ? "success"
                    : "failure",
                { exitCode: result.exitCode }
              );

              return result;
            } catch (error) {
              // These are the verified local backend's control outcomes, not rendered output parsing.
              const aborted = error instanceof Error && error.message === "aborted";
              const timedOut =
                error instanceof Error && error.message === `timeout:${options.timeout}`;
              terminal(
                started,
                aborted ? "cancelled" : "failure",
                timedOut ? { timedOut: true } : {}
              );
              throw error;
            } finally {
              ignoreFailure(() => {
                buffer.finish();
                observer.preview(buffer.snapshot());
              });
            }
          }
        };
        definition =
          original.name === "bash"
            ? createBashToolDefinition(settings.cwd, {
                operations,
                ...(settings.shellPath ? { shellPath: settings.shellPath } : {}),
                ...(settings.commandPrefix ? { commandPrefix: settings.commandPrefix } : {})
              })
            : createPowerShellToolDefinition(settings.cwd, { operations });
      } else if (original.name === "edit") {
        let before: string | undefined;
        definition = createEditToolDefinition(settings.cwd, {
          operations: {
            access: (path) => access(path, constants.R_OK | constants.W_OK),
            async readFile(path) {
              const bytes = await readFile(path);
              ignoreFailure(() => {
                if (bytes.length <= OBSERVATION_BYTES)
                  before = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
              });

              return bytes;
            },
            async writeFile(path, content) {
              const previous = before;
              before = undefined;
              // Successful edits supply their own patch. Keep captured inputs only
              // for failed writes or results without a usable native patch.
              recordFallbackChange = () => proposal(path, previous, content, "modification");
              const started = start();

              try {
                await writeFile(path, content, "utf8");
                terminal(started, "success");
              } catch (error) {
                terminal(started, "failure");
                throw error;
              }
            }
          }
        });
      } else if (original.name === "write") {
        definition = createWriteToolDefinition(settings.cwd, {
          operations: {
            mkdir: async (path) => {
              await mkdir(path, { recursive: true });
            },
            async writeFile(path, content) {
              // Pi already owns the mutation queue here; do not queue again.
              let before;

              try {
                if (Buffer.byteLength(content) <= OBSERVATION_BYTES)
                  before = await beforeWrite(path);
              } catch {
                /* Observation only. */
              }

              proposal(path, before?.text, content, before?.change ?? "modification");
              const started = start();

              try {
                await writeFile(path, content, "utf8");
                terminal(started, "success");
              } catch (error) {
                terminal(started, "failure");
                throw error;
              }
            }
          }
        });
      } else return original.execute(id, args, signal, onUpdate, context);

      try {
        const result = await executeWithSavedReference(
          definition,
          [id, args, signal, onUpdate, context],
          fact
        );

        if (recordFallbackChange) {
          const patch = record(result.details).patch;

          if (typeof patch === "string" && parsePatch(patch)) {
            // Record before outer result middleware can replace or reject Pi's result.
            fact({ kind: "change", availability: "available", change: "modification", patch });
            recordFallbackChange = undefined;
          }
        }

        return result;
      } finally {
        recordFallbackChange?.();
      }
    }
  };
}
