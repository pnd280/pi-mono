import { z } from "zod";

/** The custom message that tells the model when the active profile changes between runs. */
export const NOTICE_MESSAGE = "pi-profiles.notice";

const MAX_NAME_LENGTH = 64;

/** One printable word, so `/profile <name>` and notices need no quoting or sanitising. */
export const profileNameSchema = z
  .string()
  .max(MAX_NAME_LENGTH)
  .regex(/^[^\s\p{C}]+$/u);

const scopeSchema = z.enum(["global", "project"]);

const profileRefSchema = z.strictObject({
  name: profileNameSchema,
  scope: scopeSchema
});

export type ProfileRef = z.output<typeof profileRefSchema>;

/** Details persisted on a `pi-profiles.notice` custom message. */
export const profileNoticeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("switched"),
    from: profileRefSchema,
    to: profileRefSchema
  }),
  z.strictObject({
    kind: z.literal("set"),
    to: profileRefSchema
  }),
  z.strictObject({
    kind: z.literal("cleared"),
    from: profileRefSchema
  }),
  z.strictObject({
    kind: z.literal("unavailable"),
    from: profileRefSchema
  })
]);

export type ProfileNoticeDetails = z.output<typeof profileNoticeSchema>;

/** Labels for `from` and `to`, adding `(global)` / `(project)` only when both share a name across scopes. */
export function formatNoticeRefs(from: ProfileRef, to: ProfileRef): { from: string; to: string } {
  const disambiguate = from.name === to.name && from.scope !== to.scope;
  const label = (ref: ProfileRef) => (disambiguate ? `${ref.name} (${ref.scope})` : ref.name);

  return { from: label(from), to: label(to) };
}
