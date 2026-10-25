/**
 * Reads the `--flag value` pairs of a `/subagents` command into the values that `spec` gives for
 * each flag. A flag outside `spec`, a repeated flag, or a flag without a value throws `usage`. A
 * flag's parser can throw its own error, before the later pairs are read.
 */
export function parseFlags<Values extends Record<string, unknown>>(
  tokens: string[],
  spec: { [Flag in keyof Values]: (value: string) => Values[Flag] },
  usage: string
): Partial<Values> {
  const result: Partial<Values> = {};

  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    let known = false;

    for (const key in spec) {
      if (key !== flag || value === undefined || Object.hasOwn(result, key)) continue;
      result[key] = spec[key](value);
      known = true;
    }

    if (!known) throw new Error(usage);
  }

  return result;
}
