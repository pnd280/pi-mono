import path from "node:path";

import type { ExtensionContext, SessionBoundaryDraft } from "@earendil-works/pi-coding-agent";
import { absolutePathSchema } from "@pi-mono/utils/paths";
import { z } from "zod";

import { decodeNotice, digest, noticeSchema, noticeType } from "./notices.ts";
import type { Invocation } from "./scopes.ts";

export const readType = "pi-nested-instructions.read";

const stampSchema = z.string().max(256).nullable();

const readSchema = z.strictObject({
  version: z.literal(1),
  path: absolutePathSchema.max(65536),
  toolCallId: z.string().max(1024),
  callEntryId: z.string().max(1024),
  callDigest: z.string().length(64),
  stamp: stampSchema
});

type ReadMarker = z.infer<typeof readSchema>;

export interface SessionView {
  buildSessionProjection(): Pick<
    ReturnType<ExtensionContext["sessionManager"]["buildSessionProjection"]>,
    "entries"
  >;
  getBranch: ExtensionContext["sessionManager"]["getBranch"];
}

/** What the canonical session projection still shows the model about nested instructions. */
export interface Ledger {
  /** Records a direct-read attempt only while its exact, unchanged source call is projected. */
  markRead(
    call: Invocation,
    file: string,
    stamp: string | undefined
  ): SessionBoundaryDraft | undefined;
  /** A visible direct read exists, whatever the file's current revision. */
  wasRead(file: string): boolean;
  /** A visible direct read exists for exactly this filesystem revision. */
  readUnchanged(file: string, stamp: string): boolean;
  /** A visible notice currently supplies this directory's instructions. */
  announced(directory: string): boolean;
  /** Instructions for this directory reached the model by notice or a direct read of an existing file. */
  delivered(directory: string): boolean;
  /** The visible notice already carries this instruction file and content. */
  current(directory: string, file: string, content: string): boolean;
  /** Directories with visible notices or direct reads. */
  directories(): string[];
}

/** Raw markers are useful only while their originating call is in the projection. */
export function ledger(session: SessionView): Ledger {
  const projection = session.buildSessionProjection();
  const visible = new Map(
    projection.entries.map((entry) => [entry.sourceEntry.id, entry.messages])
  );
  const reads = new Map<string, ReadMarker>();
  const scopes = new Map<string, { path: string | null; body: string }>();
  const visibleCalls = new Map<string, { name: string; arguments: unknown }>();
  // Hash calls only when a marker needs them, not every call in the session on each turn.
  const digests = new WeakMap<object, string>();

  const callDigest = (part: object) => {
    let value = digests.get(part);

    if (value === undefined) {
      value = digest(JSON.stringify(part));
      digests.set(part, value);
    }

    return value;
  };

  for (const entry of projection.entries) {
    for (const message of entry.messages) {
      if (message.role !== "assistant") continue;

      for (const part of message.content) {
        if (part.type !== "toolCall") continue;
        visibleCalls.set(JSON.stringify([entry.sourceEntry.id, part.id]), part);
      }
    }
  }

  for (const entry of session.getBranch()) {
    if (entry.type === "custom" && entry.customType === readType) {
      const parsed = readSchema.safeParse(entry.data);
      if (!parsed.success) continue;
      const marker = parsed.data;
      const call = visibleCalls.get(JSON.stringify([marker.callEntryId, marker.toolCallId]));
      if (call && callDigest(call) === marker.callDigest) reads.set(marker.path, marker);
    } else if (entry.type === "custom_message" && entry.customType === noticeType) {
      const parsed = noticeSchema.safeParse(entry.details);
      if (!parsed.success) continue;
      const notice = parsed.data;
      // A context replacement retains details, but no longer contains these instructions.
      const message = visible
        .get(entry.id)
        ?.find(
          (candidate): candidate is Extract<typeof candidate, { role: "custom" }> =>
            candidate.role === "custom" &&
            typeof candidate.content === "string" &&
            digest(candidate.content) === notice.messageDigest
        );
      if (!message) continue;
      const { body } = decodeNotice({ content: message.content, details: notice });
      scopes.set(notice.directory, { path: notice.path, body });

      if (notice.action !== "loaded") {
        for (const file of reads.keys())
          if (path.dirname(file) === notice.directory) reads.delete(file);
      }
    }
  }

  return {
    markRead(call, file, stamp) {
      if (!call.callEntryId) return undefined;
      const origin = visibleCalls.get(JSON.stringify([call.callEntryId, call.toolCallId]));
      if (
        !origin ||
        origin.name !== call.toolName ||
        JSON.stringify(origin.arguments) !== JSON.stringify(call.input)
      )
        return undefined;
      const marker: ReadMarker = {
        version: 1,
        path: file,
        toolCallId: call.toolCallId,
        callEntryId: call.callEntryId,
        callDigest: callDigest(origin),
        stamp: stamp ?? null
      };
      reads.set(file, marker);

      return { type: "custom", customType: readType, data: marker };
    },
    wasRead: (file) => reads.has(file),
    readUnchanged: (file, stamp) => reads.get(file)?.stamp === stamp,
    announced: (directory) => Boolean(scopes.get(directory)?.path),
    delivered(directory) {
      return (
        Boolean(scopes.get(directory)?.path) ||
        // A null stamp means the attempted file was missing or unreadable, so nothing was delivered.
        [...reads.values()].some(
          (marker) => marker.stamp !== null && path.dirname(marker.path) === directory
        )
      );
    },
    current(directory, file, content) {
      const previous = scopes.get(directory);

      return previous?.path === file && previous.body === content;
    },
    directories: () => [...scopes.keys(), ...[...reads.keys()].map((file) => path.dirname(file))]
  };
}
