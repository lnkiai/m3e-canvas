"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Component, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LANGS, LangContext, setGlobalLang, t, type Lang } from "@/lib/i18n";
import { preferredLang, rememberLang } from "@/lib/lang";
import { collectBackup, readDesigns, restoreBackup, saveBackup } from "@/lib/backup";
import { saveProject } from "@/lib/project";
import {
  LAST_KEY,
  adoptLegacy,
  createProject,
  duplicateProject,
  forgetUnwritten,
  hasUnwritten,
  listProjects,
  loadProject,
  memoryBackend,
  openElsewhere,
  openProjects,
  readOnly,
  renameProject,
  smallStorage,
  writesSettled,
  type Backend,
  type Project,
  type ProjectMeta,
} from "@/lib/projects";
import { readShareHash } from "@/lib/share";
import { getShapes } from "@/lib/shapes";
import { ThemeContext, ensureFontLoaded, ensureLangFontLoaded } from "@/lib/theme";
import { BEZEL, Doc, Frame, GAP, Palette, R_INNER, SETTLE_MS, SPLIT_GAP, Theme, extendedFabMetrics, fabCornerRadius, frameRadius, frameSizeOf, normalizeTheme, paletteOf, uiFontFamily } from "@/lib/tokens";
import { Bot } from "./Bot";
import { wrapTab } from "./focus";
import { FrameStatic } from "./FrameStatic";
import { Logo } from "./Logo";
import { LogoSwap } from "./LogoSwap";
import { McpSheet, originOf, type SheetOrigin } from "./McpGuide";
import { Icon } from "./M3Node";
import { GitHubMark, REPO_URL } from "./Toolbar";
import { IconBtn } from "./ui";

const EASE = [0.2, 0, 0, 1] as const;

type Look = { theme: Theme; palette: Palette };

/** the theme and the colours a document is drawn in, as the editor works them out */
const lookOf = (doc: Doc | null): Look => {
  const theme = normalizeTheme(doc?.theme);
  const custom = doc?.customPalette && typeof doc.customPalette.primary === "string" ? paletteOf("custom", doc.customPalette) : null;
  return { theme, palette: paletteOf(doc?.paletteKey || "purple", custom, theme) };
};

/** "2 hours ago" in the interface language; a date once it is more than a month back */
function ago(at: number, now: number, lang: Lang): string {
  const seconds = Math.round((at - now) / 1000);
  const past = Math.abs(seconds);
  const relative = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  if (past < 45) return relative.format(0, "second");
  if (past < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (past < 86400) return relative.format(Math.round(seconds / 3600), "hour");
  if (past < 30 * 86400) return relative.format(Math.round(seconds / 86400), "day");
  return new Intl.DateTimeFormat(lang, { year: "numeric", month: "short", day: "numeric" }).format(at);
}

const screensText = (n: number, lang: Lang) => (n === 1 ? t("screensOne", lang) : t("screensMany", lang).replace("{n}", String(n)));
const metaLine = (meta: ProjectMeta, now: number, lang: Lang) => `${meta.screens > 0 ? `${screensText(meta.screens, lang)} · ` : ""}${ago(meta.updatedAt, now, lang)}`;
const editorHref = (id: string) => ({ pathname: "/", query: { p: id } });

/** A document saved by an older version may hold a part this build draws differently; the
 *  editor brings it up to date on first open. Until then its picture may not draw at all,
 *  and the place shows a plain mark instead of taking the list down with it. */
class Safe extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** A project's document, read when something that draws it appears, so the list itself
 *  opens on the small records alone. `undefined` while it is being read. */
function useDoc(backend: Backend, meta: ProjectMeta | null): Doc | null | undefined {
  const id = meta?.id ?? null;
  /* the date and the screen count: a project's first opening writes its seed without a new date */
  const stamp = (meta?.updatedAt ?? 0) + (meta?.screens ?? 0) / 1000;
  const [held, setHeld] = useState<{ id: string; stamp: number; doc: Doc | null } | null>(() => {
    const known = id ? docsRead.get(id) : undefined;
    return known && known.backend === backend && known.stamp === stamp && id ? { id, stamp, doc: known.doc } : null;
  });
  useEffect(() => {
    if (!id) return;
    const known = docsRead.get(id);
    if (known && known.backend === backend && known.stamp === stamp) {
      setHeld({ id, stamp, doc: known.doc });
      return;
    }
    let active = true;
    const keep = (doc: Doc | null) => {
      docsRead.set(id, { backend, stamp, doc });
      if (active) setHeld({ id, stamp, doc });
    };
    void backend.doc(id).then(keep, () => active && setHeld({ id, stamp, doc: null }));
    return () => {
      active = false;
    };
  }, [backend, id, stamp]);
  return id && held?.id === id && held.stamp === stamp ? held.doc : id ? undefined : null;
}

/** The documents the cards have read, one per project, as of the `updatedAt` they were read
 *  at. A search takes the cards down and puts them back; without this each return would
 *  read its document from storage again. */
const docsRead = new Map<string, { backend: Backend; stamp: number; doc: Doc | null }>();

function useLook(doc: Doc | null | undefined): Look {
  const look = useMemo(() => lookOf(doc ?? null), [doc]);
  useEffect(() => {
    if (doc) ensureFontLoaded(look.theme.font);
  }, [doc, look.theme.font]);
  return look;
}

/** One screen inside its bezel, as the editor's canvas draws it, at `scale`. */
function Device({ doc, frame, look, scale }: { doc: Doc; frame: Frame; look: Look; scale: number }) {
  const { w, h } = frameSizeOf(frame);
  const radius = frameRadius(frame);
  const outerW = w + BEZEL * 2;
  const outerH = h + BEZEL * 2;
  return (
    <div style={{ width: outerW * scale, height: outerH * scale, flex: "0 0 auto" }}>
      <div
        style={{
          position: "relative",
          width: outerW,
          height: outerH,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          borderRadius: radius + BEZEL,
          background: look.palette.inverseSurface,
        }}
      >
        <div style={{ position: "absolute", left: BEZEL, top: BEZEL, width: w, height: h, borderRadius: radius, overflow: "hidden", background: look.palette.surface, fontFamily: uiFontFamily() }}>
          <FrameStatic frame={frame} groups={doc.groups} frames={doc.frames} widths={{}} palette={look.palette} />
        </div>
      </div>
    </div>
  );
}

/** the screens of a document in a row, drawn but not for touching */
function Screens({ doc, look, scale, max, gap, style }: { doc: Doc; look: Look; scale: number | ((f: Frame) => number); max: number; gap: number; style?: CSSProperties }) {
  return (
    <ThemeContext.Provider value={look.theme}>
      <div aria-hidden inert style={{ display: "flex", alignItems: "flex-start", gap, pointerEvents: "none", ...style }}>
        {doc.frames.slice(0, max).map((f) => (
          <Device key={f.id} doc={doc} frame={f} look={look} scale={typeof scale === "function" ? scale(f) : scale} />
        ))}
      </div>
    </ThemeContext.Provider>
  );
}

const hasScreens = (doc: Doc | null | undefined): doc is Doc => !!doc && Array.isArray(doc.frames) && doc.frames.length > 0 && Array.isArray(doc.groups);

function Mark({ p, shown }: { p: Palette; shown: boolean }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: p.onSurfaceVariant, opacity: shown ? 0.7 : 0 }}>
      <Icon name="draw" size={28} />
    </div>
  );
}

function MenuRow({ icon, label, p, danger, onClick }: { icon: string; label: string; p: Palette; danger?: boolean; onClick: () => void }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="m3-press"
      style={{
        height: 40,
        padding: "0 16px 0 12px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        border: "none",
        borderRadius: 12,
        background: "transparent",
        color: danger ? p.error : p.onSurface,
        fontSize: 14,
        fontWeight: 500,
        whiteSpace: "nowrap",
        cursor: "pointer",
        textAlign: "start",
      }}
    >
      <Icon name={icon} size={20} />
      {label}
    </button>
  );
}

type CardAction = "rename" | "duplicate" | "save" | "delete";
const ACTIONS: { action: CardAction; icon: string; label: "rename" | "duplicate" | "saveProject" | "delete" }[] = [
  { action: "rename", icon: "edit", label: "rename" },
  { action: "duplicate", icon: "content_copy", label: "duplicate" },
  { action: "save", icon: "download", label: "saveProject" },
  { action: "delete", icon: "delete", label: "delete" },
];

/** A menu hung off whatever `trigger` draws. It is drawn on the page itself rather than
 *  beside its trigger: a card clips what overflows it, and would cut a menu off. */
function Anchored({ p, minWidth = 180, style, trigger, children }: { p: Palette; minWidth?: number; style?: CSSProperties; trigger: (toggle: () => void, open: boolean) => ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<CSSProperties>({});
  const holder = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  /** closes the menu; closed from the keyboard or by a choice, the focus goes back to its trigger */
  const leave = (refocus: boolean) => {
    setOpen(false);
    if (refocus) holder.current?.querySelector<HTMLElement>("button")?.focus();
  };
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector("button")?.focus();
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!holder.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return leave(true);
      /* Tab moves on from the trigger: the menu itself is drawn at the end of the page, and
         from there Tab would leave the page altogether */
      if (e.key === "Tab") return leave(true);
      const rows = [...(menu.current?.querySelectorAll<HTMLElement>("button") ?? [])];
      const at = rows.indexOf(document.activeElement as HTMLElement);
      const to = e.key === "ArrowDown" ? at + 1 : e.key === "ArrowUp" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : null;
      if (to === null || rows.length === 0) return;
      e.preventDefault();
      rows[(to + rows.length) % rows.length].focus();
    };
    const shut = () => setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", shut);
    window.addEventListener("scroll", shut, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", shut);
      window.removeEventListener("scroll", shut, true);
    };
  }, [open]);
  const toggle = () => {
    const r = holder.current?.getBoundingClientRect();
    if (!open && r) {
      /* against the trigger's right edge, or its left one where the menu would leave the window */
      const fromRight = r.right > minWidth + 60;
      const side = fromRight ? { right: window.innerWidth - r.right } : { left: r.left };
      const origin = fromRight ? "right" : "left";
      /* below the trigger, or above it when it sits at the foot of the window */
      setAnchor(window.innerHeight - r.bottom > 200 ? { top: r.bottom + 6, ...side, transformOrigin: `top ${origin}` } : { bottom: window.innerHeight - r.top + 6, ...side, transformOrigin: `bottom ${origin}` });
    }
    setOpen((o) => !o);
  };
  return (
    <div ref={holder} style={{ position: "relative", zIndex: 2, flex: "0 0 auto", ...style }}>
      {trigger(toggle, open)}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menu}
              role="menu"
              initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
              transition={{ duration: 0.16, ease: EASE }}
              style={{
                position: "fixed",
                zIndex: 60,
                padding: 6,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                minWidth,
                borderRadius: 18,
                background: p.surfaceContainerLow,
                color: p.onSurface,
                boxShadow: "0 6px 20px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.04)",
                ...anchor,
              }}
            >
              {children(() => leave(true))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

/** the height of the pair of buttons on a card, and the corner its two halves share */
const PAIR_H = 40;

/** The more-button of a card and the menu it opens. The button is the trailing half of the
 *  pair it forms with Open: a container of its own, squared off on the side that meets it. */
function ProjectMenu({ p, lang, onAction }: { p: Palette; lang: Lang; onAction: (action: CardAction) => void }) {
  return (
    <Anchored
      p={p}
      style={{ zIndex: undefined }}
      trigger={(toggle, open) => (
        <button
          onClick={toggle}
          title={t("more", lang)}
          aria-label={t("more", lang)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="m3-press"
          style={{
            width: PAIR_H,
            height: PAIR_H,
            display: "grid",
            placeItems: "center",
            border: "none",
            /* an open menu rounds the half that holds it, the way a split button's arrow does */
            borderRadius: open ? PAIR_H / 2 : `${R_INNER}px ${PAIR_H / 2}px ${PAIR_H / 2}px ${R_INNER}px`,
            background: p.secondaryContainer,
            color: p.onSecondaryContainer,
            cursor: "pointer",
            transition: "border-radius 160ms cubic-bezier(0.2, 0, 0, 1)",
          }}
        >
          <Icon name="more_vert" size={22} />
        </button>
      )}
    >
      {(close) =>
        ACTIONS.map((a) => (
          <MenuRow
            key={a.action}
            icon={a.icon}
            label={t(a.label, lang)}
            p={p}
            danger={a.action === "delete"}
            onClick={() => {
              close();
              onAction(a.action);
            }}
          />
        ))
      }
    </Anchored>
  );
}

/** The language button of the header. Its menu opens under it and keeps inside the window
 *  at either edge, which the editor's own language menu, made for the rail, would not. */
function LangButton({ p, lang, onLang }: { p: Palette; lang: Lang; onLang: (next: Lang) => void }) {
  return (
    <Anchored p={p} minWidth={152} style={{ zIndex: undefined }} trigger={(toggle, open) => <IconBtn icon="translate" p={p} on={open} onClick={toggle} title={t("language", lang)} size={40} hasPopup="menu" expanded={open} />}>
      {(close) =>
        LANGS.map((l) => (
          <button
            key={l.key}
            role="menuitemradio"
            aria-checked={l.key === lang}
            onClick={() => {
              close();
              onLang(l.key);
            }}
            className="m3-press"
            style={{ height: 40, padding: "0 12px 0 16px", display: "flex", alignItems: "center", gap: 12, border: "none", borderRadius: 12, background: l.key === lang ? p.secondaryContainer : "transparent", color: l.key === lang ? p.onSecondaryContainer : p.onSurface, font: "inherit", fontSize: 14, fontWeight: 500, cursor: "pointer", textAlign: "start" }}
          >
            <span style={{ flex: 1 }}>{l.label}</span>
            {l.key === lang && <Icon name="check" size={18} />}
          </button>
        ))
      }
    </Anchored>
  );
}

/** The character in the header, with the word AI beside it: the way to the guide on using the
 *  app with an agent over MCP. It sits still until the pointer comes near, and looks up when it
 *  is pointed at. It is the trailing half of the pair it forms with the search field, squared
 *  off on the side that meets it. */
function AiButton({ p, lang, onOpen }: { p: Palette; lang: Lang; onOpen: (origin: SheetOrigin) => void }) {
  const [over, setOver] = useState(false);
  return (
    <button
      onClick={(e) => onOpen(originOf(e.currentTarget))}
      title={t("mcpTitle", lang)}
      aria-label={`AI: ${t("mcpTitle", lang)}`}
      aria-haspopup="dialog"
      className="m3-press"
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      onFocus={() => setOver(true)}
      onBlur={() => setOver(false)}
      style={{ height: PAIR_H, padding: "0 14px 0 6px", flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 6, border: "none", borderRadius: `${R_INNER}px ${PAIR_H / 2}px ${PAIR_H / 2}px ${R_INNER}px`, background: p.surfaceContainerHigh, color: p.onSurface, font: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
    >
      <Bot p={p} size={32} calm spark={false} mood={over ? "curious" : "idle"} />
      AI
    </button>
  );
}

/** a project's name, or the words that stand in for a missing one */
function Name({ meta, p, lang, size }: { meta: ProjectMeta; p: Palette; lang: Lang; size: number }) {
  return <div style={{ fontSize: size, fontWeight: 600, lineHeight: `${Math.round(size * 1.45)}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: meta.title ? p.onSurface : p.onSurfaceVariant }}>{meta.title || t("untitledProject", lang)}</div>;
}

type ItemProps = {
  meta: ProjectMeta;
  backend: Backend;
  p: Palette;
  lang: Lang;
  now: number;
  /** the project the editor opened last */
  last: boolean;
  /** the same function for every card and every render, so a card is drawn again only when
   *  its own project changes */
  onAction: (meta: ProjectMeta, action: CardAction) => void;
};

/** how large a screen is drawn on a card: a phone at about a third of its size, a wide screen fitted to the card */
const cardScale = (f: Frame) => (frameSizeOf(f).w < frameSizeOf(f).h ? 0.36 : 0.24);

/** A card: the first screens of the project in its own colours, its name and when it was
 *  last worked on. About three stand side by side on a desktop window. */
const Card = memo(function Card({ meta, backend, p, lang, now, last, onAction }: ItemProps) {
  const doc = useDoc(backend, meta);
  const look = useLook(doc);
  const drawn = hasScreens(doc);
  const background = drawn ? look.palette.primaryContainer : p.surfaceContainerHigh;
  return (
    <article className="m3e-proj-card" data-project={meta.id} style={{ background: p.surface, color: p.onSurface, ["--proj-ring" as string]: p.primary }}>
      {/* the whole card opens the project for a pointer; the keyboard has the Open button, so
          this one is kept out of its way */}
      <Link className="m3e-proj-open" href={editorHref(meta.id)} aria-label={meta.title || t("untitledProject", lang)} aria-hidden tabIndex={-1} draggable={false} />
      {/* until the document has been read the place breathes, as the page's own skeleton does */}
      <div className="m3e-proj-thumb" data-wait={doc === undefined ? "" : undefined} style={{ background, transition: "background 240ms" }}>
        {drawn ? (
          <Safe fallback={<Mark p={p} shown />}>
            <div className="m3e-proj-screens">
              <Screens doc={doc} look={look} scale={cardScale} max={4} gap={12} />
            </div>
          </Safe>
        ) : (
          <Mark p={p} shown={doc !== undefined} />
        )}
        {/* the screens run past the bottom edge; the fade says there is more of them */}
        {drawn && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 36, background: `linear-gradient(transparent, ${background})`, pointerEvents: "none" }} />}
      </div>
      {/* the name starts at the picture's left edge and the buttons end at its right one */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Name meta={meta} p={p} lang={lang} size={15} />
          <div style={{ fontSize: 13, lineHeight: "18px", color: p.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {last ? `${t("lastOpened", lang)} · ` : ""}
            {metaLine(meta, now, lang)}
          </div>
        </div>
        {/* Open and the more-button are one connected pair, as a split button's two halves are */}
        <div style={{ position: "relative", zIndex: 2, display: "flex", gap: SPLIT_GAP, flex: "0 0 auto" }}>
          <Link
            href={editorHref(meta.id)}
            draggable={false}
            aria-label={`${t("openProjectAction", lang)}: ${meta.title || t("untitledProject", lang)}`}
            className="m3-press"
            style={{
              height: PAIR_H,
              padding: "0 14px 0 18px",
              display: "inline-flex",
              alignItems: "center",
              borderRadius: `${PAIR_H / 2}px ${R_INNER}px ${R_INNER}px ${PAIR_H / 2}px`,
              background: p.secondaryContainer,
              color: p.onSecondaryContainer,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {t("openProjectAction", lang)}
          </Link>
          <ProjectMenu p={p} lang={lang} onAction={(action) => onAction(meta, action)} />
        </div>
      </div>
    </article>
  );
});

const FAB_H = 56;

/** The page's one floating button: an extended FAB that starts a new project. `folded` draws
 *  it as the plain FAB, icon only; it retracts towards its right edge, which stays where it
 *  is, the way the canvas's own extended FAB does (see public/agent.md). */
function Fab({ p, label, folded, onClick }: { p: Palette; label: string; folded: boolean; onClick: () => void }) {
  const reduced = useReducedMotion();
  const measure = useRef<HTMLSpanElement>(null);
  const [labelW, setLabelW] = useState<number | null>(null);
  const m = extendedFabMetrics(FAB_H);
  /* the label's own width, so folding eases over exactly the distance it covers */
  useLayoutEffect(() => {
    const read = () => setLabelW(measure.current ? Math.ceil(measure.current.getBoundingClientRect().width) : null);
    read();
    void document.fonts?.ready.then(read);
  }, [label]);
  const ease = `${reduced ? 0 : SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)`;
  return (
    <div className="m3e-proj-fab">
      <button
        onClick={onClick}
        aria-label={label}
        title={folded ? label : undefined}
        className="m3-press"
        style={{
          display: "flex",
          alignItems: "center",
          height: FAB_H,
          /* the folded button is the square FAB: its icon centred in the same height */
          padding: `0 ${folded ? (FAB_H - m.icon) / 2 : m.padX}px`,
          border: "none",
          borderRadius: folded ? fabCornerRadius(FAB_H) : m.radius,
          background: p.primary,
          color: p.onPrimary,
          font: "inherit",
          fontSize: m.font,
          fontWeight: 500,
          whiteSpace: "nowrap",
          cursor: "pointer",
          boxShadow: "0 3px 8px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.12)",
          transition: `padding ${ease}, border-radius ${ease}`,
        }}
      >
        <span style={{ display: "grid", placeItems: "center", width: m.icon, height: m.icon, flex: "0 0 auto" }}>
          <Icon name="add" size={m.icon} />
        </span>
        <span aria-hidden style={{ display: "block", overflow: "hidden", width: folded ? 0 : labelW === null ? undefined : labelW + m.gap, opacity: folded ? 0 : 1, transition: `width ${ease}, opacity ${reduced ? 0 : 160}ms` }}>
          <span ref={measure} style={{ display: "inline-block", paddingLeft: m.gap }}>
            {label}
          </span>
        </span>
      </button>
    </div>
  );
}

/* The shapes the loading indicator morphs through, each as a path around its own centre:
   0 soft burst, 1 cookie, 2 pentagon, 3 pill, 4 sunny, 5 clover, 6 oval. */
const shapePaths = new Map<number, string>();
const shapePath = (index: number) => {
  let d = shapePaths.get(index);
  if (!d) {
    d = getShapes()[index].map(([x, y], i) => `${i ? "L" : "M"}${(x * 50).toFixed(2)} ${(y * 50).toFixed(2)}`).join("") + "Z";
    shapePaths.set(index, d);
  }
  return d;
};

/** one shape of a picture: where its centre stands on the stage, and how long one turn takes
 *  (a negative time turns it the other way) */
type Piece = { shape: number; size: number; x: number; y: number; color: string; turn: number };

const STAGE_W = 248;
const STAGE_H = 176;

/** What the list shows when it has nothing to list: a few Material shapes turning slowly
 *  around an icon, a line that says why, and what can be done about it. */
function Blank({ p, pieces, icon, iconColor, title, body, children }: { p: Palette; pieces: Piece[]; icon: string; iconColor: string; title: string; body: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <div className="m3e-proj-blank">
      <div aria-hidden style={{ position: "relative", width: STAGE_W, height: STAGE_H }}>
        {pieces.map((piece, i) => (
          <motion.div
            key={i}
            /* the shapes arrive one after another, the large one first */
            initial={reduced ? false : { opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.06 + i * 0.07 }}
            style={{ position: "absolute", left: piece.x - piece.size / 2, top: piece.y - piece.size / 2, width: piece.size, height: piece.size }}
          >
            <svg className="m3e-proj-shape" width={piece.size} height={piece.size} viewBox="-50 -50 100 100" style={{ animationDuration: `${Math.abs(piece.turn)}s`, animationDirection: piece.turn < 0 ? "reverse" : "normal" }}>
              <path d={shapePath(piece.shape)} fill={piece.color} />
            </svg>
          </motion.div>
        ))}
        {/* the icon stands still on the large shape while the shape turns under it */}
        <motion.div
          initial={reduced ? false : { opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.16 }}
          style={{ position: "absolute", left: pieces[0].x - 24, top: pieces[0].y - 24, width: 48, height: 48, display: "grid", placeItems: "center", color: iconColor }}
        >
          <Icon name={icon} size={44} />
        </motion.div>
      </div>
      <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700, lineHeight: 1.4 }}>{title}</div>
      <div style={{ marginTop: 4, maxWidth: 400, fontSize: 14, lineHeight: 1.55, color: p.onSurfaceVariant, overflowWrap: "anywhere", textWrap: "balance" }}>{body}</div>
      <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: GAP }}>{children}</div>
    </div>
  );
}

/** a button of a blank state, 40px tall like every other control of the page */
function BlankButton({ icon, label, background, color, radius, onClick }: { icon: string; label: string; background: string; color: string; radius: string | number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="m3-press" style={{ height: PAIR_H, padding: "0 18px 0 14px", display: "inline-flex", alignItems: "center", gap: 8, border: "none", borderRadius: radius, background, color, font: "inherit", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" }}>
      <Icon name={icon} size={20} />
      {label}
    </button>
  );
}

/** A card that is not there yet: a card's own measures with nothing in them. It is drawn in
 *  the --skel-* colours, which are the last visit's until the page knows its own. */
function GhostCard({ index }: { index: number }) {
  return (
    <div className="m3e-proj-ghost" style={{ ["--i" as string]: index }}>
      <span className="m3e-bone" style={{ height: 220, margin: "12px 12px 0", borderRadius: 12 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 8 }}>
          <span className="m3e-bone" style={{ width: "58%", height: 12, borderRadius: 6 }} />
          <span className="m3e-bone" style={{ width: "36%", height: 10, borderRadius: 5 }} />
        </div>
        <span className="m3e-bone" style={{ width: 108, height: PAIR_H, borderRadius: PAIR_H / 2, flex: "0 0 auto" }} />
      </div>
    </div>
  );
}

function GhostGrid({ count }: { count: number }) {
  return (
    <div className="m3e-proj-grid" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <GhostCard key={i} index={i} />
      ))}
    </div>
  );
}

/** The page before it has read anything: its own header, a first screenful of cards and the
 *  FAB, all empty. It is in the first HTML, so it is painted before any script runs. */
function Ghost() {
  return (
    <div className="m3e-projects" aria-busy style={{ background: "var(--skel-low)", ["--proj-bg" as string]: "var(--skel-low)" }}>
      <div className="m3e-proj-head" aria-hidden>
        <div className="m3e-proj-head-in">
          <div className="m3e-proj-head-left">
            <span className="m3e-proj-brand">
              <span style={{ width: 40, height: 40, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
                <Logo size={32} color="var(--skel-primary)" />
              </span>
              <span className="m3e-proj-wordmark m3e-bone" style={{ width: 92, height: 14, borderRadius: 7 }} />
            </span>
            <span className="m3e-proj-ghost-link m3e-bone" />
            <span className="m3e-bone" style={{ width: 40, height: 40, borderRadius: 20, flex: "0 0 auto" }} />
          </div>
          <div className="m3e-proj-head-right">
            <span className="m3e-proj-find m3e-proj-ghost-find m3e-bone" />
            <span className="m3e-proj-trio m3e-proj-ghost-trio m3e-bone" />
          </div>
        </div>
      </div>
      <div className="m3e-proj-main">
        <GhostGrid count={6} />
      </div>
      <div className="m3e-proj-float" aria-hidden>
        <div className="m3e-proj-float-in">
          <span className="m3e-bone" style={{ width: 204, height: FAB_H, borderRadius: extendedFabMetrics(FAB_H).radius, background: "var(--skel-primary)" }} />
        </div>
      </div>
    </div>
  );
}

/** The dialog a project is renamed in: a picture of the project, so there is no doubt which
 *  one it is, one field holding the name, and the two ways out. Enter keeps the name, Escape
 *  and the scrim leave it as it was. */
function RenameDialog({ p, lang, meta, backend, onClose }: { p: Palette; lang: Lang; meta: ProjectMeta; backend: Backend; onClose: (name: string | null) => void }) {
  const reduced = useReducedMotion();
  const doc = useDoc(backend, meta);
  const look = useLook(doc);
  const drawn = hasScreens(doc);
  const tint = drawn ? look.palette.primaryContainer : p.surfaceContainerHighest;
  const [draft, setDraft] = useState(meta.title);
  const [focused, setFocused] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    /* while an input method is composing, Escape is its own: it takes the conversion back */
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose(null);
    } else wrapTab(e, box.current);
  };
  const button = (label: string, primary: boolean, onClick?: () => void) => (
    <button type={primary ? "submit" : "button"} onClick={onClick} className="m3-press" style={{ height: 40, padding: "0 20px", border: "none", borderRadius: 20, background: primary ? p.primary : "transparent", color: primary ? p.onPrimary : p.primary, font: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
      {label}
    </button>
  );
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onPointerDown={(e) => e.target === e.currentTarget && onClose(null)}
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "grid", placeItems: "center", padding: 24, background: "rgba(0,0,0,0.32)" }}
    >
      <motion.div
        ref={box}
        role="dialog"
        aria-modal
        aria-label={t("rename", lang)}
        onKeyDown={onKey}
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
        style={{ width: "min(100%, 480px)", padding: 24, borderRadius: 28, background: p.surfaceContainerHigh, color: p.onSurface, boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)" }}
      >
        {/* a form, so Enter keeps the name; the browser holds Enter back while an input method is composing */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onClose(draft);
          }}
          style={{ display: "flex", flexDirection: "column", gap: 20 }}
        >
          {/* the project as its card shows it */}
          <div className="m3e-proj-thumb" data-wait={doc === undefined ? "" : undefined} style={{ height: 148, margin: 0, borderRadius: 16, background: tint, transition: "background 240ms" }}>
            {drawn ? (
              <Safe fallback={<Mark p={p} shown />}>
                <div className="m3e-proj-screens">
                  <Screens doc={doc} look={look} scale={cardScale} max={4} gap={12} />
                </div>
              </Safe>
            ) : (
              <Mark p={p} shown={doc !== undefined} />
            )}
            {drawn && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 36, background: `linear-gradient(transparent, ${tint})`, pointerEvents: "none" }} />}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", margin: "4px 4px -4px" }}>{t("rename", lang)}</div>
          {/* the field wears a ring, and its mark the theme's colour, while it is typed in */}
          <div style={{ position: "relative", height: 56, borderRadius: 16, background: p.surfaceContainerHighest, boxShadow: `inset 0 0 0 2px ${focused ? p.primary : "transparent"}`, transition: "box-shadow 160ms" }}>
            <span aria-hidden style={{ position: "absolute", left: 16, top: 17, display: "grid", color: focused ? p.primary : p.onSurfaceVariant, transition: "color 160ms" }}>
              <Icon name="edit" size={22} />
            </span>
            <input
              ref={field}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              aria-label={t("projectName", lang)}
              placeholder={t("untitledProject", lang)}
              maxLength={120}
              enterKeyHint="done"
              autoComplete="off"
              spellCheck={false}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", padding: `0 ${draft ? 52 : 18}px 0 50px`, border: "none", outline: "none", borderRadius: 16, background: "transparent", color: p.onSurface, font: "inherit", fontSize: 16, fontWeight: 500 }}
            />
            {draft && (
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  field.current?.focus();
                }}
                title={t("clear", lang)}
                aria-label={t("clear", lang)}
                className="m3-press"
                style={{ position: "absolute", right: 10, top: 10, width: 36, height: 36, display: "grid", placeItems: "center", border: "none", borderRadius: 18, background: "transparent", color: p.onSurfaceVariant, cursor: "pointer" }}
              >
                <Icon name="close" size={20} />
              </button>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            {button(t("cancel", lang), false, () => onClose(null))}
            {button(t("save", lang), true)}
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/** The dialog a design is opened from a link in: one field to paste the link into, and the two
 *  ways out. A link that carries no design says so under the field and stays for another try. */
function LinkDialog({ p, lang, onOpen, onClose }: { p: Palette; lang: Lang; onOpen: (doc: Doc) => void; onClose: () => void }) {
  const reduced = useReducedMotion();
  const [link, setLink] = useState("");
  const [focused, setFocused] = useState(false);
  const [bad, setBad] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => field.current?.focus(), []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    } else wrapTab(e, box.current);
  };
  const submit = async () => {
    const text = link.trim();
    /* a whole link, or only what follows its # */
    const doc = text ? await readShareHash(text.includes("#") ? text.slice(text.indexOf("#")) : text) : null;
    if (doc) onOpen(doc);
    else {
      setBad(true);
      field.current?.focus();
    }
  };
  const ring = bad ? p.error : focused ? p.primary : "transparent";
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "grid", placeItems: "center", padding: 24, background: "rgba(0,0,0,0.32)" }}
    >
      <motion.div
        ref={box}
        role="dialog"
        aria-modal
        aria-label={t("openFromLink", lang)}
        onKeyDown={onKey}
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
        style={{ width: "min(100%, 480px)", padding: 24, borderRadius: 28, background: p.surfaceContainerHigh, color: p.onSurface, boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)" }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px", margin: "0 4px" }}>{t("openFromLink", lang)}</div>
          <div style={{ position: "relative", height: 56, borderRadius: 16, background: p.surfaceContainerHighest, boxShadow: `inset 0 0 0 2px ${ring}`, transition: "box-shadow 160ms" }}>
            <span aria-hidden style={{ position: "absolute", left: 16, top: 17, display: "grid", color: bad ? p.error : focused ? p.primary : p.onSurfaceVariant, transition: "color 160ms" }}>
              <Icon name="link" size={22} />
            </span>
            <input
              ref={field}
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setBad(false);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              aria-label={t("openFromLink", lang)}
              aria-invalid={bad}
              aria-describedby={bad ? "m3e-link-bad" : undefined}
              placeholder={t("designLinkPlaceholder", lang)}
              enterKeyHint="go"
              autoComplete="off"
              spellCheck={false}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", padding: `0 ${link ? 52 : 18}px 0 50px`, border: "none", outline: "none", borderRadius: 16, background: "transparent", color: p.onSurface, font: "inherit", fontSize: 15, fontWeight: 500 }}
            />
            {link && (
              <button
                type="button"
                onClick={() => {
                  setLink("");
                  setBad(false);
                  field.current?.focus();
                }}
                title={t("clear", lang)}
                aria-label={t("clear", lang)}
                className="m3-press"
                style={{ position: "absolute", right: 10, top: 10, width: 36, height: 36, display: "grid", placeItems: "center", border: "none", borderRadius: 18, background: "transparent", color: p.onSurfaceVariant, cursor: "pointer" }}
              >
                <Icon name="close" size={20} />
              </button>
            )}
          </div>
          {bad && (
            <div id="m3e-link-bad" role="alert" style={{ margin: "-6px 6px 0", fontSize: 13, lineHeight: 1.5, color: p.error }}>
              {t("designLinkInvalid", lang)}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} className="m3-press" style={{ height: 40, padding: "0 20px", border: "none", borderRadius: 20, background: "transparent", color: p.primary, font: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              {t("cancel", lang)}
            </button>
            <button type="submit" disabled={!link.trim()} className="m3-press" style={{ height: 40, padding: "0 20px", border: "none", borderRadius: 20, background: p.primary, color: p.onPrimary, font: "inherit", fontSize: 14, fontWeight: 600, cursor: link.trim() ? "pointer" : "default", opacity: link.trim() ? 1 : 0.5 }}>
              {t("openProjectAction", lang)}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/** how long the typing has to pause before the list is filtered by what was typed */
const SEARCH_SETTLE = 320;

type Snack = { id: number; text: string; undo?: () => void };

/** Every project this browser holds: open one, start one, bring one in from a file, and
 *  rename, copy, save or delete what is there. A page of its own, so the editor stays the
 *  editor; it reads the same store and never holds a project open. The app's mark stands in the
 *  corner where the editor has it, and leads back to the editor. */
export function Projects({ mcp = false }: { mcp?: boolean }) {
  const router = useRouter();
  /** the guide to MCP, open over the list, and the control it opened out from. Reached by its
   *  own address, the list comes up with the guide already open. */
  const [guide, setGuide] = useState<{ open: boolean; origin: SheetOrigin }>({ open: mcp, origin: null });
  const closeGuide = () => {
    setGuide((g) => ({ ...g, open: false }));
    /* reached by the guide's own address, the page is the guide's: closing it goes to the list
       proper, so Back does not bring the guide up again and the tab is named for the list */
    if (mcp) router.replace("/projects");
  };
  const reduced = useReducedMotion();
  const [lang, setLang] = useState<Lang | null>(null);
  const [backend, setBackend] = useState<Backend | null>(null);
  const [metas, setMetas] = useState<ProjectMeta[] | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  /** the page's colours: those of the project worked on last, the default purple until there is one */
  const [p, setP] = useState<Palette>(() => paletteOf("purple"));
  const [query, setQuery] = useState("");
  /** what the list was last filtered by; it follows `query` once the typing has paused */
  const [applied, setApplied] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  /** the dialog a link is pasted into is up */
  const [linking, setLinking] = useState(false);
  const [snack, setSnack] = useState<Snack | null>(null);
  const [dropping, setDropping] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement>(null);
  const snackId = useRef(0);
  /** the header has slid out above the window, and the FAB is drawn without its label */
  const [headHidden, setHeadHidden] = useState(false);
  const [fabFolded, setFabFolded] = useState(false);
  const headRef = useRef<HTMLElement>(null);
  /** only a wheel or a finger hides the header; a scroll the keyboard caused leaves it alone */
  const pointerScroll = useRef(false);

  /* The page scrolls the way a screen does in the preview. Scrolling down slides the header
     out and folds the FAB to its icon; any scroll up brings both back. The header also
     stays at the top of the page and while something in it has keyboard focus. */
  useEffect(() => {
    let last = Math.max(0, window.scrollY);
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) pointerScroll.current = true;
    };
    const onTouch = () => {
      pointerScroll.current = true;
    };
    const onEnd = () => {
      pointerScroll.current = false;
    };
    /* not every browser sends `scrollend`: a short silence after the last scroll says the same */
    let quiet = 0;
    const onKey = () => {
      pointerScroll.current = false;
    };
    const onScroll = () => {
      window.clearTimeout(quiet);
      quiet = window.setTimeout(onEnd, 180);
      /* elastic overscroll at either end must not read as a change of direction */
      const top = Math.min(Math.max(0, window.scrollY), Math.max(0, document.documentElement.scrollHeight - window.innerHeight));
      const down = top - last;
      last = top;
      if (down !== 0) setFabFolded(down > 0);
      const focused = headRef.current?.querySelector(":focus-visible");
      if (!pointerScroll.current || focused || top === 0) setHeadHidden(false);
      else if (down !== 0) setHeadHidden(down > 0);
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("scrollend", onEnd);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(quiet);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("scrollend", onEnd);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const say = useCallback((text: string, undo?: () => void) => setSnack({ id: ++snackId.current, text, undo }), []);

  useEffect(() => {
    if (!snack) return;
    const id = setTimeout(() => setSnack((s) => (s?.id === snack.id ? null : s)), snack.undo ? 7000 : 3200);
    return () => clearTimeout(id);
  }, [snack]);

  const refresh = useCallback(async (b: Backend) => {
    setMetas(await listProjects(b));
    setNow(Date.now());
  }, []);

  useEffect(() => {
    let active = true;
    const l = preferredLang();
    setGlobalLang(l);
    setLang(l);
    void (async () => {
      try {
        /* an editor that was just left may still be writing: the list is read after it */
        await writesSettled();
        const b = await openProjects();
        const storage = b.kind === "memory" ? readOnly(smallStorage()) : smallStorage();
        /* a visit that starts here still brings the earlier single document along */
        await adoptLegacy(b, storage);
        const list = await listProjects(b);
        const last = storage.getItem(LAST_KEY);
        /* the page wears the colours of the project worked on last, as the editor did a moment
           ago; each card still shows its own project in that project's colours */
        const worn = list.find((m) => m.id === last) ?? list[0];
        const doc = worn ? await b.doc(worn.id) : null;
        if (!active) return;
        if (doc) setP(lookOf(doc).palette);
        setLastId(last);
        setBackend(b);
        setMetas(list);
        setNow(Date.now());
        if (b.kind === "memory") say(t("storageUnavailable", l));
      } catch {
        /* storage would not answer: an empty list that says so, not a page that never arrives */
        if (!active) return;
        setBackend(memoryBackend());
        setMetas([]);
        say(t("storageUnavailable", l));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /* work an editor of this page could not write is still held here: closing the tab would lose it */
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!hasUnwritten()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /* another tab may have changed the list while this one was in the background */
  useEffect(() => {
    if (!backend) return;
    const onShow = () => {
      if (document.visibilityState === "visible") void refresh(backend);
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [backend, refresh]);

  useEffect(() => {
    if (!lang) return;
    document.documentElement.lang = lang;
    document.body.style.fontFamily = uiFontFamily(lang);
    ensureLangFontLoaded(lang);
  }, [lang]);

  useEffect(() => {
    document.body.style.background = p.surfaceContainerLow;
    document.body.style.color = p.onSurface;
  }, [p.surfaceContainerLow, p.onSurface]);

  const changeLanguage = (next: Lang) => {
    setGlobalLang(next);
    rememberLang(next);
    setLang(next);
  };

  const open = (id: string) => router.push(`/?p=${encodeURIComponent(id)}`);

  /** a new project; one the author never touched is opened again rather than piling up beside another */
  const startNew = async () => {
    if (!backend) return;
    /* asked afresh: the list on screen may be older than what another tab has done since */
    for (const meta of await listProjects(backend)) {
      if (meta.edited || (await openElsewhere(meta.id))) continue;
      open(meta.id);
      return;
    }
    open((await createProject(backend, null)).id);
  };

  const addFiles = async (files: File[]) => {
    if (!backend || !lang || files.length === 0) return;
    let added = 0;
    let present = 0;
    for (const file of files) {
      /* a project file holds one design, a backup of the list holds them all */
      const found = await readDesigns(file);
      if (!found) continue;
      try {
        const done = await restoreBackup(backend, found.entries);
        added += done.added;
        present += done.present;
      } catch {
        /* it did not fit: what was added so far is kept, and the author is told */
        await refresh(backend);
        say(t("saveFailed", lang));
        return;
      }
    }
    await refresh(backend);
    say(added > 1 ? t("projectsAdded", lang).replace("{n}", String(added)) : added === 1 ? t("projectAdded", lang) : present ? t("backupAlreadyHere", lang) : t("invalidProject", lang));
  };
  /** every project into one file: the browser's storage is not a safe place to keep the only copy */
  const exportAll = async () => {
    if (!backend || !lang) return;
    try {
      const backup = await collectBackup(backend);
      if (backup.projects.length === 0) throw new Error("nothing to export");
      saveBackup(backup);
      say(t("exportedAll", lang).replace("{n}", String(backup.projects.length)));
    } catch {
      say(t("exportFailed", lang));
    }
  };
  /** a design that came in a pasted link joins the list, as one from a file does */
  const addDoc = async (doc: Doc) => {
    closeLink();
    if (!backend || !lang) return;
    try {
      await createProject(backend, doc);
      await refresh(backend);
      say(t("projectAdded", lang));
    } catch {
      say(t("saveFailed", lang));
    }
  };
  /** the dialog goes, and the focus returns to the button that opened it */
  const closeLink = () => {
    setLinking(false);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".m3e-proj-trio button:nth-child(2)")?.focus());
  };
  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles;

  const actRef = useRef<(meta: ProjectMeta, action: CardAction) => void>(() => {});
  const onCardAction = useCallback((meta: ProjectMeta, action: CardAction) => actRef.current(meta, action), []);
  const act = async (meta: ProjectMeta, action: CardAction) => {
    if (!backend || !lang) return;
    const name = meta.title || t("untitledProject", lang);
    if (action === "save") {
      const doc = await backend.doc(meta.id);
      if (doc) saveProject({ ...doc, title: doc.title ?? meta.title });
      return;
    }
    if (action === "duplicate") {
      try {
        await duplicateProject(backend, meta.id, t("copyOf", lang).replace("{name}", name));
      } catch {
        /* it did not fit */
        say(t("saveFailed", lang));
      }
      await refresh(backend);
      return;
    }
    /* an editor in another tab would write its own state straight back over the change */
    if (await openElsewhere(meta.id)) {
      say(t("projectOpenElsewhere", lang));
      return;
    }
    if (action === "rename") {
      setRenaming(meta.id);
      return;
    }
    const removed: Project | null = await loadProject(backend, meta.id);
    if (!removed) return;
    try {
      await backend.remove(meta.id);
    } catch {
      say(t("saveFailed", lang));
      return;
    }
    /* nothing an editor still held for it may bring it back */
    forgetUnwritten(meta.id);
    await refresh(backend);
    say(t("projectDeleted", lang).replace("{name}", name), () => {
      void backend.write(removed.meta, { doc: removed.doc, before: removed.before }).then(() => refresh(backend));
      setSnack(null);
    });
  };

  actRef.current = (meta, action) => void act(meta, action);

  const commitName = async (meta: ProjectMeta, name: string | null) => {
    setRenaming(null);
    /* the focus goes back to the card the dialog was opened from */
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-project="${CSS.escape(meta.id)}"] [aria-haspopup="menu"]`)?.focus());
    if (!backend || !lang || name === null || name.trim() === meta.title) return;
    /* an editor may have opened the project while the dialog was up: its next save would undo the name */
    if (await openElsewhere(meta.id)) {
      say(t("projectOpenElsewhere", lang));
      return;
    }
    await renameProject(backend, meta.id, name);
    await refresh(backend);
  };
  const renamed = metas?.find((m) => m.id === renaming) ?? null;

  /* a project file dropped anywhere on the page */
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDropping(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDropping(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDropping(false);
      void addFilesRef.current([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  /* While words are being typed the list stands as a skeleton, and is filtered once the
     typing has paused. An emptied field brings the whole list back at once, and so does
     every change for someone who asked for less motion. */
  const typed = query.trim().toLowerCase();
  const direct = !typed || !!reduced;
  useEffect(() => {
    if (typed === applied) return;
    const id = setTimeout(() => setApplied(typed), direct ? 0 : SEARCH_SETTLE);
    return () => clearTimeout(id);
  }, [typed, applied, direct]);
  const filter = direct ? typed : applied;
  const searching = filter !== typed;

  const matching = useCallback((q: string) => (metas ?? []).filter((m) => !q || m.title.toLowerCase().includes(q)), [metas]);
  const shown = useMemo(() => matching(filter), [matching, filter]);
  /* as many empty cards as there will be projects, so nothing jumps when they arrive */
  const awaited = useMemo(() => Math.min(matching(typed).length || 3, 6), [matching, typed]);

  if (!lang || !backend || !metas) return <Ghost />;

  /** what the list shows: cards, the skeleton of a search, or one of its two blank states */
  const view = searching ? "searching" : metas.length === 0 ? "empty" : shown.length === 0 ? "none" : "list";


  return (
    <LangContext.Provider value={lang}>
      <div
        className="m3e-projects"
        style={{
          background: p.surfaceContainerLow,
          color: p.onSurface,
          ["--proj-bg" as string]: p.surfaceContainerLow,
          /* the empty cards of a search wear the page's own colours */
          ["--skel-surface" as string]: p.surface,
          ["--skel-high" as string]: p.surfaceContainerHigh,
        }}
      >
        {/* about the app at the left end (its mark, its repository, its language), things to
            do at the right (the search joined to the AI button, then the ways to add a project) */}
        {/* the header fades out downwards, so what scrolls under it leaves softly; it slides out
            above the window on the way down the page and back in on the way up, over 200 ms */}
        <header
          ref={headRef}
          className="m3e-proj-head"
          data-hidden={headHidden ? "" : undefined}
          onFocusCapture={() => setHeadHidden(false)}
          style={{ transform: headHidden ? "translateY(-100%)" : undefined, transition: `transform ${reduced ? 0 : 200}ms cubic-bezier(0.2, 0, 0, 1)` }}
        >
          <div className="m3e-proj-head-in">
          <div className="m3e-proj-head-left">
          {/* the app's mark leads back to the project worked on last; pointed at, the layers in
              it turn into the editor's pencil */}
          <Link href="/" title={t("backToEditor", lang)} aria-label={t("backToEditor", lang)} className="m3e-proj-brand m3e-logo-hit m3-press" style={{ color: p.onSurface }}>
            <span style={{ width: 40, height: 40, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
              <LogoSwap p={p} icon="edit" />
            </span>
            <span className="m3e-proj-wordmark">M3E Canvas</span>
          </Link>
          {/* about the app, beside its mark: where its source lives, and the language it speaks */}
          <a href={REPO_URL} target="_blank" rel="noreferrer" title="GitHub" className="m3e-proj-link m3-press" style={{ borderRadius: PAIR_H / 2, background: p.secondaryContainer, color: p.onSecondaryContainer }}>
            <GitHubMark size={18} />
            <span className="m3e-proj-link-label">GitHub</span>
          </a>
          <LangButton p={p} lang={lang} onLang={changeLanguage} />
          </div>
          {/* The header's right end is for doing things. Finding a project and asking an AI for
              one stand together as a connected pair, the field giving up what room it must;
              then the three ways to add a project. */}
          <div className="m3e-proj-head-right">
            <div className="m3e-proj-find">
              <label className="m3e-proj-search" style={{ background: p.surfaceContainerHigh, color: p.onSurfaceVariant }}>
                <Icon name="search" size={20} />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && query && !e.nativeEvent.isComposing) setQuery("");
                  }}
                  placeholder={t("searchProjects", lang)}
                  aria-label={t("searchProjects", lang)}
                  style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: p.onSurface, font: "inherit", fontSize: 14 }}
                />
                {/* the field's own button to empty it; the browser's is hidden in globals.css */}
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      searchRef.current?.focus();
                    }}
                    title={t("clear", lang)}
                    aria-label={t("clear", lang)}
                    className="m3-press"
                    style={{ width: 30, height: 30, marginRight: -9, display: "grid", placeItems: "center", border: "none", borderRadius: 15, background: "transparent", color: p.onSurfaceVariant, cursor: "pointer", flex: "0 0 auto" }}
                  >
                    <Icon name="close" size={18} />
                  </button>
                )}
              </label>
              <AiButton p={p} lang={lang} onOpen={(origin) => setGuide({ open: true, origin })} />
            </div>
            {/* The three ways to add a project as one connected run of icon buttons: from a
                file, from a link, and a new one, which alone wears the theme's colour and ends
                the header over the cards' right edge. The FAB starts a project too; this is a
                second way in. */}
            <div className="m3e-proj-trio">
              {(
                [
                  ["upload_file", "importProject", () => fileRef.current?.click()],
                  ["link", "openFromLink", () => setLinking(true)],
                  ["add", "createProject", () => void startNew()],
                ] as const
              ).map(([icon, label, run], i) => (
                <button
                  key={label}
                  onClick={run}
                  title={t(label, lang)}
                  aria-label={t(label, lang)}
                  className="m3-press"
                  style={{
                    borderRadius: i === 0 ? `${PAIR_H / 2}px ${R_INNER}px ${R_INNER}px ${PAIR_H / 2}px` : i === 2 ? `${R_INNER}px ${PAIR_H / 2}px ${PAIR_H / 2}px ${R_INNER}px` : R_INNER,
                    background: i === 2 ? p.primary : p.secondaryContainer,
                    color: i === 2 ? p.onPrimary : p.onSecondaryContainer,
                  }}
                >
                  <Icon name={icon} size={22} />
                </button>
              ))}
            </div>
          </div>
          </div>
        </header>

        <main className="m3e-proj-main" aria-busy={searching}>
          {/* each state of the list fades in over the one before it */}
          <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.2, ease: EASE }} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {view === "searching" ? (
              <GhostGrid count={awaited} />
            ) : view === "empty" ? (
              <Blank
                p={p}
                icon="draw"
                iconColor={p.onPrimaryContainer}
                title={t("projectsEmptyTitle", lang)}
                body={t("projectsEmptyBody", lang)}
                pieces={[
                  { shape: 1, size: 136, x: 124, y: 92, color: p.primaryContainer, turn: 48 },
                  { shape: 3, size: 58, x: 208, y: 44, color: p.tertiaryContainer, turn: -36 },
                  { shape: 5, size: 46, x: 40, y: 134, color: p.secondaryContainer, turn: 30 },
                  { shape: 4, size: 26, x: 46, y: 36, color: p.secondary, turn: -24 },
                  { shape: 2, size: 20, x: 208, y: 142, color: p.primary, turn: 20 },
                ]}
              >
                {/* what the FAB and the header's file button do, where the eye already is */}
                <BlankButton icon="add" label={t("newProject", lang)} background={p.primary} color={p.onPrimary} radius={`${PAIR_H / 2}px ${R_INNER}px ${R_INNER}px ${PAIR_H / 2}px`} onClick={() => void startNew()} />
                <BlankButton icon="upload_file" label={t("importProject", lang)} background={p.secondaryContainer} color={p.onSecondaryContainer} radius={`${R_INNER}px ${PAIR_H / 2}px ${PAIR_H / 2}px ${R_INNER}px`} onClick={() => fileRef.current?.click()} />
              </Blank>
            ) : view === "none" ? (
              <Blank
                p={p}
                icon="search_off"
                iconColor={p.onSecondaryContainer}
                title={t("noProjectMatches", lang)}
                body={t("noProjectMatchesBody", lang).replace("{query}", query.trim())}
                pieces={[
                  { shape: 4, size: 136, x: 124, y: 92, color: p.secondaryContainer, turn: 60 },
                  { shape: 6, size: 54, x: 40, y: 46, color: p.tertiaryContainer, turn: -40 },
                  { shape: 2, size: 42, x: 210, y: 134, color: p.primaryContainer, turn: 32 },
                  { shape: 0, size: 26, x: 204, y: 38, color: p.secondary, turn: -22 },
                  { shape: 3, size: 20, x: 44, y: 138, color: p.primary, turn: 26 },
                ]}
              >
                <BlankButton
                  icon="close"
                  label={t("clearSearch", lang)}
                  background={p.secondaryContainer}
                  color={p.onSecondaryContainer}
                  radius={PAIR_H / 2}
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                />
              </Blank>
            ) : (
              <>
                {/* what remains only moves into the gap a removed project leaves, keeping its size */}
                <div className="m3e-proj-grid">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {shown.map((meta) => (
                      <motion.div key={meta.id} layout={reduced ? false : "position"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16, ease: EASE }}>
                        <Card meta={meta} backend={backend} p={p} lang={lang} now={now} last={meta.id === lastId && metas.length > 1} onAction={onCardAction} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                {/* where the work is kept, and the way to take a copy of all of it; said only
                    where there is work and a store that keeps it */}
                {backend.kind !== "memory" && metas.some((m) => m.edited) && (
                  <div className="m3e-proj-foot" style={{ color: p.onSurfaceVariant }}>
                    <span aria-hidden style={{ display: "grid", flex: "0 0 auto" }}>
                      <Icon name="hard_drive" size={18} />
                    </span>
                    <span>{t("storedHere", lang)}</span>
                    <button type="button" className="m3-press m3e-proj-foot-btn" onClick={() => void exportAll()} style={{ color: p.primary }}>
                      <Icon name="download" size={18} />
                      {t("exportAll", lang)}
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </main>

        {/* the FAB floats over the list and keeps the list's own margin at its right edge */}
        <div className="m3e-proj-float">
          <div className="m3e-proj-float-in">
            <Fab p={p} label={t("createProject", lang)} folded={fabFolded} onClick={() => void startNew()} />
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void addFiles(files);
          }}
        />

        <McpSheet p={p} lang={lang} open={guide.open} origin={guide.origin} onClose={closeGuide} />

        <AnimatePresence>{linking && <LinkDialog key="link" p={p} lang={lang} onOpen={(doc) => void addDoc(doc)} onClose={closeLink} />}</AnimatePresence>

        <AnimatePresence>{renamed && <RenameDialog key={renamed.id} p={p} lang={lang} meta={renamed} backend={backend} onClose={(name) => void commitName(renamed, name)} />}</AnimatePresence>

        {dropping && (
          <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "grid", placeItems: "center", padding: 24, background: "rgba(0,0,0,0.32)", pointerEvents: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderRadius: 20, background: p.primaryContainer, color: p.onPrimaryContainer, fontSize: 14, fontWeight: 600, boxShadow: "0 12px 40px rgba(0,0,0,0.22)" }}>
              <Icon name="upload_file" size={22} />
              {t("dropToOpen", lang)}
            </div>
          </div>
        )}

        <div aria-live="polite" style={{ position: "fixed", left: 0, right: 0, bottom: 88, zIndex: 70, display: "grid", placeItems: "center", padding: "0 16px", pointerEvents: "none" }}>
          <AnimatePresence>
            {snack && (
              <motion.div
                key={snack.id}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.14 } }}
                transition={{ duration: 0.22, ease: EASE }}
                style={{
                  maxWidth: "min(560px, 100%)",
                  minHeight: 44,
                  padding: snack.undo ? "4px 6px 4px 16px" : "4px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderRadius: 16,
                  background: p.inverseSurface,
                  color: p.inverseOnSurface,
                  fontSize: 14,
                  lineHeight: 1.4,
                  boxShadow: "0 6px 20px rgba(0,0,0,0.22)",
                  pointerEvents: "auto",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>{snack.text}</span>
                {snack.undo && (
                  <button onClick={snack.undo} className="m3-press" style={{ height: 36, padding: "0 12px", border: "none", borderRadius: 18, background: "transparent", color: p.inversePrimary, fontSize: 14, fontWeight: 700, cursor: "pointer", flex: "0 0 auto" }}>
                    {t("undo", lang)}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </LangContext.Provider>
  );
}
