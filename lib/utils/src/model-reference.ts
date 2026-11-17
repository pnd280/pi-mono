import { z } from "zod";

const referencePattern = /^[^/\s]+\/\S+$/u;

/** A trimmed `provider/model-id` setting; the model ID may contain slashes. */
export const modelReferenceSchema = z.string().trim().regex(referencePattern);

/** Split a reference that `modelReferenceSchema` accepted at its first slash. */
export function splitModelReference(reference: string): { provider: string; id: string } {
  const slash = reference.indexOf("/");

  return { provider: reference.slice(0, slash), id: reference.slice(slash + 1) };
}
