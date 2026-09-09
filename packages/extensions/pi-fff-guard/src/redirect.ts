export function blockingReason(toolName: string): string {
  return `${toolName} does not work with Git-ignored paths. Retry with rg or another available tool.`;
}

export function missingPathReason(): string {
  return "No such file or directory";
}
