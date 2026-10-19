import { z } from "zod";

/**
 * Public `pi.events` channel. Each payload adds 1 to its counter in the active run. Pi-agent-summary
 * ignores payloads emitted while no run is active.
 */
export const counterChannel = "pi-agent-summary:counter";

export const maxCounters = 10;

const label = z.string().trim().min(1).max(32);

export const counterSchema = z.object({
  id: z.string().min(1).max(64),
  verb: label,
  singular: label,
  plural: label
});

export type Counter = z.input<typeof counterSchema>;
