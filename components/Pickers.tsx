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
  timeLayoutOf,
} from "@/lib/tokens";
import { dateHeadline, monthHeadline, t, useLang } from "@/lib/i18n";
import { Icon, inkOf } from "./M3Node";

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
                  color: inkOf(item, src ? "#fff" : i === 0 ? p.onPrimaryContainer : p.onSurfaceVariant),
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
function PickerActions({ item, p }: { item: Item; p: Palette }) {
  const lang = useLang();
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "0 12px 12px" }}>
      {[t("cancel", lang), t("ok", lang)].map((label) => (
        <span key={label} style={{ height: 40, padding: "0 12px", borderRadius: 20, color: inkOf(item, p.primary), fontSize: 14, fontWeight: 600, display: "inline-flex", alignItems: "center" }}>
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
function Month({ item, at, p, cell }: { item: Item; at: Date; p: Palette; cell: number }) {
  const lang = useLang();
  const day = at.getDate();
  const days = new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate();
  const offset = new Date(at.getFullYear(), at.getMonth(), 1).getDay();
  const cells = Array.from({ length: 42 }, (_, i) => (i < offset || i - offset >= days ? null : i - offset + 1));
  return (
    <div style={{ padding: "0 24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {(WEEKDAYS[lang] ?? WEEKDAYS.en).map((d, i) => (
          <span key={i} style={{ height: cell, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, color: inkOf(item, p.onSurfaceVariant) }}>
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
                  color: inkOf(item, d === day ? p.onPrimary : p.onSurface),
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
function DateField({ item, at, p }: { item: Item; at: Date; p: Palette }) {
  const lang = useLang();
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: inkOf(item, p.onSurfaceVariant), marginBottom: 6 }}>{t("dateLabel", lang)}</div>
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
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: inkOf(item, p.onSurface) }}>
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
  if (layout === "input") return <DateField item={item} at={at} p={p} />;
  const { w } = sizeOf(item, {});
  const cell = Math.round((w - 48) / 7);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {layout === "modal" && (
        <div style={{ padding: "16px 24px 0" }}>
          <div style={{ fontSize: 12, color: inkOf(item, p.onSurfaceVariant) }}>{t("selectDate", lang)}</div>
          <div style={{ fontSize: 28, fontWeight: 500, color: inkOf(item, p.onSurface), marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {dateHeadline(lang, at)}
          </div>
        </div>
      )}
      {/* under a headline the month row sits close; docked, it is the first thing on the surface and takes the surface's own margin */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${layout === "docked" ? 16 : 8}px 16px 0 24px`, color: p.onSurfaceVariant }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: p.onSurface, display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: inkOf(item, p.onSurface) }}>{monthHeadline(lang, at)}</span>
          <Icon name="arrow_drop_down" size={20} />
        </span>
        <span style={{ display: "inline-flex", gap: 12 }}>
          <Icon name="chevron_left" size={20} />
          <Icon name="chevron_right" size={20} />
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, paddingTop: 4 }}>
        <Month item={item} at={at} p={p} cell={cell} />
      </div>
      <PickerActions item={item} p={p} />
    </div>
  );
}

/** one of the two number plates a time is read off */
function TimeBox({ text, ink, on, p, wide }: { text: string; ink?: string; on: boolean; p: Palette; wide: number }) {
  return (
    <span
      style={{
        width: wide,
        height: 72,
        borderRadius: 8,
        display: "grid",
        placeItems: "center",
        background: on ? p.primaryContainer : p.surfaceContainerHighest,
        color: ink,
        fontSize: 40,
        fontWeight: 400,
        border: on ? `2px solid ${p.primary}` : "none",
        boxSizing: "border-box",
      }}
    >
      {text}
    </span>
  );
}

/** the clock face: the hours around it and a hand reaching the one it is now */
function Dial({ item, hour24, p, size }: { item: Item; hour24: number; p: Palette; size: number }) {
  /* the hour on a twelve-hour face: twelve stands at the top, where a zero would */
  const hour = hour24 % 12 || 12;
  const R = size / 2;
  const ring = R - 20;
  const angle = ((hour % 12) / 12) * Math.PI * 2 - Math.PI / 2;
  const hx = R + Math.cos(angle) * ring;
  const hy = R + Math.sin(angle) * ring;
  return (
    <div style={{ width: size, height: size, borderRadius: R, background: p.surfaceContainerHighest, position: "relative" }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0 }} aria-hidden>
        <line x1={R} y1={R} x2={hx} y2={hy} stroke={p.primary} strokeWidth={2} />
        <circle cx={R} cy={R} r={3} fill={p.primary} />
        <circle cx={hx} cy={hy} r={20} fill={p.primary} />
      </svg>
      {Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        const a = (n / 12) * Math.PI * 2 - Math.PI / 2;
        const on = n === hour;
        return (
          <span
            key={n}
            style={{
              position: "absolute",
              left: R + Math.cos(a) * ring - 20,
              top: R + Math.sin(a) * ring - 20,
              width: 40,
              height: 40,
              display: "grid",
              placeItems: "center",
              fontSize: 15,
              fontWeight: on ? 700 : 500,
              color: inkOf(item, on ? p.onPrimary : p.onSurface),
            }}
          >
            {n}
          </span>
        );
      })}
    </div>
  );
}

export function TimePickerBody({ item, p }: { item: Item; p: Palette }) {
  const lang = useLang();
  const layout = timeLayoutOf(item);
  const { w } = sizeOf(item, {});
  const at = now();
  const hour24 = at.getHours();
  const hh = String(hour24 % 12 || 12).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  const pm = hour24 >= 12;
  const plate = Math.max(0, Math.min(96, Math.round((w - CARD_PADDING * 2 - 60) / 2)));
  const dial = Math.min(256, w - 48);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px 24px 0", fontSize: 12, color: inkOf(item, p.onSurfaceVariant) }}>{t("selectTime", lang)}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "12px 24px 0" }}>
        <TimeBox text={hh} ink={inkOf(item, p.onPrimaryContainer)} on p={p} wide={plate} />
        <span style={{ fontSize: 32, color: inkOf(item, p.onSurface) }}>:</span>
        <TimeBox text={mm} ink={inkOf(item, p.onSurface)} on={false} p={p} wide={plate} />
        <span style={{ display: "flex", flexDirection: "column", width: 48, height: 72, borderRadius: 8, border: `1px solid ${p.outline}`, overflow: "hidden" }}>
          {["AM", "PM"].map((s) => {
            const on = (s === "PM") === pm;
            return (
              <span
                key={s}
                style={{
                  flex: 1,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  background: on ? p.tertiaryContainer : "transparent",
                  color: inkOf(item, on ? p.onTertiaryContainer : p.onSurfaceVariant),
                }}
              >
                {s}
              </span>
            );
          })}
        </span>
      </div>
      {layout === "dial" ? (
        <div style={{ flex: 1, minHeight: 0, display: "grid", placeItems: "center", padding: "12px 0" }}>
          <Dial item={item} hour24={hour24} p={p} size={dial} />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "flex-start", padding: "10px 24px", gap: 8, color: inkOf(item, p.onSurfaceVariant), fontSize: 12 }}>
          <span style={{ width: plate, textAlign: "center" }}>{t("hourLabel", lang)}</span>
          <span style={{ width: 10 }} />
          <span style={{ width: plate, textAlign: "center" }}>{t("minuteLabel", lang)}</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", padding: "0 12px 12px" }}>
        <Icon name={layout === "dial" ? "keyboard" : "schedule"} size={22} />
        <span style={{ flex: 1 }} />
        <PickerActions item={item} p={p} />
      </div>
    </div>
  );
}
