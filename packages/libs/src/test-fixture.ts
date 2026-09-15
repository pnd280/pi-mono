export function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });

  return { promise, resolve, reject };
}
