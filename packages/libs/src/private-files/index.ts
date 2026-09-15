export { atomicReplace, type AtomicWriteWarning, type WriteHooks } from "./atomic.ts";

export { LockTimeoutError, PrivateFileError, ReadLimitError } from "./errors.ts";

export { acquireLock, type OwnedLock } from "./lock.ts";

export { WriteLifetime, type WriteScope } from "./lifetime.ts";

export {
  privateScopedDirectory,
  resolveDirectoryScope,
  type DirectoryScope
} from "./scoped-directory.ts";

export {
  PrivateFileTransactions,
  type PrivateFileUpdate,
  type PrivateTransactionResult,
  type PrivateTransactionOptions
} from "./transaction.ts";

export { boundedRead, checkHandle, privateDirectory, privateOpen, sameFile } from "./privacy.ts";
