"use client";

import {
  CARD_PADDING,
  Item,
  Palette,
  cardWidths,
  carouselCardsOf,
  carouselCountOf,
  carouselInset,
  carouselLayoutOf,
  carouselShapes,
  cardScrimOf,
  dateLayoutOf,
  scaleR,
  sizeOf,
  timeHorizontalOf,
  timeInlineOf,
  timeLayoutOf,
  timeLive,
} from "@/lib/tokens";
import { useLayoutEffect, useRef } from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { dateHeadline, monthHeadline, t, useLang } from "@/lib/i18n";
import { Icon } from "./M3Node";

/* The three parts drawn here are wide surfaces rather than controls: a carousel's row of
 * cards, a calendar, a clock. They take their whole box. A calendar shows today and a clock the
 * time it is now, the way the real pickers open, so the sketch never has a date to be set and
 * the prompt never names one. */

/** the moment a picker is drawn at: read once per render, so every piece of one picker agrees */
const now = () => new Date();

export function CarouselBody({ item, p, scroll = 0 }: { item: Item; p: Palette; scroll?: number }) {
  const { w, h } = sizeOf(item, {});
  const cards = carouselCardsOf(item);
  const r = scaleR(16);
  /* where each card stands at this scroll: at rest it is the arrangement the layout names, and
   * part-way through a scroll each card is between two of its sizes */
  const shapes = carouselShapes(item, w, scroll);
  /* Every picture is drawn at the widest a card ever is and cropped by the card it is on, so it
   * holds still while the card grows and shrinks. Sized to the card instead, a picture would be
   * zoomed and unzoomed the whole way through a scroll, which is the card's own movement fighting
   * what is on it. */
  const picture = cardWidths(carouselLayoutOf(item), w - carouselInset(w), carouselCountOf(item))[0];
  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      {shapes.map(({ x, w: cw, lead }, i) => {
        const card = cards[i];
        const src = card?.src;
        const words = card?.label?.trim() ?? "";
        if (cw < 1) return null;
        return (
          <div
            key={i}
            data-card={i}
            style={{
              position: "absolute",
              left: x,
              top: 0,
              width: cw,
              height: "100%",
              borderRadius: r,
              background: !src && i === 0 ? p.primaryContainer : p.surfaceContainerHighest,
              color: i === 0 ? p.onPrimaryContainer : p.onSurfaceVariant,
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
            }}
          >
            {src ? (
              /* the picture fills its card, however the card is shaped */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt=""
                draggable={false}
                /* the card keeps the middle of it: what a narrow card loses, it loses off both sides */
                style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: picture, maxWidth: "none", height: "100%", objectFit: "cover" }}
              />
            ) : (
              cw > 56 && !words && <Icon name="image" size={Math.min(32, Math.round(Math.min(cw, h) * 0.28))} />
            )}
            {/* a picture stands under the same scrim a card's own words stand on: it fades in from
              * the foot of the card, so the row reads as one whatever the pictures are. The words
              * over a picture are white whatever the theme, so the scrim is the one white ink asks
              * for; a card with no picture is its own colour and needs none. */}
            {src && <div style={{ position: "absolute", inset: 0, background: cardScrimOf("#ffffff", "end"), pointerEvents: "none" }} />}
            {/* only the card in the large keyline says anything: it fades in as it grows into it */}
            {cw > 72 && words && lead > 0 && (
              <span
                style={{
                  position: "absolute",
                  left: 14,
                  right: 14,
                  bottom: 12,
                  fontSize: 16,
                  fontWeight: 600,
                  lineHeight: 1.35,
                  /* what the author typed, line breaks and all */
                  whiteSpace: "pre-line",
                  overflow: "hidden",
                  color: src ? "#fff" : "inherit",
                  opacity: lead,
                }}
              >
                {words}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** the run of text buttons a picker dialog ends with */
function PickerActions({ p }: { p: Palette }) {
  const lang = useLang();
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "0 12px 12px" }}>
      {[t("cancel", lang), t("ok", lang)].map((label, i) => (
        <span key={label} data-act={i ? "ok" : "cancel"} style={{ height: 40, padding: "0 12px", borderRadius: 20, color: p.primary, fontSize: 14, fontWeight: 600, display: "inline-flex", alignItems: "center" }}>
          {label}
        </span>
      ))}
    </div>
  );
}

/** the seven letters over a month's columns, in the language the sketch is written in */
const WEEKDAYS: Record<string, string[]> = {
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  en: ["S", "M", "T", "W", "T", "F", "S"],
  zh: ["日", "一", "二", "三", "四", "五", "六"],
  ko: ["일", "월", "화", "수", "목", "금", "토"],
};

/** this month as a grid: its days from the weekday it starts on, with today on a filled circle */
function Month({ at, p, cell }: { at: Date; p: Palette; cell: number }) {
  const lang = useLang();
  const day = at.getDate();
  const days = new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate();
  const offset = new Date(at.getFullYear(), at.getMonth(), 1).getDay();
  const cells = Array.from({ length: 42 }, (_, i) => (i < offset || i - offset >= days ? null : i - offset + 1));
  return (
    <div style={{ padding: "0 24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {(WEEKDAYS[lang] ?? WEEKDAYS.en).map((d, i) => (
          <span key={i} style={{ height: cell, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant }}>
            {d}
          </span>
        ))}
        {cells.map((d, i) => (
          <span key={i} style={{ height: cell, display: "grid", placeItems: "center" }}>
            {d !== null && (
              <span
                style={{
                  width: cell - 4,
                  height: cell - 4,
                  borderRadius: (cell - 4) / 2,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 13,
                  fontWeight: d === day ? 700 : 500,
                  background: d === day ? p.primary : "transparent",
                  color: d === day ? p.onPrimary : p.onSurface,
                }}
              >
                {d}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** the field a date is typed into, with the calendar button at its end */
function DateField({ at, p }: { at: Date; p: Palette }) {
  const lang = useLang();
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: p.onSurfaceVariant, marginBottom: 6 }}>{t("dateLabel", lang)}</div>
      <div
        style={{
          height: 56,
          borderRadius: 4,
          border: `1px solid ${p.outline}`,
          display: "flex",
          alignItems: "center",
          padding: "0 12px 0 16px",
          gap: 8,
          color: p.onSurface,
          fontSize: 16,
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {dateHeadline(lang, at)}
        </span>
        <Icon name="calendar_month" size={22} />
      </div>
    </div>
  );
}

export function DatePickerBody({ item, p }: { item: Item; p: Palette }) {
  const lang = useLang();
  const layout = dateLayoutOf(item);
  const at = now();
  if (layout === "input") return <DateField at={at} p={p} />;
  const { w } = sizeOf(item, {});
  const cell = Math.round((w - 48) / 7);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {layout === "modal" && (
        <div style={{ padding: "16px 24px 0" }}>
          <div style={{ fontSize: 12, color: p.onSurfaceVariant }}>{t("selectDate", lang)}</div>
          <div style={{ fontSize: 28, fontWeight: 500, color: p.onSurface, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {dateHeadline(lang, at)}
          </div>
        </div>
      )}
      {/* under a headline the month row sits close; docked, it is the first thing on the surface and takes the surface's own margin */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${layout === "docked" ? 16 : 8}px 16px 0 24px`, color: p.onSurfaceVariant }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: p.onSurface, display: "inline-flex", alignItems: "center", gap: 4 }}>
          {monthHeadline(lang, at)}
          <Icon name="arrow_drop_down" size={20} />
        </span>
        <span style={{ display: "inline-flex", gap: 12 }}>
          <Icon name="chevron_left" size={20} />
          <Icon name="chevron_right" size={20} />
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, paddingTop: 4 }}>
        <Month at={at} p={p} cell={cell} />
      </div>
      <PickerActions p={p} />
    </div>
  );
}

/* ---------- time picker (M3 Expressive) ---------- */

/** the surface the fields, the wheels and the dial sit on: surfaceContainerLowest, which the
 *  palette does not carry. It is white in a light scheme and a step darker than the surface in a
 *  dark one. */
function lowestOf(p: Palette): string {
  const hex = p.surface.replace("#", "");
  const v = parseInt(hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.slice(0, 6), 16);
  if (Number.isNaN(v)) return "#FFFFFF";
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  if ((0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5) return "#FFFFFF";
  const dim = (c: number) => Math.round(c * 0.66).toString(16).padStart(2, "0");
  return `#${dim(r)}${dim(g)}${dim(b)}`;
}

const TIME_DIGITS = { fontSize: 57, lineHeight: 1, fontWeight: 500, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 } as const;
const two = (n: number) => String(n).padStart(2, "0");

/** what a picker shows: the time a preview visitor has set on it, or else the time it is now,
 *  as its clock reads it, and the field being set */
function clockOf(item: Item, clock24: boolean) {
  const live = item[timeLive];
  const at = now();
  const h24 = live?.h24 ?? at.getHours();
  const minute = live?.minute ?? at.getMinutes();
  return { h24, hour: clock24 ? h24 : h24 % 12 || 12, minute, pm: h24 >= 12, field: live?.field ?? "hour" };
}

/** the hour or minute field of the input and dial pickers; the one being set has a primary outline */
function TimeField({ text, on, caret, typed, p, w, h, name }: { text: string; on: boolean; caret?: boolean; typed?: boolean; p: Palette; w: number; h: number; name: "hour" | "minute" }) {
  /* in the preview an input picker's fields are real text fields, so a phone brings up its number
     pad; the preview turns what is typed into the time (see components/PreviewSurface.tsx) */
  if (typed)
    return (
      <span style={{ width: w, height: h, flex: "0 0 auto", borderRadius: scaleR(16), background: lowestOf(p), boxShadow: on ? `inset 0 0 0 2px ${p.primary}` : undefined, display: "flex" }}>
        <input
          data-tp={name}
          value={text}
          onChange={() => {}}
          inputMode="numeric"
          aria-label={name}
          style={{ width: "100%", height: "100%", border: "none", outline: "none", background: "transparent", textAlign: "center", padding: 0, color: on ? p.primary : p.onSurface, caretColor: p.primary, fontFamily: "inherit", ...TIME_DIGITS }}
        />
      </span>
    );
  return (
    <span
      data-tp={name}
      style={{
        width: w,
        height: h,
        flex: "0 0 auto",
        borderRadius: scaleR(16),
        background: lowestOf(p),
        boxShadow: on ? `inset 0 0 0 2px ${p.primary}` : undefined,
        color: on ? p.primary : p.onSurface,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...TIME_DIGITS,
      }}
    >
      {text}
      {caret && <span style={{ width: 2, height: 44, marginLeft: 2, background: p.primary }} />}
    </span>
  );
}

/** a scroll picker's wheel: the value in the middle, the ones before and after cut off by its edges.
 *  When the value changes the numbers roll to it, the shorter way round, as a phone's wheel does. */
function TimeWheel({ index, count, label, p, w, h, name }: { index: number; count: number; label: (n: number) => string; p: Palette; w: number; h: number; name: "hour" | "minute" }) {
  const off = Math.round(h * 0.42);
  const y = useMotionValue(0);
  const reduced = useReducedMotion();
  const last = useRef(index);
  useLayoutEffect(() => {
    const was = last.current;
    last.current = index;
    if (was === index || reduced) return;
    /* how far it moved, the short way round the dial of values */
    const by = ((((index - was) % count) + count + count / 2) % count) - count / 2;
    /* start from where the old value stood and roll the new one into the middle */
    const roll = animate(y, 0, { from: y.get() + by * off, duration: 0.24, ease: [0.2, 0, 0, 1] });
    return () => roll.stop();
  }, [index, count, off, reduced, y]);
  const rows = [-2, -1, 0, 1, 2];
  return (
    <span data-tp-wheel={name} style={{ position: "relative", touchAction: "none", width: w, height: h, flex: "0 0 auto", borderRadius: scaleR(16), background: lowestOf(p), overflow: "hidden" }}>
      <motion.span style={{ position: "absolute", inset: 0, y }}>
        {rows.map((k) => (
          <span
            key={k}
            data-tp-step={k || undefined}
            style={{ position: "absolute", left: 0, right: 0, top: h / 2 + k * off, transform: "translateY(-50%)", textAlign: "center", color: k ? p.outline : p.onSurface, ...TIME_DIGITS }}
          >
            {label((((index + k) % count) + count) % count)}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** the colon between hours and minutes, as two dots */
function TimeSeparator({ p, h }: { p: Palette; h: number }) {
  const dot = { width: 6, height: 6, borderRadius: 3, background: p.onSurface };
  return (
    <span style={{ width: 16, height: h, flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <span style={dot} />
      <span style={dot} />
    </span>
  );
}

/** AM and PM: the chosen one a rounded square in primaryContainer, the other a circle (a pill when wide) */
function Period({ pm, p, size, row, wide }: { pm: boolean; p: Palette; size: number; row?: boolean; wide?: number }) {
  const lowest = lowestOf(p);
  return (
    <span style={{ display: "flex", flexDirection: row ? "row" : "column", gap: row ? 16 : 8, flex: "0 0 auto" }}>
      {["AM", "PM"].map((label) => {
        const on = (label === "PM") === pm;
        return (
          <span
            key={label}
            data-tp={label === "PM" ? "pm" : "am"}
            style={{
              width: wide ?? size,
              height: size,
              borderRadius: on ? scaleR(size >= 56 ? 16 : 12) : size / 2,
              background: on ? p.primaryContainer : lowest,
              color: on ? p.onPrimaryContainer : p.onSurfaceVariant,
              display: "grid",
              placeItems: "center",
              fontSize: size >= 56 ? 16 : 14,
              fontWeight: on ? 700 : 500,
            }}
          >
            {label}
          </span>
        );
      })}
    </span>
  );
}

/** the clock face: the hours round the edge, and on a 24-hour clock 12 to 23 on a ring inside */
function TimeDial({ h24, minute, field, clock24, p }: { h24: number; minute: number; field: "hour" | "minute"; clock24: boolean; p: Palette }) {
  const size = 256;
  const R = size / 2;
  const outer = 102;
  const inner = 70;
  const at = (n: number, ring: number) => {
    const a = ((n % 12) / 12) * Math.PI * 2 - Math.PI / 2;
    return { x: R + Math.cos(a) * ring, y: R + Math.sin(a) * ring };
  };
  /* minutes run round the edge in fives; on a 24-hour face midnight and 1 to 11 run round the
     edge and 12 to 23 round the inside */
  const minutes = field === "minute";
  const pick = minutes ? minute : clock24 ? h24 : h24 % 12 || 12;
  const hand = minutes ? at(minute / 5, outer) : at(pick, clock24 && h24 >= 12 ? inner : outer);
  const labels: { n: number; text: string; ring: number; slot: number }[] = minutes
    ? Array.from({ length: 12 }, (_, i) => ({ n: i * 5, text: two(i * 5), ring: outer, slot: i }))
    : clock24
      ? [
          ...Array.from({ length: 12 }, (_, i) => ({ n: i, text: i === 0 ? "00" : String(i), ring: outer, slot: i })),
          ...Array.from({ length: 12 }, (_, i) => ({ n: i + 12, text: String(i + 12), ring: inner, slot: i })),
        ]
      : Array.from({ length: 12 }, (_, i) => ({ n: i + 1, text: String(i + 1), ring: outer, slot: i + 1 }));
  const onLabel = labels.some((l) => l.n === pick);
  return (
    <div data-tp-face={field} data-clock24={clock24 || undefined} style={{ width: size, height: size, borderRadius: R, background: lowestOf(p), position: "relative", flex: "0 0 auto", touchAction: "none" }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden>
        <line x1={R} y1={R} x2={hand.x} y2={hand.y} stroke={p.primary} strokeWidth={2} />
        <circle cx={R} cy={R} r={4} fill={p.primary} />
        <circle cx={hand.x} cy={hand.y} r={24} fill={p.primary} />
        {/* a minute between the fives has no number under the selector, so it carries a dot */}
        {!onLabel && <circle cx={hand.x} cy={hand.y} r={2} fill={p.onPrimary} />}
      </svg>
      {labels.map(({ n, text, ring, slot }) => {
        const c = at(slot, ring);
        const on = n === pick;
        return (
          <span
            key={n}
            data-tp-dial={n}
            style={{
              position: "absolute",
              left: c.x - 20,
              top: c.y - 20,
              width: 40,
              height: 40,
              display: "grid",
              placeItems: "center",
              fontSize: ring === inner ? 14 : 16,
              color: on ? p.onPrimary : p.onSurface,
            }}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}

/** the row a time picker dialog ends with: the mode switch on the left, Cancel and OK on the right */
function TimeActions({ icon, p }: { icon: string; p: Palette }) {
  const lang = useLang();
  return (
    <div style={{ height: 48, display: "flex", alignItems: "center", flex: "0 0 auto" }}>
      <span data-tp="toggle" style={{ width: 48, height: 48, display: "grid", placeItems: "center", color: p.onSurfaceVariant }}>
        <Icon name={icon} size={24} fill={icon === "schedule"} />
      </span>
      <span style={{ flex: 1 }} />
      {[t("cancel", lang), t("ok", lang)].map((label, i) => (
        <span key={label} data-act={i ? "ok" : "cancel"} style={{ height: 40, padding: "0 12px", color: p.primary, fontSize: 14, fontWeight: 600, display: "inline-flex", alignItems: "center" }}>
          {label}
        </span>
      ))}
    </div>
  );
}

/** M3 Expressive's time pickers: a scroll picker and an input picker, inline or in a dialog, and a
 *  dial picker in a dialog, upright or on its side, each on a 12- or 24-hour clock */
export function TimePickerBody({ item, p }: { item: Item; p: Palette }) {
  const layout = timeLayoutOf(item);
  const clock24 = !!item.clock24;
  const { w } = sizeOf(item, {});
  const { h24, hour, minute, pm, field } = clockOf(item, clock24);
  /* the preview sets a time on the picker; that is where its typed fields take the keyboard */
  const typed = layout === "input" && !!item[timeLive];
  const hourText = (n: number) => (clock24 ? two((n + 24) % 24) : two(((n + 11) % 12) + 1));
  const fields = (fw: number, fh: number) =>
    layout === "scroll" ? (
      <>
        <TimeWheel name="hour" index={clock24 ? h24 : hour - 1} count={clock24 ? 24 : 12} label={(n) => (clock24 ? two(n) : two(n + 1))} p={p} w={fw} h={fh} />
        <TimeSeparator p={p} h={fh} />
        <TimeWheel name="minute" index={minute} count={60} label={two} p={p} w={fw} h={fh} />
      </>
    ) : (
      <>
        <TimeField name="hour" text={hourText(hour)} on={field === "hour"} caret={layout === "input" && field === "hour"} typed={typed} p={p} w={fw} h={fh} />
        <TimeSeparator p={p} h={fh} />
        <TimeField name="minute" text={two(minute)} on={field === "minute"} caret={layout === "input" && field === "minute"} typed={typed} p={p} w={fw} h={fh} />
      </>
    );

  if (timeInlineOf(item)) {
    /* in the page: the fields fill the width, with the period and the mode switch in a column beside them */
    const fw = Math.max(100, Math.floor((w - 16 - 8 - 40) / 2));
    return (
      <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
        {fields(fw, 140)}
        <span style={{ width: 8, flex: "0 0 auto" }} />
        <span style={{ width: 40, height: 136, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8, flex: "0 0 auto" }}>
          {!clock24 && <Period pm={pm} p={p} size={40} />}
          <span data-tp="toggle" style={{ width: 40, height: 40, display: "grid", placeItems: "center", color: p.onSurfaceVariant }}>
            <Icon name={layout === "scroll" ? "keyboard" : "swipe_vertical"} size={24} />
          </span>
        </span>
      </div>
    );
  }

  if (timeHorizontalOf(item)) {
    /* on its side: the fields and the period stand beside the dial, centred on it */
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", height: 256 }}>
          <div style={{ width: 216, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex" }}>{fields(100, 120)}</div>
            {!clock24 && <Period pm={pm} p={p} size={40} row wide={100} />}
          </div>
          <span style={{ width: 52, flex: "0 0 auto" }} />
          <TimeDial h24={h24} minute={minute} field={field} clock24={clock24} p={p} />
        </div>
        <span style={{ height: 24, flex: "0 0 auto" }} />
        <TimeActions icon="keyboard" p={p} />
      </div>
    );
  }

  /* a dialog with the fields across the top, and the dial under them on a dial picker */
  const fw = clock24 && layout === "dial" ? 132 : 100;
  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}>
        {fields(fw, 120)}
        {!clock24 && (
          <>
            <span style={{ width: 8, flex: "0 0 auto" }} />
            <Period pm={pm} p={p} size={56} />
          </>
        )}
      </div>
      {layout === "dial" ? (
        <>
          <span style={{ height: 12, flex: "0 0 auto" }} />
          <div style={{ display: "flex", justifyContent: "center", flex: "0 0 auto" }}>
            <TimeDial h24={h24} minute={minute} field={field} clock24={clock24} p={p} />
          </div>
          <span style={{ height: 12, flex: "0 0 auto" }} />
          <TimeActions icon="keyboard" p={p} />
        </>
      ) : (
        <>
          <span style={{ height: 8, flex: "0 0 auto" }} />
          <TimeActions icon={layout === "input" ? (item[timeLive]?.back === "scroll" ? "swipe_vertical" : "schedule") : "keyboard"} p={p} />
        </>
      )}
    </div>
  );
}
