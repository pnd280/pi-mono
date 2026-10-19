import type { TuiMouseEvent } from "@earendil-works/pi-tui";

/** Cards ignore clicks with Shift, Alt, or Ctrl held. */
export function modifierHeld(event: TuiMouseEvent): boolean {
  return event.shift || event.alt || event.ctrl;
}
