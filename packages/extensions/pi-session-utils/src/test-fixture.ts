import { registerSessionCommand } from "./commands.ts";

type SeshHandler = Parameters<
  Parameters<typeof registerSessionCommand>[0]["registerCommand"]
>[1]["handler"];

export type SessionCommandContext = Parameters<SeshHandler>[1];

/** Returns the `/sesh` handler, so tests drive session operations through the registered command. */
export function registerSesh(): SeshHandler {
  const handlers: SeshHandler[] = [];
  registerSessionCommand(
    { registerCommand: (_name, options) => void handlers.push(options.handler) },
    async () => {}
  );
  const [handler] = handlers;
  if (!handler) throw new Error("/sesh was not registered");

  return handler;
}
