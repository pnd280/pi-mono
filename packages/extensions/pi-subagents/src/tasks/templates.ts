import type { Template } from "../config.ts";
import { checkTemplateArgs, type ToolInput } from "./tool-schema.ts";

/**
 * The call with the values of its template filled in, for a new task or a resume. A call value replaces the template's model, thinking level, and background value. The template's launch arguments and prompt files follow the call's launch arguments, so that the template's value wins for a flag that Pi reads once. The call then sets `launch_args`, so a resume does not repeat the latest run's arguments. The task label starts with the template name in brackets.
 */
export function applyTemplate(
  request: ToolInput,
  templates: ReadonlyMap<string, Template>
): ToolInput {
  const { template: name, ...call } = request;
  if (name === undefined) return request;
  const template = templates.get(name);

  if (!template) {
    const names = [...templates.keys()].join(", ");

    throw new Error(
      names
        ? `Unknown template ${name}; the templates are ${names}`
        : `Unknown template ${name}; no templates are configured`
    );
  }

  checkTemplateArgs(call.launch_args ?? [], template.launchArgs, name);
  const model = call.model ?? template.model;
  const thinking = call.thinking ?? template.thinking;
  const background = call.background ?? template.background;

  return {
    ...call,
    description: `[${name}] ${call.description}`,
    ...(model === undefined ? {} : { model }),
    ...(thinking === undefined ? {} : { thinking }),
    ...(background === undefined ? {} : { background }),
    launch_args: [
      ...(call.launch_args ?? []),
      ...template.launchArgs,
      ...template.appendSystemPrompts.flatMap((path) => ["--append-system-prompt", path])
    ]
  };
}
