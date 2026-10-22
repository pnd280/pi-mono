/** Keep per-call focus last without dropping it when no file focus is configured. */
export function combineInstructions(additional: string | undefined, requested: string | undefined) {
  if (!additional) return requested;

  return requested ? `${additional}\n\n${requested}` : additional;
}
