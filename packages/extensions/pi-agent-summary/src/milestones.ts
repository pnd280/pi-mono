import { z } from "zod";

/** Public `pi.events` channel. Pi-agent-summary ignores payloads emitted while no run is active. */
export const milestoneChannel = "pi-agent-summary:milestone";

export const maxMilestones = 20;

export const milestoneSchema = z.object({ text: z.string().trim().min(1).max(200) });

export type Milestone = z.input<typeof milestoneSchema>;
