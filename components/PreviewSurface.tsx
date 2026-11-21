"use client";

import { useEffect, useRef } from "react";
import { Item, dateLayoutOf, timeInlineOf, timeLayoutOf, timeLive } from "@/lib/tokens";
import { TimeState, dialAt, pickDial, setPeriod, startTime, stepTime, toggleMode, typeDigit } from "@/lib/timeLive";

/* The preview's dialogs and pickers: Cancel and OK close a dialog, a date picker and a time
 * picker (OK also does what the part is set to do), and a time picker can be set with its
 * wheels, its dial, its fields, AM/PM and its mode switch. A closed part comes back when its
 * screen is opened again. */

/** a part a visitor can close from inside: a dialog, a date picker shown as a dialog or hanging off
 *  its field, and a time picker that is not part of the page */
export const closable = (it: Item) =>
  it.kind === "dialog" || (it.kind === "datePicker" && dateLayoutOf(it) !== "input") || (it.kind === "timePicker" && !timeInlineOf(it));

/** a part this wrapper has something to do for */
export const surfaceOf = (it: Item) => closable(it) || it.kind === "timePicker";

/** the time picker as the visitor has set it, or as it opens before they touch it: its layout
 *  switched and the live time attached, which also makes its typed fields real text fields. A
 *  dialog switched to typing stays a dialog, whatever an `inline` left over from another layout
 *  says, and remembers which wheels or dial its mode switch goes back to. */
export function liveLook(it: Item, s: TimeState | undefined): Item {
  if (it.kind !== "timePicker") return it;
  const live = s ?? startTime(it, new Date());
  const own = timeLayoutOf(it);
  return {
    ...it,
    layout: live.layout,
    inline: timeInlineOf(it) || undefined,
    [timeLive]: { h24: live.h24, minute: live.minute, field: live.field, back: own === "input" ? (timeInlineOf(it) ? "scroll" : "dial") : own },
  };
}


export function Surface({
  item,
  state,
  onState,
  onClose,
  onOk,
  closing,
  reducedMotion,
  children,
}: {
  item: Item;
  state: TimeState | undefined;
  onState: (s: TimeState) => void;
  onClose: () => void;
  onOk: () => void;
  closing: boolean;
  reducedMotion: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isTime = item.kind === "timePicker";
  const clock24 = !!item.clock24;
  /* the latest state, for listeners that outlive a render */
  const current = useRef<TimeState>(state ?? startTime(item, new Date()));
  current.current = state ?? current.current;
  const set = (s: TimeState) => {
    current.current = s;
    onState(s);
  };
  /* a drag on a wheel or the dial ends in a click that must not also count as a tap */
  const dragged = useRef(false);

  /* the wheels turn with the mouse wheel; the page must not scroll under them */
  useEffect(() => {
    const el = ref.current;
    if (!el || !isTime) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      const wheel = (e.target as Element).closest?.("[data-tp-wheel]") as HTMLElement | null;
      if (!wheel) return;
      e.preventDefault();
      /* one notch of a mouse wheel is one step; a trackpad's small deltas add up to one */
      acc += e.deltaY;
      if (Math.abs(acc) < 30) return;
      const by = Math.sign(acc);
      acc = 0;
      set(stepTime(current.current, wheel.dataset.tpWheel as "hour" | "minute", by));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTime]);

  /* a typed field moved on to by typing (the hour done, on to the minutes) takes the caret */
  const field = state?.field;
  useEffect(() => {
    const el = ref.current;
    if (!el || !field || !(document.activeElement instanceof HTMLInputElement) || !el.contains(document.activeElement)) return;
    const input = el.querySelector(`input[data-tp="${field}"]`) as HTMLInputElement | null;
    if (input && input !== document.activeElement) input.focus({ preventScroll: true });
  }, [field]);

  /* a phone's number pad sends text rather than key presses: each digit is typed the same way */
  const onBeforeInput = (e: React.FormEvent) => {
    const data = (e.nativeEvent as InputEvent).data;
    if (!isTime || !(e.target instanceof HTMLInputElement)) return;
    e.preventDefault();
    let s = current.current;
    for (const ch of data ?? "") if (/[0-9]/.test(ch)) s = typeDigit(s, Number(ch), clock24);
    set(s);
  };

  /* typing sets the field being set while the picker has focus. Every key handled here stops
     here too: Backspace and the left arrow also mean "back a screen" to the preview. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    /* Escape is a dialog's or a picker's Cancel, before it is the preview's own close */
    if (e.key === "Escape" && closable(item)) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (!isTime) return;
    const s = current.current;
    /* Tab goes from the hour to the minute, and from the minute on out of the picker (Shift+Tab
       the other way), so the keyboard is never held inside it */
    if (e.key === "Tab") {
      const into = e.shiftKey ? "hour" : "minute";
      if (s.layout === "scroll" || s.field === into) return;
      e.stopPropagation();
      /* typed fields are real inputs: the browser moves between them and the focus sets the field */
      if (s.layout === "input") return;
      e.preventDefault();
      set({ ...s, field: into, fresh: true, lead: undefined });
      return;
    }
    const handled = /^[0-9]$/.test(e.key) || ["Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(e.key);
    if (handled) e.stopPropagation();
    if (/^[0-9]$/.test(e.key) && s.layout === "input") {
      e.preventDefault();
      set(typeDigit(s, Number(e.key), clock24));
    } else if (e.key === "Backspace" && s.layout === "input") {
      /* clearing a field starts it over: the next digit is its first */
      e.preventDefault();
      set({ ...s, fresh: true, lead: undefined });
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      set(stepTime(s, s.field, e.key === "ArrowUp" ? 1 : -1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (s.layout === "scroll") return;
      e.preventDefault();
      set({ ...s, field: e.key === "ArrowLeft" ? "hour" : "minute", fresh: true, lead: undefined });
    } else if (e.key === "Enter" && closable(item)) {
      e.preventDefault();
      onOk();
    }
  };

  /* the dial follows a pointer dragged round it, and a wheel steps as it is dragged */
  const onPointerDown = (e: React.PointerEvent) => {
    dragged.current = false;
    /* a dialog or a picker is a surface, not a button: pressing anywhere on it must not shrink it
       the way a pressed button does, nor start a swipe between screens */
    e.stopPropagation();
    if (!isTime) return;
    const target = e.target as Element;
    const face = target.closest("[data-tp-face]") as HTMLElement | null;
    const wheel = target.closest("[data-tp-wheel]") as HTMLElement | null;
    if (!face && !wheel) return;
    const startY = e.clientY;
    let moved = 0;
    /* one step for every row the finger travels, so the numbers keep pace with it */
    const notch = wheel ? wheel.getBoundingClientRect().height * 0.42 : 1;
    const atPointer = (x: number, y: number) => {
      const r = face!.getBoundingClientRect();
      const k = r.width / 256;
      const s = current.current;
      return pickDial(s, dialAt(s.field, clock24, (x - r.left - r.width / 2) / k, (y - r.top - r.height / 2) / k), clock24);
    };
    if (face) set(atPointer(e.clientX, e.clientY));
    const move = (ev: PointerEvent) => {
      if (face) {
        dragged.current = true;
        set(atPointer(ev.clientX, ev.clientY));
        return;
      }
      const steps = Math.trunc((startY - ev.clientY) / notch) - moved;
      if (steps) {
        dragged.current = true;
        moved += steps;
        set(stepTime(current.current, wheel!.dataset.tpWheel as "hour" | "minute", steps));
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      /* letting go of an hour on the dial moves on to the minutes, as M3's dial does */
      if (face && current.current.field === "hour") set({ ...current.current, field: "minute", fresh: true, lead: undefined });
      if (face) dragged.current = true;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onClickCapture = (e: React.MouseEvent) => {
    const target = e.target as Element;
    const act = (target.closest("[data-act]") as HTMLElement | null)?.dataset.act;
    if (act) {
      e.stopPropagation();
      if (act === "ok") onOk();
      else onClose();
      return;
    }
    if (!isTime) {
      /* nothing else in a dialog or a picker over the page does anything; it takes the keyboard,
         so Escape closes it */
      if (closable(item)) {
        e.stopPropagation();
        ref.current?.focus({ preventScroll: true });
      }
      return;
    }
    /* the picker takes the keyboard, unless a typed field already has it; an input picker hands it
       to the field being set once this tap has been drawn, so Tab runs on from there */
    if (!(target instanceof HTMLInputElement)) {
      ref.current?.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        const s = current.current;
        if (s.layout !== "input" || !ref.current?.contains(document.activeElement)) return;
        (ref.current.querySelector(`input[data-tp="${s.field}"]`) as HTMLInputElement | null)?.focus({ preventScroll: true });
      });
    }
    if (dragged.current) {
      dragged.current = false;
      e.stopPropagation();
      return;
    }
    const s = current.current;
    const control = target.closest("[data-tp],[data-tp-step],[data-tp-dial]") as HTMLElement | null;
    const tp = control?.dataset.tp;
    if (tp === "am" || tp === "pm") set(setPeriod(s, tp === "pm"));
    else if (tp === "hour" || tp === "minute") set({ ...s, field: tp, fresh: true, lead: undefined });
    else if (tp === "toggle") set(toggleMode(item, s));
    else if (control?.dataset.tpStep) {
      const wheel = control.closest("[data-tp-wheel]") as HTMLElement | null;
      if (wheel) set(stepTime(s, wheel.dataset.tpWheel as "hour" | "minute", Number(control.dataset.tpStep)));
    } else if (!control && !closable(item)) return;
    e.stopPropagation();
  };

  return (
    <div
      ref={ref}
      tabIndex={isTime || closable(item) ? -1 : undefined}
      onKeyDown={onKeyDown}
      onBeforeInputCapture={onBeforeInput}
      onFocusCapture={(e) => {
        /* a typed field chosen by tapping or tabbing into it is the one being set */
        const name = (e.target as HTMLElement).dataset?.tp;
        if (isTime && e.target instanceof HTMLInputElement && (name === "hour" || name === "minute") && current.current.field !== name)
          set({ ...current.current, field: name, fresh: true, lead: undefined });
      }}
      onPointerDownCapture={onPointerDown}
      onClickCapture={onClickCapture}
      style={{
        display: "flex",
        flex: "0 0 auto",
        outline: "none",
        opacity: closing ? 0 : 1,
        transform: closing ? "scale(0.96)" : undefined,
        transition: reducedMotion ? undefined : "opacity 150ms cubic-bezier(0.2, 0, 0, 1), transform 150ms cubic-bezier(0.2, 0, 0, 1)",
        pointerEvents: closing ? "none" : undefined,
      }}
    >
      {children}
    </div>
  );
}
