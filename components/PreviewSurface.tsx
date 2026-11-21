"use client";

import { useEffect, useRef } from "react";
import { Item, dateLayoutOf, timeInlineOf, timeLive } from "@/lib/tokens";
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

/** the time picker as the visitor has set it: its layout switched and the live time attached */
export function liveLook(it: Item, s: TimeState | undefined): Item {
  if (it.kind !== "timePicker" || !s) return it;
  return { ...it, layout: s.layout, [timeLive]: { h24: s.h24, minute: s.minute, field: s.field } };
}

/** how far a wheel is dragged for one step, in screen pixels */
const NOTCH = 36;

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

  /* typing sets the field being set while the picker has focus */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!isTime) return;
    const s = current.current;
    if (/^[0-9]$/.test(e.key) && s.layout === "input") {
      e.preventDefault();
      set(typeDigit(s, Number(e.key), clock24));
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      set(stepTime(s, s.field, e.key === "ArrowUp" ? 1 : -1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Tab") {
      if (s.layout === "scroll") return;
      e.preventDefault();
      set({ ...s, field: s.field === "hour" ? "minute" : "hour", fresh: true });
    } else if (e.key === "Enter" && closable(item)) {
      e.preventDefault();
      onOk();
    }
  };

  /* the dial follows a pointer dragged round it, and a wheel steps as it is dragged */
  const onPointerDown = (e: React.PointerEvent) => {
    dragged.current = false;
    if (!isTime) return;
    const target = e.target as Element;
    const face = target.closest("[data-tp-face]") as HTMLElement | null;
    const wheel = target.closest("[data-tp-wheel]") as HTMLElement | null;
    if (!face && !wheel) return;
    e.stopPropagation();
    const startY = e.clientY;
    let moved = 0;
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
      const steps = Math.trunc((startY - ev.clientY) / NOTCH) - moved;
      if (steps) {
        dragged.current = true;
        moved += steps;
        set(stepTime(current.current, wheel!.dataset.tpWheel as "hour" | "minute", -steps));
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      /* letting go of an hour on the dial moves on to the minutes, as M3's dial does */
      if (face && current.current.field === "hour") set({ ...current.current, field: "minute", fresh: true });
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
      /* nothing else in a dialog or a picker over the page does anything */
      if (closable(item)) e.stopPropagation();
      return;
    }
    ref.current?.focus({ preventScroll: true });
    if (dragged.current) {
      dragged.current = false;
      e.stopPropagation();
      return;
    }
    const s = current.current;
    const control = target.closest("[data-tp],[data-tp-step],[data-tp-dial]") as HTMLElement | null;
    const tp = control?.dataset.tp;
    if (tp === "am" || tp === "pm") set(setPeriod(s, tp === "pm"));
    else if (tp === "hour" || tp === "minute") set({ ...s, field: tp, fresh: true });
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
      tabIndex={isTime ? -1 : undefined}
      onKeyDown={onKeyDown}
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
