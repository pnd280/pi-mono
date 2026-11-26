import { z } from "zod";

const MAX_RULES = 100;
const MAX_TEXT_LENGTH = 4096;

const ruleSchema = z.strictObject({
  match: z.string().min(1).max(MAX_TEXT_LENGTH),
  flags: z
    .string()
    .regex(/^[imsu]*$/)
    .optional(),
  replace: z.string().max(MAX_TEXT_LENGTH),
  sections: z.array(z.string().min(1).max(MAX_TEXT_LENGTH)).max(MAX_RULES).optional()
});

const rulesSchema = z.array(z.unknown()).max(MAX_RULES);

export type RewriteRule = {
  pattern: RegExp;
  replace: string;
  /** `undefined` applies the rule to every section. */
  sections: ReadonlySet<string> | undefined;
};

/**
 * Parses the global `rules` value. Invalid rules are skipped; warnings never echo supplied keys or values.
 */
export function parseRules(rawRules: unknown): { rules: RewriteRule[]; warnings: string[] } {
  if (rawRules === undefined) return { rules: [], warnings: [] };

  const parsed = rulesSchema.safeParse(rawRules);

  if (!parsed.success) {
    return {
      rules: [],
      warnings: [`rules is invalid; expected a list of at most ${MAX_RULES} rules; rules disabled`]
    };
  }

  const rules: RewriteRule[] = [];
  const warnings: string[] = [];

  for (const [index, rawRule] of parsed.data.entries()) {
    const rule = ruleSchema.safeParse(rawRule);

    if (!rule.success) {
      warnings.push(
        `rules[${index}] skipped: invalid rule; check match, flags, replace, sections, and unknown fields`
      );
      continue;
    }

    let pattern: RegExp;

    try {
      pattern = new RegExp(rule.data.match, `${rule.data.flags ?? ""}g`);
    } catch {
      warnings.push(`rules[${index}] skipped: invalid regular expression or flags`);
      continue;
    }

    rules.push({
      pattern,
      replace: rule.data.replace,
      sections: rule.data.sections && new Set(rule.data.sections)
    });
  }

  return { rules, warnings };
}

/** The body inside Pi's `<name>` wrapper; a section without that exact wrapper, such as `preamble`, is all body. */
export function sectionBody(name: string, content: string): string {
  const open = `<${name}>\n`;
  const close = `\n</${name}>`;

  return content.startsWith(open) && content.endsWith(close)
    ? content.slice(open.length, -close.length)
    : content;
}

/** Maps the section body and keeps Pi's wrapper as is. */
export function mapSectionBody(
  name: string,
  content: string,
  map: (body: string) => string
): string {
  const body = sectionBody(name, content);

  return body === content ? map(content) : `<${name}>\n${map(body)}\n</${name}>`;
}

/** Runs the rules that apply to section `name` in list order, on the section body. */
export function rewriteSection(
  rules: readonly RewriteRule[],
  name: string,
  content: string
): string {
  return mapSectionBody(name, content, (body) => {
    for (const rule of rules) {
      if (rule.sections && !rule.sections.has(name)) continue;
      body = body.replace(rule.pattern, rule.replace);
    }

    return body;
  });
}
