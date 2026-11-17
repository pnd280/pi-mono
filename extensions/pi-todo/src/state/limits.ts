import type { TaskMutationParams } from "./model.ts";

/** Model-facing list text is bounded; result details still carry the full snapshot. */
export const MAX_LIST_LINES = 200;

export const MAX_LIST_CHARACTERS = 32_768;

export const MAX_TASKS = 1_000;

export const MAX_TASK_DEPTH = 8;

const MAX_DEPENDENCIES = 100;

/** String fields in characters and dependency lists in todo IDs, in error-precedence order. */
export const FIELD_LIMITS = {
  subject: { maximum: 200, unit: "characters" },
  description: { maximum: 4_000, unit: "characters" },
  inProgressLabel: { maximum: 200, unit: "characters" },
  owner: { maximum: 200, unit: "characters" },
  blockedBy: { maximum: MAX_DEPENDENCIES, unit: "todo ids" },
  addBlockedBy: { maximum: MAX_DEPENDENCIES, unit: "todo ids" },
  removeBlockedBy: { maximum: MAX_DEPENDENCIES, unit: "todo ids" }
} as const;

export type LimitedField = keyof typeof FIELD_LIMITS;

const LIMITED_FIELDS = Object.keys(FIELD_LIMITS).filter((field): field is LimitedField =>
  Object.hasOwn(FIELD_LIMITS, field)
);

export const MAX_METADATA_DEPTH = 8;

export const MAX_METADATA_BYTES = 16 * 1_024;

export const MAX_SNAPSHOT_BYTES = 512 * 1_024;

/** Replay headroom over a full snapshot for `version` and `error`, and for the `action` and `params` keys that results saved by earlier versions still carry. */
export const MAX_DETAILS_OVERHEAD_BYTES = 64 * 1_024;

export function fieldLimitFailure(
  values: Readonly<Pick<TaskMutationParams, LimitedField>>
): { field: LimitedField; error: string } | undefined {
  for (const field of LIMITED_FIELDS) {
    const { maximum, unit } = FIELD_LIMITS[field];

    if ((values[field]?.length ?? 0) > maximum) {
      return { field, error: `${field} exceeds ${maximum} ${unit}` };
    }
  }

  return undefined;
}

export function metadataLimitError(metadata: object): string | undefined {
  if (!serializedValueFitsLimit(metadata, MAX_METADATA_BYTES)) {
    return `metadata exceeds ${MAX_METADATA_BYTES} serialized bytes`;
  }

  // Iterative, so that the recursive metadata parser never sees deeper input.
  const stack: Array<{ value: unknown; depth: number }> = [{ value: metadata, depth: 1 }];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame || typeof frame.value !== "object" || frame.value === null) continue;

    if (frame.depth > MAX_METADATA_DEPTH) {
      return `metadata exceeds maximum depth of ${MAX_METADATA_DEPTH}`;
    }

    for (const child of Object.values(frame.value)) {
      stack.push({ value: child, depth: frame.depth + 1 });
    }
  }

  return undefined;
}

export function serializedValueFitsLimit(value: unknown, maximumBytes: number): boolean {
  return Buffer.byteLength(JSON.stringify(value), "utf8") <= maximumBytes;
}

/** Objects whose prototype is `Object.prototype` or `null`; arrays and class instances fail. */
export function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}
