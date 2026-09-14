export function record(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object") return {};

  // Read-only lookup view, including arrays and class instances. No field's presence or type
  // is guaranteed: consumers must validate each unknown value before using it.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as Readonly<Record<string, unknown>>;
}
