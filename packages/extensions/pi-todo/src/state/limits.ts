import type { TaskDetails } from "./model.ts";

// Model-facing list text is bounded; result details still carry the full snapshot.
export const MAX_LIST_LINES = 200;

export const MAX_LIST_CHARACTERS = 32_768;

export const MAX_TASKS = 1_000;

export const MAX_TASK_DEPTH = 8;

export const MAX_SUBJECT_LENGTH = 200;

export const MAX_DESCRIPTION_LENGTH = 4_000;

export const MAX_IN_PROGRESS_LABEL_LENGTH = 200;

export const MAX_OWNER_LENGTH = 200;

export const MAX_DEPENDENCIES = 100;

export const MAX_METADATA_DEPTH = 8;

export const MAX_METADATA_BYTES = 16 * 1_024;

export const MAX_SNAPSHOT_BYTES = 512 * 1_024;

// Result parameters and errors must still fit when the stored todo state is full.
export const MAX_DETAILS_OVERHEAD_BYTES = 64 * 1_024;

type SizeFrame =
  | { kind: "value"; value: unknown }
  | { kind: "array"; value: readonly unknown[]; index: number }
  | { kind: "object"; value: object; keys: Iterator<string>; emitted: boolean };

type OwnPropertyValue = { found: false } | { found: true; value: unknown };

type SerializationSizeContext = {
  maximumBytes: number;
  bytes: number;
  active: WeakSet<object>;
  stack: SizeFrame[];
};

type SerializedStringUnit = { bytes: number; consumedCodeUnits: 1 | 2 };

export function metadataLimitError<Metadata>(metadata: Metadata): string | undefined {
  if (!serializedValueFitsLimit(metadata, MAX_METADATA_BYTES)) {
    return `metadata exceeds ${MAX_METADATA_BYTES} serialized bytes`;
  }

  try {
    const active = new WeakSet<object>();
    const stack: Array<{ value: unknown; depth: number; exiting?: boolean }> = [
      { value: metadata, depth: 1 }
    ];

    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) continue;
      const { value } = frame;

      if (value === null || typeof value === "string" || typeof value === "boolean") continue;

      if (typeof value === "number") {
        if (!Number.isFinite(value) || Object.is(value, -0)) {
          return "metadata must be JSON-serializable";
        }

        continue;
      }

      if (!Array.isArray(value) && !isPlainObject(value)) {
        return "metadata must be JSON-serializable";
      }

      const container = value;

      if (frame.exiting) {
        active.delete(container);
        continue;
      }

      if (frame.depth > MAX_METADATA_DEPTH) {
        return `metadata exceeds maximum depth of ${MAX_METADATA_DEPTH}`;
      }

      if (active.has(container) || (Array.isArray(container) && !isDenseJsonArray(container))) {
        return "metadata must be JSON-serializable";
      }

      active.add(container);
      stack.push({ ...frame, value: container, exiting: true });
      const children = Array.isArray(container) ? container : Object.values(container);

      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({ value: children[index], depth: frame.depth + 1 });
      }
    }
  } catch {
    return "metadata must be JSON-serializable";
  }

  return undefined;
}

/**
 * Budgeted JSON-size preflight for session and mutation ingress. It walks only
 * until the byte limit is exceeded and does not build a serialized copy of the
 * complete value.
 */
export function serializedValueFitsLimit<Value>(value: Value, maximumBytes: number): boolean {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) return false;
  const context: SerializationSizeContext = {
    maximumBytes,
    bytes: 0,
    active: new WeakSet<object>(),
    stack: [{ kind: "value", value }]
  };

  try {
    while (context.stack.length > 0) {
      const frame = context.stack.pop();
      if (frame === undefined) break;

      if (frame.kind === "array") {
        if (!processArraySizeFrame(frame, context)) return false;
      } else if (frame.kind === "object") {
        if (!processObjectSizeFrame(frame, context)) return false;
      } else if (!processValueSizeFrame(frame.value, context)) {
        return false;
      }
    }
  } catch {
    return false;
  }

  return true;
}

function addSerializedBytes(context: SerializationSizeContext, count: number): boolean {
  context.bytes += count;

  return context.bytes <= context.maximumBytes;
}

// Printable ASCII other than `"` and `\` serialises to one byte per code unit.
const NEEDS_PER_UNIT_SIZE = /[^\x20\x21\x23-\x5b\x5d-\x7f]/u;

function serializedStringFitsLimit(text: string, context: SerializationSizeContext): boolean {
  if (!addSerializedBytes(context, 2)) return false;
  // Every code unit serialises to at least one byte.
  if (text.length > context.maximumBytes - context.bytes) return false;
  if (!NEEDS_PER_UNIT_SIZE.test(text)) return addSerializedBytes(context, text.length);

  for (let index = 0; index < text.length; index += 1) {
    const unit = serializedStringUnit(text, index);
    index += unit.consumedCodeUnits - 1;
    if (!addSerializedBytes(context, unit.bytes)) return false;
  }

  return true;
}

function serializedStringUnit(text: string, index: number): SerializedStringUnit {
  const code = text.charCodeAt(index);
  if (code === 0x22 || code === 0x5c) return { bytes: 2, consumedCodeUnits: 1 };

  if (code <= 0x1f) {
    const shortEscape =
      code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d;

    return { bytes: shortEscape ? 2 : 6, consumedCodeUnits: 1 };
  }

  if (code >= 0xd800 && code <= 0xdbff) {
    const next = text.charCodeAt(index + 1);

    return next >= 0xdc00 && next <= 0xdfff
      ? { bytes: 4, consumedCodeUnits: 2 }
      : { bytes: 6, consumedCodeUnits: 1 };
  }

  if (code >= 0xdc00 && code <= 0xdfff) return { bytes: 6, consumedCodeUnits: 1 };

  if (code <= 0x7f) return { bytes: 1, consumedCodeUnits: 1 };

  return { bytes: code <= 0x7ff ? 2 : 3, consumedCodeUnits: 1 };
}

function processArraySizeFrame(
  frame: Extract<SizeFrame, { kind: "array" }>,
  context: SerializationSizeContext
): boolean {
  if (frame.index >= frame.value.length) {
    context.active.delete(frame.value);

    return addSerializedBytes(context, 1);
  }

  if (frame.index > 0 && !addSerializedBytes(context, 1)) return false;
  const item = frame.value[frame.index];
  context.stack.push({ ...frame, index: frame.index + 1 });
  context.stack.push({ kind: "value", value: isJsonOmittedValue(item) ? null : item });

  return true;
}

function processObjectSizeFrame(
  frame: Extract<SizeFrame, { kind: "object" }>,
  context: SerializationSizeContext
): boolean {
  const next = frame.keys.next();

  if (next.done) {
    context.active.delete(frame.value);

    return addSerializedBytes(context, 1);
  }

  context.stack.push(frame);
  const property = ownEnumerableProperty(frame.value, next.value);
  if (!property.found || isJsonOmittedValue(property.value)) return true;
  if (frame.emitted && !addSerializedBytes(context, 1)) return false;
  frame.emitted = true;
  if (!serializedStringFitsLimit(next.value, context)) return false;
  if (!addSerializedBytes(context, 1)) return false;
  context.stack.push({ kind: "value", value: property.value });

  return true;
}

function processValueSizeFrame<Value>(current: Value, context: SerializationSizeContext): boolean {
  if (current === null) return addSerializedBytes(context, 4);
  if (typeof current === "string") return serializedStringFitsLimit(current, context);
  if (typeof current === "number")
    return addSerializedBytes(context, Number.isFinite(current) ? String(current).length : 4);
  if (typeof current === "boolean") return addSerializedBytes(context, current ? 4 : 5);

  const container = jsonContainer(current);
  if (container === undefined || context.active.has(container)) return false;
  if (!Array.isArray(container) && hasFunctionToJson(container)) return false;
  context.active.add(container);
  if (Array.isArray(container)) return startArraySizeFrame(container, context);
  if (!addSerializedBytes(context, 1)) return false;
  context.stack.push({
    kind: "object",
    value: container,
    keys: Object.keys(container).values(),
    emitted: false
  });

  return true;
}

function startArraySizeFrame(
  container: readonly unknown[],
  context: SerializationSizeContext
): boolean {
  // Brackets, commas, and one byte per item establish a cheap lower bound.
  if (container.length > 0 && container.length * 2 + 1 > context.maximumBytes - context.bytes) {
    return false;
  }

  if (!addSerializedBytes(context, 1)) return false;
  context.stack.push({ kind: "array", value: container, index: 0 });

  return true;
}

/** Details preflight for callers that already validated the todo snapshot at `MAX_SNAPSHOT_BYTES`. */
export function snapshotDetailsFitLimit(details: TaskDetails): boolean {
  return serializedValueFitsLimit(details, MAX_SNAPSHOT_BYTES + MAX_DETAILS_OVERHEAD_BYTES);
}

function isJsonOmittedValue<Value>(value: Value): boolean {
  return value === undefined || typeof value === "function" || typeof value === "symbol";
}

function jsonContainer<Value>(value: Value): object | undefined {
  if (Array.isArray(value)) return value;
  if (typeof value === "function") return undefined;

  return isObject(value) ? value : undefined;
}

function hasFunctionToJson<Value extends object>(value: Value): boolean {
  return typeof (value as { toJSON?: unknown }).toJSON === "function";
}

function isPlainObject(value: unknown): value is object {
  if (!isObject(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function isDenseJsonArray(value: readonly unknown[]): boolean {
  return Object.keys(value).length === value.length;
}

function isObject<Value>(value: Value): value is Value & object {
  return Object(value) === value;
}

function ownEnumerableProperty<Value extends object>(value: Value, key: string): OwnPropertyValue {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor?.enumerable !== true) return { found: false };
  if ("value" in descriptor) return { found: true, value: descriptor.value };

  return { found: true, value: descriptor.get?.call(value) };
}
