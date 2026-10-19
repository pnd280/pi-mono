const sectionReplacements = new Map<string, ReadonlyMap<string, string>>([
  [
    "docs",
    new Map([
      [
        "Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):",
        "Pi documentation (read only for questions about the agent, its SDK, extensions, themes, skills, or TUI):"
      ],
      [
        "- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md), environment variables (docs/environment-variables.md), MCP servers (docs/mcp.md), codemode scripts and non-LLM models such as classifiers and image models (docs/codemode.md)",
        "- Choose the reference for the requested topic: extensions (docs/extensions.md, examples/extensions/); themes (docs/themes.md); skills (docs/skills.md); prompt templates (docs/prompt-templates.md); terminal UI components (docs/tui.md); keybindings (docs/keybindings.md); SDK integrations (docs/sdk.md); custom providers (docs/custom-provider.md); adding models (docs/models.md); packages (docs/packages.md); environment variables (docs/environment-variables.md); MCP servers (docs/mcp.md); codemode scripts and non-LLM models, including classifiers and image models (docs/codemode.md)."
      ]
    ])
  ]
]);

export function rewritePromptSection(name: string, content: string): string {
  const replacements = sectionReplacements.get(name);
  if (!replacements) return content;

  const lines = content.split("\n");

  for (const [index, line] of lines.entries()) {
    // Skill names, descriptions, and paths belong to the user, not the prompt template.
    if (name === "skills" && line === "<available_skills>") break;
    lines[index] = replacements.get(line) ?? line;
  }

  return lines.join("\n");
}
