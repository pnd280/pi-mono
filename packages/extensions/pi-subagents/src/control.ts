import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { ChildRun } from "./child.ts";
import { CONTROL_REPLY_ENTRY, RECORD_MAX_BYTES } from "./constants.ts";
import { taskRecordSchema, transferRecordSchema } from "./records.ts";
import { detailsSchema } from "./result.ts";

const input = z.object({
  kind: z.literal("input"),
  task_id: z.string().min(1),
  prompt: z.string().min(1),
  delivery: z.enum(["steer", "follow_up"])
});
const adopt = z.object({ kind: z.literal("adopt"), record: transferRecordSchema });
const abort = z.object({
  kind: z.literal("abort"),
  task_id: z.string().min(1),
  reason: z.string().min(1)
});
const control = z.discriminatedUnion("kind", [input, adopt, abort]);
const reply = z.object({
  request_id: z.string(),
  details: detailsSchema.optional(),
  record: taskRecordSchema.optional(),
  error: z.string().optional()
});

export type Control = z.infer<typeof control>;

export const controlRequestSchema = z.intersection(
  control,
  z.object({ request_id: z.string().min(1) })
);

/** Replies are adjacent-process acknowledgements, never model messages or transcript bodies. */
export async function requestControl(run: ChildRun, value: Control) {
  const request_id = randomUUID();
  const message = `/subagents relay ${JSON.stringify({ ...value, request_id })}`;
  if (Buffer.byteLength(message) > RECORD_MAX_BYTES)
    throw new Error("Subagent input exceeds the relay budget");
  const result = Promise.withResolvers<z.infer<typeof reply> | undefined>();
  const unsubscribe = run.connection.subscribe((event) => {
    if (
      event.type !== "entry_appended" ||
      event.entry.type !== "custom" ||
      event.entry.customType !== CONTROL_REPLY_ENTRY
    )
      return;
    const parsed = reply.safeParse(event.entry.data);

    if (parsed.success) {
      if (parsed.data.request_id === request_id) result.resolve(parsed.data);
    } else if (
      value.kind === "abort" &&
      z.object({ request_id: z.literal(request_id) }).safeParse(event.entry.data).success
    ) {
      result.reject(new Error("Invalid subagent abort acknowledgement"));
    }
  });
  void run.connection.closed.then(() =>
    result.reject(new Error("Subagent exited before acknowledging input"))
  );

  // Observe both promises immediately; a failed command may precede process exit.
  try {
    const [acknowledgement] = await Promise.all([
      result.promise,
      run.input(message, "followUp").then((disposition) => {
        if (disposition === undefined) result.resolve(undefined);
        else if (disposition !== "handled") throw new Error("Subagent control was not handled");
      })
    ]);
    if (!acknowledgement) return;
    if (acknowledgement.error) throw new Error(acknowledgement.error);
    if (value.kind === "input" && !acknowledgement.details)
      throw new Error("Subagent input acknowledgement is missing its result");

    return acknowledgement;
  } finally {
    unsubscribe();
  }
}
