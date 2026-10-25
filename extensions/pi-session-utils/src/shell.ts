/** Quote NUL-free text as one literal argument in a POSIX shell. */
export function quotePosixShellArgument(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
