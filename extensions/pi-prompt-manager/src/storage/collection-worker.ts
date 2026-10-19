import { parentPort } from "node:worker_threads";

import { errorMessage } from "../model.ts";
import { readCollection, updateCollection } from "./collection.ts";
import type { CollectionRequest, CollectionResponse } from "./processing.ts";

const port = parentPort;
if (!port) throw new Error("Collection processing requires a worker port.");

// Requests originate in processing.ts. Collection contents are validated by collection.ts.
port.on("message", (request: CollectionRequest) => {
  let response: CollectionResponse;

  try {
    const bytes = request.options.raw;
    const raw =
      bytes === undefined
        ? undefined
        : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const value =
      request.kind === "read"
        ? readCollection(request.options.collection, request.options.cwd, raw)
        : updateCollection({ ...request.options, raw });
    response = { status: "success", value };
  } catch (error) {
    response = { status: "error", message: errorMessage(error) };
  }

  port.postMessage(response);
});
