import {
  createBashToolDefinition,
  createLocalBashOperations,
  createLocalPowerShellOperations,
  createPowerShellToolDefinition,
  type BashOperations,
  type ToolDefinition
} from "@earendil-works/pi-coding-agent";
import type { MutationSink } from "@pi-mono/libs/file-mutations";
import type { NativeSettings } from "@pi-mono/libs/native-tools";
import { OutputBuffer, type OutputBufferOptions } from "@pi-mono/libs/output-buffer";
import { joinOutputText, outputOmission, type OutputText } from "@pi-mono/utils/output-text";

import type { DisplayFact, Outcome } from "../contracts.ts";
import { mutationChange, OBSERVATION_BYTES } from "../diff.ts";
import { record } from "../values.ts";

export interface ObservationSink {
  started(): void;
  fact(fact: DisplayFact): void;
  preview(output: OutputText): void;
}

const ignoreFailure = (action: () => void): void => {
  try {
    action();
  } catch {
    /* Display failure cannot fail execution. */
  }
};

const PREVIEW_UPDATE_INTERVAL_MS = 100;

const liveOutputOptions = {
  maxBytes: 1024 * 1024,
  edgeLines: 50,
  lineBytes: 10_280,
  formatOmission: ({ count, unit }) =>
    joinOutputText([
      // Long-line clipping may leave a process style active at the inserted notice.
      ...(unit === "bytes" ? ["\x1b[0m"] : []),
      outputOmission(`… ${count} ${unit} omitted …`)
    ])
} satisfies OutputBufferOptions;

function previewPublisher(buffer: OutputBuffer, publish: (output: OutputText) => void) {
  let dirty = false;
  let lastPublished = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    if (!dirty) return;
    dirty = false;
    lastPublished = performance.now();
    ignoreFailure(() => publish(buffer.snapshot()));
  };

  const schedule = () => {
    dirty = true;
    const delay = PREVIEW_UPDATE_INTERVAL_MS - (performance.now() - lastPublished);
    if (delay <= 0) flush();
    else if (!timer)
      timer = setTimeout(() => {
        timer = undefined;
        flush();
      }, delay);
  };

  return {
    append(data: Buffer) {
      buffer.append(data);
      schedule();
    },
    finish() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      buffer.finish();
      dirty = true;
      flush();
    }
  };
}

export function displayMutationSink(observer: ObservationSink, name: string): MutationSink {
  return {
    maxSourceBytes: OBSERVATION_BYTES,
    started: () => observer.started(),
    async completed(mutation) {
      const change = async () => observer.fact(await mutationChange(mutation));
      if (name === "write") await change();
      observer.fact({ kind: "operation", outcome: mutation.outcome });
      if (name === "edit") await change();
    }
  };
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
    if (savedPath) fact({ kind: "saved-output", path: savedPath });
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

      const terminal = (outcome: Outcome, extra = {}) =>
        fact({ kind: "operation", outcome, ...extra });
      let definition: Pick<ToolDefinition, "execute">;
      if (original.name === "bash" || original.name === "powershell") {
        const local =
          original.name === "bash"
            ? createLocalBashOperations(settings.shellPath ? { shellPath: settings.shellPath } : {})
            : createLocalPowerShellOperations();
        const buffer = new OutputBuffer(liveOutputOptions);
        const previews = previewPublisher(buffer, (value) => observer.preview(value));
        const operations: BashOperations = {
          async exec(command, cwd, options) {
            ignoreFailure(() => observer.started());

            try {
              const result = await local.exec(command, cwd, {
                ...options,
                onData(data) {
                  options.onData(data);
                  ignoreFailure(() => previews.append(data));
                }
              });
              let outcome: Outcome = "failure";
              if (result.exitCode === null) outcome = "unavailable";
              else if (result.exitCode === 0) outcome = "success";
              terminal(outcome, { exitCode: result.exitCode });

              return result;
            } catch (error) {
              // These are the verified local backend's control outcomes, not rendered output parsing.
              const aborted = error instanceof Error && error.message === "aborted";
              const timedOut =
                error instanceof Error && error.message === `timeout:${options.timeout}`;
              terminal(aborted ? "cancelled" : "failure", timedOut ? { timedOut: true } : {});
              throw error;
            } finally {
              ignoreFailure(() => previews.finish());
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
      } else return original.execute(id, args, signal, onUpdate, context);

      return executeWithSavedReference(definition, [id, args, signal, onUpdate, context], fact);
    }
  };
}
