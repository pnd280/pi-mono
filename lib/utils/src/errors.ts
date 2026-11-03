/** Whether a thrown value carries one of `codes`, such as a Node system error's `ENOENT`. */
export function hasErrorCode<const Code extends string>(
  error: unknown,
  ...codes: readonly Code[]
): error is { code: Code } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    (codes as readonly string[]).includes(error.code)
  );
}

/** The message of an `Error`, or the string form of any other thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
