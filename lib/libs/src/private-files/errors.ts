/** Safe diagnostics for privacy checks; underlying OS errors remain untrusted. */
export class PrivateFileError extends Error {}

export class ReadLimitError extends PrivateFileError {
  constructor() {
    super("File exceeds the requested read limit.");
  }
}

export class LockTimeoutError extends PrivateFileError {
  constructor() {
    super("Timed out waiting for the owned file lock.");
  }
}

export function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
