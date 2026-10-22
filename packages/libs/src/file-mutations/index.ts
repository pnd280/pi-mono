import { constants } from "node:fs";
import { access, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import {
  AgentSession,
  createEditToolDefinition,
  createWriteToolDefinition,
  type ToolDefinition
} from "@earendil-works/pi-coding-agent";
import { parsePatch } from "@pi-mono/utils/patch";
import { z } from "zod";

import {
  createBoundedPatch,
  patchLimitsSchema,
  type BoundedPatchResult,
  type PatchLimits
} from "../bounded-diff/index.ts";
import { observeNativeTools } from "../native-tools/index.ts";
import { decodeTextFile, observeTextFile, type FileObservation } from "./observation.ts";

export type { FileObservation } from "./observation.ts";

export type MutationPatch = BoundedPatchResult | { status: "source-unavailable" };

export interface FileMutation {
  path: string;
  sequence: number;
  before: FileObservation;
  after: FileObservation;
  outcome: "success" | "failure";
  /** Call-scoped cache. Do not retain this closure: it owns the captured source. */
  patch: (limits: PatchLimits) => Promise<MutationPatch>;
}

export interface MutationSink {
  maxSourceBytes: number;
  started?(): void;
  completed(mutation: FileMutation): void | Promise<void>;
}

export interface MutationObserver {
  eligible(session: AgentSession, name: string): boolean;
  begin(session: AgentSession, name: string, id: string): MutationSink | undefined;
}

const sizeSchema = z.int().nonnegative();
const patchSchema = z.object({ patch: z.string() });
let sequence = 0;

function safely<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    // Observation must never fail a tool or hide its original error.
    return undefined;
  }
}

async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) return path;

    return join(await canonicalPath(parent), basename(path));
  }
}

export function observedSource(observation: FileObservation): string | undefined {
  if (observation.status === "ready") return observation.text;
  if (observation.status === "missing") return "";

  return undefined;
}

/** Reuses native edit I/O. Writes perform one shared bounded pre-write read inside Pi's queue. */
export function observeMutationDefinition(
  original: ToolDefinition,
  cwd: string,
  begin: (id: string) => readonly MutationSink[]
): ToolDefinition {
  if (original.name !== "edit" && original.name !== "write") return original;

  return {
    ...original,
    async execute(id, args, signal, onUpdate, context) {
      const sinks = (safely(() => begin(id)) ?? []).filter(
        (sink) => sizeSchema.safeParse(sink.maxSourceBytes).success
      );
      if (!sinks.length) return original.execute(id, args, signal, onUpdate, context);
      const maxBytes = Math.max(...sinks.map((sink) => sink.maxSourceBytes));
      let before: FileObservation = { status: "unavailable" };
      let mutation: FileMutation | undefined;
      let nativePatch: string | undefined;
      const patches = new Map<string, Promise<MutationPatch>>();

      const performWrite = async (path: string, content: string) => {
        if (original.name === "write") before = await observeTextFile(path, maxBytes);
        const identity = await canonicalPath(path).catch(() => path);
        // Node replaces unpaired surrogates when writing UTF-8. Observe those bytes,
        // not a JS string that cannot be read back; a native patch may describe the latter.
        const after: FileObservation =
          Buffer.byteLength(content) <= maxBytes
            ? { status: "ready", text: Buffer.from(content, "utf8").toString("utf8") }
            : { status: "too-large" };
        const order = ++sequence;
        sinks.forEach((sink) => safely(() => sink.started?.()));
        let outcome: FileMutation["outcome"] = "failure";

        try {
          await writeFile(path, content, "utf8");
          outcome = "success";
        } finally {
          mutation = {
            path: identity,
            sequence: order,
            before,
            after,
            outcome,
            patch(limits) {
              if (!patchLimitsSchema.safeParse(limits).success)
                throw new RangeError(
                  "Patch limits must be nonnegative finite values, with integer sizes."
                );
              const key = JSON.stringify([
                limits.maxSourceBytes,
                limits.maxPatchBytes,
                limits.maxEditLength,
                limits.timeoutMs,
                limits.contextLines
              ]);
              const cached = patches.get(key);
              if (cached) return cached;
              let result: MutationPatch | Promise<MutationPatch>;
              const previous = observedSource(before);
              const next = observedSource(after);
              if (nativePatch && Buffer.byteLength(nativePatch) > limits.maxPatchBytes)
                result = { status: "patch-too-large" };
              else if (nativePatch && parsePatch(nativePatch, limits.maxPatchBytes))
                result = { status: "ready", patch: nativePatch };
              else if (previous === undefined || next === undefined)
                result = { status: "source-unavailable" };
              else
                result = createBoundedPatch({
                  path: identity,
                  before: previous,
                  after: next,
                  ...limits
                });
              const pending = Promise.resolve(result);
              patches.set(key, pending);

              return pending;
            }
          };
        }
      };

      const definition: Pick<ToolDefinition, "execute"> =
        original.name === "edit"
          ? createEditToolDefinition(cwd, {
              operations: {
                access: (path) => access(path, constants.R_OK | constants.W_OK),
                async readFile(path) {
                  const bytes = await readFile(path);
                  before = decodeTextFile(bytes, maxBytes);

                  return bytes;
                },
                writeFile: performWrite
              }
            })
          : createWriteToolDefinition(cwd, {
              operations: {
                mkdir: async (path) => {
                  await mkdir(path, { recursive: true });
                },
                writeFile: performWrite
              }
            });

      try {
        const result = await definition.execute(id, args, signal, onUpdate, context);
        const candidate = patchSchema.safeParse(result.details).data?.patch;
        // A patch containing unpaired surrogates describes pre-encoding text, not disk contents.
        if (candidate && !/\p{Surrogate}/u.test(candidate)) nativePatch = candidate;

        return result;
      } finally {
        const completed = mutation;
        if (completed)
          await Promise.allSettled(sinks.map(async (sink) => sink.completed(completed)));
      }
    }
  };
}

const sharedKey = Symbol.for("pi-mono.file-mutations");
class SharedMutations {
  private observers = new Set<{ observer: MutationObserver }>();
  private native = observeNativeTools({
    names: ["edit", "write"],
    eligible: (session, name) =>
      [...this.observers].some(
        (subscription) =>
          this.observers.has(subscription) &&
          safely(() => subscription.observer.eligible(session, name)) &&
          this.observers.has(subscription)
      ),
    wrap: (session, original, settings) =>
      observeMutationDefinition(original, settings.cwd, (id) =>
        [...this.observers].flatMap((subscription) => {
          // An earlier eligibility or begin callback can dispose a later subscription.
          if (!this.observers.has(subscription)) return [];
          const { observer } = subscription;
          const sink = safely(() =>
            observer.eligible(session, original.name) && this.observers.has(subscription)
              ? observer.begin(session, original.name, id)
              : undefined
          );

          if (!sink || !this.observers.has(subscription)) return [];

          return [
            {
              maxSourceBytes: sink.maxSourceBytes,
              started: () => {
                if (this.observers.has(subscription)) sink.started?.();
              },
              completed: (mutation: FileMutation) => {
                if (this.observers.has(subscription)) return sink.completed(mutation);
              }
            }
          ];
        })
      )
  });
  subscribe(observer: MutationObserver) {
    const subscription = { observer };
    this.observers.add(subscription);
    let active = true;

    return {
      bind: (manager: object) => this.native.bindSessionManager(manager),
      dispose: () => {
        if (!active) return;
        active = false;
        this.observers.delete(subscription);
        if (this.observers.size) return;
        this.native.dispose();
        const prototype: object & { [sharedKey]?: SharedMutations } = AgentSession.prototype;
        if (prototype[sharedKey] === this) delete prototype[sharedKey];
      }
    };
  }
}

/** Install before runtime construction, then bind after establishing session eligibility. */
export function observeFileMutations(observer: MutationObserver) {
  const prototype: object & { [sharedKey]?: SharedMutations } = AgentSession.prototype;
  let shared = prototype[sharedKey];

  if (!shared) {
    shared = new SharedMutations();
    prototype[sharedKey] = shared;
  }

  return shared.subscribe(observer);
}
