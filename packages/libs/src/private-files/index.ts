export type { AtomicWriteWarning, WriteHooks } from "./atomic.ts";

export { LockTimeoutError, PrivateFileError, ReadLimitError } from "./errors.ts";

export { WriteLifetime, type WriteScope } from "./lifetime.ts";

export {
  privateScopedDirectory,
  resolveDirectoryScope,
  type DirectoryScope
} from "./scoped-directory.ts";

export { PrivateFileTransactions, type PrivateFileUpdate } from "./transaction.ts";

export { boundedRead, checkHandle } from "./privacy.ts";
