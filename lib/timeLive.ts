import { Item, TimeLayout, TimeLive, timeInlineOf, timeLayoutOf } from "./tokens";

/* What a visitor does to a time picker in the preview, as plain steps on its state, so the
 * preview only has to say which control was used. */

/** `fresh`: the next digit typed starts the field over rather than joining the one before it */
export type TimeState = TimeLive & { layout: TimeLayout; fresh?: boolean };

/** a picker as it first opens: the time it is now, on the hour field, in the layout its author chose */
export const startTime = (it: Item, at: Date): TimeState => ({ h24: at.getHours(), minute: at.getMinutes(), field: "hour", layout: timeLayoutOf(it), fresh: true });

const wrap = (n: number, m: number) => ((n % m) + m) % m;

/** one notch of a wheel, or an arrow key: the hour wraps round the day, the minute round the hour
 *  (without carrying into the hour, as the wheels do) */
export const stepTime = (s: TimeState, field: "hour" | "minute", by: number): TimeState =>
  field === "hour" ? { ...s, h24: wrap(s.h24 + by, 24) } : { ...s, minute: wrap(s.minute + by, 60) };

/** AM or PM chosen: the same hour in the other half of the day */
export const setPeriod = (s: TimeState, pm: boolean): TimeState => ({ ...s, h24: (s.h24 % 12) + (pm ? 12 : 0) });

/** a number on the dial tapped: an hour as the face reads it (1 to 12, or 0 to 23 on a 24-hour
 *  face) keeps the half of the day on a 12-hour clock; picking one moves on to the minutes */
export function pickDial(s: TimeState, n: number, clock24: boolean): TimeState {
  if (s.field === "minute") return { ...s, minute: wrap(n, 60) };
  const h24 = clock24 ? wrap(n, 24) : (n % 12) + (s.h24 >= 12 ? 12 : 0);
  return { ...s, h24 };
}

/** the number under a point on the dial: dx and dy from the face's centre, in dp. Hours sit every
 *  30 degrees and minutes every 6; on a 24-hour face a point inside the ring between the two
 *  circles of numbers is an hour from 12 to 23. */
export function dialAt(field: "hour" | "minute", clock24: boolean, dx: number, dy: number): number {
  const turn = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
  if (field === "minute") return Math.round(turn / (Math.PI / 30)) % 60;
  const slot = Math.round(turn / (Math.PI / 6)) % 12;
  if (clock24) return Math.hypot(dx, dy) < 86 ? slot + 12 : slot;
  return slot === 0 ? 12 : slot;
}

/** a digit typed into the field being set. The first digit after a field is chosen starts it
 *  over; a second one joins it when the pair is a time the field can hold. An hour that cannot
 *  take another digit is done, and typing moves on to the minutes. */
export function typeDigit(s: TimeState, d: number, clock24: boolean): TimeState {
  const minute = s.field === "minute";
  const max = minute ? 59 : clock24 ? 23 : 12;
  const current = minute ? s.minute : clock24 ? s.h24 : s.h24 % 12 || 12;
  const pair = current * 10 + d;
  const value = !s.fresh && current < 10 && pair <= max ? pair : d;
  /* a 12-hour clock has no hour 0: a leading zero is only the start of 01 to 09 */
  if (!minute && !clock24 && value === 0) return { ...s, fresh: false, h24: s.h24 };
  const done = value * 10 > max || value >= 10;
  if (minute) return { ...s, minute: value, fresh: done };
  const h24 = clock24 ? value : (value % 12) + (s.h24 >= 12 ? 12 : 0);
  return done ? { ...s, h24, field: "minute", fresh: true } : { ...s, h24, fresh: false };
}

/** the mode switch: typing the numbers in, or back to the wheels or the dial the picker came with
 *  (an inline picker has no dial, so it goes back to its wheels) */
export function toggleMode(it: Item, s: TimeState): TimeState {
  if (s.layout !== "input") return { ...s, layout: "input" };
  const own = timeLayoutOf(it);
  return { ...s, layout: timeInlineOf(it) || own === "scroll" ? "scroll" : "dial" };
}
