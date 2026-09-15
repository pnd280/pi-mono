const HEIGHT_FRACTION = 3 / 4;
const MIN_INLINE_HEIGHT = 12;
const INLINE_CHROME_ROWS = 3;

export function browserLayout(terminalRows: number) {
  const inlineHeight = Math.floor(Math.max(0, terminalRows - INLINE_CHROME_ROWS) * HEIGHT_FRACTION);
  const overlay = inlineHeight < MIN_INLINE_HEIGHT;

  return {
    overlay,
    height: overlay ? Math.floor(Math.max(0, terminalRows) * HEIGHT_FRACTION) : inlineHeight
  };
}
