import { z } from "zod";

const referencePattern = /^[^/\s]+\/\S+$/u;

/** A trimmed `provider/model-id` setting; the model ID may contain slashes. */
export const modelReferenceSchema = z.string().trim().regex(referencePattern);

/** Split a `provider/model-id` reference at its first slash. */
export function splitModelReference(reference: string): { provider: string; id: string } {
  if (!referencePattern.test(reference))
    throw new TypeError("Expected a provider/model-id reference.");
  const slash = reference.indexOf("/");

  return { provider: reference.slice(0, slash), id: reference.slice(slash + 1) };
}
