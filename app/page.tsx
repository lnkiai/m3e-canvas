"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion, useSpring } from "motion/react";
import { toPng } from "html-to-image";
import { buildPrompt, effectivePrompt } from "@/lib/prompt";
import {
  Action,
  actionsOf,
  Axis,
  BACK_TARGET,
  baseRadii,
  explodeGroup,
  freeRadii,
  BEZEL,
  canJoin,
  clamp,
  connectSpecOf,
  Doc,
  isPlatform,
  Platform,
  Frame,
  Place,
  AlignKind,
  FramePreset,
  FRAME_GAP,
  FRAME_LABEL_H,
  FrameMode,
  frameOfGroup,
  framePresetPatch,
  frameRadius,
  frameRect,
  frameSizeOf,
  carryItemSize,
  defaultPlatformOf,
  GAP,
  Group,
  groupBounds,
  Item,
  Kind,
  KIND_ORDER,
  KIND_SPEC,
  collapseFree,
  layoutOf,
  lerp,
  makeItem,
  DEFAULT_THEME,
  Theme,
  fontFamilyOf,
  uiFontFamily,
  normalizeTheme,
  setGlobalShape,
  MEASURED,
  NAV_BAR_H,
  Palette,
  paletteOf,
  PHONE_H,
  PHONE_MARGIN,
  PHONE_W,
  PULL_EXP,
  Radii,
  SETTLE_MS,
  sizeOf,
  SNAP_CROSS,
  SNAP_MAIN,
  Transition,
  TRANSITIONS,
  uid,
  uniformRadii,
  FULL_WIDTH,
  fitHeight,
} from "@/lib/tokens";
import { Icon, M3Node, M3Static, MeasuredContent } from "@/components/M3Node";
import { LayersPanel } from "@/components/Layers";
import { FrameInspector, FrameSizePicker, Inspector } from "@/components/Inspector";
import { Preview } from "@/components/Preview";
import { Logo } from "@/components/Logo";
import { PartsPalette } from "@/components/PartsPalette";
import { PromptPanel } from "@/components/PromptPanel";
import { GitHubLink, Mode, Toolbar } from "@/components/Toolbar";
import { LangMenu } from "@/components/Menus";
import { AiActionKey, AiPanel, aiErrorText } from "@/components/AiPanel";
import { TidyState } from "@/components/ui";
import { AiSettings, DEFAULT_AI, hasKey, isSecureUrl, loadAiSettings, proposeBehavior, proposeDescription, pushHistory, saveAiSettings } from "@/lib/ai";
import { barSlotOf, bodyRect, carryFrame, pullInto, tidyFrame } from "@/lib/tidy";
import { isProject, readProject, saveProject } from "@/lib/project";
import { hasShareHash, readShareHash } from "@/lib/share";
import { LoadingIndicator } from "@/components/Loading";
import { draftDesign } from "@/lib/ai";
import { ShareDialog } from "@/components/ShareMenu";
import { ColorPanel } from "@/components/ColorPanel";
import { MotionPanel, ShapePanel, TypePanel } from "@/components/ThemePanel";
import { ThemeContext, ensureFontLoaded, ensureLangFontLoaded } from "@/lib/theme";
import { BottomSheet, MobileActionBar, MobileInspector, MobileLang, MobileSettings } from "@/components/Mobile";
import { ConfirmDialog, IconBtn, Segmented } from "@/components/ui";
import { Lang, LangContext, SEED_TEXT, getLang, isLang, setGlobalLang, t, translateDefaultFrameName, translateDefaultText } from "@/lib/i18n";

/** the screens while a model drafts: primary, tertiary and primary container, drifting */
const DRAFT_GRADIENT = (p: Palette) => `linear-gradient(120deg, ${p.primaryContainer}, ${p.tertiaryContainer}, ${p.primary}, ${p.secondaryContainer}, ${p.primaryContainer})`;
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** the dragged part's own travel: a little lag reads as weight */
const CARRY = {
  type: "spring" as const,
  stiffness: 620,
  damping: 38,
  mass: 0.7,
};
/** the gap opening and the run's counter-shift; identical configs so they cancel */
const OPEN = {
  type: "spring" as const,
  stiffness: 700,
  damping: 42,
  mass: 0.55,
};
const INSTANT = { duration: 0 };

/** the icon rail on the left edge of the parts / layers panel */
const RAIL_W = 52;
const MIN_Z = 0.25;
const MAX_Z = 3;
const HISTORY_MAX = 100;
const DOC_KEY = "m3e:doc";
/** the design a draft or a link replaced, until the author keeps or undoes it */
const BEFORE_KEY = "m3e:doc:before";
const DOC_LOCK = "m3e:doc:editor";
const UI_KEY = "m3e:ui";

type View = { x: number; y: number; z: number };
type Snap = { groupId: string; index: number; pull: number };

/** alignment guide: the snapped position plus the line to draw */
type Guide = { x?: number; y?: number; gx?: number; gy?: number };
const GUIDE_PX = 7;

/** Material's 4dp grid: a coordinate rounded to it, measured from the screen's corner */
const GRID = 4;
const onGrid = (v: number, origin: number) => origin + Math.round((v - origin) / GRID) * GRID;
const FRAME_MARGIN = PHONE_MARGIN;

type DragState = {
  item: Item;
  guide: Guide | null;
  offX: number;
  offY: number;
  startX: number;
  startY: number;
  px: number;
  py: number;
  active: boolean;
  fromPalette: boolean;
  overBin: boolean;
  snap: Snap | null;
  settling: boolean;
};

type Gesture =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | {
      kind: "marquee";
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      moved: boolean;
    }
  | {
      kind: "frame";
      id: string;
      sx: number;
      sy: number;
      fx: number;
      fy: number;
      groups: { id: string; x: number; y: number }[];
      moved: boolean;
    }
  | { kind: "group"; id: string; sx: number; sy: number; gx: number; gy: number; moved: boolean; overBin: boolean };

/** everything in a document apart from its screens and parts */
type DocMeta = Omit<Doc, "groups" | "frames">;
/** an undo step: the screens and parts, plus the rest of the document for steps that replaced it all */
type Snapshot = { groups: Group[]; frames: Frame[]; meta?: DocMeta };

/** a screen changing size eases the way a settling part does */
const SIZE_TRANSITION = `width ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1), height ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1), border-radius ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)`;

function translateSnapshot(snap: Snapshot, lang: Lang): Snapshot {
  return {
    groups: snap.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        label: translateDefaultText(item.label, item.kind, "label", lang),
        ...(item.supporting !== undefined && { supporting: translateDefaultText(item.supporting, item.kind, "supporting", lang) }),
        ...(item.tabs && { tabs: item.tabs.map((tab) => ({ ...tab, label: translateDefaultText(tab.label, item.kind, "tab", lang) })) }),
      })),
    })),
    frames: snap.frames.map((frame) => ({ ...frame, name: translateDefaultFrameName(frame.name, lang) })),
  };
}

const SEED_FRAMES: Frame[] = [{ id: "seedF1", name: "Home", x: 0, y: 0 }];

/** Documents saved before the bars grew their system insets have the navigation
 *  bar flush with the old 80dp bottom; keep it on the bottom edge. */
function migrateGroups(groups: Group[], frames: Frame[]): Group[] {
  const oldNavH = KIND_SPEC.bottomNav.h - NAV_BAR_H;
  return groups.map((g) => {
    if (g.items.length !== 1 || g.items[0].kind !== "bottomNav") return g;
    const f = frames.find((fr) => {
      const r = frameRect(fr);
      return g.x >= r.l - 1 && g.x <= r.r && g.y === r.b - oldNavH;
    });
    return f ? { ...g, y: frameRect(f).b - KIND_SPEC.bottomNav.h } : g;
  });
}

/** Seed ids are deterministic so server and client render the same markup. */
const seed = (lang: Lang = getLang()): Group[] => {
  const text = SEED_TEXT[lang];
  let n = 0;
  const sid = () => `seed${++n}`;
  const mk = (k: Kind) => ({ ...makeItem(k), id: sid() });
  const bar = mk("topAppBar");
  const a = mk("button");
  const b = mk("button");
  a.label = text.favorite;
  a.icon = "star";
  b.label = text.share;
  b.icon = "share";
  b.variant = "tonal";
  const rows = [text.inbox, text.starred, text.archive].map((t, i) => {
    const it = mk("listItem");
    it.label = t;
    it.icon = ["inbox", "star", "archive"][i];
    it.supporting = text.supporting;
    return it;
  });
  const nav = mk("bottomNav");
  const fab = mk("fab");
  return [
    { id: sid(), x: 0, y: 0, axis: "x", items: [bar] },
    { id: sid(), x: PHONE_MARGIN, y: 96, axis: "x", items: [a, b] },
    { id: sid(), x: PHONE_MARGIN, y: 184, axis: "y", items: rows },
    {
      id: sid(),
      x: PHONE_W - 56 - PHONE_MARGIN,
      y: PHONE_H - KIND_SPEC.bottomNav.h - 56 - PHONE_MARGIN,
      axis: "x",
      items: [fab],
    },
    { id: sid(), x: 0, y: PHONE_H - KIND_SPEC.bottomNav.h, axis: "x", items: [nav] },
  ];
};

/** The phone version starts with buttons only: that is all it edits. */
const mobileSeed = (lang: Lang = getLang()): Group[] => {
  const text = SEED_TEXT[lang];
  const mk = (k: Kind) => makeItem(k);
  const a = mk("button");
  const b = mk("button");
  const c = mk("button");
  a.label = text.favorite;
  a.icon = "star";
  b.label = text.share;
  b.icon = "share";
  b.variant = "tonal";
  c.label = text.start;
  c.icon = "arrow_forward";
  return [
    { id: uid(), x: PHONE_MARGIN, y: 120, axis: "x", items: [a, b] },
    { id: uid(), x: PHONE_MARGIN, y: 200, axis: "x", items: [c] },
  ];
};

/** While the model works on a screen, the scheme's colors drift through its bezel. */
function ThinkingRing({ p, frame }: { p: Palette; frame: Frame }) {
  const still = useReducedMotion();
  const { w: frameW, h: frameH } = frameSizeOf(frame);
  const w = frameW + BEZEL * 2;
  const h = frameH + BEZEL * 2;
  const d = Math.ceil(Math.hypot(w, h)) + 80;
  const stops = [p.primary, p.tertiaryContainer, p.inversePrimary, p.secondaryContainer, p.primaryContainer, p.primary];
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <motion.div
        animate={still ? undefined : { rotate: 360 }}
        transition={{ repeat: Infinity, duration: 3.2, ease: "linear" }}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: d,
          height: d,
          marginLeft: -d / 2,
          marginTop: -d / 2,
          background: `conic-gradient(from 0deg, ${stops.join(", ")})`,
          filter: "blur(22px)",
        }}
      />
    </motion.div>
  );
}

type LeftTab = "parts" | "layers" | "color" | "shape" | "type" | "motion" | "ai";
/** the left rail: parts and layers, then the four theme axes of the whole design */
const LEFT_TABS: { key: LeftTab; icon: string; title: "parts" | "layers" | "colors" | "shape" | "typography" | "motion" | "ai" }[] = [
  { key: "parts", icon: "add_box", title: "parts" },
  { key: "layers", icon: "layers", title: "layers" },
  { key: "color", icon: "palette", title: "colors" },
  { key: "shape", icon: "rounded_corner", title: "shape" },
  { key: "type", icon: "text_fields", title: "typography" },
  { key: "motion", icon: "animation", title: "motion" },
  { key: "ai", icon: "auto_awesome", title: "ai" },
];

export default function Page() {
  /* ---------- document ---------- */
  const [editAccess, setEditAccess] = useState<"checking" | "editable" | "readonly">("checking");
  const [groups, setGroups] = useState<Group[]>(seed);
  const [frames, setFrames] = useState<Frame[]>(SEED_FRAMES);
  const [paletteKey, setPaletteKey] = useState("purple");
  const [customPalette, setCustomPalette] = useState<Palette | null>(null);
  const [dynamicColor, setDynamicColor] = useState(false);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const patchTheme = (patch: Partial<Theme>) => setTheme((t) => ({ ...t, ...patch }));
  const [frame, setFrame] = useState<FrameMode>("phone");
  const [lang, setLang] = useState<Lang>("ja");
  const changeLanguage = (next: Lang) => {
    setGlobalLang(next);
    initialLangRef.current = next;
    setLang(next);
    const translated = translateSnapshot({ groups: groupsRef.current, frames: framesRef.current }, next);
    const tidy = tidyRef.current;
    if (tidy) {
      tidyRef.current = tidy.after === groupsRef.current ? {
        ...tidy,
        before: translateSnapshot({ groups: tidy.before, frames: framesRef.current }, next).groups,
        after: translated.groups,
      } : null;
    }
    setGroups(translated.groups);
    setFrames(translated.frames);
    pastRef.current = pastRef.current.map((snap) => translateSnapshot(snap, next));
    futureRef.current = futureRef.current.map((snap) => translateSnapshot(snap, next));
  };
  const [isMobile, setIsMobile] = useState(false);
  const [sheet, setSheet] = useState<"edit" | "settings" | "lang" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  /** frame being rendered offscreen for the PNG export */
  const [exportFrame, setExportFrame] = useState<Frame | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [promptEdit, setPromptEdit] = useState<string | undefined>(undefined);
  /** the author's explicit target; null follows the screens (web once a desktop screen exists) */
  const [platform, setPlatform] = useState<Platform | null>(null);
  /** a project file waiting for the author to confirm replacing the canvas */
  const [pendingImport, setPendingImport] = useState<Doc | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  /** the idea typed into the "ask an AI" dialog; kept here so a failed draft does not lose it */
  const [ideaText, setIdeaText] = useState("");
  /** a model is drafting a design right now */
  const [draftBusy, setDraftBusy] = useState(false);
  /** the design a draft replaced, kept until the author keeps or undoes the draft */
  const [draftBefore, setDraftBefore] = useState<Doc | null>(null);
  const draftBeforeRef = useRef<Doc | null>(null);
  draftBeforeRef.current = draftBefore;
  /** true for the moment after a design arrives, so its colours ease over */
  const [revealing, setRevealing] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
  }, []);
  const guideRef = useRef<string | null>(null);

  /* ---------- editor ui ---------- */
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 });
  /** Keep the server-rendered world hidden until its first fit has completed. */
  const [viewReady, setViewReady] = useState(false);
  /** screens ease to their new place and size for a moment after one changes size */
  const [easing, setEasing] = useState(false);
  /** the canvas transform eases while the camera glides to or from a screen */
  const [cameraEasing, setCameraEasing] = useState(false);
  const [mode, setMode] = useState<Mode>("select");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftW, setLeftW] = useState(RAIL_W + 268);
  const [leftTab, setLeftTab] = useState<LeftTab>("parts");
  /** pointer over the collapsed rail: the logo becomes the open button */
  const [railHover, setRailHover] = useState(false);
  /** the screen whose layers are listed when nothing on a screen is selected */
  const [layersFrameId, setLayersFrameId] = useState<string | null>(null);
  const [rightW, setRightW] = useState(320);
  const [rightTab, setRightTab] = useState<"edit" | "prompt">("edit");
  const [favorites, setFavorites] = useState<Kind[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [resizing, setResizing] = useState<"left" | "right" | null>(null);
  const [, bumpHistory] = useState(0);
  /* ---------- tidy and ai ---------- */
  /** the groups before and after the last tidy; "undo" is offered only while the after-state is still current */
  const tidyRef = useRef<{ frameId: string; before: Group[]; after: Group[] } | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI);
  const [aiBusy, setAiBusy] = useState(false);
  /** the screen the model is working on, which wears the animated ring meanwhile */
  const [aiFrameId, setAiFrameId] = useState<string | null>(null);
  /** the "applied" confirmation beside the tidy button */
  const [aiNote, setAiNote] = useState<{ text: string; icon: string } | null>(null);
  const projectFileRef = useRef<HTMLInputElement>(null);
  const aiNoteTimer = useRef<number | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  const p = paletteOf(paletteKey, customPalette, theme);
  /* corner helpers read the shape scale outside React; keep it current before anything renders */
  setGlobalShape(theme.shape);

  const canvasRef = useRef<HTMLDivElement>(null);
  const measureEls = useRef<Map<string, HTMLElement>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const pendingRef = useRef<{ timer: number; commit: () => void } | null>(null);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const viewRef = useRef(view);
  viewRef.current = view;
  const leftOpenRef = useRef(leftOpen);
  leftOpenRef.current = leftOpen;
  const leftWRef = useRef(leftW);
  leftWRef.current = leftW;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const spaceRef = useRef(spaceHeld);
  spaceRef.current = spaceHeld;
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const mobileRef = useRef(isMobile);
  mobileRef.current = isMobile;
  /** active touch points, for pinch zoom */
  const touchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    d0: number;
    z0: number;
    mx: number;
    my: number;
    vx: number;
    vy: number;
  } | null>(null);
  /** groups that must reposition without animating on the next render */
  const instantRef = useRef<Set<string>>(new Set());
  const loadedRef = useRef(false);
  const initialLangRef = useRef<Lang>("ja");
  /** A saved document or the first viewport initialization prevents later reseeding. */
  const hadDocRef = useRef(false);

  /* ---------- history ---------- */
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const lastPatchRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });

  const snapshot = useCallback((withMeta = false) => {
    setQuickUndo(false);
    pastRef.current.push(current(withMeta));
    if (pastRef.current.length > HISTORY_MAX) pastRef.current.shift();
    futureRef.current = [];
    bumpHistory((v) => v + 1);
  }, []);

  /** consecutive edits of the same field collapse into one undo step */
  const snapshotFor = useCallback(
    (key: string) => {
      const now = Date.now();
      const last = lastPatchRef.current;
      if (last.key !== key || now - last.at > 800) snapshot();
      lastPatchRef.current = { key, at: now };
    },
    [snapshot],
  );

  const restore = (snap: Snapshot) => {
    for (const g of snap.groups) instantRef.current.add(g.id);
    if (snap.meta) {
      applyDoc({ ...snap.meta, groups: snap.groups, frames: snap.frames }, true);
      if (!mobileRef.current) {
        const mode = snap.meta.frame === "blank" ? "blank" : "phone";
        setFrame(mode);
        frameRef.current = mode;
      }
    } else {
      setGroups(snap.groups);
      setFrames(snap.frames);
    }
    bumpHistory((v) => v + 1);
  };

  /** the current step as a snapshot; `withMeta` when the step being crossed replaced the whole document */
  const current = (withMeta: boolean): Snapshot => {
    const { groups: _g, frames: _f, ...meta } = docRef.current;
    return { groups: groupsRef.current, frames: framesRef.current, meta: withMeta ? meta : undefined };
  };

  const undo = useCallback(() => {
    setQuickUndo(false);
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(current(!!prev.meta));
    restore(prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(current(!!next.meta));
    restore(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    instantRef.current.clear();
  });

  /* ---------- persistence ---------- */
  useEffect(() => {
    /* The first tab keeps this promise pending for its lifetime. Later tabs get
       `null` immediately and stay read-only until they are reloaded. Where the
       browser has no locks (an insecure origin, an old WebKit) the editor works
       as it always did, without the guard. */
    if (!navigator.locks) {
      setEditAccess("editable");
      return;
    }
    let active = true;
    let releaseLock: (() => void) | undefined;
    /* Wait until React has finished its development-only effect replay. This
       prevents the discarded setup from briefly competing with the real one. */
    queueMicrotask(() => {
      if (!active) return;
      void navigator.locks
        .request(DOC_LOCK, { ifAvailable: true }, async (lock) => {
          if (!active) return;
          if (!lock) {
            setEditAccess("readonly");
            return;
          }
          setEditAccess("editable");
          await new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
        })
        .catch(() => {
          if (active) setEditAccess("editable");
        });
    });
    return () => {
      active = false;
      releaseLock?.();
    };
  }, []);

  /** Puts a stored or opened document into the editor. Fields a partial document
   *  leaves out keep their current value, or go back to the default when `reset`. */
  const applyDoc = (doc: Partial<Doc>, reset: boolean) => {
    const frames = Array.isArray(doc.frames) ? doc.frames : framesRef.current;
    if (Array.isArray(doc.groups)) setGroups(migrateGroups(doc.groups, frames));
    if (Array.isArray(doc.frames)) setFrames(doc.frames);
    if (typeof doc.paletteKey === "string" && doc.paletteKey) setPaletteKey(doc.paletteKey);
    else if (reset) setPaletteKey("purple");
    if (doc.customPalette && typeof doc.customPalette.primary === "string") setCustomPalette(doc.customPalette);
    else if (reset) setCustomPalette(null);
    if (typeof doc.dynamicColor === "boolean") setDynamicColor(doc.dynamicColor);
    else if (reset) setDynamicColor(false);
    if (doc.theme && typeof doc.theme === "object") setTheme(normalizeTheme(doc.theme));
    else if (reset) setTheme(normalizeTheme(undefined));
    if (typeof doc.title === "string") setTitle(doc.title);
    else if (reset) setTitle("");
    if (typeof doc.brief === "string") setBrief(doc.brief);
    else if (reset) setBrief("");
    if (typeof doc.promptEdit === "string") setPromptEdit(doc.promptEdit);
    else if (reset) setPromptEdit(undefined);
    if (isPlatform(doc.platform)) setPlatform(doc.platform);
    else if (reset) setPlatform(null);
  };

  useEffect(() => {
    // React's development double-run would otherwise read back its own first save
    if (loadedRef.current) return;
    try {
      const d = localStorage.getItem(DOC_KEY);
      if (d) {
        hadDocRef.current = true;
        applyDoc(JSON.parse(d) as Partial<Doc>, false);
        // frame mode is decided by the device (media-query effect), not restored
      }
      const before = d ? localStorage.getItem(BEFORE_KEY) : null;
      if (!d) localStorage.removeItem(BEFORE_KEY);
      if (before) {
        const value: unknown = JSON.parse(before);
        if (isProject(value)) setDraftBefore(value);
        else localStorage.removeItem(BEFORE_KEY);
      }
      let initialLang: Lang = "ja";
      const u = localStorage.getItem(UI_KEY);
      if (u) {
        const ui = JSON.parse(u);
        if (ui.view) setView(ui.view);
        if (typeof ui.leftOpen === "boolean") setLeftOpen(ui.leftOpen);
        if (typeof ui.rightOpen === "boolean") setRightOpen(ui.rightOpen);
        if (ui.leftW) setLeftW(Math.max(RAIL_W + 244, ui.leftW));
        if (ui.rightW) setRightW(ui.rightW);
        if (Array.isArray(ui.favorites)) setFavorites(ui.favorites);
        if (ui.mode) setMode(ui.mode);
        if (isLang(ui.lang)) {
          initialLang = ui.lang;
          setLang(ui.lang);
        }
      } else {
        const nl = (navigator.language ?? "").toLowerCase();
        initialLang = nl.startsWith("zh") ? "zh" : nl.startsWith("ko") ? "ko" : nl.startsWith("ja") ? "ja" : "en";
        setLang(initialLang);
        queueMicrotask(() => fitRef.current());
      }
      setGlobalLang(initialLang);
      initialLangRef.current = initialLang;
      if (!d) {
        setGroups(seed(initialLang));
        setFrames([{ ...SEED_FRAMES[0], name: t("home", initialLang) }]);
      }
    } catch {}
    setAiSettings(loadAiSettings());
    loadedRef.current = true;
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    /* the editor's own text and the parts both pick up the language's Noto face */
    document.body.style.fontFamily = uiFontFamily(lang);
    ensureLangFontLoaded(lang, () => setWidths({}));
  }, [lang]);

  useEffect(() => {
    /* an empty width map makes every measured part read its width again in the new face */
    ensureFontLoaded(theme.font, () => setWidths({}));
  }, [theme.font]);

  /* the page background outside the app root follows the scheme, so dark mode has no white edges */
  useEffect(() => {
    document.body.style.background = p.surface;
    document.body.style.color = p.onSurface;
  }, [p.surface, p.onSurface]);

  /* in-app browsers size the page behind their own toolbars and may ignore dvh,
     so the measured inner height wins over the CSS height (innerHeight, not the
     visual viewport, so pinch-zoom and the keyboard leave the layout alone) */
  useEffect(() => {
    const apply = () => {
      const h = Math.round(window.innerHeight);
      if (h > 0) document.documentElement.style.setProperty("--app-h", `${h}px`);
    };
    /* in-app browsers (X, Instagram, LINE...) keep their own action bar over the
       page bottom, so the controls sit one button higher there. App names in the
       user agent are unreliable; the embedded web view itself is not: iOS web
       views omit the Safari token and Android ones carry "wv" */
    const ua = navigator.userAgent;
    const iosWebView = /iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua);
    const androidWebView = /Android/.test(ua) && /(?:^|\W)wv(?:\W|$)/.test(ua);
    if (iosWebView || androidWebView || /Twitter|Instagram|FBAN|FBAV|Line\//i.test(ua)) {
      document.documentElement.style.setProperty("--bottom-ui", "64px");
    }
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  /* everyone works on phone screens; a phone gets one fixed screen and the select tool only */
  useEffect(() => {
    const mq = window.matchMedia(
      "(max-width: 840px), (pointer: coarse) and (max-width: 1024px)",
    );
    const apply = () => {
      const m = mq.matches;
      setIsMobile(m);
      mobileRef.current = m;
      if (m) {
        setMode("select");
        setSheet(null);
        if (!hadDocRef.current) {
          hadDocRef.current = true;
          setGroups(mobileSeed(initialLangRef.current));
          setFrames([{ id: uid(), name: t("home", initialLangRef.current), x: 0, y: 0 }]);
        }
      }
      hadDocRef.current = true;
      if (frameRef.current !== "phone") {
        setFrame("phone");
        frameRef.current = "phone";
      }
      ensureFrameRef.current();
      queueMicrotask(() => {
        fitRef.current();
        setViewReady(true);
      });
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!loadedRef.current || editAccess !== "editable") return;
    try {
      localStorage.setItem(
        DOC_KEY,
        JSON.stringify({ groups, frames, paletteKey, frame, title, brief, promptEdit, platform: platform ?? undefined, customPalette: customPalette ?? undefined, dynamicColor, theme }),
      );
    } catch {}
  }, [editAccess, groups, frames, paletteKey, frame, title, brief, promptEdit, platform, customPalette, dynamicColor, theme]);

  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      localStorage.setItem(
        UI_KEY,
        JSON.stringify({
          view,
          leftOpen,
          rightOpen,
          leftW,
          rightW,
          favorites,
          mode,
          lang,
        }),
      );
    } catch {}
  }, [
    view,
    leftOpen,
    rightOpen,
    leftW,
    rightW,
    favorites,
    mode,
    lang,
  ]);

  /* ---------- measurement (text-sized kinds) ---------- */
  const allItems = useMemo(() => {
    const map = new Map<string, Item>();
    for (const g of groups) for (const it of g.items) map.set(it.id, it);
    if (drag) map.set(drag.item.id, drag.item);
    return [...map.values()];
  }, [groups, drag]);

  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    measureEls.current.forEach((el, id) => {
      next[id] = Math.ceil(el.getBoundingClientRect().width);
    });
    const keys = Object.keys(next);
    const changed =
      keys.length !== Object.keys(widthsRef.current).length ||
      keys.some((k) => widthsRef.current[k] !== next[k]);
    if (changed) setWidths(next);
  });

  useEffect(() => {
    const refreshWidths = () => setWidths({});
    document.fonts?.ready.then(refreshWidths);
    document.fonts?.addEventListener("loadingdone", refreshWidths);
    return () => document.fonts?.removeEventListener("loadingdone", refreshWidths);
  }, []);

  const sizeRef = useCallback((it: Item) => sizeOf(it, widthsRef.current), []);
  const alongRef = useCallback(
    (it: Item, axis: Axis) => (axis === "x" ? sizeRef(it).w : sizeRef(it).h),
    [sizeRef],
  );
  const prefixOf = useCallback(
    (g: Group, k: number) =>
      g.items.slice(0, k).reduce((s, it) => s + alongRef(it, g.axis) + GAP, 0),
    [alongRef],
  );

  /* ---------- coordinates ---------- */
  const canvasRect = () => canvasRef.current?.getBoundingClientRect();
  const toWorld = (clientX: number, clientY: number) => {
    const r = canvasRect();
    const v = viewRef.current;
    return {
      x: (clientX - (r?.left ?? 0) - v.x) / v.z,
      y: (clientY - (r?.top ?? 0) - v.y) / v.z,
    };
  };
  const inBin = (clientX: number) =>
    !mobileRef.current && clientX >= 0 && clientX <= (leftOpenRef.current ? leftWRef.current : RAIL_W);

  const setZoomAt = useCallback((nz: number, cx?: number, cy?: number) => {
    const r = canvasRect();
    const v = viewRef.current;
    const z = clamp(nz, MIN_Z, MAX_Z);
    const px = cx === undefined ? (r?.width ?? 0) / 2 : cx - (r?.left ?? 0);
    const py = cy === undefined ? (r?.height ?? 0) / 2 : cy - (r?.top ?? 0);
    setView({
      x: px - ((px - v.x) * z) / v.z,
      y: py - ((py - v.y) * z) / v.z,
      z,
    });
  }, []);

  const fit = useCallback(() => {
    const r = canvasRect();
    if (!r) return;
    const gs = groupsRef.current;
    let x0 = -BEZEL;
    let y0 = -BEZEL - FRAME_LABEL_H;
    let x1 = PHONE_W + BEZEL;
    let y1 = PHONE_H + BEZEL;
    const fs = framesRef.current;
    if (frameRef.current === "phone" && fs.length > 0) {
      x0 = Math.min(...fs.map((f) => f.x)) - BEZEL;
      y0 = Math.min(...fs.map((f) => f.y)) - BEZEL - FRAME_LABEL_H;
      x1 = Math.max(...fs.map((f) => frameRect(f).r)) + BEZEL;
      y1 = Math.max(...fs.map((f) => frameRect(f).b)) + BEZEL;
    }
    if (frameRef.current === "blank") {
      if (gs.length === 0) {
        setView({ x: 48, y: 48, z: 1 });
        return;
      }
      x0 = Infinity;
      y0 = Infinity;
      x1 = -Infinity;
      y1 = -Infinity;
      for (const g of gs) {
        for (const pl of layoutOf(g, widthsRef.current)) {
          x0 = Math.min(x0, pl.x);
          y0 = Math.min(y0, pl.y);
          x1 = Math.max(x1, pl.x + pl.w);
          y1 = Math.max(y1, pl.y + pl.h);
        }
      }
    }
    const mobile = mobileRef.current;
    const pad = mobile ? 14 : 40;
    const top = mobile ? 96 : 84; // keep the floating toolbar clear of the frame
    const bottom = mobile ? 96 : pad;
    if (mobile) {
      // a phone zooms to the screen's width and starts at its top; the rest scrolls
      const z = clamp((r.width - pad * 2) / (x1 - x0), MIN_Z, MAX_Z);
      setView({ x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: top - y0 * z, z });
      return;
    }
    const z = clamp(
      Math.min(
        (r.width - pad * 2) / (x1 - x0),
        (r.height - top - bottom) / (y1 - y0),
        1,
      ),
      MIN_Z,
      MAX_Z,
    );
    setView({
      x: (r.width - (x1 - x0) * z) / 2 - x0 * z,
      y: top + (r.height - top - bottom - (y1 - y0) * z) / 2 - y0 * z,
      z,
    });
  }, []);
  const fitRef = useRef(fit);
  fitRef.current = fit;

  /* touch: two fingers pinch-zoom and pan, cancelling whatever one finger started */
  const onTouchCapture = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchesRef.current.size === 2) {
      const [a, b] = [...touchesRef.current.values()];
      const v = viewRef.current;
      pinchRef.current = {
        d0: Math.hypot(a.x - b.x, a.y - b.y),
        z0: v.z,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
        vx: v.x,
        vy: v.y,
      };
      dragRef.current = null;
      setDrag(null);
      setPressedId(null);
      gestureRef.current = null;
      setGesture(null);
    }
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !touchesRef.current.has(e.pointerId))
        return;
      touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pinch = pinchRef.current;
      if (!pinch || touchesRef.current.size < 2) return;
      const [a, b] = [...touchesRef.current.values()];
      const r = canvasRef.current?.getBoundingClientRect();
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const z = clamp((pinch.z0 * d) / Math.max(1, pinch.d0), MIN_Z, MAX_Z);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const px = pinch.mx - (r?.left ?? 0);
      const py = pinch.my - (r?.top ?? 0);
      setView({
        x: px - ((px - pinch.vx) * z) / pinch.z0 + (mx - pinch.mx),
        y: py - ((py - pinch.vy) * z) / pinch.z0 + (my - pinch.my),
        z,
      });
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touchesRef.current.delete(e.pointerId);
      if (touchesRef.current.size < 2) pinchRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  /* wheel: pan, or zoom with ctrl / pinch */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        setZoomAt(
          viewRef.current.z * Math.exp(-e.deltaY * 0.0022),
          e.clientX,
          e.clientY,
        );
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoomAt]);

  /* ---------- rest positions and the magnet ---------- */
  const restPos = useCallback(
    (g: Group, k: number, sz: { w: number; h: number }) =>
      g.axis === "x"
        ? { left: k === 0 ? g.x - sz.w - GAP : g.x + prefixOf(g, k), top: g.y }
        : { left: g.x, top: k === 0 ? g.y - sz.h - GAP : g.y + prefixOf(g, k) },
    [prefixOf],
  );

  /** Nearest slot inside the magnetic field with an attraction that ramps
   *  from 0 at the edge to 1 on target. A part only fuses with its own kind. */
  const findSnap = useCallback(
    (item: Item, left: number, top: number): Snap | null => {
      const spec = connectSpecOf(item);
      if (!spec) return null;
      const sz = sizeRef(item);
      let best: Snap | null = null;
      let bestD = 1;
      for (const g of groupsRef.current) {
        if (g.free || g.axis !== spec.axis || !g.items[0] || !canJoin(g.items[0], item))
          continue;
        for (let k = 0; k <= g.items.length; k++) {
          const r = restPos(g, k, sz);
          const dx = left - r.left;
          const dy = top - r.top;
          const nMain = (spec.axis === "x" ? dx : dy) / SNAP_MAIN;
          const nCross = (spec.axis === "x" ? dy : dx) / SNAP_CROSS;
          if (Math.abs(nMain) >= 1 || Math.abs(nCross) >= 1) continue;
          const d = Math.hypot(nMain, nCross);
          if (d < bestD) {
            bestD = d;
            best = { groupId: g.id, index: k, pull: Math.pow(1 - d, PULL_EXP) };
          }
        }
      }
      return best;
    },
    [restPos, sizeRef],
  );

  const sx = useSpring(0, CARRY);
  const sy = useSpring(0, CARRY);

  /** Canva-style alignment: edges and centres of neighbours and of the frame
   *  pull the part gently into line and draw a guide while they do. */
  const findGuide = useCallback(
    (item: Item, left: number, top: number): Guide | null => {
      const sz = sizeRef(item);
      const tol = GUIDE_PX / viewRef.current.z;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const g of groupsRef.current) {
        for (const pl of layoutOf(g, widthsRef.current)) {
          if (pl.item.id === item.id) continue;
          xs.push(pl.x, pl.x + pl.w / 2, pl.x + pl.w);
          ys.push(pl.y, pl.y + pl.h / 2, pl.y + pl.h);
        }
      }
      if (frameRef.current === "phone") {
        for (const f of framesRef.current) {
          const { w, h } = frameSizeOf(f);
          xs.push(
            f.x,
            f.x + FRAME_MARGIN,
            f.x + w / 2,
            f.x + w - FRAME_MARGIN,
            f.x + w,
          );
          ys.push(
            f.y,
            f.y + FRAME_MARGIN,
            f.y + h / 2,
            f.y + h - FRAME_MARGIN,
            f.y + h,
          );
        }
      }
      const mine = (pos: number, len: number) => [
        pos,
        pos + len / 2,
        pos + len,
      ];
      let best: Guide = {};
      let bx = tol;
      for (const c of xs)
        for (const m of mine(left, sz.w)) {
          const d = Math.abs(c - m);
          if (d < bx) {
            bx = d;
            best = { ...best, x: left + (c - m), gx: c };
          }
        }
      let by = tol;
      for (const c of ys)
        for (const m of mine(top, sz.h)) {
          const d = Math.abs(c - m);
          if (d < by) {
            by = d;
            best = { ...best, y: top + (c - m), gy: c };
          }
        }
      return best.x === undefined && best.y === undefined ? null : best;
    },
    [sizeRef],
  );

  /* ---------- pointer: parts ---------- */
  const flushPending = useCallback(() => {
    const pend = pendingRef.current;
    if (!pend) return;
    clearTimeout(pend.timer);
    pendingRef.current = null;
    pend.commit();
  }, []);
  useEffect(() => () => flushPending(), [flushPending]);

  const startPan = (clientX: number, clientY: number) => {
    const g: Gesture = {
      kind: "pan",
      sx: clientX,
      sy: clientY,
      vx: viewRef.current.x,
      vy: viewRef.current.y,
    };
    gestureRef.current = g;
    setGesture(g);
  };

  const onItemPointerDown = (
    e: React.PointerEvent,
    g: Group,
    index: number,
    item: Item,
  ) => {
    if (e.button === 1 || modeRef.current === "hand" || spaceRef.current) {
      e.preventDefault();
      e.stopPropagation();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    flushPending();
    if (g.free) {
      setSelectedIds((cur) => (e.shiftKey ? [...cur.filter((x) => !g.items.some((it) => it.id === x)), ...g.items.map((it) => it.id)] : g.items.map((it) => it.id)));
      setSelectedFrameId(null);
      setSelectedLinkId(null);
      setRightTab("edit");
      const gg: Gesture = { kind: "group", id: g.id, sx: e.clientX, sy: e.clientY, gx: g.x, gy: g.y, moved: false, overBin: false };
      gestureRef.current = gg;
      setGesture(gg);
      return;
    }
    const pt = toWorld(e.clientX, e.clientY);
    const off = prefixOf(g, index);
    const left = g.axis === "x" ? g.x + off : g.x;
    const top = g.axis === "x" ? g.y : g.y + off;
    sx.jump(left);
    sy.jump(top);
    setSelectedIds((cur) =>
      e.shiftKey ? [...cur.filter((x) => x !== item.id), item.id] : [item.id],
    );
    setSelectedFrameId(null);
    setSelectedLinkId(null);
    setRightTab("edit");
    setPressedId(item.id);
    const d: DragState = {
      item,
      offX: pt.x - left,
      offY: pt.y - top,
      startX: pt.x,
      startY: pt.y,
      px: pt.x,
      py: pt.y,
      active: false,
      fromPalette: false,
      overBin: false,
      snap: null,
      settling: false,
      guide: null,
    };
    dragRef.current = d;
    setDrag({ ...d });
  };

  const onPartPointerDown = (e: React.PointerEvent, kind: Kind) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    flushPending();
    const item = makeItem(kind);
    const pt = toWorld(e.clientX, e.clientY);
    const sz = sizeOf(item, widthsRef.current);
    const offX = Math.min(sz.w / 2, 90);
    const offY = Math.min(sz.h / 2, 40);
    sx.jump(pt.x - offX);
    sy.jump(pt.y - offY);
    setSelectedIds([item.id]);
    setRightTab("edit");
    const d: DragState = {
      item,
      offX,
      offY,
      startX: pt.x,
      startY: pt.y,
      px: pt.x,
      py: pt.y,
      active: true,
      fromPalette: true,
      overBin: false,
      snap: null,
      settling: false,
      guide: null,
    };
    dragRef.current = d;
    setDrag({ ...d });
  };

  const isDragging = drag !== null;

  useEffect(() => {
    if (!isDragging) return;

    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const pt = toWorld(e.clientX, e.clientY);
      d.px = pt.x;
      d.py = pt.y;

      if (!d.active) {
        if (
          Math.hypot(pt.x - d.startX, pt.y - d.startY) * viewRef.current.z <
          5
        ) {
          setDrag({ ...d });
          return;
        }
        d.active = true;
        d.snap = null;
        const id = d.item.id;
        snapshot();
        setGroups((prev) => {
          const out: Group[] = [];
          for (const g of prev) {
            const idx = g.items.findIndex((it) => it.id === id);
            if (idx < 0) {
              out.push(g);
              continue;
            }
            const rest = g.items.filter((it) => it.id !== id);
            if (rest.length === 0) continue;
            const sz = sizeOf(g.items[idx], widthsRef.current);
            const back = idx === 0;
            // The anchor moves to the new first item; that jump must not animate,
            // otherwise the remaining run springs sideways for a frame.
            if (back) instantRef.current.add(g.id);
            out.push({
              ...g,
              x: back && g.axis === "x" ? g.x + sz.w + GAP : g.x,
              y: back && g.axis === "y" ? g.y + sz.h + GAP : g.y,
              items: rest,
            });
          }
          return out;
        });
        setPressedId(null);
        setDrag({ ...d });
        return;
      }

      d.overBin = inBin(e.clientX);
      d.snap = d.overBin
        ? null
        : findSnap(d.item, pt.x - d.offX, pt.y - d.offY);
      d.guide =
        d.overBin || d.snap
          ? null
          : findGuide(d.item, pt.x - d.offX, pt.y - d.offY);
      setDrag({ ...d });
    };

    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setPressedId(null);
      if (!d) return;
      if (!d.active) {
        setDrag(null);
        return;
      }

      const item = d.item;
      const sz = sizeRef(item);

      if (d.overBin) {
        setSelectedIds((cur) => cur.filter((x) => x !== item.id));
        setDrag(null);
        return;
      }

      if (d.snap) {
        const t = d.snap;
        setDrag({ ...d, snap: { ...t, pull: 1 }, settling: true });
        const commit = () => {
          setGroups((prev) => {
            if (prev.some((g) => g.items.some((it) => it.id === item.id)))
              return prev;
            return prev.map((g) => {
              if (g.id !== t.groupId) return g;
              const front = t.index === 0;
              return {
                ...g,
                x: front && g.axis === "x" ? g.x - sz.w - GAP : g.x,
                y: front && g.axis === "y" ? g.y - sz.h - GAP : g.y,
                items: [
                  ...g.items.slice(0, t.index),
                  item,
                  ...g.items.slice(t.index),
                ],
              };
            });
          });
          setDrag(null);
        };
        const timer = window.setTimeout(() => {
          pendingRef.current = null;
          commit();
        }, SETTLE_MS);
        pendingRef.current = { timer, commit };
        return;
      }

      const rect = canvasRect();
      const v = viewRef.current;
      const rawX = d.guide?.x ?? d.px - d.offX;
      const rawY = d.guide?.y ?? d.py - d.offY;
      const screenL = (rawX + sz.w) * v.z + v.x;
      const screenT = (rawY + sz.h) * v.z + v.y;
      const screenR = rawX * v.z + v.x;
      const screenB = rawY * v.z + v.y;
      const cw = rect?.width ?? 0;
      const ch = rect?.height ?? 0;
      if (
        d.fromPalette &&
        (screenL < 0 || screenT < 0 || screenR > cw || screenB > ch)
      ) {
        setSelectedIds((cur) => cur.filter((x) => x !== item.id));
        setDrag(null);
        return;
      }
      if (d.fromPalette) snapshot();
      const targetFrame =
        frameRef.current === "phone"
          ? framesRef.current.find((f) => {
              const r = frameRect(f);
              const cx = rawX + sz.w / 2;
              const cy = rawY + sz.h / 2;
              return cx >= r.l && cx <= r.r && cy >= r.t && cy <= r.b;
            })
          : undefined;
      /* a bar spans the screen it lands on, beside its rail; any other part keeps its phone-sized
       * default (a list or a field as wide as a desktop is rarely what the author means), but no
       * taller than the screen */
      const slot = targetFrame ? barSlotOf(groupsRef.current, targetFrame, framesRef.current, widthsRef.current) : null;
      const isBar = FULL_WIDTH.includes(item.kind);
      const placedItem = targetFrame && slot ? (isBar ? carryItemSize(item, { w: PHONE_W, h: PHONE_H }, { w: slot.w, h: frameSizeOf(targetFrame).h }) : fitHeight(item, frameSizeOf(targetFrame).h)) : item;
      /* off any guide, the part settles on the 4dp grid of the screen it lands on */
      const origin = targetFrame ?? { x: 0, y: 0 };
      const dropped: Group = {
        id: uid(),
        x: isBar && slot ? Math.round(slot.x) : d.guide?.gx !== undefined ? Math.round(rawX) : onGrid(rawX, origin.x),
        y: d.guide?.gy !== undefined ? Math.round(rawY) : onGrid(rawY, origin.y),
        axis: connectSpecOf(item)?.axis ?? "x",
        items: [placedItem],
      };
      /* a part that grew to the screen's width is kept inside it, then settles back on the grid */
      const pulled = targetFrame ? pullInto(dropped, targetFrame, widthsRef.current) : dropped;
      const ng =
        pulled === dropped
          ? dropped
          : { ...pulled, x: d.guide?.gx !== undefined ? pulled.x : onGrid(pulled.x, origin.x), y: d.guide?.gy !== undefined ? pulled.y : onGrid(pulled.y, origin.y) };
      setGroups((prev) =>
        prev.some((g) => g.items.some((it) => it.id === item.id))
          ? prev
          : [...prev, ng],
      );
      setDrag(null);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // handlers read live state through refs, so this binds once per drag
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  /* the overlay sits between the cursor and the slot, weighted by attraction */
  useEffect(() => {
    if (!drag?.active) return;
    const cursorL = drag.px - drag.offX;
    const cursorT = drag.py - drag.offY;
    if (drag.snap) {
      const g = groupsRef.current.find((x) => x.id === drag.snap!.groupId);
      if (g) {
        const r = restPos(g, drag.snap.index, sizeRef(drag.item));
        sx.set(lerp(cursorL, r.left, drag.snap.pull));
        sy.set(lerp(cursorT, r.top, drag.snap.pull));
        return;
      }
    }
    sx.set(drag.guide?.x ?? cursorL);
    sy.set(drag.guide?.y ?? cursorT);
  }, [drag, restPos, sizeRef, sx, sy]);

  /* ---------- pointer: canvas (pan / marquee) ---------- */
  const itemRects = useCallback(() => {
    const out: { id: string; l: number; t: number; r: number; b: number }[] =
      [];
    for (const g of groupsRef.current) {
      for (const pl of layoutOf(g, widthsRef.current)) {
        out.push({ id: pl.item.id, l: pl.x, t: pl.y, r: pl.x + pl.w, b: pl.y + pl.h });
      }
    }
    return out;
  }, []);

  const clearSelection = () => {
    setSelectedIds([]);
    setSelectedFrameId(null);
    setSelectedLinkId(null);
  };

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (mobileRef.current && e.pointerType === "touch") {
      e.preventDefault();
      clearSelection();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button === 1 || modeRef.current === "hand" || spaceRef.current) {
      e.preventDefault();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;
    const pt = toWorld(e.clientX, e.clientY);
    const g: Gesture = {
      kind: "marquee",
      x0: pt.x,
      y0: pt.y,
      x1: pt.x,
      y1: pt.y,
      moved: false,
    };
    gestureRef.current = g;
    setGesture(g);
    if (!e.shiftKey) setSelectedIds([]);
    setSelectedFrameId(null);
    setSelectedLinkId(null);
  };

  /** grab a phone frame by its bezel or label: it carries everything on it;
   *  on a phone the screen stays put and a tap on it just clears the selection */
  const onFramePointerDown = (e: React.PointerEvent, f: Frame) => {
    if (mobileRef.current) {
      e.preventDefault();
      e.stopPropagation();
      clearSelection();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button === 1 || modeRef.current === "hand" || spaceRef.current) {
      e.preventDefault();
      e.stopPropagation();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedFrameId(f.id);
    setSelectedIds([]);
    setSelectedLinkId(null);
    setRightTab("edit");
    const carried = groupsRef.current
      .filter(
        (g) =>
          frameOfGroup(g, framesRef.current, widthsRef.current)?.id === f.id,
      )
      .map((g) => ({ id: g.id, x: g.x, y: g.y }));
    const g: Gesture = {
      kind: "frame",
      id: f.id,
      sx: e.clientX,
      sy: e.clientY,
      fx: f.x,
      fy: f.y,
      groups: carried,
      moved: false,
    };
    gestureRef.current = g;
    setGesture(g);
  };

  const isGesturing = gesture !== null;
  useEffect(() => {
    if (!isGesturing) return;
    const move = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g) return;
      if (g.kind === "pan") {
        setView((v) => ({
          ...v,
          x: g.vx + (e.clientX - g.sx),
          y: g.vy + (e.clientY - g.sy),
        }));
        return;
      }
      if (g.kind === "group") {
        const z = viewRef.current.z;
        const dx = (e.clientX - g.sx) / z;
        const dy = (e.clientY - g.sy) / z;
        if (!g.moved) {
          if (Math.hypot(dx, dy) * z < 4) return;
          g.moved = true;
          snapshot();
        }
        instantRef.current.add(g.id);
        g.overBin = inBin(e.clientX);
        setGesture({ ...g });
        setGroups((gs) =>
          gs.map((gr) => {
            if (gr.id !== g.id) return gr;
            /* a moved group settles on the 4dp grid of the screen it is over */
            const moved = { ...gr, x: g.gx + dx, y: g.gy + dy };
            const f = frameOfGroup(moved, framesRef.current, widthsRef.current);
            return { ...moved, x: onGrid(moved.x, f?.x ?? 0), y: onGrid(moved.y, f?.y ?? 0) };
          }),
        );
        return;
      }
      if (g.kind === "frame") {
        const z = viewRef.current.z;
        const dx = (e.clientX - g.sx) / z;
        const dy = (e.clientY - g.sy) / z;
        if (!g.moved) {
          if (Math.hypot(dx, dy) * z < 4) return;
          g.moved = true;
          snapshot();
        }
        const ids = new Map(g.groups.map((o) => [o.id, o]));
        for (const o of g.groups) instantRef.current.add(o.id);
        setFrames((fs) =>
          fs.map((f) =>
            f.id === g.id
              ? { ...f, x: Math.round(g.fx + dx), y: Math.round(g.fy + dy) }
              : f,
          ),
        );
        setGroups((gs) =>
          gs.map((gr) => {
            const o = ids.get(gr.id);
            return o
              ? { ...gr, x: Math.round(o.x + dx), y: Math.round(o.y + dy) }
              : gr;
          }),
        );
        return;
      }
      const pt = toWorld(e.clientX, e.clientY);
      g.x1 = pt.x;
      g.y1 = pt.y;
      if (
        !g.moved &&
        Math.hypot(pt.x - g.x0, pt.y - g.y0) * viewRef.current.z > 4
      )
        g.moved = true;
      if (g.moved) {
        const l = Math.min(g.x0, g.x1);
        const r = Math.max(g.x0, g.x1);
        const t = Math.min(g.y0, g.y1);
        const b = Math.max(g.y0, g.y1);
        const hit = itemRects()
          .filter((it) => it.l < r && it.r > l && it.t < b && it.b > t)
          .map((it) => it.id);
        setSelectedIds(hit);
      }
      setGesture({ ...g });
    };
    const up = (e: PointerEvent) => {
      const g = gestureRef.current;
      gestureRef.current = null;
      setGesture(null);
      // a group dragged onto the parts panel is deleted, like a single part
      if (g?.kind === "group" && g.moved && inBin(e.clientX)) {
        setGroups((gs) => gs.filter((x) => x.id !== g.id));
        setSelectedIds([]);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGesturing]);

  /* ---------- panel resize ---------- */
  useEffect(() => {
    if (!resizing) return;
    const move = (e: PointerEvent) => {
      if (resizing === "left") setLeftW(clamp(e.clientX, RAIL_W + 244, 480));
      else setRightW(clamp(window.innerWidth - e.clientX, 280, 480));
    };
    const up = () => setResizing(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [resizing]);

  /* ---------- editing ---------- */
  const primaryId = selectedIds[selectedIds.length - 1] ?? null;
  const selected = useMemo(() => {
    for (const g of groups) {
      const it = g.items.find((i) => i.id === primaryId);
      if (it) return it;
    }
    return drag?.item.id === primaryId ? (drag?.item ?? null) : null;
  }, [groups, primaryId, drag]);

  useEffect(() => {
    if (!selected && sheet === "edit") setSheet(null);
  }, [selected, sheet]);

  /** Resizing a lone part keeps whatever it was lined up with on the frame:
   *  its centre on the centre line, or its far edge on the margin or screen edge.
   *  Otherwise the near (left / top) edge stays put, as the sliders always did. */
  const resizeShift = (g: Group, before: Item, after: Item) => {
    const none = { dx: 0, dy: 0 };
    if (g.items.length !== 1 || frameRef.current !== "phone") return none;
    const f = frameOfGroup(g, framesRef.current, widthsRef.current);
    if (!f) return none;
    const { w: frameW, h: frameH } = frameSizeOf(f);
    const a = sizeOf(before, widthsRef.current);
    const b = sizeOf(after, widthsRef.current);
    const shift = (pos: number, len: number, next: number, f0: number, fLen: number) => {
      const d = next - len;
      if (d === 0) return 0;
      const near = (v: number, target: number) => Math.abs(v - target) <= 1;
      if (near(pos + len / 2, f0 + fLen / 2)) return -Math.round(d / 2);
      if (near(pos + len, f0 + fLen - FRAME_MARGIN) || near(pos + len, f0 + fLen)) return -d;
      return 0;
    };
    return {
      dx: shift(g.x, a.w, b.w, f.x, frameW),
      dy: shift(g.y, a.h, b.h, f.y, frameH),
    };
  };

  const patchSelected = (patch: Partial<Item>) => {
    if (!primaryId) return;
    const id = primaryId;
    snapshotFor(id + ":" + Object.keys(patch).join(","));
    const resizes = "size" in patch || "size2" in patch;
    setGroups((prev) =>
      prev.map((g) => {
        const idx = g.items.findIndex((it) => it.id === id);
        if (idx < 0) return g;
        const next = { ...g.items[idx], ...patch };
        const { dx, dy } = resizes ? resizeShift(g, g.items[idx], next) : { dx: 0, dy: 0 };
        if (dx || dy) instantRef.current.add(g.id);
        return {
          ...g,
          x: g.x + dx,
          y: g.y + dy,
          items: g.items.map((it, i) => (i === idx ? next : it)),
        };
      }),
    );
    if (dragRef.current?.item.id === id) {
      dragRef.current.item = { ...dragRef.current.item, ...patch };
    }
  };

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const ids = new Set(selectedIds);
    snapshot();
    setGroups((prev) =>
      prev
        .map((g) => {
          if (g.free) return collapseFree({ ...g, items: g.items.filter((it) => !ids.has(it.id)) }, widthsRef.current);
          let x = g.x;
          let y = g.y;
          let items = g.items;
          while (items.length && ids.has(items[0].id)) {
            const sz = sizeOf(items[0], widthsRef.current);
            if (g.axis === "x") x += sz.w + GAP;
            else y += sz.h + GAP;
            items = items.slice(1);
          }
          if (x !== g.x || y !== g.y) instantRef.current.add(g.id);
          return { ...g, x, y, items: items.filter((it) => !ids.has(it.id)) };
        })
        .filter((g) => g.items.length > 0),
    );
    setSelectedIds([]);
  }, [selectedIds, snapshot]);

  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    /* a selected hand-made group is copied whole, keeping its layout */
    const fg = groupsRef.current.find((g) => g.free && g.items.some((it) => it.id === selected.id));
    if (fg && fg.items.every((it) => selectedIds.includes(it.id))) {
      const idMap = new Map(fg.items.map((it) => [it.id, uid()]));
      const pos: Record<string, { x: number; y: number }> = {};
      for (const it of fg.items) pos[idMap.get(it.id)!] = fg.pos?.[it.id] ?? { x: 0, y: 0 };
      const copyG: Group = {
        ...fg,
        id: uid(),
        x: fg.x + 24,
        y: fg.y + 24,
        pos,
        items: fg.items.map((it) => ({ ...it, id: idMap.get(it.id)!, tabs: it.tabs?.map((t) => ({ ...t })) })),
      };
      snapshot();
      setGroups((prev) => [...prev, copyG]);
      setSelectedIds(copyG.items.map((it) => it.id));
      return;
    }
    const rect = itemRects().find((r) => r.id === selected.id);
    if (!rect) return;
    const copy: Item = {
      ...selected,
      id: uid(),
      tabs: selected.tabs?.map((t) => ({ ...t })),
    };
    snapshot();
    setGroups((prev) => [
      ...prev,
      {
        id: uid(),
        x: rect.l + 24,
        y: rect.t + 24,
        axis: connectSpecOf(copy)?.axis ?? "x",
        items: [copy],
      },
    ]);
    setSelectedIds([copy.id]);
  }, [selected, selectedIds, itemRects, snapshot]);

  /* The in-app clipboard: Ctrl+C keeps a copy of the selection (a whole group when
   * the selection covers one) with its offset inside its screen, so Ctrl+V can put it
   * at the same spot on another screen, or a step aside on the same one. */
  const clipboardRef = useRef<{ group: Group; dx: number; dy: number; frameId: string | null } | null>(null);

  const copySelected = useCallback(() => {
    if (!selected) return;
    const ids = new Set(selectedIds);
    const g = groupsRef.current.find((x) => x.items.some((it) => it.id === selected.id));
    if (!g) return;
    let group: Group;
    if (g.items.every((it) => ids.has(it.id))) {
      group = structuredClone(g);
    } else {
      const rect = itemRects().find((r) => r.id === selected.id);
      if (!rect) return;
      group = { id: g.id, x: rect.l, y: rect.t, axis: connectSpecOf(selected)?.axis ?? "x", items: [structuredClone(selected)] };
    }
    /* a group on no screen keeps its canvas position; one on a screen keeps its offset there */
    const f = frameOfGroup(g, framesRef.current, widthsRef.current);
    clipboardRef.current = { group, dx: f ? group.x - f.x : 0, dy: f ? group.y - f.y : 0, frameId: f?.id ?? null };
  }, [selected, selectedIds, itemRects]);

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip) return;
    const fs = framesRef.current;
    /* the screen to paste into: the selected screen, else the selection's, else the source */
    let target = selectedFrameId ? fs.find((f) => f.id === selectedFrameId) : undefined;
    if (!target && selected) {
      const g = groupsRef.current.find((x) => x.items.some((it) => it.id === selected.id));
      if (g) target = frameOfGroup(g, fs, widthsRef.current) ?? undefined;
    }
    if (!target) target = fs.find((f) => f.id === clip.frameId);
    let x = target && clip.frameId ? target.x + clip.dx : clip.group.x;
    let y = target && clip.frameId ? target.y + clip.dy : clip.group.y;
    /* onto a spot already taken (the source, or an earlier paste) it steps aside like a duplicate */
    while (groupsRef.current.some((g) => g.x === x && g.y === y)) {
      x += 24;
      y += 24;
    }
    const idMap = new Map(clip.group.items.map((it) => [it.id, uid()]));
    const pos: Record<string, { x: number; y: number }> | undefined = clip.group.pos ? {} : undefined;
    if (pos) for (const it of clip.group.items) pos[idMap.get(it.id)!] = clip.group.pos?.[it.id] ?? { x: 0, y: 0 };
    const copy: Group = {
      ...structuredClone(clip.group),
      id: uid(),
      x,
      y,
      pos,
      items: clip.group.items.map((it) => ({ ...structuredClone(it), id: idMap.get(it.id)! })),
    };
    snapshot();
    setGroups((prev) => [...prev, copy]);
    setSelectedIds(copy.items.map((it) => it.id));
    setSelectedFrameId(null);
  }, [selected, selectedFrameId, snapshot]);

  /** the free group the whole selection belongs to, if it is exactly one */
  const selectedGroup = useMemo(() => {
    if (selectedIds.length === 0) return null;
    const g = groups.find((x) => x.free && x.items.some((it) => it.id === selectedIds[0]));
    if (!g) return null;
    const ids = new Set(g.items.map((it) => it.id));
    return selectedIds.every((id) => ids.has(id)) && selectedIds.length === g.items.length ? g : null;
  }, [groups, selectedIds]);

  /** Pull the selected parts out of their runs into one free group that keeps
   *  their positions. It takes the layer slot of the topmost run involved. */
  /** Lines the selected parts up, or spaces them evenly. Whole groups move: a connected
   *  run or a hand-made group is one unit, like in Tidy. Several parts line up with each
   *  other's bounding box; a lone part lines up with the screen's body area, the box Tidy
   *  fills between the bars. A unit that would land on another part steps away from the
   *  edge it was aligned to until it is clear. */
  const alignSelected = useCallback(
    (kind: AlignKind) => {
      const ids = new Set(selectedIds);
      const all = groupsRef.current;
      const units = all.filter((g) => g.items.some((it) => ids.has(it.id)));
      if (units.length === 0) return;
      const distributing = kind === "distributeH" || kind === "distributeV";
      const horizontal = kind === "left" || kind === "centerH" || kind === "right" || kind === "distributeH";
      const rects = new Map(all.map((g) => [g.id, groupBounds(g, widthsRef.current)]));
      let bb = units.map((g) => rects.get(g.id)!).reduce((a, r) => ({ l: Math.min(a.l, r.l), t: Math.min(a.t, r.t), r: Math.max(a.r, r.r), b: Math.max(a.b, r.b) }));
      let screenId: string | null = null;
      if (units.length === 1) {
        const f = frameOfGroup(units[0], framesRef.current, widthsRef.current);
        if (!f || distributing) return;
        screenId = f.id;
        bb = bodyRect(all, f, framesRef.current, widthsRef.current, new Set(units.map((g) => g.id)));
      }
      const shift = new Map<string, { dx: number; dy: number }>();
      if (distributing) {
        const sorted = [...units].sort((a, b) => (horizontal ? rects.get(a.id)!.l - rects.get(b.id)!.l : rects.get(a.id)!.t - rects.get(b.id)!.t));
        const sizes = sorted.map((g) => (horizontal ? rects.get(g.id)!.r - rects.get(g.id)!.l : rects.get(g.id)!.b - rects.get(g.id)!.t));
        const span = horizontal ? bb.r - bb.l : bb.b - bb.t;
        const gap = (span - sizes.reduce((s, v) => s + v, 0)) / (sorted.length - 1);
        let pos = horizontal ? bb.l : bb.t;
        sorted.forEach((g, i) => {
          const r = rects.get(g.id)!;
          shift.set(g.id, horizontal ? { dx: Math.round(pos) - r.l, dy: 0 } : { dx: 0, dy: Math.round(pos) - r.t });
          pos += sizes[i] + gap;
        });
      } else {
        /* parts that are not moving, on the same screen, that a moved unit must not land on */
        const others = all.filter((g) => !ids.has(g.items[0].id) && !g.items.some((it) => ids.has(it.id)) && (!screenId || frameOfGroup(g, framesRef.current, widthsRef.current)?.id === screenId)).map((g) => rects.get(g.id)!);
        const hits = (r: { l: number; t: number; r: number; b: number }) => others.filter((o) => o.l < r.r && o.r > r.l && o.t < r.b && o.b > r.t);
        /* stepping away from the aligned edge: right of a left edge, up from a bottom edge; a centre tries both ways */
        const dir = kind === "left" || kind === "top" ? 1 : kind === "right" || kind === "bottom" ? -1 : 0;
        for (const g of units) {
          const r = rects.get(g.id)!;
          const w = r.r - r.l;
          const h = r.b - r.t;
          const ax = kind === "left" ? bb.l : kind === "centerH" ? Math.round((bb.l + bb.r) / 2 - w / 2) : kind === "right" ? bb.r - w : r.l;
          const ay = kind === "top" ? bb.t : kind === "centerV" ? Math.round((bb.t + bb.b) / 2 - h / 2) : kind === "bottom" ? bb.b - h : r.t;
          /* candidates stay inside the reference box; with no clear spot the plain alignment wins */
          let x = ax;
          let y = ay;
          let clear = false;
          for (let tries = 0, sign = dir || 1; tries < 12; tries++, sign = dir || -sign) {
            const blocking = hits({ l: x, t: y, r: x + w, b: y + h });
            if (!blocking.length) {
              clear = true;
              break;
            }
            const step = 8 + (horizontal ? Math.max(...blocking.map((o) => o.r - o.l)) : Math.max(...blocking.map((o) => o.b - o.t)));
            if (horizontal) x = clamp(x + sign * step * (dir ? 1 : tries + 1), bb.l, Math.max(bb.l, bb.r - w));
            else y = clamp(y + sign * step * (dir ? 1 : tries + 1), bb.t, Math.max(bb.t, bb.b - h));
          }
          if (!clear) {
            x = ax;
            y = ay;
          }
          shift.set(g.id, { dx: x - r.l, dy: y - r.t });
        }
      }
      if (![...shift.values()].some((s) => s.dx || s.dy)) return;
      snapshot();
      setGroups((gs) =>
        gs.map((g) => {
          const s = shift.get(g.id);
          return s && (s.dx || s.dy) ? { ...g, x: g.x + s.dx, y: g.y + s.dy } : g;
        }),
      );
    },
    [selectedIds, snapshot],
  );

  const groupSelected = useCallback(() => {
    const ids = new Set(selectedIds);
    if (ids.size < 2) return;
    const rects = new Map(itemRects().map((r) => [r.id, r]));
    const picked: Item[] = [];
    let top = -1;
    groupsRef.current.forEach((g, i) => {
      for (const it of g.items) if (ids.has(it.id)) {
        picked.push(it);
        top = i;
      }
    });
    if (picked.length < 2) return;
    const l = Math.min(...picked.map((it) => rects.get(it.id)!.l));
    const t = Math.min(...picked.map((it) => rects.get(it.id)!.t));
    const pos: Record<string, { x: number; y: number }> = {};
    for (const it of picked) pos[it.id] = { x: rects.get(it.id)!.l - l, y: rects.get(it.id)!.t - t };
    const ng: Group = { id: uid(), x: l, y: t, axis: "x", items: picked, free: true, pos };
    snapshot();
    setGroups((prev) => {
      const out: Group[] = [];
      prev.forEach((g, i) => {
        if (g.free) {
          const rest = g.items.filter((it) => !ids.has(it.id));
          if (rest.length) out.push(collapseFree({ ...g, items: rest }, widthsRef.current));
        } else {
          let x = g.x;
          let y = g.y;
          let items = g.items;
          while (items.length && ids.has(items[0].id)) {
            const sz = sizeOf(items[0], widthsRef.current);
            if (g.axis === "x") x += sz.w + GAP;
            else y += sz.h + GAP;
            items = items.slice(1);
          }
          items = items.filter((it) => !ids.has(it.id));
          if (items.length) {
            if (x !== g.x || y !== g.y) instantRef.current.add(g.id);
            out.push({ ...g, x, y, items });
          }
        }
        if (i === top) out.push(ng);
      });
      return out;
    });
    setSelectedIds(picked.map((it) => it.id));
  }, [selectedIds, itemRects, snapshot]);

  /** Split a free group back into single runs at their current positions, in the same layer slot. */
  const ungroupSelected = useCallback(() => {
    const g = selectedGroup;
    if (!g) return;
    snapshot();
    const singles: Group[] = explodeGroup(g, widthsRef.current).map((run) => ({ ...run, id: uid() }));
    for (const sg of singles) instantRef.current.add(sg.id);
    setGroups((prev) => prev.flatMap((x) => (x.id === g.id ? singles : [x])));
  }, [selectedGroup, snapshot]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (selectedIds.length === 0 && selectedFrameId) {
        const f = framesRef.current.find((x) => x.id === selectedFrameId);
        if (!f) return;
        snapshotFor("nudge:frame:" + f.id);
        const carried = new Set(
          groupsRef.current
            .filter(
              (g) =>
                frameOfGroup(g, framesRef.current, widthsRef.current)?.id ===
                f.id,
            )
            .map((g) => g.id),
        );
        for (const id of carried) instantRef.current.add(id);
        setFrames((fs) =>
          fs.map((x) =>
            x.id === f.id ? { ...x, x: x.x + dx, y: x.y + dy } : x,
          ),
        );
        setGroups((gs) =>
          gs.map((g) =>
            carried.has(g.id) ? { ...g, x: g.x + dx, y: g.y + dy } : g,
          ),
        );
        return;
      }
      if (selectedIds.length === 0) return;
      const ids = new Set(selectedIds);
      snapshotFor("nudge:" + selectedIds.join(","));
      setGroups((prev) =>
        prev.map((g) =>
          g.items.some((it) => ids.has(it.id))
            ? { ...g, x: g.x + dx, y: g.y + dy }
            : g,
        ),
      );
    },
    [selectedIds, selectedFrameId, snapshotFor],
  );

  const clearAll = () => {
    setConfirmClear(false);
    if (groupsRef.current.length === 0 && framesRef.current.length === 0)
      return;
    setDraftBefore(null);
    setQuickUndo(false);
    try {
      localStorage.removeItem(BEFORE_KEY);
    } catch {}
    snapshot();
    setGroups([]);
    setFrames([]);
    setSelectedIds([]);
    setSelectedFrameId(null);
  };

  /** Opening a project file replaces the canvas with the same restore path the saved
   *  document goes through, then starts the editor fresh on it. */
  const importDoc = (next: Doc) => {
    hadDocRef.current = true;
    /* the whole document being replaced stays one undo away */
    snapshot(true);
    /* whatever was under review is over: a file, a clear or a new arrival replaces it */
    setDraftBefore(null);
    setQuickUndo(false);
    try {
      localStorage.removeItem(BEFORE_KEY);
    } catch {}
    applyDoc(next, true);
    if (!mobileRef.current) {
      const nextFrame = next.frame === "blank" ? "blank" : "phone";
      setFrame(nextFrame);
      frameRef.current = nextFrame;
    }
    setSelectedIds([]);
    setSelectedFrameId(null);
    setSelectedLinkId(null);
    setWidths({});
    lastPatchRef.current = { key: "", at: 0 };
    queueMicrotask(() => fitRef.current());
  };

  /* A link with a design in its hash offers it once the editor is ready to take it,
     whether the page opened on that link or the link was pasted into this tab. */
  useEffect(() => {
    if (editAccess !== "editable" || typeof window === "undefined") return;
    let active = true;
    const offer = () => {
      if (!hasShareHash(window.location.hash)) return;
      void readShareHash(window.location.hash).then((next) => {
        if (!active) return;
        if (next) {
          setShareOpen(false);
          arrive(next);
          clearShareHash();
        } else {
          clearShareHash();
          showToast(t("invalidProject", getLang()), 3000, "error");
        }
      });
    };
    offer();
    window.addEventListener("hashchange", offer);
    return () => {
      active = false;
      window.removeEventListener("hashchange", offer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editAccess]);

  /** Asks the author's own model for a design and puts it on the canvas. The guide it reads
   *  is the one a coding agent reads (public/agent.md). The replaced design waits in
   *  `draftBefore` until the author keeps or undoes the draft. */
  /** A design that arrived from a model or a link takes the canvas with its colours easing
   *  over; the design it replaced waits in `draftBefore` until the author keeps or undoes it. */
  const arrive = (next: Doc) => {
    /* the phone editor has no keep / undo buttons: a link simply opens there, undoable as usual */
    if (mobileRef.current) {
      importDoc(next);
      return;
    }
    const before = draftBeforeRef.current ?? docRef.current;
    setRevealing(true);
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => setRevealing(false), 900);
    importDoc(next);
    setDraftBefore(before);
    try {
      localStorage.setItem(BEFORE_KEY, JSON.stringify(before));
    } catch {}
  };

  const startDraft = async (idea: string) => {
    setShareOpen(false);
    setDraftBusy(true);
    try {
      if (guideRef.current === null) {
        const res = await fetch(`${BASE_PATH}/agent.md`);
        if (!res.ok) throw new Error("guide");
        guideRef.current = await res.text();
      }
      const next = await draftDesign(aiSettings, guideRef.current, idea, lang);
      arrive(next);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      showToast(m === "json" ? t("aiErrorJson", lang) : m === "refusal" ? t("aiErrorRefusal", lang) : m === "long" ? t("aiErrorLong", lang) : t("aiError", lang), 3200, "error");
    } finally {
      setDraftBusy(false);
    }
  };
  /** true after a kept draft until the author undoes something, so the header's undo also sits by the opener */
  const [quickUndo, setQuickUndo] = useState(false);
  const keepDraft = () => {
    setDraftBefore(null);
    setQuickUndo(true);
    try {
      localStorage.removeItem(BEFORE_KEY);
    } catch {}
  };
  const undoDraft = () => {
    if (draftBefore) {
      setRevealing(true);
      if (revealTimer.current) clearTimeout(revealTimer.current);
      revealTimer.current = setTimeout(() => setRevealing(false), 900);
      importDoc(draftBefore);
    }
    setDraftBefore(null);
  };

  /** drops the design from the URL once it has been taken or declined */
  const clearShareHash = () => {
    if (typeof window !== "undefined" && window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  };

  const selectedFrame = useMemo(
    () => frames.find((f) => f.id === selectedFrameId) ?? null,
    [frames, selectedFrameId],
  );
  const selectedPartFrame = useMemo(() => {
    if (!primaryId || frame !== "phone") return null;
    const g = groups.find((g) => g.items.some((it) => it.id === primaryId));
    return g ? (frameOfGroup(g, frames, widths) ?? null) : null;
  }, [primaryId, frame, groups, frames, widths]);

  /** the screen the tidy button works on: the selected one, or the one under the selected part */
  const tidyTarget = useMemo((): Frame | null => {
    if (frame !== "phone" || isMobile) return null;
    if (selectedFrame) return selectedFrame;
    if (!primaryId) return null;
    const g = groups.find((g) => g.items.some((it) => it.id === primaryId));
    return g ? (frameOfGroup(g, frames, widths) ?? null) : null;
  }, [frame, isMobile, selectedFrame, primaryId, groups, frames, widths]);

  const nextFrameX = () =>
    framesRef.current.length
      ? Math.max(...framesRef.current.map((f) => frameRect(f).r)) + FRAME_GAP
      : 0;

  /** Entering phone mode with no frames wraps the existing parts in one. */
  const ensureFrame = () => {
    if (framesRef.current.length > 0) return;
    const gs = groupsRef.current;
    let x = 0;
    let y = 0;
    if (gs.length) {
      const bbs = gs.map((g) => groupBounds(g, widthsRef.current));
      const l = Math.min(...bbs.map((b) => b.l));
      const t = Math.min(...bbs.map((b) => b.t));
      const r = Math.max(...bbs.map((b) => b.r));
      x = Math.round(Math.max(l - 24, r - PHONE_W + 24 > l ? l : l - 24));
      y = Math.round(t - 72);
      x = Math.min(x, l);
      y = Math.min(y, t);
    }
    const f: Frame = { id: uid(), name: t("home"), x, y };
    setFrames([f]);
  };

  const ensureFrameRef = useRef(() => {});
  ensureFrameRef.current = ensureFrame;

  /** phone UI: the plus button drops a new button where the view is looking,
   *  kept inside the screen, and nudged down when that spot is already taken */
  const addButton = () => {
    const r = canvasRect();
    const v = viewRef.current;
    const item = makeItem("button");
    const sz = sizeOf(item, widthsRef.current);
    const f = framesRef.current[0];
    let x = ((r?.width ?? 0) / 2 - v.x) / v.z - sz.w / 2;
    let y = ((r?.height ?? 0) / 2 - v.y) / v.z - sz.h / 2;
    if (f) {
      const { w, h } = frameSizeOf(f);
      const lx = f.x + Math.min(FRAME_MARGIN, (w - sz.w) / 2);
      const ly = f.y + Math.min(FRAME_MARGIN, (h - sz.h) / 2);
      x = clamp(x, lx, Math.max(lx, f.x + w - FRAME_MARGIN - sz.w));
      y = clamp(y, ly, Math.max(ly, f.y + h - FRAME_MARGIN - sz.h));
      const taken = (yy: number) =>
        itemRects().some((o) => o.l < x + sz.w && o.r > x && o.t < yy + sz.h && o.b > yy);
      let tries = 0;
      while (taken(y) && y + sz.h * 2 < f.y + h && tries++ < 12) y += sz.h + 12;
    }
    snapshot();
    setGroups((gs) => [
      ...gs,
      {
        id: uid(),
        x: Math.round(x),
        y: Math.round(y),
        axis: "x",
        items: [item],
      },
    ]);
    setSelectedIds([item.id]);
    setSelectedFrameId(null);
    setSheet(null);
  };

  const changeFrame = (f: FrameMode) => {
    if (f === frame) return;
    snapshot();
    setFrame(f);
    frameRef.current = f;
    if (f === "phone") ensureFrame();
    setSelectedFrameId(null);
    setSelectedLinkId(null);
    queueMicrotask(() => fitRef.current());
  };

  const addFrame = () => {
    snapshot();
    const base = framesRef.current[0];
    const f: Frame = {
      id: uid(),
      name: `${t("screenN")} ${framesRef.current.length + 1}`,
      x: nextFrameX(),
      y: base?.y ?? 0,
    };
    setFrames((fs) => [...fs, f]);
    setSelectedFrameId(f.id);
    setSelectedIds([]);
    const r = canvasRect();
    if (r) {
      const z = viewRef.current.z;
      const { w, h } = frameSizeOf(f);
      setView({
        x: r.width / 2 - (f.x + w / 2) * z,
        y: r.height / 2 - (f.y + h / 2) * z,
        z,
      });
    }
  };

  const patchFrame = (id: string, patch: Partial<Frame>) => {
    snapshotFor("frame:" + id + ":" + Object.keys(patch).join(","));
    setFrames((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const setFramePreset = (id: string, preset: FramePreset) => {
    const current = framesRef.current.find((f) => f.id === id);
    if (!current) return;
    const next = { ...current, ...framePresetPatch(preset) };
    const before = frameSizeOf(current);
    const after = frameSizeOf(next);
    if (before.w === after.w && before.h === after.h) return;
    const frames = framesRef.current;
    /* the screens to the right move over, parts take the sizes the new screen calls for,
     * and the screen is laid out again by the tidy rules */
    const laid = carryFrame(groupsRef.current, current, next, frames, widthsRef.current);
    /* a target the author never picked follows the screens */
    if (platform === defaultPlatformOf(frames, frameRef.current)) setPlatform(null);
    snapshot();
    tidyRef.current = null;
    setEasing(true);
    window.setTimeout(() => setEasing(false), SETTLE_MS + 40);
    setFrames(laid.frames);
    setGroups(laid.groups);
  };

  /** the tidy button's state for the screen in play; the layout pass runs only when the document changes */
  const tidyState = useMemo((): TidyState | null => {
    if (!tidyTarget) return null;
    const last = tidyRef.current;
    if (last && last.frameId === tidyTarget.id && last.after === groups) return "undo";
    return tidyFrame(groups, tidyTarget, frames, widths) ? "tidy" : "done";
  }, [tidyTarget, groups, frames, widths]);

  const tidy = (f: Frame) => {
    const last = tidyRef.current;
    if (last && last.frameId === f.id && last.after === groupsRef.current) {
      snapshot();
      setGroups(last.before);
      tidyRef.current = null;
      return;
    }
    const after = tidyFrame(groupsRef.current, f, framesRef.current, widthsRef.current);
    if (!after) return;
    snapshot();
    tidyRef.current = { frameId: f.id, before: groupsRef.current, after };
    setGroups(after);
  };


  /** sets where Tidy puts a screen's body, then tidies it that way */
  const setPlace = (f: Frame, place: Place) => {
    const next: Frame = { ...f, place: place === "top" ? undefined : place };
    /* one undo step covers both the setting and the tidy it causes */
    snapshot();
    const frames = framesRef.current.map((o) => (o.id === f.id ? next : o));
    setFrames(frames);
    tidyRef.current = null;
    const after = tidyFrame(groupsRef.current, next, frames, widthsRef.current);
    if (!after) return;
    tidyRef.current = { frameId: f.id, before: groupsRef.current, after };
    setGroups(after);
  };

  const toastTimer = useRef<number | null>(null);
  /** the desktop's message pill beside the tidy button; the phone keeps its centered toast */
  const showAiNote = (text: string, icon = "check", ms = 2200) => {
    setAiNote({ text, icon });
    if (aiNoteTimer.current) window.clearTimeout(aiNoteTimer.current);
    aiNoteTimer.current = window.setTimeout(() => setAiNote(null), ms);
  };

  const showToast = (msg: string, ms = 2200, icon = "info") => {
    if (!mobileRef.current) {
      showAiNote(msg, icon, ms);
      return;
    }
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  };

  const updateAiSettings = (s: AiSettings) => {
    setAiSettings(s);
    saveAiSettings(s);
  };

  const aiReady = hasKey(aiSettings) && aiSettings.model.trim().length > 0 && isSecureUrl(aiSettings.baseUrl);
  const aiReason = !aiReady ? t("aiNoKey", lang) : !tidyTarget ? t("aiSelectScreen", lang) : undefined;

  /** Writes one field with the model: a part's behavior note, or a screen's description.
   *  The result goes straight in; the field remembers what it said so the rewrite can be undone. */
  const runAi = async (action: AiActionKey, f: Frame, itemId?: string) => {
    if (!aiReady) {
      showToast(t("aiNoKey", lang));
      return;
    }
    const curDoc = doc;
    aiAbortRef.current?.abort();
    const ac = new AbortController();
    aiAbortRef.current = ac;
    setAiBusy(true);
    setAiFrameId(f.id);
    try {
      if (action === "describe") {
        const r = await proposeDescription(aiSettings, curDoc, widthsRef.current, f, lang, ac.signal);
        if (ac.signal.aborted) return;
        snapshot();
        setFrames((fs) => fs.map((x) => (x.id === f.id ? { ...x, note: r.note, noteHistory: pushHistory(x.noteHistory, x.note), name: r.name ?? x.name } : x)));
        showAiNote(t("aiApplied", lang));
        return;
      }
      if (!itemId) return;
      const note = await proposeBehavior(aiSettings, curDoc, widthsRef.current, f, lang, itemId, ac.signal);
      if (ac.signal.aborted) return;
      if (!note) {
        showToast(t("aiErrorJson", lang));
        return;
      }
      snapshot();
      setGroups((gs) => gs.map((g) => (g.items.some((it) => it.id === itemId) ? { ...g, items: g.items.map((it) => (it.id === itemId ? { ...it, note, noteHistory: pushHistory(it.noteHistory, it.note) } : it)) } : g)));
      showAiNote(t("aiApplied", lang));
    } catch (e) {
      if (!ac.signal.aborted) showToast(aiErrorText(e, lang), 4000, "error");
    } finally {
      if (aiAbortRef.current === ac) {
        aiAbortRef.current = null;
        setAiBusy(false);
        setAiFrameId(null);
      }
    }
  };

  const cancelAi = () => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setAiBusy(false);
    setAiFrameId(null);
  };

  useEffect(
    () => () => {
      aiAbortRef.current?.abort();
      if (aiNoteTimer.current) window.clearTimeout(aiNoteTimer.current);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  /** a screen takes everything on it along, and links into it are dropped */
  const deleteFrame = useCallback(
    (id: string) => {
      snapshot();
      const gone = new Set(
        groupsRef.current
          .filter((g) => frameOfGroup(g, framesRef.current, widthsRef.current)?.id === id)
          .map((g) => g.id),
      );
      setFrames((fs) =>
        fs
          .filter((f) => f.id !== id)
          .map((f) => {
            if (!f.swipe) return f;
            const swipe = Object.fromEntries(Object.entries(f.swipe).filter(([, to]) => to !== id));
            return { ...f, swipe: Object.keys(swipe).length ? swipe : undefined };
          }),
      );
      setGroups((gs) =>
        gs
          .filter((g) => !gone.has(g.id))
          .map((g) => ({
            ...g,
            items: g.items.map((it) => {
              const next = { ...it };
              if (next.action?.to === id) next.action = undefined;
              if (next.actions) {
                const actions = Object.fromEntries(Object.entries(next.actions).filter(([, a]) => a.to !== id));
                next.actions = Object.keys(actions).length ? actions : undefined;
              }
              return next;
            }),
          })),
      );
      setSelectedFrameId(null);
      setSelectedIds((cur) => cur.filter((x) => !groupsRef.current.some((g) => gone.has(g.id) && g.items.some((it) => it.id === x))));
    },
    [snapshot],
  );

  const duplicateFrame = (id: string) => {
    const f = framesRef.current.find((x) => x.id === id);
    if (!f) return;
    snapshot();
    const nf: Frame = {
      ...f,
      id: uid(),
      name: `${f.name}${t("copySuffix")}`,
      x: nextFrameX(),
    };
    const dx = nf.x - f.x;
    const copies = groupsRef.current
      .filter(
        (g) => frameOfGroup(g, framesRef.current, widthsRef.current)?.id === id,
      )
      .map((g) => {
        const idMap = new Map(g.items.map((it) => [it.id, uid()]));
        const pos = g.pos
          ? Object.fromEntries(Object.entries(g.pos).map(([id, o]) => [idMap.get(id) ?? id, o]))
          : undefined;
        return {
          ...g,
          id: uid(),
          x: g.x + dx,
          pos,
          items: g.items.map((it) => ({
            ...it,
            id: idMap.get(it.id)!,
            tabs: it.tabs?.map((t) => ({ ...t })),
          })),
        };
      });
    setFrames((fs) => [...fs, nf]);
    setGroups((gs) => [...gs, ...copies]);
    setSelectedFrameId(nf.id);
  };
  const duplicateFrameRef = useRef(duplicateFrame);
  duplicateFrameRef.current = duplicateFrame;

  /** The screen is re-rendered offscreen at 1:1 with static parts, so the
   *  canvas zoom, selection outlines and in-flight animations never leak into the PNG. */
  const saveFrameImage = async (f: Frame) => {
    setExportFrame(f);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    try {
      await document.fonts?.ready;
      const el = document.querySelector<HTMLElement>(`[data-export="${f.id}"]`);
      if (!el) return;
      const { w, h } = frameSizeOf(f);
      const url = await toPng(el, { pixelRatio: 2, cacheBust: true, width: w, height: h });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${f.name || "screen"}.png`;
      a.click();
    } finally {
      setExportFrame(null);
    }
  };

  /** the runs of one screen drawn with plain divs: the export layer */
  const renderExport = (f: Frame) => {
    const gs = groups.filter((g) => frameOfGroup(g, frames, widths)?.id === f.id);
    const { w, h } = frameSizeOf(f);
    return (
      <div
        data-export={f.id}
        style={{
          position: "relative",
          width: w,
          height: h,
          background: p[f.bg ?? "surface"],
          overflow: "hidden",
        }}
      >
        {gs.map((g) =>
          g.free ? (
            ((corners) =>
            layoutOf(g, widths).map((pl) => (
              <div key={pl.item.id} style={{ position: "absolute", left: pl.x - f.x, top: pl.y - f.y }}>
                <M3Static
                  item={pl.item}
                  palette={p}
                  radii={corners.get(pl.item.id)}
                  style={MEASURED.includes(pl.item.kind) ? undefined : { width: pl.w, height: pl.h }}
                />
              </div>
            )))(freeRadii(g, widths))
          ) : (
          <div
            key={g.id}
            style={{
              position: "absolute",
              left: g.x - f.x,
              top: g.y - f.y,
              display: "flex",
              flexDirection: g.axis === "x" ? "row" : "column",
              alignItems: g.axis === "x" ? "center" : "stretch",
              gap: GAP,
            }}
          >
            {g.items.map((it, i) => {
              const conn = connectSpecOf(it);
              const n = g.items.length;
              const radii =
                conn && n > 1
                  ? runRadii(g.axis, i === 0, i === n - 1, false, false, 0, conn.outer, conn.inner)
                  : conn
                    ? uniformRadii(conn.outer)
                    : baseRadii(it);
              return (
                <M3Static
                  key={it.id}
                  item={it}
                  palette={p}
                  radii={radii}
                  style={MEASURED.includes(it.kind) ? undefined : { width: sizeOf(it, widths).w, height: sizeOf(it, widths).h }}
                />
              );
            })}
          </div>
          ),
        )}
      </div>
    );
  };

  /** the view before the preview opened, restored when it closes */
  const viewBeforePreview = useRef<View | null>(null);
  /** the camera glides for a moment: a screen is brought to the center before the
   *  preview opens over it, and the view returns once the preview closes */
  const glide = (v: View) => {
    setCameraEasing(true);
    setView(v);
    window.setTimeout(() => setCameraEasing(false), SETTLE_MS + 40);
  };
  const openPreview = (startId?: string | null) => {
    if (frame !== "phone") {
      changeFrame("phone");
    }
    queueMicrotask(() => {
      const id = startId ?? selectedFrameId ?? framesRef.current[0]?.id ?? null;
      const f = framesRef.current.find((x) => x.id === id);
      const r = canvasRect();
      if (f && r) {
        /* the preview's own fit and center, in window coordinates: its stage is sized for the
         * largest screen and sits left of the control column, so the screen lands where the
         * preview will show it */
        const { w, h } = frameSizeOf(f);
        const wide = window.innerWidth >= 720;
        const maxW = Math.max(...framesRef.current.map((x) => frameSizeOf(x).w)) + BEZEL * 2;
        const maxH = Math.max(...framesRef.current.map((x) => frameSizeOf(x).h)) + BEZEL * 2;
        const z = clamp(Math.min(1.4, (window.innerHeight - 32) / maxH, (window.innerWidth - (wide ? 236 : 16)) / maxW), MIN_Z, MAX_Z);
        const cx = (window.innerWidth - (wide ? 220 : 0)) / 2 - r.left;
        const cy = window.innerHeight / 2 - (wide ? 0 : 28) - r.top;
        viewBeforePreview.current = viewRef.current;
        glide({ x: cx - (f.x + w / 2) * z, y: cy - (f.y + h / 2) * z, z });
        window.setTimeout(() => setPreviewId(id), SETTLE_MS);
      } else {
        setPreviewId(id);
      }
    });
  };
  const closePreview = () => {
    setPreviewId(null);
    const back = viewBeforePreview.current;
    viewBeforePreview.current = null;
    if (back) window.setTimeout(() => glide(back), 220);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editAccess !== "editable") return;
      const t = e.target as HTMLElement;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);
      if (typing) return;
      // the confirm dialog and the preview own the keyboard while they are up
      if (confirmClear || previewId !== null) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selectedIds.length === 0 && selectedFrameId) duplicateFrameRef.current(selectedFrameId);
        else duplicateSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "c") {
        /* with nothing selected, or text highlighted somewhere, the browser keeps its own copy */
        if (selectedIds.length === 0 || window.getSelection()?.toString()) return;
        e.preventDefault();
        copySelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        if (!clipboardRef.current) return;
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
        return;
      }
      if (e.key === " " && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedIds.length === 0 && selectedFrameId)
          deleteFrame(selectedFrameId);
        else deleteSelected();
        return;
      }
      if (e.key === "Escape") {
        setSelectedIds([]);
        setSelectedFrameId(null);
        setSelectedLinkId(null);
        return;
      }
      if (e.key === "p" || e.key === "P") {
        openPreviewRef.current();
        return;
      }
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const s = e.shiftKey ? 10 : 1;
        nudge(
          e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0,
          e.key === "ArrowUp" ? -s : e.key === "ArrowDown" ? s : 0,
        );
        return;
      }
      if (mod) return;
      if (e.key === "v" || e.key === "V") setMode("select");
      if (e.key === "h" || e.key === "H") setMode("hand");
      if (e.key === "=" || e.key === "+") setZoomAt(viewRef.current.z * 1.2);
      if (e.key === "-" || e.key === "_") setZoomAt(viewRef.current.z / 1.2);
      if (e.key === "0") fitRef.current();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    deleteSelected,
    duplicateSelected,
    copySelected,
    pasteClipboard,
    groupSelected,
    ungroupSelected,
    nudge,
    redo,
    undo,
    setZoomAt,
    selectedIds,
    selectedFrameId,
    deleteFrame,
    confirmClear,
    previewId,
    editAccess,
  ]);
  const openPreviewRef = useRef(openPreview);
  openPreviewRef.current = openPreview;

  /* ---------- render ---------- */
  const dragSize = drag ? sizeOf(drag.item, widths) : { w: 0, h: 0 };
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const doc: Doc = useMemo(
    () => ({ groups, frames, paletteKey, frame, title, brief, promptEdit, platform: platform ?? undefined, customPalette: customPalette ?? undefined, dynamicColor, theme }),
    [groups, frames, paletteKey, frame, title, brief, promptEdit, platform, customPalette, dynamicColor, theme],
  );
  /** the same document, for callbacks that were created on an earlier render */
  const docRef = useRef(doc);
  docRef.current = doc;

  /** arrows from tappable parts to the frames they open */
  const links = useMemo(() => {
    if (frame !== "phone") return [];
    const rects = itemRects();
    const out: {
      id: string;
      d: string;
      mx: number;
      my: number;
      tx: number;
      ty: number;
      ang: number;
      t: Transition;
    }[] = [];
    for (const g of groups) {
      for (const it of g.items) {
        for (const { slot, action } of actionsOf(it)) {
        if (action.to === BACK_TARGET) continue;
        const f = frames.find((x) => x.id === action.to);
        const r = rects.find((x) => x.id === it.id);
        if (!f || !r) continue;
        const fr = frameRect(f);
        const rightward = (fr.l + fr.r) / 2 >= (r.l + r.r) / 2;
        const sx = rightward ? r.r : r.l;
        const sy = (r.t + r.b) / 2;
        const tx = rightward ? fr.l - BEZEL : fr.r + BEZEL;
        const ty = clamp(sy, fr.t + 40, fr.b - 40);
        const dx = Math.max(60, Math.abs(tx - sx) * 0.5);
        const c1x = sx + (rightward ? dx : -dx);
        const c2x = tx + (rightward ? -dx : dx);
        const d = `M${sx} ${sy} C${c1x} ${sy} ${c2x} ${ty} ${tx} ${ty}`;
        // midpoint of the cubic at t = 0.5
        const mx = 0.125 * sx + 0.375 * c1x + 0.375 * c2x + 0.125 * tx;
        const my = 0.125 * sy + 0.375 * sy + 0.375 * ty + 0.125 * ty;
        out.push({
          id: `${it.id}|${slot}`,
          d,
          mx,
          my,
          tx,
          ty,
          ang: rightward ? 0 : 180,
          t: action.transition,
        });
        }
      }
    }
    return out;
  }, [groups, frames, frame, itemRects, widths]);

  /** apply a change to the action behind a link id ("itemId|slot") */
  const patchLink = (linkId: string, fn: (a: Action) => Action | undefined) => {
    const [itemId, slot] = linkId.split("|");
    setGroups((gs) =>
      gs.map((g) => ({
        ...g,
        items: g.items.map((it) => {
          if (it.id !== itemId) return it;
          if (!slot) return { ...it, action: it.action ? fn(it.action) : undefined };
          const cur = it.actions?.[slot];
          if (!cur) return it;
          const next = fn(cur);
          const actions = { ...(it.actions ?? {}) };
          if (next) actions[slot] = next;
          else delete actions[slot];
          return { ...it, actions: Object.keys(actions).length ? actions : undefined };
        }),
      })),
    );
  };

  const setLinkTransition = (linkId: string, transition: Transition) => {
    snapshotFor("link:" + linkId);
    patchLink(linkId, (a) => ({ ...a, transition }));
  };
  const removeLink = (linkId: string) => {
    snapshot();
    patchLink(linkId, () => undefined);
    setSelectedLinkId(null);
  };

  const runRadii = (
    axis: Axis,
    first: boolean,
    last: boolean,
    prevPh: boolean,
    nextPh: boolean,
    pull: number,
    outer: number,
    inner: number,
  ): Radii => {
    const soft = lerp(outer, inner, pull);
    const s = first ? outer : prevPh ? soft : inner;
    const e = last ? outer : nextPh ? soft : inner;
    return axis === "x"
      ? { tl: s, bl: s, tr: e, br: e }
      : { tl: s, tr: s, bl: e, br: e };
  };

  /** which frame each run sits on (phone mode only) */
  const frameOf = useMemo(() => {
    const m = new Map<string, string>();
    if (frame !== "phone") return m;
    for (const g of groups) {
      const f = frameOfGroup(g, frames, widths);
      if (f) m.set(g.id, f.id);
    }
    return m;
  }, [groups, frames, frame, widths]);

  /** the screen whose layers the panel lists: the selection's, else the chosen one */
  const layersFrame = useMemo(() => {
    if (frame !== "phone") return null;
    if (primaryId) {
      const g = groups.find((x) => x.items.some((it) => it.id === primaryId));
      const fid = g ? frameOf.get(g.id) : undefined;
      if (fid) return frames.find((f) => f.id === fid) ?? null;
    }
    if (selectedFrameId) return frames.find((f) => f.id === selectedFrameId) ?? null;
    return frames.find((f) => f.id === layersFrameId) ?? frames[0] ?? null;
  }, [frame, primaryId, groups, frameOf, frames, selectedFrameId, layersFrameId]);
  const layerGroups = useMemo(
    () => (layersFrame ? groups.filter((g) => frameOf.get(g.id) === layersFrame.id) : []),
    [groups, frameOf, layersFrame],
  );
  /** A drag in the layers panel is one undo step: the snapshot is taken when it starts,
   *  and the reorders it fires along the way record nothing more. */
  const layerDragRef = useRef(false);
  const onLayerDragging = (dragging: boolean) => {
    if (dragging && !layerDragRef.current) snapshot();
    layerDragRef.current = dragging;
  };
  const layerSnapshot = (key: string) => {
    if (!layerDragRef.current) snapshotFor(key);
  };

  const reorderLayers = (topFirst: string[]) => {
    const inFrame = new Set(topFirst);
    const byId = new Map(groupsRef.current.map((g) => [g.id, g]));
    const ordered = [...topFirst].reverse().map((id) => byId.get(id)).filter((g): g is Group => !!g);
    if (ordered.length !== inFrame.size) return;
    layerSnapshot("layers:" + (layersFrame?.id ?? ""));
    for (const id of inFrame) instantRef.current.add(id);
    setGroups((gs) => [...gs.filter((g) => !inFrame.has(g.id)), ...ordered]);
  };

  /** The parts of one group in a new order: reading order for a connected run, back to
   *  front for a free group. Inside a free group a hidden run keeps its slots, handed out
   *  again in the new order, so reordering a list really moves its rows. */
  const reorderGroupItems = (groupId: string, order: string[]) => {
    const g = groupsRef.current.find((x) => x.id === groupId);
    if (!g) return;
    const byId = new Map(g.items.map((it) => [it.id, it]));
    const items = order.map((id) => byId.get(id)).filter((it): it is Item => !!it);
    if (items.length !== g.items.length || new Set(order).size !== order.length) return;
    layerSnapshot("layers:items:" + groupId);
    instantRef.current.add(groupId);
    if (!g.free) {
      setGroups((gs) => gs.map((x) => (x.id === groupId ? { ...x, items } : x)));
      return;
    }
    const rank = new Map(items.map((it, i) => [it.id, i]));
    const pos = { ...(g.pos ?? {}) };
    for (const run of explodeGroup(g, widthsRef.current)) {
      if (run.items.length < 2) continue;
      const slots = run.items.map((it) => pos[it.id] ?? { x: 0, y: 0 });
      const members = [...run.items].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
      members.forEach((it, i) => {
        pos[it.id] = slots[i];
      });
    }
    setGroups((gs) => gs.map((x) => (x.id === groupId ? { ...x, items, pos } : x)));
  };

  const renderGroup = (g: Group, ox: number, oy: number) => {
    if (g.free) {
      const instantG = instantRef.current.has(g.id);
      const allOn = g.items.every((it) => selectedSet.has(it.id));
      const corners = freeRadii(g, widths);
      return (
        <motion.div
          key={g.id}
          initial={false}
          animate={{ x: g.x - ox, y: g.y - oy }}
          transition={instantG ? INSTANT : OPEN}
          style={{ position: "absolute", left: 0, top: 0 }}
        >
          {layoutOf(g, widths).map((pl) => (
            <div key={pl.item.id} style={{ position: "absolute", left: pl.x - g.x, top: pl.y - g.y }}>
              <M3Node
                item={pl.item}
                palette={p}
                widths={widths}
                radii={corners.get(pl.item.id)}
                pressed={false}
                selected={selectedSet.has(pl.item.id)}
                interactive={!handMode}
                onPointerDown={(e) => onItemPointerDown(e, g, pl.index, pl.item)}
              />
            </div>
          ))}
          {allOn && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: -6,
                top: -6,
                width: groupBounds(g, widths).r - g.x + 12,
                height: groupBounds(g, widths).b - g.y + 12,
                border: `${1.5 / view.z}px dashed ${p.primary}`,
                borderRadius: 10,
                pointerEvents: "none",
              }}
            />
          )}
        </motion.div>
      );
    }
    const snap = drag?.active && drag.snap?.groupId === g.id ? drag.snap : null;
    const pull = snap?.pull ?? 0;
    const phMain = snap ? (g.axis === "x" ? dragSize.w : dragSize.h) * pull : 0;
    const shift = snap && snap.index === 0 ? -(phMain + GAP) : 0;
    const conn = g.items[0] ? connectSpecOf(g.items[0]) : undefined;

    type Cell = { ph: true } | { ph: false; item: Item; index: number };
    const cells: Cell[] = [];
    for (let i = 0; i <= g.items.length; i++) {
      if (snap && snap.index === i) cells.push({ ph: true });
      if (i < g.items.length)
        cells.push({ ph: false, item: g.items[i], index: i });
    }
    const m = cells.length;
    const instant = instantRef.current.has(g.id);

    return (
      <motion.div
        key={g.id}
        initial={false}
        animate={{
          x: g.x - ox + (g.axis === "x" ? shift : 0),
          y: g.y - oy + (g.axis === "y" ? shift : 0),
        }}
        transition={instant ? INSTANT : OPEN}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          display: "flex",
          flexDirection: g.axis === "x" ? "row" : "column",
          alignItems: g.axis === "x" ? "center" : "stretch",
          gap: GAP,
        }}
      >
        {cells.map((c, r) => {
          if (c.ph) {
            return (
              <motion.div
                key="__gap"
                initial={g.axis === "x" ? { width: 0 } : { height: 0 }}
                animate={
                  g.axis === "x" ? { width: phMain } : { height: phMain }
                }
                transition={OPEN}
                style={{
                  flex: "0 0 auto",
                  height: g.axis === "x" ? dragSize.h : undefined,
                  width: g.axis === "y" ? dragSize.w : undefined,
                }}
              />
            );
          }
          const ic = connectSpecOf(c.item);
          const radii =
            conn && ic
              ? runRadii(
                  g.axis,
                  r === 0,
                  r === m - 1,
                  r > 0 && cells[r - 1].ph,
                  r < m - 1 && cells[r + 1].ph,
                  pull,
                  ic.outer,
                  ic.inner,
                )
              : baseRadii(c.item);
          return (
            <M3Node
              key={c.item.id}
              item={c.item}
              palette={p}
              widths={widths}
              radii={radii}
              pressed={pressedId === c.item.id}
              selected={selectedSet.has(c.item.id)}
              interactive={!handMode}
              onPointerDown={(e) => onItemPointerDown(e, g, c.index, c.item)}
            />
          );
        })}
      </motion.div>
    );
  };

  const handMode = !isMobile && (mode === "hand" || spaceHeld);
  const panning = gesture?.kind === "pan";
  const marquee = gesture?.kind === "marquee" && gesture.moved ? gesture : null;
  const canvasBg = frame === "phone" ? p.surfaceContainerLow : "#ffffff";

  const panelStyle: React.CSSProperties = {
    background: p.surface,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
    flex: "0 0 auto",
  };

  const showRight = rightOpen && !isMobile;
  const guide = drag?.active ? drag.guide : null;
  const visibleWorld = (() => {
    const r = canvasRef.current?.getBoundingClientRect();
    return {
      l: -view.x / view.z,
      t: -view.y / view.z,
      w: (r?.width ?? 0) / view.z,
      h: (r?.height ?? 0) / view.z,
    };
  })();

  return (
    <LangContext.Provider value={lang}>
    <ThemeContext.Provider value={theme}>
      <div
        className={revealing ? "app-root m3e-reveal" : "app-root"}
        inert={editAccess !== "editable"}
        aria-hidden={editAccess !== "editable"}
        style={{
          display: "flex",
          overflow: "hidden",
          background: p.surfaceContainer,
          cursor: resizing ? "col-resize" : undefined,
          userSelect: resizing ? "none" : undefined,
          ["--sb" as string]: p.outlineVariant,
        }}
      >
        {/* hidden measuring layer for text-sized kinds */}
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: -99999,
            top: 0,
            visibility: "hidden",
            pointerEvents: "none",
            fontFamily: fontFamilyOf(theme.font, lang),
          }}
        >
          {allItems
            .filter((it) => MEASURED.includes(it.kind))
            .map((it) => (
              <div
                key={it.id}
                ref={(el) => {
                  if (el) measureEls.current.set(it.id, el);
                  else measureEls.current.delete(it.id);
                }}
                style={{
                  display: "inline-flex",
                  boxSizing: "border-box",
                  border:
                    it.variant === "outlined" &&
                    (it.kind === "button" ||
                      it.kind === "chip" ||
                      it.kind === "extendedFab")
                      ? "1px solid transparent"
                      : "none",
                }}
              >
                <MeasuredContent item={it} p={p} />
              </div>
            ))}
        </div>

        {exportFrame && (
          <div aria-hidden style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none", fontFamily: fontFamilyOf(theme.font, lang) }}>
            {renderExport(exportFrame)}
          </div>
        )}

        {/* ---- left: rail + parts / layers ---- */}
        {!isMobile && (
          <aside style={{ ...panelStyle, width: leftOpen ? leftW : RAIL_W, flexDirection: "row", transition: "width 200ms cubic-bezier(0.2, 0, 0, 1)" }}>
            <div
              onPointerEnter={() => setRailHover(true)}
              onPointerLeave={() => setRailHover(false)}
              onClick={(e) => {
                // a click on the rail's empty background opens the panel
                if (!leftOpen && e.target === e.currentTarget) setLeftOpen(true);
              }}
              style={{
                width: RAIL_W,
                flex: "0 0 auto",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: "10px 0",
                background: p.surfaceContainerLow,
                cursor: leftOpen ? undefined : "pointer",
              }}
            >
              {!leftOpen && railHover ? (
                <IconBtn icon="left_panel_open" p={p} on onClick={() => setLeftOpen(true)} title={t("openPanel", lang)} size={40} />
              ) : (
                <div
                  onClick={() => !leftOpen && setLeftOpen(true)}
                  style={{ width: 40, height: 40, display: "grid", placeItems: "center", cursor: leftOpen ? "default" : "pointer" }}
                >
                  <Logo size={32} color={p.primary} glyph={p.onPrimary} />
                </div>
              )}
              <div style={{ height: 6 }} />
              {LEFT_TABS.map((tab, i) => (
                <div key={tab.key} style={{ marginTop: i === 2 || i === 6 ? 10 : 0 }}>
                  <IconBtn
                    icon={tab.icon}
                    p={p}
                    on={leftOpen && leftTab === tab.key}
                    onClick={() => {
                      setLeftTab(tab.key);
                      setLeftOpen(true);
                    }}
                    title={t(tab.title, lang)}
                    size={44}
                  />
                </div>
              ))}
              <div style={{ flex: 1 }} onClick={() => !leftOpen && setLeftOpen(true)} />
              <LangMenu p={p} onLang={changeLanguage} side="right" size={44} />
              <GitHubLink p={p} size={44} />
            </div>
            {leftOpen && (
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 10px 0 14px",
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    color: p.onSurface,
                    flex: 1,
                  }}
                >
                  {t(LEFT_TABS.find((x) => x.key === leftTab)?.title ?? "parts", lang)}
                </span>
                <IconBtn
                  icon="left_panel_close"
                  p={p}
                  onClick={() => setLeftOpen(false)}
                  title={t("closePanel", lang)}
                />
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {leftTab === "parts" ? (
                  <PartsPalette
                    palette={p}
                    favorites={favorites}
                    onToggleFavorite={(k) =>
                      setFavorites((f) =>
                        f.includes(k) ? f.filter((x) => x !== k) : [...f, k],
                      )
                    }
                    onPartPointerDown={onPartPointerDown}
                    overBin={(!!drag?.active && drag.overBin) || (gesture?.kind === "group" && gesture.overBin)}
                  />
                ) : leftTab === "color" ? (
                  <ColorPanel
                    p={p}
                    paletteKey={paletteKey}
                    onPalette={setPaletteKey}
                    custom={customPalette}
                    onCustom={setCustomPalette}
                    dynamic={dynamicColor}
                    onDynamic={setDynamicColor}
                    theme={theme}
                    onTheme={patchTheme}
                  />
                ) : leftTab === "shape" ? (
                  <ShapePanel p={p} theme={theme} onChange={patchTheme} />
                ) : leftTab === "type" ? (
                  <TypePanel p={p} theme={theme} onChange={patchTheme} />
                ) : leftTab === "motion" ? (
                  <MotionPanel p={p} theme={theme} onChange={patchTheme} />
                ) : leftTab === "ai" ? (
                  <AiPanel p={p} settings={aiSettings} onSettings={updateAiSettings} />
                ) : (
                  <LayersPanel
                    p={p}
                    frames={frames}
                    frameId={layersFrame?.id ?? null}
                    onFrame={(id) => {
                      setLayersFrameId(id);
                      setSelectedIds([]);
                      setSelectedFrameId(id);
                    }}
                    groups={layerGroups}
                    widths={widths}
                    selectedIds={selectedIds}
                    onSelect={(ids, add) => {
                      setSelectedIds((cur) => (add ? [...cur.filter((x) => !ids.includes(x)), ...ids] : ids));
                      setSelectedFrameId(null);
                      setSelectedLinkId(null);
                      setRightTab("edit");
                    }}
                    onReorder={reorderLayers}
                    onReorderItems={reorderGroupItems}
                    onDragging={onLayerDragging}
                  />
                )}
              </div>
            </div>
            )}
            {leftOpen && (
            <div
              onPointerDown={(e) => {
                e.preventDefault();
                setResizing("left");
              }}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                right: -3,
                width: 6,
                cursor: "col-resize",
                zIndex: 5,
              }}
            />
            )}
          </aside>
        )}

        {/* ---- canvas ---- */}
        <main
          style={{
            flex: 1,
            position: "relative",
            minWidth: 0,
            padding: isMobile ? 6 : 8,
          }}
        >
          <div
            ref={canvasRef}
            onPointerDown={onCanvasPointerDown}
            onPointerDownCapture={onTouchCapture}
            style={{
              position: "absolute",
              inset: isMobile ? 6 : 8,
              overflow: "hidden",
              borderRadius: 24,
              background: canvasBg,
              cursor: panning ? "grabbing" : handMode ? "grab" : "default",
              touchAction: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
                transformOrigin: "0 0",
                transition: cameraEasing ? `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)` : undefined,
                willChange: "transform",
                visibility: viewReady ? "visible" : "hidden",
                fontFamily: fontFamilyOf(theme.font, lang),
              }}
            >
              {frame === "phone" &&
                frames.map((f) => {
                  const on = f.id === selectedFrameId;
                  const bg = p[f.bg ?? "surface"];
                  const { w, h } = frameSizeOf(f);
                  const radius = frameRadius(f);
                  return (
                    <div
                      key={f.id}
                      data-frame={f.id}
                      style={{ position: "absolute", left: f.x, top: f.y, transition: easing ? `left ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)` : undefined }}
                    >
                      <div
                        onPointerDown={(e) => onFramePointerDown(e, f)}
                        style={{
                          position: "absolute",
                          left: -BEZEL,
                          top: -BEZEL - FRAME_LABEL_H,
                          height: FRAME_LABEL_H,
                          /* follows the zoom, softened: a little larger when zoomed out, a little smaller when zoomed in */
                          transform: `scale(${clamp(1 / view.z, 0.7, 1.4)})`,
                          transformOrigin: "left bottom",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "0 8px",
                          fontSize: 20,
                          fontWeight: 600,
                          color: on ? p.primary : p.onSurfaceVariant,
                          cursor: handMode ? "grab" : "move",
                          userSelect: "none",
                          whiteSpace: "nowrap",
                          fontFamily: uiFontFamily(lang),
                        }}
                      >
                        <div onPointerDown={(e) => e.stopPropagation()}>
                          <FrameSizePicker frame={f} onChange={(preset) => setFramePreset(f.id, preset)} palette={p} compact />
                        </div>
                        {f.name || t("screen", lang)}
                      </div>
                      <div
                        onPointerDown={(e) => onFramePointerDown(e, f)}
                        style={{
                          position: "absolute",
                          left: -BEZEL,
                          top: -BEZEL,
                          overflow: "hidden",
                          width: w + BEZEL * 2,
                          height: h + BEZEL * 2,
                          borderRadius: radius + BEZEL,
                          backgroundColor: p.inverseSurface,
                          backgroundImage: draftBusy ? DRAFT_GRADIENT(p) : undefined,
                          backgroundSize: draftBusy ? "300% 300%" : undefined,
                          animation: draftBusy ? "m3e-drift 3s ease-in-out infinite" : undefined,
                          boxShadow: on
                            ? `0 0 0 3px ${p.primary}, 0 18px 50px rgba(0,0,0,0.16)`
                            : "0 18px 50px rgba(0,0,0,0.14)",
                          cursor: handMode ? "grab" : "move",
                          transition: `box-shadow 120ms, ${SIZE_TRANSITION}`,
                        }}
                      >
                        <AnimatePresence>{aiFrameId === f.id && <ThinkingRing key="ring" p={p} frame={f} />}</AnimatePresence>
                        <div
                          data-screen={f.id}
                          style={{
                            position: "absolute",
                            left: BEZEL,
                            top: BEZEL,
                            width: w,
                            height: h,
                            borderRadius: radius,
                            background: bg,
                            overflow: "hidden",
                            transition: SIZE_TRANSITION,
                          }}
                        >
                          {groups
                            .filter((g) => frameOf.get(g.id) === f.id)
                            .map((g) => renderGroup(g, f.x, f.y))}
                          {draftBusy && (
                            <div style={{ position: "absolute", inset: 0, zIndex: 90, background: canvasBg, display: "grid", placeItems: "center" }}>
                              <LoadingIndicator size={96} color="url(#m3e-drafting)" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

              {groups
                .filter((g) => !frameOf.has(g.id))
                .map((g) => renderGroup(g, 0, 0))}

              {/* the part in flight */}
              {drag?.active && (
                <motion.div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    x: sx,
                    y: sy,
                    pointerEvents: "none",
                    zIndex: 50,
                  }}
                  animate={{
                    opacity: drag.overBin ? 0.4 : 1,
                    scale: drag.overBin ? 0.84 : 1,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 520,
                    damping: 34,
                    mass: 0.6,
                  }}
                >
                  <M3Node
                    item={drag.item}
                    palette={p}
                    widths={widths}
                    dragging
                    radii={(() => {
                      const conn = connectSpecOf(drag.item);
                      if (!conn || !drag.snap) return baseRadii(drag.item);
                      const g = groupsRef.current.find(
                        (x) => x.id === drag.snap!.groupId,
                      );
                      const mm = (g?.items.length ?? 0) + 1;
                      const k = drag.snap.index;
                      return runRadii(
                        conn.axis,
                        k === 0,
                        k === mm - 1,
                        k > 0,
                        k < mm - 1,
                        drag.snap.pull,
                        conn.outer,
                        conn.inner,
                      );
                    })()}
                  />
                </motion.div>
              )}

              {links.length > 0 && (
                <svg
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    overflow: "visible",
                    pointerEvents: "none",
                  }}
                  width={1}
                  height={1}
                >
                  <defs>
                    <marker
                      id="m3e-arrow"
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="8"
                      markerHeight="8"
                      orient="auto"
                    >
                      <path d="M0 0 L10 5 L0 10 z" fill={p.primary} />
                    </marker>
                  </defs>
                  {!draftBusy && links.map((l) => {
                    const on = l.id === selectedLinkId;
                    return (
                      <g key={l.id}>
                        <path
                          d={l.d}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={18 / view.z}
                          style={{ pointerEvents: "stroke", cursor: "pointer" }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelectedLinkId(l.id);
                            setSelectedIds([]);
                            setSelectedFrameId(null);
                          }}
                        />
                        <path
                          d={l.d}
                          fill="none"
                          stroke={p.primary}
                          strokeWidth={on ? 3 : 2}
                          strokeDasharray={on ? undefined : "6 6"}
                          strokeLinecap="round"
                          markerEnd="url(#m3e-arrow)"
                          opacity={on ? 1 : 0.7}
                        />
                      </g>
                    );
                  })}
                </svg>
              )}

              {links
                .filter((l) => l.id === selectedLinkId)
                .map((l) => (
                  <div
                    key={l.id}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute",
                      left: l.mx,
                      top: l.my,
                      transform: `translate(-50%, 14px) scale(${1 / view.z})`,
                      transformOrigin: "50% 0",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: 6,
                      borderRadius: 26,
                      background: p.surfaceContainerLow,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.16)",
                      zIndex: 60,
                    }}
                  >
                    <Segmented<Transition>
                      options={TRANSITIONS.map((t) => ({
                        key: t.key,
                        icon: t.icon,
                        title: t.label,
                      }))}
                      value={l.t}
                      onChange={(t) => setLinkTransition(l.id, t)}
                      p={p}
                      height={36}
                      grow={false}
                    />
                    <IconBtn
                      icon="link_off"
                      p={p}
                      danger
                      onClick={() => removeLink(l.id)}
                      title={t("removeLink", lang)}
                      size={36}
                    />
                  </div>
                ))}

              {guide?.gx !== undefined && (
                <div
                  style={{
                    position: "absolute",
                    left: guide.gx,
                    top: visibleWorld.t,
                    width: 1.5 / view.z,
                    height: visibleWorld.h,
                    background: p.primary,
                    pointerEvents: "none",
                  }}
                />
              )}
              {guide?.gy !== undefined && (
                <div
                  style={{
                    position: "absolute",
                    top: guide.gy,
                    left: visibleWorld.l,
                    height: 1.5 / view.z,
                    width: visibleWorld.w,
                    background: p.primary,
                    pointerEvents: "none",
                  }}
                />
              )}

              {marquee && (
                <div
                  style={{
                    position: "absolute",
                    left: Math.min(marquee.x0, marquee.x1),
                    top: Math.min(marquee.y0, marquee.y1),
                    width: Math.abs(marquee.x1 - marquee.x0),
                    height: Math.abs(marquee.y1 - marquee.y0),
                    border: `${1 / view.z}px solid ${p.primary}`,
                    background: `${p.primary}14`,
                    borderRadius: 4 / view.z,
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          </div>

          {draftBusy && (
            <div style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden>
              <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
                <defs>
                  <linearGradient id="m3e-drafting" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={p.primary} />
                    <stop offset="50%" stopColor={p.tertiaryContainer} />
                    <stop offset="100%" stopColor={p.primaryContainer} />
                    <animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur="3s" repeatCount="indefinite" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          )}
          <Toolbar
            p={p}
            mode={mode}
            onMode={setMode}
            frame={frame}
            onFrame={changeFrame}
            zoom={view.z}
            onZoom={(z) => setZoomAt(z)}
            onFit={fit}
            canUndo={pastRef.current.length > 0}
            canRedo={futureRef.current.length > 0}
            onUndo={undo}
            onRedo={redo}
            onClear={() => {
              if (groupsRef.current.length || framesRef.current.length) setConfirmClear(true);
            }}
            onAddFrame={addFrame}
            onPreview={() => openPreview()}
            tidy={selectedIds.length > 1 ? undefined : tidyState ?? undefined}
            onTidy={tidyTarget ? () => tidy(tidyTarget) : undefined}
            place={tidyTarget?.place}
            onPlace={tidyTarget ? (pl) => setPlace(tidyTarget, pl) : undefined}
            note={aiNote}
            onSaveProject={() => saveProject(doc)}
            onOpenProject={() => projectFileRef.current?.click()}
            onShare={!isMobile ? () => setShareOpen(true) : undefined}
            shareState={draftBusy ? "busy" : draftBefore ? "review" : "idle"}
            onDraftKeep={keepDraft}
            onDraftUndo={undoDraft}
            onDraftSave={() => saveProject(doc)}
            quickUndo={quickUndo}
            rightInset={showRight ? rightW : 0}
            mobile={isMobile}
            onSettings={() => setSheet(sheet === "settings" ? null : "settings")}
            onLangSheet={() => setSheet(sheet === "lang" ? null : "lang")}
            onPrompt={async () => {
              try {
                await navigator.clipboard.writeText(effectivePrompt(doc, widths, lang));
                showToast(t("copied", lang), 1400, "check");
              } catch {}
            }}
          />

          {isMobile && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 80,
                textAlign: "center",
                fontSize: 11,
                lineHeight: 1.4,
                color: p.onSurfaceVariant,
                pointerEvents: "none",
                zIndex: 40,
              }}
            >
              {t("mobileNote", lang)}
            </div>
          )}

          {isMobile && sheet === null && (
            <button
              onClick={addButton}
              title={t("addButton", lang)}
              aria-label={t("addButton", lang)}
              className="m3-press"
              style={{
                position: "absolute",
                right: 16,
                bottom: "calc(16px + var(--bottom-ui, 0px) + env(safe-area-inset-bottom))",
                width: 64,
                height: 64,
                borderRadius: 20,
                border: "none",
                background: p.primary,
                color: p.onPrimary,
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                zIndex: 46,
                boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
              }}
            >
              <Icon name="add" size={32} />
            </button>
          )}

          {isMobile && selected && sheet === null && (
            <MobileActionBar
              p={p}
              onEdit={() => setSheet("edit")}
              onDuplicate={duplicateSelected}
              onDelete={deleteSelected}
            />
          )}

          <AnimatePresence>
            {isMobile && sheet === "edit" && selected && (
              <BottomSheet key="edit" p={p} onClose={() => setSheet(null)}>
                <MobileInspector
                  item={selected}
                  palette={p}
                  onChange={patchSelected}
                  onDelete={() => {
                    deleteSelected();
                    setSheet(null);
                  }}
                  onDuplicate={duplicateSelected}
                  onClose={() => setSheet(null)}
                />
              </BottomSheet>
            )}
            {isMobile && sheet === "settings" && (
              <BottomSheet key="settings" p={p} onClose={() => setSheet(null)}>
                <MobileSettings palette={p} paletteKey={paletteKey} onPalette={setPaletteKey} theme={theme} onTheme={patchTheme} />
              </BottomSheet>
            )}
            {isMobile && sheet === "lang" && (
              <BottomSheet key="lang" p={p} onClose={() => setSheet(null)}>
                <MobileLang
                  palette={p}
                  lang={lang}
                  onLang={(l) => {
                    changeLanguage(l);
                    setSheet(null);
                  }}
                />
              </BottomSheet>
            )}
          </AnimatePresence>

          {toast && (
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: 96,
                transform: "translateX(-50%)",
                padding: "10px 18px",
                borderRadius: 20,
                background: p.inverseSurface,
                color: p.inverseOnSurface,
                fontSize: 13,
                fontWeight: 600,
                zIndex: 47,
                pointerEvents: "none",
              }}
            >
              {toast}
            </div>
          )}

          {!rightOpen && !isMobile && (
            <div
              style={{ position: "absolute", right: 20, top: 20, zIndex: 45 }}
            >
              <IconBtn
                icon="right_panel_open"
                p={p}
                on
                onClick={() => setRightOpen(true)}
                title={t("edit", lang)}
                size={44}
              />
            </div>
          )}
        </main>

        {/* ---- right: inspector / prompt ---- */}
        {showRight && (
          <aside style={{ ...panelStyle, width: rightW }}>
            <div
              onPointerDown={(e) => {
                e.preventDefault();
                setResizing("right");
              }}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: -3,
                width: 6,
                cursor: "col-resize",
                zIndex: 5,
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 10px 6px 12px",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <Segmented<"edit" | "prompt">
                  options={[
                    { key: "edit", icon: "tune", title: t("edit", lang), grow: false, wide: true },
                    { key: "prompt", icon: "auto_awesome", label: t("prompt", lang), title: t("prompt", lang), grow: true },
                  ]}
                  value={rightTab}
                  onChange={setRightTab}
                  p={p}
                  height={40}
                />
              </div>
              <IconBtn
                icon="right_panel_close"
                p={p}
                onClick={() => setRightOpen(false)}
                title={t("closePanel", lang)}
              />
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {rightTab === "edit" && selectedFrame && !selected ? (
                <FrameInspector
                  frame={selectedFrame}
                  palette={p}
                  onSize={(preset) => setFramePreset(selectedFrame.id, preset)}
                  onChange={(patch) => patchFrame(selectedFrame.id, patch)}
                  onDelete={() => deleteFrame(selectedFrame.id)}
                  onDuplicate={() => duplicateFrame(selectedFrame.id)}
                  onPreview={() => openPreview(selectedFrame.id)}
                  prompt={buildPrompt(doc, widths, selectedFrame.id, lang)}
                  onSaveImage={() => saveFrameImage(selectedFrame)}
                  frames={frames}
                  tidy={tidyState ?? "done"}
                  onTidy={() => tidy(selectedFrame)}
                  onPlace={(pl) => setPlace(selectedFrame, pl)}
                  ai={{ ready: aiReady, reason: aiReason, busy: aiBusy && aiFrameId === selectedFrame.id, onRun: () => runAi("describe", selectedFrame), onCancel: cancelAi }}
                />
              ) : rightTab === "edit" ? (
                <Inspector
                  ai={{
                    ready: aiReady && !!tidyTarget,
                    reason: aiReason,
                    busy: aiBusy,
                    onRun: () => {
                      if (tidyTarget && selected) runAi("behavior", tidyTarget, selected.id);
                    },
                    onCancel: cancelAi,
                  }}
                  item={selectedIds.length > 1 ? null : selected}
                  frame={selectedPartFrame}
                  palette={p}
                  frames={frame === "phone" ? frames : []}
                  onChange={patchSelected}
                  onDelete={deleteSelected}
                  onDuplicate={duplicateSelected}
                  onAlign={alignSelected}
                  multi={selectedIds.length}
                  grouped={!!selectedGroup}
                  onGroup={groupSelected}
                  onUngroup={ungroupSelected}
                />
              ) : (
                <PromptPanel
                  doc={doc}
                  widths={widths}
                  palette={p}
                  onDoc={(patch) => {
                    if (patch.title !== undefined) setTitle(patch.title);
                    if (patch.brief !== undefined) setBrief(patch.brief);
                    if ("promptEdit" in patch) setPromptEdit(patch.promptEdit);
                    if ("platform" in patch) setPlatform(isPlatform(patch.platform) ? patch.platform : null);
                  }}
                />
              )}
            </div>
          </aside>
        )}

        <input
          ref={projectFileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void readProject(file).then((next) => (next ? setPendingImport(next) : showToast(t("invalidProject", lang), 3000, "error")));
          }}
        />

        <ConfirmDialog
          open={pendingImport !== null}
          icon="file_open"
          title={t("replaceProjectTitle", lang)}
          body={t("replaceProject", lang)}
          p={p}
          onCancel={() => setPendingImport(null)}
          onConfirm={() => {
            if (pendingImport) importDoc(pendingImport);
            setPendingImport(null);
          }}
        />

        <ShareDialog
          p={p}
          doc={doc}
          aiReady={aiReady}
          idea={ideaText}
          onIdea={setIdeaText}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          onDraft={(idea) => void startDraft(idea)}
          onSetupAi={() => {
            setShareOpen(false);
            setLeftOpen(true);
            setLeftTab("ai");
          }}
        />


        <ConfirmDialog
          open={confirmClear}
          title={t("clearAllTitle", lang)}
          body={t("clearAllBody", lang)}
          p={p}
          onCancel={() => setConfirmClear(false)}
          onConfirm={clearAll}
        />

        <AnimatePresence>
          {previewId !== null && frames.length > 0 && (
            <Preview
              key="preview"
              doc={doc}
              widths={widths}
              palette={p}
              startId={previewId}
              onClose={closePreview}
            />
          )}
        </AnimatePresence>
      </div>

      {editAccess === "readonly" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-access-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "rgba(0,0,0,0.32)",
          }}
        >
            <div
              style={{
                width: "min(420px, 100%)",
                padding: 24,
                borderRadius: 28,
                background: p.surfaceContainerHigh,
                color: p.onSurface,
                boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
              }}
            >
              <Icon name="lock" size={28} />
              <h1 id="edit-access-title" style={{ margin: "16px 0 8px", fontSize: 22, lineHeight: 1.25 }}>
                {t("readOnlyTitle", lang)}
              </h1>
              <p style={{ margin: 0, color: p.onSurfaceVariant, fontSize: 14, lineHeight: 1.5 }}>
                {t("readOnlyBody", lang)}
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                <button
                  autoFocus
                  className="m3-press"
                  onClick={() => window.location.reload()}
                  style={{
                    minHeight: 40,
                    padding: "0 20px",
                    border: "none",
                    borderRadius: 20,
                    background: p.primary,
                    color: p.onPrimary,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {t("reload", lang)}
                </button>
              </div>
            </div>
        </div>
      )}
    </ThemeContext.Provider>
    </LangContext.Provider>
  );
}
