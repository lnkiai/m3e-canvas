"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@/lib/tokens";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, useReducedMotion, useIsPresent } from "motion/react";
import type { TargetAndTransition, Variants } from "motion/react";
import {
  Action,
  BACK_TARGET,
  BEZEL,
  Doc,
  Frame,
  GAP,
  Group,
  NAV_BAR_H,
  PHONE_H,
  PHONE_R,
  PHONE_W,
  Palette,
  SLIDE_SPEC,
  STATUS_BAR_H,
  SWIPE_DIRS,
  SwipeDir,
  TAPPABLE,
  Transition,
  baseRadii,
  connectSpecOf,
  fontFamilyOf,
  freeRadii,
  frameRadius,
  frameSizeOf,
  groupsInFrame,
  isPhoneFrame,
  normalizeTheme,
  toggleIcon,
  uniformRadii,
  RAIL_TOP,
  isWideRail,
  railMetrics,
  sizeOf,
  isScrollableTabs,
  tabScrollOffset,
  SCROLL_TAB_W,
} from "@/lib/tokens";
import { Icon, M3Node } from "./M3Node";
import { IconBtn } from "./ui";
import { t, useLang } from "@/lib/i18n";
import { constrainModalRails, modalRailOf, updateRail } from "@/lib/rail";
import { railMotionTargets } from "@/lib/railView";

const EASE = [0.2, 0, 0, 1] as const;
const SLIDE_MS = 0.42;
/** room reserved for the wide preview controls: panel, right margin and breathing space */
const WIDE_CONTROL_SPACE = 220;

type Anim = { t: Transition; back: boolean; /** the expressive motion scheme: springs instead of eased tweens */ spring?: boolean };

/** M3 Expressive spatial spring, with a visible overshoot */
const SPRING = { type: "spring" as const, stiffness: 360, damping: 26, mass: 1 };
/** how the current screen was reached, so "back" can play it in reverse */
type Entry = { id: string; t: Transition };

const pct = (v: number) => `${v * 100}%`;

/** offset along one axis, as a percentage of the screen */
const off = (axis: "x" | "y", v: number) => (axis === "x" ? { x: pct(v), y: 0 } : { x: 0, y: pct(v) });

type Pose = TargetAndTransition;

/** enter / leave poses for one screen change; the same spec drives forward and back */
function poses(c: Anim): { initial: Pose; animate: Pose; exit: Pose } {
  const zi = { zIndex: { duration: 0 } };
  const s = SLIDE_SPEC[c.t];
  if (s) {
    const tr = c.spring ? { ...SPRING, ...zi } : { duration: SLIDE_MS, ease: EASE, ...zi };
    return c.back
      ? {
          initial: { ...off(s.axis, s.exit), opacity: 0.6, scale: 1, zIndex: 1 },
          animate: { x: 0, y: 0, opacity: 1, scale: 1, zIndex: 1, transition: tr },
          exit: { ...off(s.axis, s.enter), opacity: 1, scale: 1, zIndex: 2, transition: tr },
        }
      : {
          initial: { ...off(s.axis, s.enter), opacity: 1, scale: 1, zIndex: 2 },
          animate: { x: 0, y: 0, opacity: 1, scale: 1, zIndex: 2, transition: tr },
          exit: { ...off(s.axis, s.exit), opacity: 0.6, scale: 1, zIndex: 1, transition: tr },
        };
  }
  if (c.t === "fade") {
    const tr = { duration: 0.3, ease: EASE, ...zi };
    return {
      initial: { x: 0, y: 0, opacity: 0, scale: 1, zIndex: 2 },
      animate: { x: 0, y: 0, opacity: 1, scale: 1, zIndex: 2, transition: tr },
      exit: { x: 0, y: 0, opacity: 0, scale: 1, zIndex: 1, transition: tr },
    };
  }
  if (c.t === "expand") {
    const tr = c.spring ? { ...SPRING, ...zi } : { duration: 0.36, ease: EASE, ...zi };
    return c.back
      ? {
          initial: { x: 0, y: 0, scale: 0.92, opacity: 0, zIndex: 1 },
          animate: { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 1, transition: tr },
          exit: { x: 0, y: 0, scale: 1.06, opacity: 0, zIndex: 2, transition: tr },
        }
      : {
          initial: { x: 0, y: 0, scale: 0.92, opacity: 0, zIndex: 2 },
          animate: { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 2, transition: tr },
          exit: { x: 0, y: 0, scale: 1.06, opacity: 0, zIndex: 1, transition: tr },
        };
  }
  const tr = { duration: 0, ...zi };
  return {
    initial: { x: 0, y: 0, opacity: 1, scale: 1, zIndex: 2 },
    animate: { x: 0, y: 0, opacity: 1, scale: 1, zIndex: 2, transition: tr },
    exit: { x: 0, y: 0, opacity: 1, scale: 1, zIndex: 1, transition: tr },
  };
}

const screenVariants: Variants = {
  initial: (c: Anim) => poses(c).initial,
  animate: (c: Anim) => poses(c).animate,
  exit: (c: Anim) => poses(c).exit,
};

/** kinds whose on/off state flips when tapped in the preview */
const TOGGLES = ["switch", "checkbox", "chip"] as const;
const flips = (it: Item) => (TOGGLES as readonly string[]).includes(it.kind) || !!it.toggle;

/** the look of a part after the visitor tapped it */
function flippedLook(it: Item): Item {
  if ((TOGGLES as readonly string[]).includes(it.kind)) return { ...it, checked: !it.checked };
  if (it.toggle) {
    return {
      ...it,
      label: it.toggle.label ?? it.label,
      icon: toggleIcon(it),
      variant: it.toggle.variant ?? it.variant,
    };
  }
  return it;
}

/** A part in the preview: presses down and shows a state layer while the
 *  pointer is on it, then fires its action on release, like a real widget. */
function Tappable({
  item,
  p,
  radii,
  widths,
  onTap,
  onSlot,
  onValue,
  onPick,
  menuOpen,
  onMenu,
  onRailToggle,
  railAnimating,
}: {
  item: Item;
  p: Palette;
  radii: ReturnType<typeof baseRadii>;
  widths: Record<string, number>;
  onTap?: () => void;
  /** per-slot targets on bars */
  onSlot?: (slot: string, animate?: boolean) => void;
  /** live value for sliders */
  onValue?: (v: number) => void;
  /** an option chosen from a dropdown's menu */
  onPick?: (index: number) => void;
  /** whether this dropdown's menu is the open one; the screen keeps at most one open */
  menuOpen?: boolean;
  onMenu?: (open: boolean) => void;
  onRailToggle?: (animate: boolean) => void;
  railAnimating?: boolean;
}) {
  const lang = useLang();
  const [pressed, setPressed] = useState(false);
  const [hot, setHot] = useState<string | null>(null);
  const menu = !!menuOpen;
  /* a tab row with more tabs than fit scrolls: by wheel, touch, or dragging the row; a chosen tab is brought into view */
  const scrollTabs = isScrollableTabs(item);
  const rowW = sizeOf(item, widths).w;
  const [tabScroll, setTabScroll] = useState(() => tabScrollOffset(item, rowW));
  const scrollRef = useRef<HTMLDivElement>(null);
  /** the click that ends a drag of the row must not pick a tab */
  const swallowClick = useRef(false);
  const settled = useRef(false);
  const tabCount = item.tabs?.length ?? 0;
  const restOffset = tabScrollOffset(item, rowW);
  /* the row is brought to the chosen tab only when the choice or the row itself changes, not on every
     render of the screen, so a position the visitor scrolled to by hand stays */
  useEffect(() => {
    const el = scrollRef.current;
    if (!scrollTabs || !el) return;
    el.scrollTo({ left: restOffset, behavior: settled.current ? "smooth" : "auto" });
    settled.current = true;
  }, [scrollTabs, item.id, item.selected, tabCount, restOffset]);
  /** a mouse or pen drags the row; touch pans it natively, so it is left to the browser */
  const dragRow = (e: React.PointerEvent<HTMLDivElement>) => {
    swallowClick.current = false;
    if (e.pointerType === "touch" || e.button !== 0) return;
    const el = e.currentTarget;
    const x0 = e.clientX;
    const left0 = el.scrollLeft;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (Math.abs(dx) > 4) moved = true;
      if (moved) el.scrollLeft = left0 - dx;
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      swallowClick.current = moved;
      if (moved) setHot(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  const live = !!onTap || !!onPick || (TAPPABLE.includes(item.kind) && item.kind !== "text");
  const ref = useRef<HTMLDivElement>(null);

  /* the open menu closes on a tap anywhere else or on Escape */
  useEffect(() => {
    if (!menu || !onMenu) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onMenu(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMenu(false);
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [menu, onMenu]);

  const dragValue = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !onValue) return;
    onValue(Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100));
  };

  /** hit areas for the icons on a top app bar and the destinations on a navigation bar */
  const slots: { key: string; style: React.CSSProperties }[] = [];
  if (onSlot && item.kind === "topAppBar") {
    /* the icons sit below the status-bar inset only where the bar has one (see sizeOf) */
    const inset = sizeOf(item, {}).h - 64;
    if (item.icon) slots.push({ key: "icon", style: { left: 4, top: inset + 8, width: 48, height: 48, borderRadius: 24 } });
    if (item.icon2) slots.push({ key: "icon2", style: { right: 4, top: inset + 8, width: 48, height: 48, borderRadius: 24 } });
  }
  if (onSlot && scrollTabs) {
    /* hit areas sit inside the scrolling layer, one per tab, so they move with the row */
    const n = item.tabs?.length ?? 0;
    for (let i = 0; i < n; i++) slots.push({ key: `tab:${i}`, style: { left: i * SCROLL_TAB_W, width: SCROLL_TAB_W, top: 0, bottom: 0, borderRadius: 16 } });
  } else if (onSlot && (item.kind === "bottomNav" || item.kind === "tabs")) {
    const n = item.tabs?.length ?? 0;
    for (let i = 0; i < n; i++)
      slots.push({ key: `tab:${i}`, style: { left: `${(i / n) * 100}%`, width: `${100 / n}%`, top: 0, bottom: item.kind === "bottomNav" ? NAV_BAR_H : 0, borderRadius: 16 } });
  }
  if (onSlot && item.kind === "navRail") {
    const rail = railMetrics(item);
    if (onRailToggle) slots.push({ key: "railToggle", style: { left: rail.headerLeft, top: RAIL_TOP, width: 48, height: 48, borderRadius: 24 } });
    const n = item.tabs?.length ?? 0;
    for (let i = 0; i < n; i++)
      slots.push({ key: `tab:${i}`, style: { left: rail.inset, width: rail.width - 2 * rail.inset, top: rail.top + i * (rail.itemHeight + rail.gap), height: rail.itemHeight, borderRadius: item.railExpanded ? 28 : 16 } });
  }
  if (onSlot && item.kind === "toolbar") {
    const n = item.tabs?.length ?? 0;
    for (let i = 0; i < n; i++) slots.push({ key: `tab:${i}`, style: { left: 8 + i * 52, width: 48, top: 8, height: 48, borderRadius: 24 } });
  }
  if (onSlot && item.kind === "fabMenu") {
    /* the pills hug their text on the right; the hit area covers the right part of the row */
    const n = item.tabs?.length ?? 0;
    for (let i = 0; i < n; i++) slots.push({ key: `tab:${i}`, style: { right: 0, width: "70%", top: i * 64, height: 56, borderRadius: 28 } });
  }

  return (
    <div
      ref={ref}
      data-rail-animate={railAnimating ? "item" : undefined}
      onPointerDown={(e) => {
        if (onValue) {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragValue(e);
          setPressed(true);
          return;
        }
        if (live) setPressed(true);
      }}
      onPointerMove={(e) => {
        if (onValue && pressed) dragValue(e);
      }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => !onValue && setPressed(false)}
      onClick={onPick ? () => onMenu?.(!menu) : onTap}
      style={{ cursor: live || onValue ? "pointer" : "default", display: "flex", position: "relative", touchAction: scrollTabs ? "pan-x" : "none" }}
    >
      <M3Node item={item} palette={p} widths={widths} radii={radii} interactive={false} pressed={pressed && !onValue} tabScroll={scrollTabs ? tabScroll : undefined} />
      {live && (
        <motion.div
          aria-hidden
          initial={false}
          animate={{ opacity: pressed ? 1 : 0, scale: pressed ? 0.97 : 1 }}
          transition={{ duration: pressed ? 0.08 : 0.24, ease: EASE }}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: `color-mix(in srgb, ${p.onSurface} 12%, transparent)`,
            borderTopLeftRadius: radii.tl,
            borderTopRightRadius: radii.tr,
            borderBottomLeftRadius: radii.bl,
            borderBottomRightRadius: radii.br,
          }}
        />
      )}
      {(() => {
      const slotNodes = slots.map((s) => {
        const Slot = onRailToggle ? "button" : "div";
        return <Slot
          key={s.key}
          type={onRailToggle ? "button" : undefined}
          className={onRailToggle ? "m3-rail-hit" : undefined}
          data-rail-toggle={s.key === "railToggle" ? item.id : undefined}
          aria-label={onRailToggle ? (s.key === "railToggle" ? t(item.railExpanded ? "collapseNavigation" : "expandNavigation", lang) : item.tabs?.[Number(s.key.slice(4))]?.label) : undefined}
          aria-expanded={s.key === "railToggle" ? !!item.railExpanded : undefined}
          aria-current={onRailToggle && s.key === `tab:${item.selected ?? 0}` ? "page" : undefined}
          onPointerDown={(e) => {
            e.stopPropagation();
            setHot(s.key);
          }}
          onPointerUp={() => setHot(null)}
          onPointerCancel={() => setHot(null)}
          onPointerLeave={() => setHot(null)}
          onClick={(e) => {
            e.stopPropagation();
            if (s.key === "railToggle") onRailToggle?.(e.detail !== 0);
            else onSlot!(s.key, e.detail !== 0);
          }}
          style={{
            position: "absolute",
            border: "none",
            padding: 0,
            color: p.primary,
            cursor: "pointer",
            background: hot === s.key ? `color-mix(in srgb, ${p.onSurface} 12%, transparent)` : "transparent",
            transition: "background 120ms",
            ...s.style,
          }}
        />;
      });
      if (!scrollTabs) return slotNodes;
      const n = item.tabs?.length ?? 0;
      return (
        <div
          ref={scrollRef}
          className="m3-hidden-scrollbar"
          onScroll={(e) => setTabScroll(e.currentTarget.scrollLeft)}
          onPointerDownCapture={dragRow}
          onClickCapture={(e) => {
            if (swallowClick.current) {
              e.stopPropagation();
              e.preventDefault();
            }
            swallowClick.current = false;
          }}
          style={{ position: "absolute", inset: 0, overflowX: "auto", overflowY: "hidden", touchAction: "pan-x", cursor: "grab" }}
        >
          <div style={{ position: "relative", width: n * SCROLL_TAB_W, height: "100%" }}>{slotNodes}</div>
        </div>
      );
      })()}
      {onPick && menu && (
        /* the dropdown's menu, under the field: surfaceContainer, 48dp items, the chosen one tinted */
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "100%",
            marginTop: 4,
            padding: "8px 0",
            maxHeight: 48 * 6 + 16,
            overflowY: "auto",
            borderRadius: 4,
            background: p.surfaceContainer,
            color: p.onSurface,
            boxShadow: "0 2px 6px rgba(0,0,0,0.15), 0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 2,
          }}
        >
          {(item.tabs ?? []).map((opt, i) => (
            <div
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                onPick(i);
                onMenu?.(false);
              }}
              style={{
                height: 48,
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                fontSize: 16,
                cursor: "pointer",
                background: item.selected === i ? `color-mix(in srgb, ${p.onSurface} 12%, transparent)` : "transparent",
                ...ellipsisText,
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ellipsisText: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

function Screen({
  active = true,
  frame,
  groups,
  widths,
  p,
  onAction,
  flipped,
  onFlip,
  values,
  onValue,
}: {
  active?: boolean;
  frame: Frame;
  groups: Group[];
  widths: Record<string, number>;
  p: Palette;
  onAction: (a: Action) => void;
  /** ids of toggles the visitor has flipped since the preview opened */
  flipped: Set<string>;
  onFlip: (id: string) => void;
  values: Record<string, number>;
  onValue: (id: string, v: number) => void;
}) {
  /* the dropdown whose menu is open, if any; its group is lifted above the rest */
  const [menuId, setMenuId] = useState<string | null>(null);
  const [railStates, setRailStates] = useState<Record<string, boolean>>({});
  const [railMotion, setRailMotion] = useState<(ReturnType<typeof railMotionTargets> & { animate: boolean }) | null>(null);
  const lang = useLang();
  const reducedMotion = useReducedMotion();
  const isPresent = useIsPresent();
  const interactive = active && isPresent;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const screenRef = useRef<HTMLDivElement>(null);
  const shownGroups = useMemo(() => Object.entries(railStates).reduce(
    (current, [id, railExpanded]) => updateRail(current, [frame], widths, id, { railExpanded }), constrainModalRails(groups),
  ), [groups, frame, widths, railStates]);
  const modalIds = new Set(shownGroups.flatMap((g) => { const rail = modalRailOf(g); return rail ? [rail.id] : []; }));
  const hasModal = modalIds.size > 0;
  const modalActive = interactive && hasModal;
  const changeRail = (id: string, railExpanded: boolean, animate: boolean) => {
    const next = updateRail(shownGroups, [frame], widths, id, { railExpanded });
    setRailMotion({ ...railMotionTargets(shownGroups, next, widths, id), animate: animate && !reducedMotion });
    setRailStates((prev) => ({ ...prev, [id]: railExpanded }));
  };
  const closeRails = (animate = false) => {
    if (!hasModal) return;
    const next = [...modalIds].reduce((current, id) => updateRail(current, [frame], widths, id, { railExpanded: false }), shownGroups);
    setRailMotion({ ...railMotionTargets(shownGroups, next, widths, [...modalIds][0]), animate: animate && !reducedMotion });
    setRailStates((prev) => ({ ...prev, ...Object.fromEntries([...modalIds].map((id) => [id, false])) }));
  };
  useEffect(() => {
    if (!railMotion) return;
    if (!railMotion.animate) {
      // Keep transition suppression through the immediate geometry paint only.
      // Removing it in the same render would restore M3Node's inline transition.
      let nextFrame = 0;
      const firstFrame = requestAnimationFrame(() => {
        nextFrame = requestAnimationFrame(() => setRailMotion(null));
      });
      return () => {
        cancelAnimationFrame(firstFrame);
        cancelAnimationFrame(nextFrame);
      };
    }
    const timer = window.setTimeout(() => setRailMotion(null), 260);
    return () => window.clearTimeout(timer);
  }, [railMotion]);
  useEffect(() => { setRailMotion(null); }, [groups, frame, widths]);
  /* The editor behind the preview is inert while it is up, so focus has nowhere else to
   * go: a screen that becomes the one on show takes it when nothing inside the preview
   * holds it, and a modal screen giving way to a plain one leaves the keyboard on the new
   * screen rather than on the body. */
  useEffect(() => {
    if (!interactive) return;
    const focused = document.activeElement;
    if (!focused || focused === document.body || focused.closest("[inert]")) screenRef.current?.focus();
  }, [interactive]);
  useEffect(() => {
    if (!modalActive) return;
    const previous = document.activeElement as HTMLElement | null;
    screenRef.current?.querySelector<HTMLButtonElement>(`[data-rail-modal] [data-rail-toggle]`)?.focus();
    return () => {
      // An exiting screen must not take focus back from its replacement. On unmount the
      // ref is already detached, so both branches stand down and the preview's own
      // restore to its opener is the one that runs.
      if (!interactiveRef.current) return;
      /* only a control of this screen is worth returning to: anything else is the page
       * behind the preview or a screen that has since left */
      if (previous?.isConnected && screenRef.current?.contains(previous) && !previous.closest("[inert]")) previous.focus();
      else screenRef.current?.focus();
    };
  }, [modalActive]);
  useEffect(() => {
    /* focus outside this screen, or inside it but off the modal, both belong on the toggle */
    if (modalActive && (!screenRef.current?.contains(document.activeElement) || !document.activeElement?.closest("[data-rail-modal]"))) {
      screenRef.current?.querySelector<HTMLButtonElement>("[data-rail-modal] [data-rail-toggle]")?.focus();
    }
  }, [shownGroups, modalActive]);
  /* Registered on every render, in the capture phase: the preview's own Escape and
   * Backspace handler listens in the bubble phase, so registration order never matters. */
  useEffect(() => {
    if (!modalActive) return;
    const onKey = (e: KeyboardEvent) => {
      /* the preview's own controls, such as an open screen menu, keep their keys */
      if (!screenRef.current?.contains(document.activeElement)) return;
      if (e.key === "Tab") {
        e.stopImmediatePropagation();
        const buttons = Array.from(screenRef.current?.querySelectorAll<HTMLButtonElement>("[data-rail-modal] button") ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (index < 0 || (!e.shiftKey && index === buttons.length - 1) || (e.shiftKey && index === 0)) {
          e.preventDefault();
          buttons[e.shiftKey ? buttons.length - 1 : 0]?.focus();
        }
        return;
      }
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeRails();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div
      ref={screenRef}
      inert={!interactive}
      aria-hidden={!interactive || undefined}
      data-rail-motion={railMotion?.animate ? "true" : undefined}
      role={modalActive ? "dialog" : "group"}
      aria-modal={modalActive ? true : undefined}
      aria-label={modalActive ? t("railState", lang) : frame.name || t("screen", lang)}
      tabIndex={-1}
      /* the scrim and the pointer guard follow the rail itself, so a peek shows the modal
       * state as authored; the root's inert keeps a non-interactive screen from acting on it */
      onPointerDown={(e) => { if (hasModal) e.stopPropagation(); }}
      style={{ position: "absolute", inset: 0, background: p[frame.bg ?? "surface"], overflow: "hidden", outline: "none", direction: "ltr" }}
    >
      <AnimatePresence>
        {hasModal && <motion.button
          key="rail-scrim"
          data-rail-scrim
          aria-label={t("collapseNavigation", lang)}
          tabIndex={-1}
          onClick={(e) => closeRails(e.detail !== 0)}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
          style={{ position: "absolute", inset: 0, border: 0, padding: 0, background: "rgba(0,0,0,0.32)", zIndex: 3 }}
        />}
      </AnimatePresence>
      {shownGroups.map((g) => (
        <div
          key={g.id}
          className="m3-preview-group"
          data-preview-group={g.id}
          data-rail-animate={railMotion?.groups.has(g.id) ? "group" : undefined}
          data-rail-modal={g.items.some((it) => modalIds.has(it.id)) ? "true" : undefined}
          inert={hasModal && !g.items.some((it) => modalIds.has(it.id))}
          style={
            g.free
              ? { position: "absolute", left: g.x - frame.x, top: g.y - frame.y, zIndex: g.items.some((it) => modalIds.has(it.id)) ? 4 : g.items.some((it) => it.id === menuId) ? 2 : undefined }
              : {
                  position: "absolute",
                  left: g.x - frame.x,
                  top: g.y - frame.y,
                  zIndex: g.items.some((it) => modalIds.has(it.id)) ? 4 : g.items.some((it) => it.id === menuId) ? 2 : undefined,
                  display: "flex",
                  flexDirection: g.axis === "x" ? "row" : "column",
                  alignItems: g.axis === "x" ? "center" : "stretch",
                  gap: GAP,
                }
          }
        >
          {((corners) => g.items.map((it, i) => {
            const conn = connectSpecOf(it);
            const n = g.free ? 1 : g.items.length;
            const radii = g.free
              ? (corners?.get(it.id) ?? baseRadii(it))
              : conn && n > 1
                ? g.axis === "x"
                  ? {
                      tl: i === 0 ? conn.outer : conn.inner,
                      bl: i === 0 ? conn.outer : conn.inner,
                      tr: i === n - 1 ? conn.outer : conn.inner,
                      br: i === n - 1 ? conn.outer : conn.inner,
                    }
                  : {
                      tl: i === 0 ? conn.outer : conn.inner,
                      tr: i === 0 ? conn.outer : conn.inner,
                      bl: i === n - 1 ? conn.outer : conn.inner,
                      br: i === n - 1 ? conn.outer : conn.inner,
                    }
                : conn
                  ? uniformRadii(conn.outer)
                  : baseRadii(it);
            const act = it.action;
            let shown = flipped.has(it.id) ? flippedLook(it) : it;
            if (it.kind === "slider" && values[it.id] !== undefined) shown = { ...shown, value: values[it.id] };
            if (it.kind === "select" && values[it.id] !== undefined) shown = { ...shown, selected: values[it.id] };
            const navKind = it.kind === "bottomNav" || it.kind === "navRail" || it.kind === "tabs";
            /* bars with the same destinations are one bar to the visitor: the choice follows them across screens */
            const navKey = navKind ? `nav:${it.kind}:${(it.tabs ?? []).map((t) => t.label).join("|")}` : "";
            if (navKind && values[navKey] !== undefined && values[navKey] >= 0) shown = { ...shown, selected: values[navKey] };
            /* a row whose selection the author never set shows the destination the visitor tapped to open this screen */
            else if (navKind && it.selected === undefined && values[`${navKey}:opened:${frame.id}`] !== undefined) shown = { ...shown, selected: values[`${navKey}:opened:${frame.id}`] };
            const tap =
              act || flips(it)
                ? () => {
                    if (flips(it)) onFlip(it.id);
                    if (act) onAction(act);
                  }
                : undefined;
            const slotActions = it.actions;
            const node = (
              <Tappable
                key={it.id}
                item={shown}
                p={p}
                radii={radii}
                widths={widths}
                railAnimating={railMotion?.items.has(it.id)}
                onTap={tap}
                onSlot={
                  slotActions || navKind
                    ? (slot, animate) => {
                        /* a tapped destination lights up where it opens nothing; where it opens a
                           screen, that screen's bar shows the destination its author chose, or the
                           tapped one when the author chose none */
                        const a = slotActions?.[slot];
                        if (navKind && slot.startsWith("tab:")) {
                          onValue(navKey, a ? -1 : Number(slot.slice(4)));
                          if (a) onValue(`${navKey}:opened:${a.to}`, Number(slot.slice(4)));
                        }
                        if (modalIds.has(it.id)) closeRails(animate);
                        if (a) onAction(a);
                      }
                    : undefined
                }
                onValue={it.kind === "slider" ? (v) => onValue(it.id, v) : undefined}
                onPick={it.kind === "select" ? (i) => onValue(it.id, i) : undefined}
                menuOpen={menuId === it.id}
                onMenu={it.kind === "select" ? (open) => setMenuId(open ? it.id : null) : undefined}
                onRailToggle={it.kind === "navRail" && isWideRail(it) ? (animate) => changeRail(it.id, !it.railExpanded, animate) : undefined}
              />
            );
            if (!g.free) return node;
            const o = g.pos?.[it.id] ?? { x: 0, y: 0 };
            return (
              <div key={it.id} style={{ position: "absolute", left: o.x, top: o.y }}>
                {node}
              </div>
            );
          }))(g.free ? freeRadii(g, widths) : null)}
        </div>
      ))}
    </div>
  );
}

/** the screen being pulled in by a swipe, and the slide it arrives with */
type Peek = { frameId: string; t: Transition };

export function Preview({
  doc,
  widths,
  palette: p,
  startId,
  onClose,
}: {
  doc: Doc;
  widths: Record<string, number>;
  palette: Palette;
  startId: string | null;
  onClose: () => void;
}) {
  const lang = useLang();
  const frames = doc.frames;
  const [stack, setStack] = useState<Entry[]>(() => [{ id: startId ?? frames[0]?.id ?? "", t: "none" }]);
  const [anim, setAnim] = useState<Anim>({ t: "none", back: false });
  const theme = normalizeTheme(doc.theme);
  const spring = theme.motion === "expressive";
  const [scale, setScale] = useState(1);
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set());
  const [values, setValues] = useState<Record<string, number>>({});
  const [peek, setPeek] = useState<Peek | null>(null);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const peekRef = useRef(peek);
  peekRef.current = peek;
  const swiped = useRef(false);

  const flip = (id: string) =>
    setFlipped((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const top = stack[stack.length - 1];
  const current = frames.find((f) => f.id === top?.id) ?? frames[0];
  const peekFrame = peek ? frames.find((f) => f.id === peek.frameId) : undefined;
  const { w: frameW, h: frameH } = current ? frameSizeOf(current) : { w: PHONE_W, h: PHONE_H };
  const phone = current ? isPhoneFrame(current) : true;
  /* every screen sits in the same bezel; only the corners tell a phone from a window */
  const radius = current ? frameRadius(current) : PHONE_R;
  const outerW = frameW + BEZEL * 2;
  const outerH = frameH + BEZEL * 2;
  const targetFrame = peekFrame ?? current;
  const { w: targetFrameW, h: targetFrameH } = targetFrame ? frameSizeOf(targetFrame) : { w: frameW, h: frameH };
  const targetRadius = targetFrame ? frameRadius(targetFrame) : radius;
  const targetOuterW = targetFrameW + BEZEL * 2;
  const targetOuterH = targetFrameH + BEZEL * 2;

  /* The shell is the size of the screen on show. When the screen changes it eases to
   * the new size in step with the slide; a tracked swipe steers it toward the target
   * with the finger, so a phone and a desktop screen hand over without a snap. */
  const prog = useMotionValue(0);
  const shellW = useMotionValue(outerW);
  const shellH = useMotionValue(outerH);
  const screenRadius = useMotionValue(radius);
  useEffect(() => {
    const opts = { duration: SLIDE_MS, ease: EASE };
    const runs = [animate(shellW, outerW, opts), animate(shellH, outerH, opts), animate(screenRadius, radius, opts)];
    return () => runs.forEach((r) => r.stop());
  }, [outerW, outerH, radius, shellW, shellH, screenRadius]);
  useEffect(
    () =>
      prog.on("change", (v) => {
        if (!peekRef.current) return;
        shellW.set(outerW + (targetOuterW - outerW) * v);
        shellH.set(outerH + (targetOuterH - outerH) * v);
        screenRadius.set(radius + (targetRadius - radius) * v);
      }),
    [prog, outerW, outerH, radius, targetOuterW, targetOuterH, targetRadius, shellW, shellH, screenRadius],
  );
  const screenW = useTransform(shellW, (v) => v - BEZEL * 2);
  const screenH = useTransform(shellH, (v) => v - BEZEL * 2);
  const shellRadius = useTransform(screenRadius, (v) => v + BEZEL);
  /* the stage is sized for the largest screen in the document, so the scale never
   * changes while a swipe crosses sizes or a screen is opened from the picker */
  const maxOuterW = Math.max(outerW, ...frames.map((f) => frameSizeOf(f).w + BEZEL * 2));
  const maxOuterH = Math.max(outerH, ...frames.map((f) => frameSizeOf(f).h + BEZEL * 2));
  const shellLeft = useTransform(shellW, (v) => ((maxOuterW - v) * scale) / 2);
  const shellTop = useTransform(shellH, (v) => ((maxOuterH - v) * scale) / 2);

  /* on a wide window the controls stand in a column at the right edge, clear of the phone;
   * on a phone they stay along the bottom, where the frame fills the width anyway */
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const fit = () => {
      const isWide = window.innerWidth >= 720;
      setWide(isWide);
      setScale(
        Math.min(1.4, (window.innerHeight - 32) / maxOuterH, (window.innerWidth - (isWide ? WIDE_CONTROL_SPACE + 16 : 16)) / maxOuterW),
      );
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [maxOuterH, maxOuterW]);

  /* a slide between a phone and a desktop screen would drag one shape through the
   * other; screens of different sizes cross-fade while the shell changes size */
  const sameSize = useCallback(
    (fromId: string, toId: string) => {
      const a = frames.find((f) => f.id === fromId);
      const b = frames.find((f) => f.id === toId);
      if (!a || !b) return true;
      const sa = frameSizeOf(a);
      const sb = frameSizeOf(b);
      return sa.w === sb.w && sa.h === sb.h;
    },
    [frames],
  );

  const back = useCallback(() => {
    const s = stackRef.current;
    if (s.length < 2 || peekRef.current) return;
    const from = s[s.length - 1];
    const to = s[s.length - 2];
    setAnim({ t: sameSize(from.id, to.id) ? from.t : "fade", back: true, spring });
    setStack(s.slice(0, -1));
  }, [spring, sameSize]);

  const go = useCallback(
    (a: Action) => {
      if (swiped.current) return;
      if (a.to === BACK_TARGET) {
        back();
        return;
      }
      if (!frames.some((f) => f.id === a.to)) return;
      const s = stackRef.current;
      const t = sameSize(s[s.length - 1].id, a.to) ? a.transition : "fade";
      setAnim({ t, back: false, spring });
      setStack((cur) => [...cur, { id: a.to, t }]);
    },
    [frames, back, spring, sameSize],
  );

  const [picker, setPicker] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        /* an open menu is the thing Escape dismisses */
        if (picker) setPicker(false);
        else onClose();
      }
      if (e.key === "Backspace" || e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, onClose, picker]);
  /* The control that opened the preview gets the keyboard back when it closes, whichever
   * screens were shown in between; a screen's own restore only covers its modal rail. Read
   * during the first render, before a screen's effect moves focus onto its rail. */
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  useEffect(() => () => { if (opener?.isConnected && !opener.closest("[inert]")) opener.focus(); }, [opener]);

  const groupsFor = useCallback((f: Frame) => groupsInFrame(doc.groups, f, frames, widths), [doc.groups, frames, widths]);
  const groups = useMemo(() => (current ? groupsFor(current) : []), [current, groupsFor]);
  const peekGroups = useMemo(() => (peekFrame ? groupsFor(peekFrame) : []), [peekFrame, groupsFor]);

  /* ---- finger-tracked swipes: only the swipes the author set on the frame ---- */
  const axisMV = useMotionValue(0); // 0 = x, 1 = y
  const enterMV = useMotionValue(0);
  const exitMV = useMotionValue(0);
  const curX = useTransform([prog, axisMV, exitMV], ([p, a, ex]: number[]) => (a === 0 ? pct(ex * p) : "0%"));
  const curY = useTransform([prog, axisMV, exitMV], ([p, a, ex]: number[]) => (a === 1 ? pct(ex * p) : "0%"));
  const curOp = useTransform(prog, (p: number) => 1 - 0.4 * p);
  const peekX = useTransform([prog, axisMV, enterMV], ([p, a, en]: number[]) => (a === 0 ? pct(en * (1 - p)) : "0%"));
  const peekY = useTransform([prog, axisMV, enterMV], ([p, a, en]: number[]) => (a === 1 ? pct(en * (1 - p)) : "0%"));

  const gesture = useRef<{
    id: number;
    x0: number;
    y0: number;
    phase: "idle" | "drag" | "none";
    dir?: SwipeDir;
    size: number;
    last: number;
    lastT: number;
    vel: number;
  } | null>(null);

  const onScreenPointerDown = (e: React.PointerEvent) => {
    if (peekRef.current || e.button !== 0) return;
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, phase: "idle", size: frameW, last: 0, lastT: e.timeStamp, vel: 0 };
    swiped.current = false;
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      const dx = (e.clientX - g.x0) / scale;
      const dy = (e.clientY - g.y0) / scale;
      if (g.phase === "none") return;
      if (g.phase === "idle") {
        if (Math.hypot(dx, dy) < 8) return;
        const dir: SwipeDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
        const s = stackRef.current;
        const cur = frames.find((f) => f.id === s[s.length - 1]?.id);
        if (!cur) return;
        const to = cur.swipe?.[dir];
        const spec = SWIPE_DIRS.find((d) => d.key === dir)!;
        /* only swipes the author set up move screens; nothing is inferred */
        let pk: Peek | null = null;
        if (to && frames.some((f) => f.id === to)) pk = { frameId: to, t: spec.transition };
        if (!pk) {
          g.phase = "none";
          return;
        }
        const sl = SLIDE_SPEC[pk.t]!;
        g.phase = "drag";
        g.dir = dir;
        const { w, h } = frameSizeOf(cur);
        g.size = sl.axis === "x" ? w : h;
        swiped.current = true;
        axisMV.set(sl.axis === "x" ? 0 : 1);
        enterMV.set(sl.enter);
        exitMV.set(sl.exit);
        prog.set(0);
        peekRef.current = pk;
        setPeek(pk);
      }
      const along = g.dir === "left" ? -dx : g.dir === "right" ? dx : g.dir === "up" ? -dy : dy;
      const pr = Math.max(0, Math.min(1, along / g.size));
      const dt = Math.max(1, e.timeStamp - g.lastT);
      g.vel = (pr - g.last) / dt;
      g.last = pr;
      g.lastT = e.timeStamp;
      prog.set(pr);
    };
    const up = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      gesture.current = null;
      if (g.phase !== "drag") return;
      const pk = peekRef.current;
      if (!pk) return;
      const commit = prog.get() > 0.25 || g.vel > 0.0012;
      animate(prog, commit ? 1 : 0, { duration: 0.26, ease: EASE }).then(() => {
        if (commit) {
          setAnim({ t: "none", back: false, spring });
          setStack((s) => [...s, { id: pk.frameId, t: pk.t }]);
        }
        peekRef.current = null;
        setPeek(null);
        enterMV.set(0);
        exitMV.set(0);
        prog.set(0);
        window.setTimeout(() => {
          swiped.current = false;
        }, 50);
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [frames, scale, prog, axisMV, enterMV, exitMV]);

  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerButton = useRef<HTMLButtonElement>(null);
  /* A menu hands focus back to its button when it closes; a chosen screen is then one Tab
   * away. The chosen item is still in the tree here because the menu animates out. */
  useEffect(() => {
    const focused = document.activeElement;
    if (!picker && focused !== pickerButton.current && pickerRef.current?.contains(focused)) pickerButton.current?.focus();
  }, [picker]);
  useEffect(() => {
    if (!picker) return;
    const onDown = (e: PointerEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPicker(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [picker]);

  if (!current) {
    return null;
  }

  const screenProps = {
    widths,
    p,
    onAction: go,
    flipped,
    onFlip: flip,
    values,
    onValue: (id: string, v: number) => setValues((m) => ({ ...m, [id]: v })),
  };

  const barBtn: React.CSSProperties = {
    height: 40,
    padding: "0 14px 0 10px",
    borderRadius: 20,
    border: "none",
    background: "transparent",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
    /* the column has a fixed width, so labels are cut with an ellipsis instead of widening it */
    width: wide ? "100%" : undefined,
    minWidth: 0,
  };
  const label: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: p.surfaceContainer,
        display: "grid",
        placeItems: "center",
        boxSizing: "border-box",
        paddingRight: wide ? WIDE_CONTROL_SPACE : 0,
      }}
    >
      <div
        style={{
          width: maxOuterW * scale,
          height: maxOuterH * scale,
          position: "relative",
          marginBottom: wide ? 0 : 56,
        }}
      >
        <motion.div
          onPointerDown={onScreenPointerDown}
          style={{
            position: "absolute",
            left: shellLeft,
            top: shellTop,
            width: shellW,
            height: shellH,
            transform: `scale(${scale})`,
            touchAction: "none",
            transformOrigin: "0 0",
            borderRadius: shellRadius,
            background: p.inverseSurface,
            boxShadow: "0 30px 80px rgba(0,0,0,0.22)",
          }}
        >
          <motion.div
            onClickCapture={(e) => {
              if (swiped.current) {
                e.stopPropagation();
                e.preventDefault();
              }
            }}
            style={{
              position: "absolute",
              left: BEZEL,
              top: BEZEL,
              width: screenW,
              height: screenH,
              borderRadius: screenRadius,
              overflow: "hidden",
              background: p[current.bg ?? "surface"],
              fontFamily: fontFamilyOf(theme.font, lang),
              touchAction: "none",
            }}
          >
            <motion.div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 1,
                x: curX,
                y: curY,
                opacity: curOp,
              }}
            >
              <AnimatePresence initial={false} mode="popLayout" custom={anim}>
                <motion.div
                  key={current.id}
                  custom={anim}
                  variants={screenVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  style={{ position: "absolute", inset: 0 }}
                >
                  <Screen frame={current} groups={groups} {...screenProps} />
                </motion.div>
              </AnimatePresence>
            </motion.div>
            {peek && peekFrame && (
              <motion.div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 2,
                  x: peekX,
                  y: peekY,
                  pointerEvents: "none",
                }}
              >
                <Screen {...screenProps} active={false} frame={peekFrame} groups={peekGroups} />
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      </div>

      <div
        style={
          wide
            ? { position: "absolute", right: 20, bottom: 20, display: "flex", alignItems: "flex-end", pointerEvents: "none" }
            : { position: "absolute", left: 0, right: 0, bottom: 14, display: "flex", justifyContent: "center", pointerEvents: "none" }
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: wide ? "column" : "row",
            alignItems: wide ? "stretch" : "center",
            gap: 4,
            padding: 6,
            borderRadius: 28,
            background: p.surface,
            boxShadow: "0 4px 18px rgba(0,0,0,0.14)",
            pointerEvents: "auto",
            width: wide ? 172 : undefined,
            maxWidth: "calc(100vw - 24px)",
          }}
        >
          <button
            onClick={back}
            disabled={stack.length < 2}
            title={t("back", lang)}
            className="m3-press"
            style={{
              ...barBtn,
              color: stack.length < 2 ? p.outlineVariant : p.onSurfaceVariant,
              cursor: stack.length < 2 ? "default" : "pointer",
            }}
          >
            <Icon name="arrow_back" size={20} />
            <span style={label}>{t("back", lang)}</span>
          </button>
          <div ref={pickerRef} style={{ position: "relative", minWidth: 0 }}>
            <button
              ref={pickerButton}
              onClick={() => setPicker((v) => !v)}
              title={t("screens", lang)}
              aria-expanded={picker}
              className="m3-press"
              style={{
                ...barBtn,
                background: p.secondaryContainer,
                color: p.onSecondaryContainer,
                maxWidth: wide ? undefined : 200,
              }}
            >
              <Icon name={phone ? "smartphone" : "desktop_windows"} size={20} />
              <span style={{ ...label, flex: wide ? 1 : undefined, textAlign: "left" }}>{current.name || t("screen", lang)}</span>
              <Icon name={wide ? (picker ? "chevron_right" : "chevron_left") : picker ? "expand_more" : "expand_less"} size={18} />
            </button>
            <AnimatePresence>
              {picker && (
                <motion.div
                  role="menu"
                  initial={wide ? { opacity: 0, x: 6, scale: 0.96 } : { opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, x: wide ? 0 : "-50%", y: 0, scale: 1 }}
                  exit={wide ? { opacity: 0, x: 6, scale: 0.96 } : { opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ duration: 0.16, ease: EASE }}
                  style={{
                    position: "absolute",
                    ...(wide ? { right: "calc(100% + 14px)", bottom: 0 } : { bottom: 48, left: "50%" }),
                    minWidth: 160,
                    maxHeight: "50vh",
                    overflowY: "auto",
                    padding: 6,
                    borderRadius: 18,
                    background: p.surfaceContainerLow,
                    boxShadow: "0 6px 20px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.04)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    transformOrigin: wide ? "bottom right" : "bottom center",
                  }}
                >
                  {frames.map((f) => {
                    const on = f.id === current.id;
                    return (
                      <button
                        key={f.id}
                        role="menuitemradio"
                        aria-checked={on}
                        onClick={() => {
                          setPicker(false);
                          if (on) return;
                          setAnim({ t: "fade", back: false, spring });
                          setStack([{ id: f.id, t: "fade" }]);
                        }}
                        className="m3-press"
                        style={{
                          height: 40,
                          padding: "0 14px 0 10px",
                          borderRadius: 12,
                          border: "none",
                          background: on ? p.secondaryContainer : "transparent",
                          color: on ? p.onSecondaryContainer : p.onSurface,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          whiteSpace: "nowrap",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ width: 18, display: "inline-flex" }}>
                          {on ? <Icon name="check" size={18} /> : <Icon name={isPhoneFrame(f) ? "smartphone" : "desktop_windows"} size={18} />}
                        </span>
                        {f.name || t("screen", lang)}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button onClick={onClose} title={t("close", lang)} className="m3-press" style={{ ...barBtn, color: p.onSurfaceVariant }}>
            <Icon name="close" size={20} />
            <span style={label}>{t("closeBtn", lang)}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
