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
