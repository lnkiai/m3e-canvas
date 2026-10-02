"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { COLOR_TOKENS, ColorToken, PLACES, Palette, Place, R_INNER, SETTLE_MS, clamp, draftGradient } from "@/lib/tokens";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { COLOR_TOKEN_TEXT, t, useLang } from "@/lib/i18n";
import { Icon } from "./M3Node";

/** the row of tabs and the clear gap under it, and the band a panel with no tabs fades its top with */
const PANEL_TABS_H = 48;
const PANEL_TABS_GAP = 16;
export const PANEL_FADE_H = 28;
/** how the lock comes over the panel and goes away again: the blur first, then the switch and
 *  the line under it; on the way out the switch turns itself off before any of it fades */
const VEIL_IN = 0.22;
const BADGE_IN = 0.18;
const SWITCH_OFF = 0.26;
const LOCK_OUT_MS = Math.round((SWITCH_OFF + 0.2) * 1000) + 40;
/** a cover that has nothing to undo has only its own fade to wait for */
const AWAY_MS = 240;

/** A part's panel: the title row and the tabs stay where they are, and everything that changes
 *  the part scrolls under them. While the part is locked that whole area goes behind a blur and
 *  out of reach -- the design is still there to read, and the tabs still turn, so the author can
 *  look the part over without being able to touch it. The switch in the middle of the blur is
 *  the lock itself, and turning it off is how the part comes back. */
export function PanelShell({
  p,
  locked,
  onUnlock,
  head,
  tabs,
  children,
}: {
  p: Palette;
  locked?: boolean;
  onUnlock?: () => void;
  head: React.ReactNode;
  /** the row of tabs, if the part has one: it floats over what scrolls rather than sitting on it */
  tabs?: React.ReactNode;
  children: React.ReactNode;
}) {
  /* The cover leaves in one of two ways. Turned off at its own switch, it undoes itself in plain
     sight: the switch goes off first and the blur only then. Gone for any other reason -- the
     panel is showing another part now -- there is nothing to undo, so it simply fades, and the
     author is not told a lock came off when none did. */
  const [drawn, setDrawn] = useState(!!locked);
  const [phase, setPhase] = useState<"on" | "off" | "away">(locked ? "on" : "away");
  const bySwitch = useRef(false);
  useEffect(() => {
    if (locked) {
      bySwitch.current = false;
      setDrawn(true);
      setPhase("on");
      return;
    }
    if (!drawn || phase !== "on") return;
    const undone = bySwitch.current;
    bySwitch.current = false;
    setPhase(undone ? "off" : "away");
    const id = setTimeout(() => setDrawn(false), undone ? LOCK_OUT_MS : AWAY_MS);
    return () => clearTimeout(id);
  }, [locked, drawn, phase]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "12px 12px 0", flex: "0 0 auto" }}>{head}</div>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <div
          className="no-scrollbar"
          inert={locked || undefined}
          /* under a row of tabs the content starts below them; with none, it starts under the fade's thick part */
          style={{ padding: `${tabs ? PANEL_TABS_H + PANEL_TABS_GAP : PANEL_FADE_H / 2}px 12px 20px`, overflowY: "auto", height: "100%" }}
        >
          {children}
        </div>
        {/* the tabs keep their place while the rest scrolls under them, and the panel's own colour
            is drawn behind them, thinning out to nothing by where the row ends: what passes up
            behind the two words dissolves into the panel rather than being cut off against a rule */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            /* the panel's colour reaches exactly as far as the rule used to, and thins out
               across the two words on its way there */
            height: tabs ? PANEL_TABS_H : PANEL_FADE_H,
            /* the tabs ride above the lock's blur: they are what stays usable while it is on */
            zIndex: tabs ? 4 : 2,
            background: tabs
              ? `linear-gradient(to bottom, ${p.surface} 0%, ${p.surface} 24%, ${p.surface}00 100%)`
              : `linear-gradient(to bottom, ${p.surface}, ${p.surface}00)`,
            pointerEvents: tabs ? undefined : "none",
          }}
        >
          {tabs}
        </div>
        {drawn && (
          <LockedCover
            p={p}
            phase={phase}
            onUnlock={
              onUnlock &&
              (() => {
                bySwitch.current = true;
                onUnlock();
              })
            }
          />
        )}
      </div>
    </div>
  );
}

/** what a locked part's panel is covered with: the blur, the lock on its switch, and a line saying
 *  what the switch is for */
function LockedCover({ p, phase, onUnlock }: { p: Palette; phase: "on" | "off" | "away"; onUnlock?: () => void }) {
  const lang = useLang();
  const reducedMotion = useReducedMotion();
  const on = phase === "on";
  /* on its way out with the lock still on: the switch keeps its place and only the cover fades */
  const away = phase === "away";
  const out = (d: number) => (reducedMotion ? { duration: 0 } : { duration: d, ease: [0.2, 0, 0, 1] as const, ...(away ? {} : { delay: SWITCH_OFF }) });
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: on ? 1 : 0 }}
      transition={reducedMotion ? { duration: 0 } : on ? { duration: VEIL_IN, ease: [0.2, 0, 0, 1] } : out(0.2)}
      onPointerDown={(e) => e.preventDefault()}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 3,
        display: "grid",
        placeItems: "center",
        padding: 24,
        pointerEvents: on ? undefined : "none",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        background: `color-mix(in srgb, ${p.surface} 55%, transparent)`,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: on ? 1 : 0, y: on ? 0 : 6 }}
        transition={reducedMotion ? { duration: 0 } : on ? { duration: 0.2, ease: [0.2, 0, 0, 1], delay: BADGE_IN } : out(0.18)}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}
      >
        {/* a cover that is only fading away keeps the lock shut: nothing was undone */}
        <LockSwitch on={on || away} p={p} onOff={on ? onUnlock : undefined} />
        <span style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, whiteSpace: "nowrap", maxWidth: "100%" }}>{t("lockedEdit", lang)}</span>
      </motion.div>
    </motion.div>
  );
}

/* the switch the lock sits on: on is locked, and the lock itself rides in the knob. It is turned
 * off by a tap or by dragging the knob back, the way a real one would be. */
const TRACK_W = 56;
const TRACK_H = 34;
const KNOB = 26;
const KNOB_INSET = 4;
const TRAVEL = TRACK_W - KNOB - KNOB_INSET * 2;

function LockSwitch({ on, p, onOff }: { on: boolean; p: Palette; onOff?: () => void }) {
  const lang = useLang();
  const reducedMotion = useReducedMotion();
  const [drag, setDrag] = useState<number | null>(null);
  const from = useRef(0);
  const moved = useRef(0);
  const x = drag !== null ? drag : on ? TRAVEL : 0;

  const start = (e: React.PointerEvent) => {
    if (!onOff || !on) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    from.current = e.clientX;
    moved.current = 0;
    setDrag(TRAVEL);
  };
  const move = (e: React.PointerEvent) => {
    if (drag === null) return;
    const dx = e.clientX - from.current;
    moved.current = Math.max(moved.current, Math.abs(dx));
    setDrag(clamp(TRAVEL + dx, 0, TRAVEL));
  };
  const end = (e: React.PointerEvent) => {
    if (drag === null) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    /* a tap turns it off; so does a drag that has taken the knob most of the way back */
    const off = moved.current < 4 || drag < TRAVEL / 2;
    setDrag(null);
    if (off) onOff?.();
  };

  return (
    <span
      role="switch"
      aria-checked={on}
      aria-label={t(on ? "unlock" : "lock", lang)}
      title={t(on ? "unlock" : "lock", lang)}
      tabIndex={0}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        /* the key is the switch's own: the canvas shortcuts behind the panel do not hear it */
        e.preventDefault();
        e.stopPropagation();
        if (on) onOff?.();
      }}
      style={{
        position: "relative",
        width: TRACK_W,
        height: TRACK_H,
        borderRadius: TRACK_H / 2,
        boxSizing: "border-box",
        background: on ? p.primary : p.surfaceContainerHighest,
        border: on ? "2px solid transparent" : `2px solid ${p.outline}`,
        transition: "background 200ms, border-color 200ms",
        cursor: onOff ? "pointer" : "default",
        touchAction: "none",
        display: "block",
      }}
    >
      <motion.span
        initial={{ x: 0 }}
        animate={{ x }}
        transition={reducedMotion || drag !== null ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 36, mass: 0.6 }}
        style={{
          position: "absolute",
          left: KNOB_INSET - 2,
          top: KNOB_INSET - 2,
          width: KNOB,
          height: KNOB,
          borderRadius: KNOB / 2,
          display: "grid",
          placeItems: "center",
          background: on ? p.onPrimary : p.outline,
          color: on ? p.onPrimaryContainer : p.surfaceContainerHighest,
          transition: "background 200ms, color 200ms",
        }}
      >
        <Icon name={on ? "lock" : "lock_open"} size={16} />
      </motion.span>
    </span>
  );
}

export function IconBtn({
  icon,
  on,
  onClick,
  title,
  size = 36,
  p,
  danger,
  disabled,
  fill,
  hasPopup,
  expanded,
}: {
  icon: string;
  on?: boolean;
  onClick?: () => void;
  title?: string;
  size?: number;
  p: Palette;
  danger?: boolean;
  disabled?: boolean;
  fill?: boolean;
  /** the button opens a menu or a list, and whether it is open now */
  hasPopup?: "menu" | "listbox";
  expanded?: boolean;
}) {
  return (
    <button
      aria-haspopup={hasPopup}
      aria-expanded={expanded}
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className="m3-press"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        border: "none",
        background: on ? (danger ? p.errorContainer : p.secondaryContainer) : "transparent",
        color: disabled
          ? p.outlineVariant
          : danger
            ? p.error
            : on
              ? p.onSecondaryContainer
              : p.onSurfaceVariant,
        cursor: disabled ? "default" : "pointer",
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.58)} fill={fill ?? on} />
    </button>
  );
}

export type SegOption<K extends string> = {
  key: K;
  icon?: string;
  label?: string;
  title?: string;
  /** a drawing of the choice, shown in place of an icon: a small picture of the thing itself */
  node?: React.ReactNode;
  /** small marker: this option carries something */
  dot?: boolean;
  /** this option alone takes the spare width */
  grow?: boolean;
  /** an icon-only option that should not shrink to a square */
  wide?: boolean;
  /** how this one cell is painted, over the run's own look: a cell that shows a style wears it */
  style?: React.CSSProperties;
};

/** Connected-button group with the same fused corners as the canvas. It is one choice among a
 *  few, so it is read as a radio group: the arrow keys walk the run, and only the chosen cell is
 *  a tab stop. */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  p,
  height = 40,
  grow = true,
  tight = false,
  label,
}: {
  options: SegOption<K>[];
  value: K;
  onChange: (k: K) => void;
  p: Palette;
  height?: number;
  grow?: boolean;
  /** the cells may be narrower than they are tall: a long run still fits the panel */
  tight?: boolean;
  /** what the run as a whole chooses, for a screen reader */
  label?: string;
}) {
  const group = useRef<HTMLDivElement | null>(null);
  const picked = Math.max(0, options.findIndex((o) => o.key === value));
  const walk = (e: React.KeyboardEvent, d: 1 | -1) => {
    e.preventDefault();
    const next = options[(picked + d + options.length) % options.length];
    onChange(next.key);
    (group.current?.querySelector(`[data-key="${next.key}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") walk(e, 1);
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") walk(e, -1);
      }}
      style={{ display: "flex", gap: 3 }}
    >
      {options.map((o, i) => {
        const on = o.key === value;
        const first = i === 0;
        const last = i === options.length - 1;
        const outer = height / 2;
        return (
          <button
            key={o.key}
            data-key={o.key}
            role="radio"
            aria-checked={on}
            tabIndex={i === picked ? 0 : -1}
            onClick={() => onChange(o.key)}
            title={o.title ?? o.label}
            aria-label={o.title ?? o.label}
            className="m3-press"
            style={{
              flex: (o.grow ?? grow) ? 1 : "0 0 auto",
              minWidth: tight ? 0 : o.wide ? height * 1.4 : height,
              height,
              padding: o.label ? "0 14px" : 0,
              border: "none",
              cursor: "pointer",
              borderTopLeftRadius: first ? outer : R_INNER,
              borderBottomLeftRadius: first ? outer : R_INNER,
              borderTopRightRadius: last ? outer : R_INNER,
              borderBottomRightRadius: last ? outer : R_INNER,
              background: on ? p.primary : p.surfaceContainerHigh,
              color: on ? p.onPrimary : p.onSurfaceVariant,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: on ? 600 : 500,
              transition: "background 120ms, color 120ms, border-radius 160ms",
              position: "relative",
              overflow: "hidden",
              whiteSpace: "nowrap",
              ...o.style,
            }}
          >
            {o.node ?? (o.icon && <Icon name={o.icon} size={Math.round(height * 0.5)} fill={on} />)}
            {o.label && <span>{o.label}</span>}
            {o.dot && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: 5,
                  right: 7,
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: on ? p.onPrimary : p.primary,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export type SelectOption = { key: string; label: string; icon?: string };

/** A single-choice dropdown: the trigger shows what is picked, and the list that drops from it
 *  scrolls in place once the choices outgrow the box. */
export function Select({
  options,
  value,
  onChange,
  p,
  label,
}: {
  options: SelectOption[];
  value: string;
  onChange: (k: string) => void;
  p: Palette;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const current = options.find((o) => o.key === value) ?? options[0];
  /* the list closes back onto the button that opened it, so focus has somewhere to land */
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    /* focus goes to the chosen entry, so the arrow keys start from where the list does */
    (list.current?.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus();
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
  /* the arrow keys walk the entries, Home and End jump to either end */
  const onListKey = (e: React.KeyboardEvent) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (at + 1) % items.length;
    else if (e.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    items[next].focus();
  };
  return (
    <div ref={box} style={{ position: "relative" }}>
      <button
        ref={trigger}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="m3-press"
        style={{
          width: "100%",
          height: 48,
          padding: "0 12px 0 14px",
          borderRadius: open ? "12px 12px 4px 4px" : 12,
          border: "none",
          background: p.surfaceContainerHigh,
          color: p.onSurface,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 14,
          fontWeight: 600,
          textAlign: "left",
          transition: "border-radius 120ms",
        }}
      >
        {current?.icon && <Icon name={current.icon} size={20} />}
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current?.label ?? ""}</span>
        <Icon name={open ? "expand_less" : "expand_more"} size={20} />
      </button>
      {open && (
        <div
          ref={list}
          role="listbox"
          aria-label={label}
          onKeyDown={onListKey}
          className="no-scrollbar"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 52,
            zIndex: 40,
            maxHeight: 232,
            overflowY: "auto",
            overscrollBehavior: "contain",
            padding: 4,
            borderRadius: 12,
            background: p.surfaceContainerHigh,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)",
          }}
        >
          {options.map((o) => {
            const on = o.key === value;
            return (
              <button
                key={o.key}
                role="option"
                aria-selected={on}
                tabIndex={-1}
                onClick={() => {
                  onChange(o.key);
                  close();
                }}
                className="m3-press"
                style={{
                  width: "100%",
                  height: 44,
                  padding: "0 10px",
                  border: "none",
                  borderRadius: 8,
                  background: on ? p.secondaryContainer : "transparent",
                  color: on ? p.onSecondaryContainer : p.onSurface,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 14,
                  fontWeight: on ? 600 : 500,
                  textAlign: "left",
                }}
              >
                {o.icon && <Icon name={o.icon} size={20} />}
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                {on && <Icon name="check" size={18} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** how wide the band is that a field wears while a model writes into it */
const RING = 3;
/** the room a control standing inside a field takes */
const LEAD_W = 32;

export function Field({
  value,
  onChange,
  placeholder,
  p,
  icon,
  leading,
  multiline,
  rows = 3,
  grow,
  height = 44,
  action,
  maxHeight,
  aiBusy,
  invalid,
  describedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  p: Palette;
  icon?: string;
  /** a control standing inside the field after its mark, the words starting after it */
  leading?: React.ReactNode;
  multiline?: boolean;
  rows?: number;
  /** a control that joins the clear button in a run pinned over the bottom right of a multiline
   *  field; the text runs the full width and passes under it */
  action?: React.ReactNode;
  /** tallest a growing field gets before it starts to scroll */
  maxHeight?: number;
  /** a model is writing into this field: it wears the same drifting gradient the screens wear,
   *  and the text it hands back is written out a letter at a time instead of dropped in */
  aiBusy?: boolean;
  /** a multiline field that grows with its text instead of scrolling, starting at `rows` lines;
   *  it wraps but never takes a line break, since the canvas wraps the text on its own */
  grow?: boolean;
  height?: number;
  /** what is in the field is not accepted, and the id of the line under it that says why */
  invalid?: boolean;
  describedBy?: string;
}) {
  const lang = useLang();
  const filled = value.length > 0;
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const reduced = useReducedMotion();
  /* the ring stays mounted through its own fade out, so the gradient leaves as quietly as it came */
  const [ring, setRing] = useState(false);
  const [ringOn, setRingOn] = useState(false);
  useEffect(() => {
    if (aiBusy) {
      setRing(true);
      /* the second frame is the one that has the ring on screen at nothing: turning it up from
       * there is what the eye reads as a fade rather than a light being switched on */
      let next = 0;
      const id = requestAnimationFrame(() => {
        next = requestAnimationFrame(() => setRingOn(true));
      });
      return () => {
        cancelAnimationFrame(id);
        cancelAnimationFrame(next);
      };
    }
    setRingOn(false);
    /* the ring is taken down once its fade has run; one that was never up simply stays down */
    const id = setTimeout(() => setRing(false), 320);
    return () => clearTimeout(id);
  }, [aiBusy]);

  /* What the model wrote is already in the field, drawn exactly as the field will keep it.
   * Nothing is copied: the field is covered, grows to the height the text needs, and is then
   * uncovered word by word, so no letter ever moves. */
  const [reveal, setReveal] = useState<{ phase: "grow" | "wipe"; p: number } | null>(null);
  /* the lines to uncover, measured off the field once the text is in it */
  const [lines, setLines] = useState<{ n: number; top: number; left: number; width: number; height: number } | null>(null);
  const wasAi = useRef(false);
  const easeHeight = useRef(false);
  const before = useRef(value);
  useEffect(() => {
    if (aiBusy) {
      wasAi.current = true;
      return;
    }
    /* the run is over: whatever text arrives with it is the model's, anything later is the author's */
    const id = setTimeout(() => (wasAi.current = false), 400);
    return () => clearTimeout(id);
  }, [aiBusy]);
  /* before the field is given its new height: the height is then eased into, not jumped to */
  useLayoutEffect(() => {
    const was = before.current;
    before.current = value;
    if (!wasAi.current || value === was || !value) return;
    wasAi.current = false;
    if (!multiline) return;
    /* only a field that grows has a height to ease; a fixed one just uncovers its text */
    easeHeight.current = !!grow;
    setReveal({ phase: "grow", p: 0 });
  }, [value, multiline, grow]);
  const phase = reveal?.phase;
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (phase !== "wipe" || !el) return;
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.55;
    const top = parseFloat(cs.paddingTop);
    const left = parseFloat(cs.paddingLeft);
    const width = el.clientWidth - left - parseFloat(cs.paddingRight);
    const text = el.scrollHeight - top - parseFloat(cs.paddingBottom);
    setLines({ n: Math.max(1, Math.round(text / lh)), top, left, width, height: lh });
  }, [phase, value]);
  useEffect(() => {
    if (!phase) return;
    if (reduced) {
      setReveal(null);
      return;
    }
    if (phase === "grow") {
      /* the box settles first; only then does the text come out from under the cover */
      const id = setTimeout(() => setReveal({ phase: "wipe", p: 0 }), SETTLE_MS);
      return () => clearTimeout(id);
    }
    const span = clamp(value.length * 10, 450, 900);
    const start = performance.now();
    let frame = requestAnimationFrame(function step() {
      const k = Math.min(1, (performance.now() - start) / span);
      setReveal((cur) => (cur?.phase === "wipe" ? { phase: "wipe", p: k } : cur));
      if (k < 1) frame = requestAnimationFrame(step);
      else setReveal(null);
    });
    return () => cancelAnimationFrame(frame);
    /* the sweep runs off its own clock: only a change of phase may start it over */
  }, [phase, reduced, value.length]);
  /* the cover: one soft band lying over the whole text, drawn off downwards. The band is deep
   * enough that the words fade up rather than being wiped away, the top ones a little ahead of
   * the ones below them. */
  const cover = (() => {
    if (!reveal) return null;
    const clear = "linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0))";
    if (reveal.phase === "grow" || !lines) return { WebkitMaskImage: clear, maskImage: clear };
    /* the soft edge is two thirds of the text's own height, so a short note fades in as one */
    const soft = 0.66;
    const at = -soft + reveal.p * (1 + soft);
    const block = lines.n * lines.height;
    const image = `linear-gradient(to bottom, #000 ${(at * 100).toFixed(1)}%, rgba(0,0,0,0) ${((at + soft) * 100).toFixed(1)}%)`;
    const position = `${lines.left}px ${lines.top}px`;
    const size = `${lines.width}px ${block}px`;
    return {
      WebkitMaskImage: image,
      maskImage: image,
      WebkitMaskPosition: position,
      maskPosition: position,
      WebkitMaskSize: size,
      maskSize: size,
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
    };
  })();
  useEffect(() => {
    const el = areaRef.current;
    if (!el || !grow) return;
    /* the model's text arrives whole: the field takes its new height over the same time a part
     * on the canvas takes to settle, and reads its own height back without the easing in the way */
    const ease = easeHeight.current && !reduced;
    easeHeight.current = false;
    const from = ease ? el.offsetHeight : 0;
    el.style.transition = "none";
    el.style.height = "auto";
    /* a growing field is never shorter than the lines it was asked for, so an empty one still
       offers the room its words will take */
    const line = parseFloat(getComputedStyle(el).lineHeight) || 21;
    const least = Math.round(rows * line + 24);
    const full = Math.max(el.scrollHeight, least);
    const capped = maxHeight ? Math.min(full, maxHeight) : full;
    if (ease) {
      el.style.height = `${from}px`;
      void el.offsetHeight;
      el.style.transition = `height ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)`;
    }
    el.style.height = `${capped}px`;
    el.style.overflowY = full > capped ? "auto" : "hidden";
    if (!ease) el.style.transition = "";
  }, [value, grow, maxHeight, rows, reduced]);
  /* with a pinned run the text keeps the full width and passes under it; otherwise the clear
   * button takes a column of its own at the trailing edge */
  const pinned = !!(multiline && action);
  const padRight = !pinned && filled ? 40 : 14;
  /* the words start after the mark, and after whatever stands beside it */
  const padLeft = (icon ? 42 : 14) + (leading ? LEAD_W : 0);
  /* as tall as the fade, so the line being typed always sits clear of it */
  const padBottom = pinned ? 40 : 12;
  /* one cell of the pinned run: a faint plate behind the button, rounded on the outer side only */
  const run = (child: React.ReactNode, first: boolean, last: boolean) => (
    <span
      style={{
        display: "inline-flex",
        overflow: "hidden",
        background: p.surfaceContainerHighest,
        borderTopLeftRadius: first ? 15 : R_INNER,
        borderBottomLeftRadius: first ? 15 : R_INNER,
        borderTopRightRadius: last ? 15 : R_INNER,
        borderBottomRightRadius: last ? 15 : R_INNER,
      }}
    >
      {child}
    </span>
  );
  /* the one button that empties the field, wherever the field puts it */
  const clearBtn = (
    <button
      onClick={() => onChange("")}
      title={t("clear", lang)}
      aria-label={t("clear", lang)}
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        border: "none",
        background: "transparent",
        color: p.onSurfaceVariant,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
      }}
    >
      <Icon name="close" size={16} />
    </button>
  );
  const base: React.CSSProperties = {
    /* a block: an inline field leaves a line box's descender under it, and a ring drawn around
     * that box would be thicker along the bottom than anywhere else */
    display: "block",
    width: "100%",
    padding: multiline ? `12px ${padRight}px ${padBottom}px ${padLeft}px` : `0 ${padRight}px 0 ${padLeft}px`,
    borderRadius: multiline ? 18 : height / 2,
    border: "none",
    background: p.surfaceContainerHigh,
    color: p.onSurface,
    fontSize: 14,
    lineHeight: multiline ? 1.55 : undefined,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    resize: "none",
  };
  return (
    <div style={{ position: "relative", width: "100%" }}>
      {ring && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: -RING,
            borderRadius: (multiline ? 18 : height / 2) + RING,
            backgroundImage: draftGradient(p),
            backgroundSize: "300% 300%",
            animation: "m3e-drift 3s ease-in-out infinite",
            opacity: ringOn ? 1 : 0,
            transition: "opacity 300ms ease",
            pointerEvents: "none",
          }}
        />
      )}
      {cover && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: multiline ? 18 : height / 2,
            background: p.surfaceContainerHigh,
            pointerEvents: "none",
          }}
        />
      )}
      {icon && (
        <span
          style={{
            position: "absolute",
            left: 12,
            top: multiline ? 12 : (height - 20) / 2,
            color: p.onSurfaceVariant,
            pointerEvents: "none",
            lineHeight: 1,
            /* the field itself is positioned, so the mark it carries sits above it */
            zIndex: 1,
          }}
        >
          <Icon name={icon} size={20} />
        </span>
      )}
      {leading && (
        <span style={{ position: "absolute", left: icon ? 36 : 6, top: (height - LEAD_W) / 2, width: LEAD_W, height: LEAD_W, display: "grid", placeItems: "center", zIndex: 1 }}>{leading}</span>
      )}
      {multiline ? (
        <textarea
          ref={areaRef}
          className={maxHeight ? "no-scrollbar" : undefined}
          value={value}
          rows={rows}
          onChange={(e) => onChange(grow ? e.target.value.replace(/[\r\n]+/g, " ") : e.target.value)}
          onKeyDown={grow ? (e) => { if (e.key === "Enter") e.preventDefault(); } : undefined}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onFocus={() => {
            setReveal(null);
            setLines(null);
          }}
          style={{
            ...base,
            ...(grow ? { overflow: "hidden" } : null),
            position: "relative",
            /* the cover masks the whole field, so while it is on, the field's own colour is
             * painted by the plate behind it and the text is all that can be hidden */
            ...(cover ? { background: "transparent", caretColor: "transparent", ...cover } : null),
          }}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          style={{ ...base, height, position: "relative" }}
        />
      )}
      {pinned ? (
        <>
          {/* the text fades out into the field's own colour as it passes under the run */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 2,
              right: 2,
              bottom: 2,
              height: 40,
              borderRadius: "0 0 16px 16px",
              background: `linear-gradient(to top, ${p.surfaceContainerHigh}, transparent)`,
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "absolute", right: 6, bottom: 6, display: "flex", gap: 2 }}>
            {filled && run(clearBtn, true, false)}
            {run(action, !filled, true)}
          </div>
        </>
      ) : (
        filled && <span style={{ position: "absolute", right: 6, top: multiline ? 8 : (height - 30) / 2, display: "inline-flex" }}>{clearBtn}</span>
      )}
    </div>
  );
}

/** Slider with a typed-in number beside it. The slider moves in `step`s; the
 *  field accepts any whole number and is clamped to min..max when it commits. */
/** A rectangle whose top or bottom corners are rounded: the corner-radius slider icons. */
/** a pair of corners on one side, or a single corner */
export function CornerIcon({ side, size = 20 }: { side: "top" | "bottom" | "left" | "right" | "tl" | "tr" | "bl" | "br"; size?: number }) {
  const PATHS: Record<typeof side, string> = {
    top: "M4 17 V9 a5 5 0 0 1 5 -5 h6 a5 5 0 0 1 5 5 v8",
    bottom: "M4 3 v8 a5 5 0 0 0 5 5 h6 a5 5 0 0 0 5 -5 v-8",
    left: "M17 4 H9 a5 5 0 0 0 -5 5 v6 a5 5 0 0 0 5 5 h8",
    right: "M7 4 h8 a5 5 0 0 1 5 5 v6 a5 5 0 0 1 -5 5 h-8",
    tl: "M5 20 V11 a6 6 0 0 1 6 -6 H20",
    tr: "M4 5 H13 a6 6 0 0 1 6 6 V20",
    bl: "M5 4 V13 a6 6 0 0 0 6 6 H20",
    br: "M20 4 V13 a6 6 0 0 1 -6 6 H4",
  };
  const d = PATHS[side];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Slider({
  icon = "tune",
  iconNode,
  value,
  min,
  max,
  step,
  onChange,
  p,
  unit = "",
  title,
}: {
  icon?: string;
  /** custom glyph shown instead of the Material Symbol */
  iconNode?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  p: Palette;
  unit?: string;
  title?: string;
}) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);
  const commit = () => {
    const n = Math.round(Number(text));
    if (Number.isFinite(n) && text.trim() !== "") onChange(clamp(n, min, max));
    setEditing(false);
    setText(String(value));
  };
  /* a value set from elsewhere — a preset, another control — travels to its new place over the
   * same time the part on the canvas takes to grow, so the knob and the part move together.
   * What the author does on the slider itself is followed exactly. */
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const mine = useRef(false);
  /* whether the knob is on its way: read at render, so it is state rather than a ref */
  const [travelling, setTravelling] = useState(false);
  const travellingRef = useRef(false);
  const travel = (on: boolean) => {
    travellingRef.current = on;
    setTravelling(on);
  };
  useEffect(() => {
    const from = shownRef.current;
    const land = () => {
      shownRef.current = value;
      setShown(value);
    };
    /* a value that keeps arriving is a part already on its way — a width that follows the text
     * inside it, say. Then the knob follows each value exactly instead of trailing its own easing. */
    if (mine.current || reduced || travellingRef.current || from === value) {
      mine.current = false;
      travel(false);
      land();
      return;
    }
    travel(true);
    const run = animate(from, value, {
      duration: SETTLE_MS / 1000,
      ease: [0.2, 0, 0, 1],
      onUpdate: (v) => {
        shownRef.current = v;
        setShown(v);
      },
      onComplete: () => {
        travel(false);
        land();
      },
    });
    return () => run.stop();
  }, [value, reduced]);
  const emit = (v: number) => {
    /* a value the part already has never comes back through the effect, so it is not waited for */
    mine.current = v !== value;
    shownRef.current = v;
    setShown(v);
    onChange(v);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span title={title} style={{ color: p.onSurfaceVariant, lineHeight: 1, flex: "0 0 auto", display: "inline-flex" }}>
        {iconNode ?? <Icon name={icon} size={20} />}
      </span>
      <input
        type="range"
        className="m3-range"
        aria-label={title}
        min={min}
        max={max}
        /* on its way the knob is free of the step, so it sweeps across instead of
           ticking from one stop to the next; the author's own drag keeps the step */
        step={travelling ? "any" : step}
        value={shown}
        onChange={(e) => emit(clamp(Math.round(Number(e.target.value) / step) * step, min, max))}
        style={{ "--track": p.secondaryContainer, "--thumb": p.primary } as React.CSSProperties}
      />
      <span style={{ position: "relative", flex: "0 0 auto", display: "inline-flex", alignItems: "center" }}>
        <input
          type="number"
          inputMode="numeric"
          aria-label={title}
          min={min}
          max={max}
          value={editing ? text : String(value)}
          onFocus={(e) => {
            setEditing(true);
            setText(String(value));
            e.currentTarget.select();
          }}
          onChange={(e) => {
            setText(e.target.value);
            // apply as you type once the number is already in range, so the canvas follows
            const n = Math.round(Number(e.target.value));
            if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) emit(n);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setText(String(value));
              e.currentTarget.blur();
            }
          }}
          className="m3-number"
          style={{
            width: unit ? 56 : 52,
            height: 30,
            padding: unit ? "0 18px 0 6px" : "0 6px",
            borderRadius: 8,
            border: "none",
            background: p.surfaceContainerHigh,
            color: p.onSurface,
            fontSize: 12,
            fontWeight: 600,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
            fontFamily: "inherit",
            outline: editing ? `2px solid ${p.primary}` : "none",
            outlineOffset: -1,
            boxSizing: "border-box",
          }}
        />
        {unit && (
          <span
            style={{
              position: "absolute",
              right: 6,
              fontSize: 11,
              color: p.onSurfaceVariant,
              pointerEvents: "none",
            }}
          >
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

/** the look of a cell that carries a short word: room for five of them across a panel */
export const RUN_CELL: React.CSSProperties = { minWidth: 0, padding: "0 4px", fontSize: 12, fontWeight: 600, textOverflow: "ellipsis" };

/** The sizes a part is named at, as one connected run: S, M, L, the way Material names a size
 *  everywhere else. The letter is what the cell carries, and the dp it comes to is in the hover
 *  text, because a row of raw numbers tells an author nothing about which one to reach for. */
export function NamedSizes({
  steps,
  value,
  onChange,
  p,
  label,
}: {
  steps: readonly { key: string; value: number }[];
  value: number;
  onChange: (v: number) => void;
  p: Palette;
  /** what the run sizes, for a screen reader; the size itself when left out */
  label?: string;
}) {
  const lang = useLang();
  return (
    <Segmented<string>
      options={steps.map((s) => ({ key: s.key, label: s.key.toUpperCase(), title: `${s.value}dp`, style: RUN_CELL }))}
      value={steps.find((s) => s.value === value)?.key ?? ""}
      onChange={(k) => onChange(steps.find((s) => s.key === k)!.value)}
      p={p}
      label={label ?? t("size", lang)}
      tight
    />
  );
}

/** Quick picks for a size: the values the frame is built from (screen width,
 *  content width, half a row) or a component's standard sizes. */
export function SizePresets({
  values,
  value,
  min,
  max,
  onChange,
  p,
  labelOf,
}: {
  values: number[];
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  p: Palette;
  /** optional hover text for a value, e.g. "Screen width" for 412 */
  labelOf?: (v: number) => string | undefined;
}) {
  const shown = values.filter((v) => v >= min && v <= max);
  if (shown.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 30 }}>
      {shown.map((v) => {
        const on = v === value;
        const label = labelOf?.(v);
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            title={label}
            aria-label={label ? `${label}: ${v}` : String(v)}
            aria-pressed={on}
            className="m3-press"
            style={{
              height: 28,
              padding: "0 10px",
              borderRadius: 14,
              border: on ? "1px solid transparent" : `1px solid ${p.outlineVariant}`,
              background: on ? p.secondaryContainer : "transparent",
              color: on ? p.onSecondaryContainer : p.onSurfaceVariant,
              fontSize: 12,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}

/** the longest side a picked picture is kept at: enough for a sketch, small enough to save */
const MAX_IMAGE_PX = 1200;

export function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, MAX_IMAGE_PX / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * s));
      c.height = Math.max(1, Math.round(img.height * s));
      const ctx = c.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) {
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/webp", 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

/** A text field for a web address: what is typed stays in the box, and only a complete
 *  http(s) address (or an emptied box) reaches the part. */
export function UrlField({ value, onChange, placeholder, p }: { value: string; onChange: (src: string | undefined) => void; placeholder: string; p: Palette }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div>
      <Field
        value={text}
        onChange={(v) => {
          setText(v);
          const s = v.trim();
          /* an emptied box removes a URL; a picked file (which shows as an empty box) is left alone */
          if (!s && value) onChange(undefined);
          else if (/^https?:\/\/\S+$/.test(s)) onChange(s);
        }}
        placeholder={placeholder}
        p={p}
        icon="link"
      />
    </div>
  );
}

/** The picture on a part, and the two ways one arrives: an address on the web typed into the
 *  box, or a file off the machine picked with the button at the end of it. It is one row
 *  wherever a part can carry a picture -- a card, an image, a carousel card. */
export function ImageRow({ value, onChange, p }: { value?: string; onChange: (src: string | undefined) => void; p: Palette }) {
  const lang = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  /* a file the browser could not read as a picture says so under the row, until the next pick */
  const [failed, setFailed] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            onChange(await readImage(f));
            setFailed(false);
          } catch {
            setFailed(true);
          }
        }}
      />
      {/* a picked file shows as data and is not editable here, so the box stays empty for it */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <UrlField value={value && /^https?:\/\//.test(value) ? value : ""} onChange={onChange} placeholder={t("imageUrl", lang)} p={p} />
      </div>
      <IconBtn icon="upload" p={p} size={44} on onClick={() => fileRef.current?.click()} title={t("pickImage", lang)} />
      {value && <IconBtn icon="close" p={p} size={44} onClick={() => onChange(undefined)} title={t("removeImage", lang)} />}
    </div>
    {failed && (
      <div role="alert" style={{ fontSize: 12, lineHeight: 1.5, color: p.error, padding: "0 6px" }}>
        {t("imageFailed", lang)}
      </div>
    )}
    </div>
  );
}

export function Toggle({
  on,
  onChange,
  p,
  icon,
  label,
  grow,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  p: Palette;
  icon?: string;
  label?: string;
  /** fill the row and push the switch to the trailing edge */
  grow?: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      title={label}
      aria-label={label}
      aria-pressed={on}
      style={{
        display: grow ? "flex" : "inline-flex",
        width: grow ? "100%" : undefined,
        alignItems: "center",
        gap: 10,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: 0,
        color: p.onSurfaceVariant,
      }}
    >
      {icon && <Icon name={icon} size={20} />}
      {label && <span style={{ fontSize: 13, color: p.onSurface, flex: grow ? 1 : undefined, textAlign: "left" }}>{label}</span>}
      <span
        style={{
          position: "relative",
          width: 44,
          height: 26,
          borderRadius: 13,
          background: on ? p.primary : p.surfaceContainerHighest,
          border: on ? "2px solid transparent" : `2px solid ${p.outline}`,
          boxSizing: "border-box",
          transition: "background 160ms",
          flex: "0 0 auto",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "50%",
            left: on ? 20 : 3,
            width: on ? 18 : 12,
            height: on ? 18 : 12,
            marginTop: on ? -9 : -6,
            borderRadius: 9,
            background: on ? p.onPrimary : p.outline,
            transition: "left 160ms, width 160ms, height 160ms, margin 160ms",
          }}
        />
      </span>
    </button>
  );
}

/** Collapsible section; collapsed state is remembered per key. */
export function Section({
  id,
  icon,
  title,
  p,
  children,
  right,
  defaultOpen = true,
  onToggle,
}: {
  id: string;
  icon: string;
  title: string;
  p: Palette;
  children: React.ReactNode;
  right?: React.ReactNode;
  defaultOpen?: boolean;
  /** called after the user opens or collapses the section by hand */
  onToggle?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    try {
      const v = localStorage.getItem(`m3e:sec:${id}`);
      if (v !== null) setOpen(v === "1");
    } catch {}
  }, [id]);
  const toggle = () => {
    const next = !open;
    try {
      localStorage.setItem(`m3e:sec:${id}`, next ? "1" : "0");
    } catch {}
    setOpen(next);
    onToggle?.(next);
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, height: 36 }}>
        <button
          onClick={toggle}
          aria-expanded={open}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 36,
            padding: "0 6px",
            border: "none",
            background: "transparent",
            color: p.onSurfaceVariant,
            cursor: "pointer",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.4,
            textAlign: "left",
          }}
        >
          <Icon name={icon} size={18} />
          <span style={{ flex: 1 }}>{title}</span>
          <Icon name={open ? "expand_less" : "expand_more"} size={18} />
        </button>
        {right}
      </div>
      {open && <div style={{ padding: "6px 4px 14px" }}>{children}</div>}
    </div>
  );
}

export function Tile({
  icon,
  label,
  p,
  onPointerDown,
  onClick,
  starred,
  onStar,
  active,
  compact,
}: {
  icon: string;
  label: string;
  p: Palette;
  onPointerDown?: (e: React.PointerEvent) => void;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  starred?: boolean;
  onStar?: () => void;
  active?: boolean;
  compact?: boolean;
}) {
  const lang = useLang();
  return (
    <div
      className="m3-tile"
      onKeyDown={(e) => {
        // Both palette controls own focus; deletion belongs to the canvas.
        if (e.key === "Delete" || e.key === "Backspace") e.stopPropagation();
      }}
      style={{ position: "relative" }}
    >
      <button
        type="button"
        className="m3-tile-action"
        aria-label={label}
        title={label}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onKeyDown={(e) => {
          // Native button activation owns these keys, rather than the canvas pan shortcut.
          if (e.key === "Enter" || e.key === " ") e.stopPropagation();
        }}
        style={{
          width: "100%",
          border: "none",
          font: "inherit",
          outlineColor: p.primary,
          display: "flex",
          flexDirection: compact ? "row" : "column",
          alignItems: "center",
          justifyContent: compact ? "flex-start" : "center",
          gap: compact ? 10 : 6,
          padding: compact ? "8px 12px" : "12px 6px 10px",
          borderRadius: 16,
          background: active ? p.secondaryContainer : p.surfaceContainerLow,
          color: active ? p.onSecondaryContainer : p.onSurface,
          cursor: onPointerDown ? "grab" : "pointer",
          userSelect: "none",
          touchAction: "none",
          minHeight: compact ? 40 : 72,
          boxSizing: "border-box",
        }}
      >
        <Icon name={icon} size={compact ? 20 : 26} color={active ? p.onSecondaryContainer : p.primary} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1.2,
            textAlign: "center",
            color: active ? p.onSecondaryContainer : p.onSurfaceVariant,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
          }}
        >
          {label}
        </span>
      </button>
      {onStar && (
        <button
          type="button"
          className="m3-star"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onStar();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.stopPropagation();
          }}
          title={starred ? t("removeFavorite", lang) : t("addFavorite", lang)}
          aria-label={starred ? t("removeFavorite", lang) : t("addFavorite", lang)}
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 24,
            height: 24,
            borderRadius: 12,
            border: "none",
            background: "transparent",
            color: starred ? p.primary : p.outline,
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            opacity: starred ? 1 : undefined,
          }}
        >
          <Icon name="star" size={16} fill={starred} />
        </button>
      )}
    </div>
  );
}

/** palette-role swatches; the dot shows the real color of the current theme */
/** One 30dp color disc; the selected one wears the primary ring */
function TokenDisc({ color, label, on, onClick, p, icon, iconColor }: { color: string; label: string; on: boolean; onClick: () => void; p: Palette; icon?: string; iconColor?: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className="m3-press"
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        border: `1px solid ${p.outlineVariant}`,
        padding: 0,
        cursor: "pointer",
        background: color,
        color: iconColor,
        display: "grid",
        placeItems: "center",
        outline: on ? `2px solid ${p.primary}` : "2px solid transparent",
        outlineOffset: 2,
      }}
    >
      {icon && <Icon name={icon} size={16} />}
    </button>
  );
}

export function TokenChips({
  value,
  onChange,
  p,
  none,
  noneOn,
  onNone,
  noneColor,
  noneTextColor,
  noneIcon = "block",
  noneLabel,
}: {
  value: ColorToken;
  onChange: (t: ColorToken) => void;
  p: Palette;
  /** offer a "no background" chip */
  none?: boolean;
  noneOn?: boolean;
  onNone?: () => void;
  /** a fallback option may represent a real computed color rather than transparency */
  noneColor?: string;
  noneTextColor?: string;
  noneIcon?: string;
  noneLabel?: string;
}) {
  const lang = useLang();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {none && (
        <TokenDisc color={noneColor ?? "transparent"} label={noneLabel ?? t("noBackground", lang)} on={!!noneOn} onClick={() => onNone?.()} p={p} icon={noneIcon} iconColor={noneTextColor ?? p.onSurfaceVariant} />
      )}
      {COLOR_TOKENS.map((tk) => (
        <TokenDisc key={tk.key} color={p[tk.key]} label={lang === "en" ? tk.label : COLOR_TOKEN_TEXT[lang][tk.key]} on={!noneOn && tk.key === value} onClick={() => onChange(tk.key)} p={p} />
      ))}
    </div>
  );
}

/** M3 basic dialog for a destructive confirmation. */
/** A run of buttons fused like the canvas's connected buttons: round outside, small corners where they meet. */
export function ButtonRun({ children }: { children: React.ReactNode }) {
  return <div className="m3-run" style={{ display: "flex", gap: 3 }}>{children}</div>;
}

export type TidyState = "tidy" | "undo" | "done";

/** One button that reads as "Tidy", turns into "Undo tidy" right after, and is
 *  disabled while the screen is already tidy. */
export function TidyButton({
  state,
  onClick,
  p,
  pill,
  place,
  onPlace,
}: {
  state: TidyState;
  onClick: () => void;
  p: Palette;
  /** the toolbar version next to the zoom pill */
  pill?: boolean;
  /** where the screen's body goes; with `onPlace` the button gains a trailing menu to change it */
  place?: Place;
  onPlace?: (place: Place) => void;
}) {
  const lang = useLang();
  const done = state === "done";
  const label = state === "undo" ? t("tidyUndo", lang) : state === "done" ? t("tidyDone", lang) : t("tidy", lang);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  /* the menu closes on a tap anywhere else or on Escape */
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      /* the editor also clears its selection on Escape; closing the menu is enough here */
      e.stopPropagation();
      setMenu(false);
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [menu]);
  const split = !!onPlace;
  const current = place ?? "top";
  const placeLabel = (k: Place) => t(k === "top" ? "placeTop" : k === "center" ? "placeCenter" : k === "bottom" ? "placeBottom" : "placeSpread", lang);
  const h = pill ? 40 : 44;
  const bg = done ? "transparent" : state === "undo" ? p.tertiaryContainer : p.secondaryContainer;
  const fg = done ? p.onSurfaceVariant : state === "undo" ? p.onTertiaryContainer : p.onSecondaryContainer;
  const main = (
    <button
      onClick={onClick}
      disabled={done}
      title={label}
      aria-label={label}
      className="m3-press"
      style={{
        width: pill ? (done ? 40 : undefined) : split ? undefined : "100%",
        flex: split && !pill ? 1 : undefined,
        height: h,
        padding: done ? 0 : pill ? "0 16px 0 12px" : "0 16px",
        borderRadius: split && !done ? `${h / 2}px ${R_INNER}px ${R_INNER}px ${h / 2}px` : h / 2,
        border: "none",
        background: bg,
        color: fg,
        fontSize: 13,
        fontWeight: 600,
        cursor: done ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: done ? 0.7 : 1,
        whiteSpace: "nowrap",
      }}
    >
      <Icon name={state === "undo" ? "undo" : state === "done" ? "check" : "align_space_even"} size={done ? 22 : 20} />
      {!done && label}
    </button>
  );
  if (!split) return main;
  /* a split button: tidy on the left, the placement menu behind the chevron, 3dp apart like a connected pair */
  return (
    <div ref={ref} style={{ position: "relative", display: "flex", gap: 3, alignItems: "center", width: pill ? undefined : "100%" }}>
      {main}
      <button
        onClick={() => setMenu((m) => !m)}
        title={t("placement", lang)}
        aria-label={t("placement", lang)}
        aria-expanded={menu}
        aria-haspopup="true"
        className="m3-press"
        style={{
          height: h,
          width: h,
          borderRadius: done ? h / 2 : `${R_INNER}px ${h / 2}px ${h / 2}px ${R_INNER}px`,
          border: "none",
          background: done ? "transparent" : bg,
          color: done ? p.onSurfaceVariant : fg,
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          flex: "0 0 auto",
        }}
      >
        <Icon name={PLACES.find((o) => o.key === current)?.icon ?? "vertical_align_top"} size={20} />
      </button>
      {menu && (
        /* the placement choices as one compact row of icon buttons, floating off the chevron */
        <div
          role="group"
          aria-label={t("placement", lang)}
          style={{
            position: "absolute",
            ...(pill ? { bottom: "100%", marginBottom: 8 } : { top: "100%", marginTop: 8 }),
            right: 0,
            display: "flex",
            gap: 3,
            padding: 4,
            borderRadius: 24,
            background: p.surfaceContainer,
            boxShadow: "0 2px 6px rgba(0,0,0,0.15), 0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 30,
          }}
        >
          {PLACES.map((o) => {
            const on = current === o.key;
            return (
              <button
                key={o.key}
                aria-pressed={on}
                title={placeLabel(o.key)}
                aria-label={placeLabel(o.key)}
                onClick={() => {
                  setMenu(false);
                  onPlace(o.key);
                }}
                className="m3-press"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  border: "none",
                  background: on ? p.secondaryContainer : "transparent",
                  color: on ? p.onSecondaryContainer : p.onSurfaceVariant,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Icon name={o.icon} size={22} fill={on} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  icon = "delete_sweep",
  p,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  icon?: string;
  p: Palette;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const lang = useLang();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
      if (e.key === "Enter") {
        e.stopPropagation();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onCancel, onConfirm]);
  const btn = (label: string, primary: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      className="m3-press"
      style={{
        height: 40,
        padding: "0 16px",
        borderRadius: 20,
        border: "none",
        background: primary ? p.primary : "transparent",
        color: primary ? p.onPrimary : p.primary,
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onCancel}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 600,
            background: "rgba(0,0,0,0.32)",
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
        >
          <motion.div
            role="alertdialog"
            aria-modal
            aria-label={title}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(100%, 340px)",
              padding: 24,
              borderRadius: 28,
              background: p.surfaceContainerHigh,
              color: p.onSurface,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ textAlign: "center", color: p.error }}>
              <Icon name={icon} size={28} />
            </div>
            <div style={{ fontSize: 22, textAlign: "center" }}>{title}</div>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: p.onSurfaceVariant }}>{body}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              {btn(t("cancel", lang), false, onCancel)}
              {btn(t("ok", lang), true, onConfirm)}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
