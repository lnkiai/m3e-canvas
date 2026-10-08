"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { AnimatePresence, motion, useReducedMotion, useSpring } from "motion/react";
import { toPng } from "html-to-image";
import { buildPrompt, effectivePrompt } from "@/lib/prompt";
import {
  Action,
  actionsOf,
  Axis,
  BACK_TARGET,
  baseRadii,
  draftGradient,
  BUTTON_H_MAX,
  BUTTON_H_MIN,
  CHIP_H_MAX,
  CHIP_H_MIN,
  FAB_H_MAX,
  FAB_H_MIN,
  isFab,
  isProgress,
  isMeasured,
  fabOpen,
  hasMenu,
  menuOpen,
  splitMenuRisesAt,
  menuUp,
  opensMenu,
  splitOpens,
  hasPickerFields,
  migrateCarousel,
  migrateFabMenu,
  migratePicker,
  isSheetBox,
  migrateSheetBox,
  buttonHeightOf,
  explodeGroup,
  freeRadii,
  radiiOfRuns,
  BEZEL,
  canJoin,
  clamp,
  connectSpecOf,
  Doc,
  isPlatform,
  Platform,
  Frame,
  Place,
  FramePreset,
  FRAME_GAP,
  FRAME_LABEL_H,
  FrameMode,
  frameOfGroup,
  framePresetPatch,
  frameRadius,
  frameRect,
  frameSizeOf,
  frameLengthOf,
  carryItemSize,
  matchRunSize,
  runSizePatch,
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
  SETTLE_CSS_VARS,
  SETTLE_MS,
  sizeOf,
  toggleIcon,
  SNAP_CROSS,
  SNAP_MAIN,
  Transition,
  TRANSITIONS,
  uid,
  uniformRadii,
  FULL_WIDTH,
  fitHeight,
  railExpansionSide,
  CONTENT_W,
  contentWidth,
} from "@/lib/tokens";
import { Icon, M3Node, M3Static, MeasuredContent } from "@/components/M3Node";
import { CORNER_GAIN, CORNERS, HandleSide, SizeHandles } from "@/components/SizeHandles";
import { LayersPanel } from "@/components/Layers";
import { FrameSizePicker, Inspector } from "@/components/Inspector";
import { FrameInspector } from "@/components/FramePanel";
import { Preview } from "@/components/Preview";
import { Logo } from "@/components/Logo";
import { PartsPalette } from "@/components/PartsPalette";
import { PromptPanel } from "@/components/PromptPanel";
import { GitHubLink, Mode, Toolbar } from "@/components/Toolbar";
import { LangMenu } from "@/components/Menus";
import { AiActionKey, AiPanel, aiErrorText } from "@/components/AiPanel";
import { TidyState, PANEL_FADE_H } from "@/components/ui";
import { AiSettings, DEFAULT_AI, hasKey, isSecureUrl, loadAiSettings, proposeBehavior, proposeDescription, pushHistory, saveAiSettings } from "@/lib/ai";
import { barSlotOf, bodyRect, carryFrame, holdsEdgeBar, maxFrameLength, minFrameLength, pullInto, stretchFrame, tidyFrame } from "@/lib/tidy";
import { constrainModalRails, modalRailOf, updateRail } from "@/lib/rail";
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
import { Lang, LangContext, SEED_TEXT, getLang, setGlobalLang, t, translateDefaultFrameName, translateDefaultText } from "@/lib/i18n";

/** the screens while a model drafts: primary, tertiary and primary container, drifting */
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
/** a cancelled part shrinking away: long enough to be seen, short enough not to be waited for */
const VANISH_MS = 180;
const VANISH = { duration: VANISH_MS / 1000, ease: [0.3, 0, 0.8, 0.15] as const };
/** a hole opening or closing: the run's offset travels on the same curve the hole's own width does */
const GAP_TWEEN = { duration: SETTLE_MS / 1000, ease: [0.2, 0, 0, 1] as const };

/** the icon rail on the left edge of the parts / layers panel */
const RAIL_W = 52;
const MIN_Z = 0.25;
const MAX_Z = 3;
/** the room a screen keeps from the canvas edges when the camera glides to it: the floating
 *  toolbar's row at the top, a margin elsewhere */
const GLIDE_TOP = 84;
const GLIDE_PAD = 40;
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
  /** the part as it was picked up, before any run it hovered lent it its size */
  base: Item;
  /** where the part was held when it was picked up; the magnet is worked out from these, so a
   *  run lending the part its size never moves the search out from under itself */
  baseOffX: number;
  baseOffY: number;
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
  /** let go where it cannot land: the ghost shrinks away before the state is cleared */
  vanishing: boolean;
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
  | { kind: "group"; id: string; sx: number; sy: number; gx: number; gy: number; moved: boolean; overBin: boolean; guide?: Guide | null };

/** everything in a document apart from its screens and parts */
type DocMeta = Omit<Doc, "groups" | "frames">;
/** an undo step: the screens and parts, plus the rest of the document for steps that replaced it all */
type Snapshot = { groups: Group[]; frames: Frame[]; meta?: DocMeta };

/** The parts a lone one of can be resized on the canvas itself: the controls that carry a size,
 *  and the indicators, whose width is the thing an author reaches for most. */
const HANDLED = new Set<Kind>([
  "button", "iconButton", "chip", "splitButton", "fab", "extendedFab",
  "linearProgress", "circularProgress", "loadingIndicator", "slider", "carousel",
  "card", "box", "bottomSheet", "image", "camera", "map", "listItem", "searchBar", "textField", "select", "switch", "divider",
  "topAppBar", "bottomNav", "tabs", "navRail",
]);
/** parts held by the four points around them: a circle's diameter, a label's height */
const ROUND = new Set<Kind>(["iconButton", "chip", "splitButton", "fab", "extendedFab", "circularProgress", "loadingIndicator"]);
/** the button family: sized on the button scale rather than by the bounds their kind is given */
const BUTTON_LIKE = new Set<Kind>(["button", "iconButton", "chip", "splitButton", "fab", "extendedFab"]);
/** these are held by their two ends; they have no height of their own to pull on */
const WIDE = new Set<Kind>(["linearProgress", "slider", "listItem", "searchBar", "textField", "select", "switch", "divider", "topAppBar", "bottomNav", "tabs"]);
const BAR_SIDES = ["left", "right"] as const;
/** a carousel runs the width of the screen, a rail the height of it: only the other measure is pulled on */
const TALL = new Set<Kind>(["carousel", "navRail"]);
const TALL_SIDES = ["top", "bottom"] as const;
/** parts with one measure whichever side is pulled; none today, a picture has two */

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
  /* a badge was a part of its own once; it is gone, and a sketch that held one loses it */
  const kept = groups
    .map((g) => ({ ...g, items: g.items.filter((it) => (it.kind as string) !== "badge") }))
    .filter((g) => g.items.length > 0);
  /* a menu used to be a part of its own; now it is something a FAB is asked to open */
  let out = kept.map((g) => (g.items.some((it) => it.kind === "fabMenu") ? { ...g, items: g.items.map(migrateFabMenu) } : g));
  /* a carousel used to be one box with one caption and one destination; now every card has its own */
  out = out.map((g) => (g.items.some((it) => it.kind === "carousel" && (it.label || it.action)) ? { ...g, items: g.items.map(migrateCarousel) } : g));
  /* a picker used to carry a chosen day and time; it shows today and now, so those fields go */
  out = out.map((g) => (g.items.some(hasPickerFields) ? { ...g, items: g.items.map(migratePicker) } : g));
  /* a box with its handle on used to stand in for a bottom sheet; the sheet is its own part now */
  out = out.map((g) => (g.items.some(isSheetBox) ? { ...g, items: g.items.map(migrateSheetBox) } : g));
  /* a carousel is as wide as the screen it stands on, whatever size that screen is */
  out = out.map((g) => {
    if (!g.items.some((it) => it.kind === "carousel")) return g;
    const f = frames.find((fr) => {
      const r = frameRect(fr);
      return g.x >= r.l - 1 && g.x <= r.r && g.y >= r.t - 1 && g.y <= r.b;
    });
    const w = f ? frameSizeOf(f).w : PHONE_W;
    if (g.items.every((it) => it.kind !== "carousel" || (it.size ?? KIND_SPEC.carousel.defSize) === w)) return g;
    return { ...g, items: g.items.map((it) => (it.kind === "carousel" ? { ...it, size: w } : it)) };
  });
  return out.map((g) => {
    if (g.items.length !== 1 || g.items[0].kind !== "bottomNav") return g;
    const f = frames.find((fr) => {
      const r = frameRect(fr);
      return g.x >= r.l - 1 && g.x <= r.r && g.y === r.b - oldNavH;
    });
    return f ? { ...g, y: frameRect(f).b - KIND_SPEC.bottomNav.h } : g;
  });
}

/** A copy of a unit under fresh ids, moved by (dx, dy). A copied modal rail starts collapsed
 *  and standard: a screen shows one modal rail, and the copy sits inward of the edge the
 *  original remembered. */
function rekeyed(g: Group, dx: number, dy: number): Group {
  const idMap = new Map(g.items.map((it) => [it.id, uid()]));
  const pos: Record<string, { x: number; y: number }> | undefined = g.pos ? {} : undefined;
  if (pos) for (const it of g.items) pos[idMap.get(it.id)!] = g.pos?.[it.id] ?? { x: 0, y: 0 };
  const items = g.items.map((it) => {
    const copy: Item = { ...structuredClone(it), id: idMap.get(it.id)! };
    if (copy.kind === "navRail" && copy.railModal) {
      copy.railModal = false;
      copy.railExpanded = false;
      delete copy[railExpansionSide];
    }
    return copy;
  });
  return { ...structuredClone(g), id: uid(), x: g.x + dx, y: g.y + dy, pos, items };
}

/** the ids of the copies, with the copy of the part that was primary last, so it stays the one the panel shows */
function copiedIds(copies: Group[], primaryAt: number): string[] {
  const ids = copies.flatMap((c) => c.items.map((it) => it.id));
  if (primaryAt < 0 || primaryAt >= ids.length) return ids;
  return [...ids.slice(0, primaryAt), ...ids.slice(primaryAt + 1), ids[primaryAt]];
}

/** Seed ids are deterministic so server and client render the same markup. */
/* shown when an edit is refused because the group is locked */
const lockedGroupMsg = () => t("lockedGroup", getLang());

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
  const w = frameSizeOf(frame).w + BEZEL * 2;
  const h = frameLengthOf(frame) + BEZEL * 2;
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

export default function Editor({ initialLang, onReady }: { initialLang: Lang; onReady?: () => void }) {
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  /* ---------- document ---------- */
  const [lang, setLang] = useState<Lang>(initialLang);
  const [editAccess, setEditAccess] = useState<"checking" | "editable" | "readonly">("checking");
  const [groups, setGroupState] = useState<Group[]>(() => seed(initialLang));
  /* Enforce the standalone-modal rule for imports, grouping, undo and all edits. */
  const setGroups = useCallback((next: Group[] | ((prev: Group[]) => Group[])) => {
    setGroupState((prev) => constrainModalRails(typeof next === "function" ? next(prev) : next));
  }, []);
  const [frames, setFrames] = useState<Frame[]>(() => [{ ...SEED_FRAMES[0], name: t("home", initialLang) }]);
  const [paletteKey, setPaletteKey] = useState("purple");
  const [customPalette, setCustomPalette] = useState<Palette | null>(null);
  const [dynamicColor, setDynamicColor] = useState(false);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const patchTheme = (patch: Partial<Theme>) => setTheme((t) => ({ ...t, ...patch }));
  const [frame, setFrame] = useState<FrameMode>("phone");
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
  const [promptOptions, setPromptOptions] = useState<string[] | undefined>(undefined);
  /** the prompt's full-screen cover is up: the panel's own band steps aside while it is */
  const [promptCoverUp, setPromptCoverUp] = useState(false);
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

  const p = useMemo(() => paletteOf(paletteKey, customPalette, theme), [paletteKey, customPalette, theme]);
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
  const previewIdRef = useRef(previewId);
  previewIdRef.current = previewId;
  const leftOpenRef = useRef(leftOpen);
  leftOpenRef.current = leftOpen;
  const leftWRef = useRef(leftW);
  leftWRef.current = leftW;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const spaceRef = useRef(spaceHeld);
  spaceRef.current = spaceHeld;
  /** focus last moved with Tab, not with a pointer */
  const tabbedRef = useRef(false);
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
  const initialLangRef = useRef<Lang>(initialLang);
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
    // A document can arrive during the opening glide, before previewId is set. The
    // screen the glide was heading for belongs to the replaced document, so the pending
    // opening is dropped and the camera returns; an open preview simply closes.
    if (previewTimer.current !== null) abandonPreview();
    else {
      /* a return still on its way would drag the camera off the new document's fit */
      cancelReturn();
      if (previewIdRef.current !== null) {
        setPreviewId(null);
        viewBeforePreview.current = null;
      }
    }
    const frames = Array.isArray(doc.frames) ? doc.frames : framesRef.current;
    if (Array.isArray(doc.groups)) setGroups(migrateGroups(doc.groups, frames));
    if (Array.isArray(doc.frames)) setFrames(doc.frames);
    if (typeof doc.paletteKey === "string" && doc.paletteKey) setPaletteKey(doc.paletteKey);
    else if (reset) setPaletteKey("purple");
    /* normalize once so a scheme saved before the secondary role gets it and keeps it on re-save */
    if (doc.customPalette && typeof doc.customPalette.primary === "string") setCustomPalette(paletteOf("custom", doc.customPalette));
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
    if (Array.isArray(doc.promptOptions)) setPromptOptions(doc.promptOptions);
    else if (reset) setPromptOptions(undefined);
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
      } else {
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
    /* the document is in state; one frame later it is on screen and the boot overlay may go.
       Not cancelled on cleanup: the development double-run skips this effect the second time. */
    requestAnimationFrame(() => onReadyRef.current?.());
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
        JSON.stringify({ groups, frames, paletteKey, frame, title, brief, promptEdit, promptOptions, platform: platform ?? undefined, customPalette: customPalette ?? undefined, dynamicColor, theme }),
      );
    } catch {}
  }, [editAccess, groups, frames, paletteKey, frame, title, brief, promptEdit, promptOptions, platform, customPalette, dynamicColor, theme]);

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
          /* the theme's surfaces, so the shell drawn before the editor loads is already this colour */
          boot: { surface: p.surface, container: p.surfaceContainer, low: p.surfaceContainerLow, high: p.surfaceContainerHigh, primary: p.primary, canvas: frame === "phone" ? p.surfaceContainerLow : "#ffffff" },
        }),
      );
    } catch {}
  }, [
    view,
    leftOpen,
    rightOpen,
    leftW,
    rightW,
    p,
    frame,
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

  /** a FAB whose size the author just changed, and the corner it is to keep. A part as wide as
   *  its own label is only measured after it is drawn, so the corner is put right once the
   *  measuring pass knows how wide it came out. */
  const fabAnchor = useRef<{ id: string; right: number; bottom: number } | null>(null);
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
    const anchor = fabAnchor.current;
    if (!anchor) return;
    const g = groupsRef.current.find((x) => x.items.some((it) => it.id === anchor.id));
    const item = g?.items.find((it) => it.id === anchor.id);
    if (!g || !item) {
      fabAnchor.current = null;
      return;
    }
    const sz = sizeOf(item, next);
    const dx = anchor.right - (g.x + sz.w);
    const dy = anchor.bottom - (g.y + sz.h);
    fabAnchor.current = null;
    if (!dx && !dy) return;
    instantRef.current.add(g.id);
    setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, x: x.x + dx, y: x.y + dy } : x)));
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
  const inCanvas = (clientX: number, clientY: number) => {
    const r = canvasRect();
    return !!r && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  };
  const toWorld = (clientX: number, clientY: number) => {
    const r = canvasRect();
    const v = viewRef.current;
    return {
      x: (clientX - (r?.left ?? 0) - v.x) / v.z,
      y: (clientY - (r?.top ?? 0) - v.y) / v.z,
    };
  };
  /* only the open left panel accepts a drop for deletion; the narrow rail never does */
  const inBin = (clientX: number) =>
    !mobileRef.current && leftOpenRef.current && clientX >= 0 && clientX <= leftWRef.current;

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
      let best: Snap | null = null;
      let bestD = 1;
      for (const g of groupsRef.current) {
        /* a locked run is finished: nothing joins it, so it never moves to make room */
        if (g.free || g.locked || g.axis !== spec.axis || !g.items[0] || !canJoin(g.items[0], item))
          continue;
        const sz = sizeRef(item);
        /* across the run, the part and the band it would join are lined up by their middles:
         * a small part carried onto a tall run should still find it, and it takes the run's
         * size as it lands anyway */
        const band = g.items.reduce((m, it) => Math.max(m, spec.axis === "x" ? sizeRef(it).h : sizeRef(it).w), 0);
        for (let k = 0; k <= g.items.length; k++) {
          const r = restPos(g, k, sz);
          const dx = left - r.left;
          const dy = top - r.top;
          const mid = spec.axis === "x" ? top + sz.h / 2 - (g.y + band / 2) : left + sz.w / 2 - (g.x + band / 2);
          const nMain = (spec.axis === "x" ? dx : dy) / SNAP_MAIN;
          const nCross = mid / SNAP_CROSS;
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
  const guideFor = useCallback(
    (left: number, top: number, sz: { w: number; h: number }, skip: Set<string>): Guide | null => {
      const tol = GUIDE_PX / viewRef.current.z;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const g of groupsRef.current) {
        for (const pl of layoutOf(g, widthsRef.current)) {
          if (skip.has(pl.item.id)) continue;
          xs.push(pl.x, pl.x + pl.w / 2, pl.x + pl.w);
          ys.push(pl.y, pl.y + pl.h / 2, pl.y + pl.h);
        }
      }
      if (frameRef.current === "phone") {
        for (const f of framesRef.current) {
          const { w } = frameSizeOf(f);
          const h = frameLengthOf(f);
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
    [],
  );
  const findGuide = useCallback(
    (item: Item, left: number, top: number): Guide | null => guideFor(left, top, sizeRef(item), new Set([item.id])),
    [guideFor, sizeRef],
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

  /** where the finger is inside the part being carried: the copy that follows the pointer is
   *  drawn lit at that point, so the light of the press is not lost when the drag begins */
  const [dragLit, setDragLit] = useState<{ x: number; y: number; at: number } | null>(null);
  /** the part that has just landed, and where the press was on it: it takes the light over,
   *  already grown, and lets it go out in place */
  const [landed, setLanded] = useState<{ id: string; x: number; y: number } | null>(null);
  const landTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (landTimer.current) clearTimeout(landTimer.current); }, []);
  /* a drop that adds or deletes nothing: the ghost fades and shrinks where it was let go, so the
   * cancel is seen rather than the part simply blinking out */
  const vanishDrag = (d: DragState) => {
    setDrag({ ...d, vanishing: true, overBin: false, snap: null, guide: null });
    window.setTimeout(() => setDrag((cur) => (cur?.vanishing ? null : cur)), VANISH_MS);
  };
  const lightLands = (id: string, x: number, y: number) => {
    setLanded({ id, x, y });
    if (landTimer.current) clearTimeout(landTimer.current);
    /* long enough to be drawn: taking it away again is what makes it fade */
    landTimer.current = setTimeout(() => setLanded(null), 50);
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
      /* a locked group stays selectable, but dragging it does nothing */
      if (g.locked) return;
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
    /* a locked group's part stays selectable, but dragging it does nothing */
    if (g.locked) return;
    setPressedId(item.id);
    /* the moment of the press travels with it, so the light carries on rather than starting over
       when the part is handed to the copy that follows the pointer */
    setDragLit({ x: pt.x - left, y: pt.y - top, at: performance.now() });
    const d: DragState = {
      item,
      base: item,
      baseOffX: pt.x - left,
      baseOffY: pt.y - top,
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
      vanishing: false,
      guide: null,
    };
    dragRef.current = d;
    setDrag({ ...d });
  };

  /** The group a new part becomes when it lands with its top-left at rawX/rawY, on the screen
   *  under its centre if there is one. A bar spans that screen beside its rail; any other part
   *  keeps its phone-sized default (a list or a field as wide as a desktop is rarely what the
   *  author means), but no taller than the screen. Off any guide the part settles on the 4dp
   *  grid of the screen it lands on; `held` names the axes that keep their whole pixel instead
   *  (a guide's hold, or a Ctrl drop). A part that grew to the screen's width is kept inside it,
   *  then settles back on the grid. */
  const landNewPart = (item: Item, rawX: number, rawY: number, held: (axis: "x" | "y") => boolean): Group => {
    const sz = sizeOf(item, widthsRef.current);
    const targetFrame = framesRef.current.find((f) => {
      const r = frameRect(f);
      const cx = rawX + sz.w / 2;
      const cy = rawY + sz.h / 2;
      return cx >= r.l && cx <= r.r && cy >= r.t && cy <= r.b;
    });
    const slot = targetFrame ? barSlotOf(groupsRef.current, targetFrame, framesRef.current, widthsRef.current) : null;
    const isBar = FULL_WIDTH.includes(item.kind);
    const placedItem = targetFrame && slot ? (isBar ? carryItemSize(item, { w: PHONE_W, h: PHONE_H }, { w: slot.w, h: frameSizeOf(targetFrame).h }) : fitHeight(item, frameSizeOf(targetFrame).h)) : item;
    const origin = targetFrame ?? { x: 0, y: 0 };
    const settle = (axis: "x" | "y", pos: number) => (held(axis) ? Math.round(pos) : onGrid(pos, origin[axis]));
    const landed: Group = {
      id: uid(),
      x: isBar && slot ? Math.round(slot.x) : settle("x", rawX),
      y: settle("y", rawY),
      axis: connectSpecOf(item)?.axis ?? "x",
      items: [placedItem],
    };
    const pulled = targetFrame ? pullInto(landed, targetFrame, widthsRef.current) : landed;
    if (pulled === landed) return pulled;
    return { ...pulled, x: held("x") ? pulled.x : onGrid(pulled.x, origin.x), y: held("y") ? pulled.y : onGrid(pulled.y, origin.y) };
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
    setDragLit({ x: offX, y: offY, at: performance.now() });
    const d: DragState = {
      item,
      base: item,
      baseOffX: offX,
      baseOffY: offY,
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
      vanishing: false,
      guide: null,
    };
    dragRef.current = d;
    setDrag({ ...d });
  };

  /** the in-flight size drag on a lone button's edge handle */
  const [widthDragId, setWidthDragId] = useState<string | null>(null);
  /** a size drag from the panel's slider is in flight: the part follows the slider with no easing */
  const [sizeEditId, setSizeEditId] = useState<string | null>(null);
  const sizeEditTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (sizeEditTimer.current) clearTimeout(sizeEditTimer.current); }, []);
  const lastSizeEdit = useRef<{ id: string; t: number } | null>(null);
  const markSizeEdit = (id: string) => {
    const now = performance.now();
    const prev = lastSizeEdit.current;
    lastSizeEdit.current = { id, t: now };
    /* one tap on a preset is a size to grow into; a stream of them is a drag, and a drag
     * must land where the pointer is rather than trail an easing behind it */
    if (!prev || prev.id !== id || now - prev.t > 150) return;
    setSizeEditId(id);
    if (sizeEditTimer.current) clearTimeout(sizeEditTimer.current);
    sizeEditTimer.current = setTimeout(() => setSizeEditId(null), 400);
  };
  /** how far the group under a left- or top-edge drag is drawn from where it sits, so the opposite
   *  edge stays put. It rides on the same commit as the new size, which keeps the two in step; the
   *  group's own position only moves once the drag ends. */
  const [widthShift, setWidthShift] = useState<{ gid: string; dx: number; dy: number } | null>(null);
  const widthDragRef = useRef<{
    id: string;
    gid: string;
    side: HandleSide;
    vertical: boolean;
    round: boolean;
    tall: boolean;
    /** the part must stay at least as wide as it is tall */
    grows: boolean;
    startX: number;
    startY: number;
    start0: number;
    startV: number;
    v: number;
    min: number;
    max: number;
    /** the undo step for this drag has been taken: it is taken at the first change */
    taken: boolean;
    /** a square picture: either side pulls its one measure */
  } | null>(null);
  /** What a handle on this side of the part changes, and how far it may be pulled: the measure
   *  it holds, and the bounds that measure has for this kind on this screen. A drag and a key
   *  press read the same answer. */
  const sizeDragSpec = (item: Item, side: HandleSide, f: Frame | null) => {
    const vertical = side === "top" || side === "bottom";
    /* a circle is pulled by a point on it: the drag reads along the diagonal and the one
     * measure it has -- its diameter -- follows, so it stays round the whole way */
    const round = CORNERS.includes(side);
    /* an extended FAB, a chip and a split button are as wide as their label makes them:
     * their one measure is height */
    const tall = item.kind === "extendedFab" || item.kind === "chip" || item.kind === "splitButton";
    const box = sizeOf(item, widthsRef.current);
    const startV = vertical || tall ? box.h : box.w;
    /* any part outside the button family is sized the way its panel sizes it: between the
     * bounds its kind is given, and a part as wide as the screen it sits on at most */
    const gauge = !BUTTON_LIKE.has(item.kind);
    /* across, the part's own measure; down, the second one it may have */
    const gaugeSpec = vertical ? KIND_SPEC[item.kind].size2 : KIND_SPEC[item.kind].size;
    /* only a button must stay at least as wide as it is tall: it is a circle at its narrowest */
    const grows = item.kind === "button";
    const { w: screenW, h: screenH } = f ? frameSizeOf(f) : { w: PHONE_W, h: PHONE_H };
    /* a bound written as the phone's size means the screen's, whatever screen this is */
    const onScreen = (v: number | undefined, fallback: number) => (v === undefined ? fallback : v === PHONE_W ? screenW : v === PHONE_H ? screenH : v === CONTENT_W ? contentWidth(screenW) : v);
    return {
      vertical,
      round,
      tall,
      grows,
      startV,
      /* a button is a circle at its narrowest, so its height says how narrow it may be drawn; a
       * kind handled without a spec for this measure is simply not pulled */
      min: gauge ? (gaugeSpec?.min ?? startV) : isFab(item.kind) ? (tall ? KIND_SPEC.extendedFab.h : FAB_H_MIN) : item.kind === "chip" ? CHIP_H_MIN : vertical || round ? BUTTON_H_MIN : buttonHeightOf(item),
      max: gauge
        ? Math.max(startV, onScreen(gaugeSpec?.max, startV))
        : isFab(item.kind)
          ? FAB_H_MAX
          : item.kind === "chip"
            ? CHIP_H_MAX
            : vertical || round
              ? BUTTON_H_MAX
              : screenW,
    };
  };
  /** the patch a new measure is: the height for a part held top and bottom or as wide as its
   *  label, the width or diameter for the rest; a button set narrower than it is tall grows */
  const sizePatch = (item: Item, d: { vertical: boolean; tall: boolean; grows: boolean }, v: number): Partial<Item> =>
    d.vertical || d.tall ? { size2: v, ...(d.grows && item.size && item.size < v ? { size: v } : {}) } : { size: v };
  /** a handle pulled by the keyboard: one 4dp step out or in, kept the way a panel change is */
  const nudgeSize = (g: Group, item: Item, side: HandleSide, dir: 1 | -1) => {
    const d = sizeDragSpec(item, side, frameOfGroup(g, framesRef.current, widthsRef.current) ?? null);
    const v = clamp(Math.round(d.startV / 4) * 4 + dir * 4, d.min, d.max);
    if (v === d.startV) return;
    patchSelected(sizePatch(item, d, v));
  };
  /* a drag that outlives the editor leaves nothing listening behind it */
  const widthDragEnd = useRef<(() => void) | null>(null);
  useEffect(() => () => widthDragEnd.current?.(), []);
  const onWidthHandleDown = (e: React.PointerEvent, g: Group, item: Item, side: HandleSide) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    flushPending();
    const f = frameOfGroup(g, framesRef.current, widthsRef.current);
    const spec = sizeDragSpec(item, side, f ?? null);
    widthDragRef.current = {
      id: item.id,
      gid: g.id,
      side,
      ...spec,
      startX: e.clientX,
      startY: e.clientY,
      start0: spec.vertical ? e.clientY : e.clientX,
      v: spec.startV,
      taken: false,
    };
    setWidthDragId(item.id);
    const move = (ev: PointerEvent) => {
      const d = widthDragRef.current;
      if (!d) return;
      const z = viewRef.current.z;
      let raw: number;
      if (d.round) {
        /* how far the point travelled along its own diagonal, the two axes counting equally, read
           back as size through the gain the point itself is drawn with: it stays under the pointer */
        const dx = ((ev.clientX - d.startX) / z) * (d.side === "tl" || d.side === "bl" ? -1 : 1);
        const dy = ((ev.clientY - d.startY) / z) * (d.side === "tl" || d.side === "tr" ? -1 : 1);
        raw = d.startV + (dx + dy) / CORNER_GAIN;
      } else {
        const delta = ((d.vertical ? ev.clientY : ev.clientX) - d.start0) / z;
        raw = d.startV + (d.side === "right" || d.side === "bottom" ? delta : -delta);
      }
      const v = clamp(Math.round(raw / 4) * 4, d.min, d.max);
      if (v === d.v) return;
      /* the undo step is taken at the first change, so a handle merely pressed leaves none */
      if (!d.taken) {
        snapshot();
        d.taken = true;
      }
      d.v = v;
      /* a FAB hangs off its own corner, so its run is drawn at an offset that changes with the
         size: it has to land with the pointer rather than ease after it */
      instantRef.current.add(d.gid);
      /* whichever point is held, the one across from it stays where it is */
      const back = d.startV - v;
      if (d.side === "left") setWidthShift({ gid: d.gid, dx: back, dy: 0 });
      if (d.side === "top") setWidthShift({ gid: d.gid, dx: 0, dy: back });
      /* a part as wide as its label makes it grows only in height, so its left side stays put */
      if (d.round && d.side !== "br") {
        setWidthShift({ gid: d.gid, dx: !d.tall && (d.side === "tl" || d.side === "bl") ? back : 0, dy: d.side === "tl" || d.side === "tr" ? back : 0 });
      }
      setGroups((prev) =>
        prev.map((gr) =>
          gr.id !== d.gid
            ? gr
            : {
                ...gr,
                items: gr.items.map((it) => (it.id !== d.id ? it : { ...it, ...sizePatch(it, d, v) })),
              },
        ),
      );

    };
    const up = () => {
      const d = widthDragRef.current;
      /* the drawn offset becomes the group's real position, in one step and with no easing */
      if (d && d.v !== d.startV && d.side !== "right" && d.side !== "bottom" && d.side !== "br") {
        const shift = d.startV - d.v;
        const movesX = !d.tall && (d.side === "left" || d.side === "tl" || d.side === "bl");
        const movesY = d.side === "top" || d.side === "tl" || d.side === "tr";
        instantRef.current.add(d.gid);
        setGroups((prev) =>
          prev.map((gr) => (gr.id !== d.gid ? gr : { ...gr, x: gr.x + (movesX ? shift : 0), y: gr.y + (movesY ? shift : 0) })),
        );
      }
      setWidthShift(null);
      widthDragRef.current = null;
      setWidthDragId(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      widthDragEnd.current = null;
    };
    widthDragEnd.current = up;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const isDragging = drag !== null;

  useEffect(() => {
    if (!isDragging) return;
    /* Ctrl overrides auto-snap for as long as it is held: no magnet slot, no
       alignment guide, no 4dp grid. A pointer move carries its own ctrlKey, and
       key events cover the moments in between when the pointer is still. */
    let ctrlHeld = false;

    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const pt = toWorld(e.clientX, e.clientY);
      d.px = pt.x;
      d.py = pt.y;
      ctrlHeld = e.ctrlKey || e.metaKey;

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
        /* the run keeps the hole the part came out of: it closes only once the part is carried
         * out of reach, rather than snapping shut the moment the drag begins */
        const from = groupsRef.current.find((x) => !x.free && x.items.length > 1 && x.items.some((it) => it.id === id));
        if (from) {
          const index = from.items.findIndex((it) => it.id === id);
          const sz = sizeRef(d.item);
          d.snap = { groupId: from.id, index, pull: 1 };
          holdGap(from.id, index, sz.w, sz.h, true);
        }
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

      /* a part being added from the palette has nothing to delete yet; dropping it back there just cancels */
      d.overBin = !d.fromPalette && inBin(e.clientX);
      /* a palette part only lands where the pointer is released inside the canvas, so it must
       * not join a run (nor hold a gap open) while the pointer is still over the palette */
      const outside = d.fromPalette && !inCanvas(e.clientX, e.clientY);
      d.snap =
        d.overBin || ctrlHeld || outside
          ? null
          : findSnap(d.base, pt.x - d.baseOffX, pt.y - d.baseOffY);
      /* the run that is standing still sets the size: the part in flight takes it while it is
       * held over the run, and has its own back the moment it is carried away again */
      const host = d.snap ? groupsRef.current.find((g) => g.id === d.snap!.groupId)?.items[0] : undefined;
      d.item = host ? matchRunSize(d.base, host) : d.base;
      /* a part that grew or shrank keeps the same spot under the finger */
      const was = sizeRef(d.base);
      const now = sizeRef(d.item);
      d.offX = was.w ? (d.baseOffX * now.w) / was.w : d.baseOffX;
      d.offY = was.h ? (d.baseOffY * now.h) / was.h : d.baseOffY;
      if (d.snap) holdGap(d.snap.groupId, d.snap.index, now.w, now.h);
      else closeGap();
      d.guide =
        d.overBin || d.snap || ctrlHeld
          ? null
          : findGuide(d.item, pt.x - d.offX, pt.y - d.offY);
      setDrag({ ...d });
    };

    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      setPressedId(null);
      /* the finger is off: whatever is holding the light lets it go out */
      setDragLit(null);
      if (!d) return;
      if (!d.active) {
        setDrag(null);
        return;
      }

      const loose = ctrlHeld || e.ctrlKey || e.metaKey;

      const item = d.item;
      const sz = sizeRef(item);

      if (d.overBin) {
        setSelectedIds((cur) => cur.filter((x) => x !== item.id));
        vanishDrag(d);
        return;
      }

      if (!loose && d.snap) {
        const t = d.snap;
        setDrag({ ...d, snap: { ...t, pull: 1 }, settling: true });
        const commit = () => {
          /* the run's own position takes the new first part's width in one step: the hole it was
           * holding open is handed straight to the part, with nothing sliding */
          if (t.index === 0) instantRef.current.add(t.groupId);
          if (gapTimer.current) clearTimeout(gapTimer.current);
          setGap(null);
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
          lightLands(item.id, d.offX, d.offY);
          setDrag(null);
        };
        const timer = window.setTimeout(() => {
          pendingRef.current = null;
          commit();
        }, SETTLE_MS);
        pendingRef.current = { timer, commit };
        return;
      }

      /* A palette part is accepted by the canvas only when the pointer is released over it.
       * Testing the part's bounds here made a click in the palette add any wide part whose
       * preview happened to overlap the canvas. */
      if (d.fromPalette && !inCanvas(e.clientX, e.clientY)) {
        setSelectedIds((cur) => cur.filter((x) => x !== item.id));
        vanishDrag(d);
        return;
      }
      /* a Ctrl drop lands where the cursor is, untouched by any guide hold */
      const rawX = loose ? d.px - d.offX : d.guide?.x ?? d.px - d.offX;
      const rawY = loose ? d.py - d.offY : d.guide?.y ?? d.py - d.offY;
      if (d.fromPalette) snapshot();
      /* Ctrl keeps the pixel the cursor chose and a guide holds its whole-pixel position */
      const ng = landNewPart(item, rawX, rawY, (axis) => loose || (axis === "x" ? d.guide?.gx : d.guide?.gy) !== undefined);
      setGroups((prev) =>
        prev.some((g) => g.items.some((it) => it.id === item.id))
          ? prev
          : [...prev, ng],
      );
      lightLands(item.id, d.offX, d.offY);
      setDrag(null);
    };

    /* Ctrl (or Cmd on a Mac) pressed or released while the pointer is still: the drawn
       magnet and guide must leave (or be free to return) right away, not on the next move */
    const onCtrl = (e: KeyboardEvent, held: boolean) => {
      if ((e.key !== "Control" && e.key !== "Meta") || e.repeat) return;
      const d = dragRef.current;
      if (!d) return;
      ctrlHeld = held;
      if (held) {
        d.snap = null;
        d.guide = null;
      }
      setDrag({ ...d });
    };
    const onCtrlDown = (e: KeyboardEvent) => onCtrl(e, true);
    const onCtrlUp = (e: KeyboardEvent) => onCtrl(e, false);
    window.addEventListener("keydown", onCtrlDown);
    window.addEventListener("keyup", onCtrlUp);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", onCtrlDown);
      window.removeEventListener("keyup", onCtrlUp);
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
        const gr = groupsRef.current.find((x) => x.id === g.id);
        if (!gr) return;
        /* a moved group lines up with its neighbours like a single part does, and off
           any guide settles on the 4dp grid of the screen it is over; Ctrl (or Cmd)
           skips both */
        const moved = { ...gr, x: g.gx + dx, y: g.gy + dy };
        const loose = e.ctrlKey || e.metaKey;
        const b = groupBounds(moved, widthsRef.current);
        const guide = loose || g.overBin ? null : guideFor(b.l, b.t, { w: b.r - b.l, h: b.b - b.t }, new Set(gr.items.map((it) => it.id)));
        g.guide = guide;
        setGesture({ ...g });
        const f = frameOfGroup(moved, framesRef.current, widthsRef.current);
        const placed = loose
          ? moved
          : {
              ...moved,
              x: guide?.x !== undefined ? Math.round(moved.x + guide.x - b.l) : onGrid(moved.x, f?.x ?? 0),
              y: guide?.y !== undefined ? Math.round(moved.y + guide.y - b.t) : onGrid(moved.y, f?.y ?? 0),
            };
        setGroups((gs) => gs.map((x) => (x.id === g.id ? placed : x)));
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
    if (g.items.length !== 1) return none;
    /* a FAB is the part in the corner of a screen: it grows and shrinks out of that corner,
     * whatever the corner happens to be, rather than out of its top left */
    if (isFab(before.kind) || isFab(after.kind)) {
      const a = sizeOf(before, widthsRef.current);
      const b = sizeOf(after, widthsRef.current);
      /* the corner to keep, put right again once a part as wide as its label has been measured */
      fabAnchor.current = { id: before.id, right: g.x + a.w, bottom: g.y + a.h };
      const measured = MEASURED.includes(after.kind);
      return { dx: measured ? 0 : a.w - b.w, dy: a.h - b.h };
    }
    if (frameRef.current !== "phone") return none;
    const f = frameOfGroup(g, framesRef.current, widthsRef.current);
    if (!f) return none;
    const { w: frameW, h: deviceH } = frameSizeOf(f);
    const frameH = frameLengthOf(f);
    const a = sizeOf(before, widthsRef.current);
    const b = sizeOf(after, widthsRef.current);
    const shift = (pos: number, len: number, next: number, f0: number, fLen: number, foot = true) => {
      const d = next - len;
      if (d === 0) return 0;
      const near = (v: number, target: number) => Math.abs(v - target) <= 1;
      if (near(pos + len / 2, f0 + fLen / 2)) return -Math.round(d / 2);
      if (foot && (near(pos + len, f0 + fLen - FRAME_MARGIN) || near(pos + len, f0 + fLen))) return -d;
      return 0;
    };
    return {
      dx: shift(g.x, a.w, b.w, f.x, frameW),
      /* on a screen that runs further, a part keeps to its foot, or to the middle of the device;
       * the foot of the device is no edge there, since the body runs on past it */
      dy: shift(g.y, a.h, b.h, f.y, frameH) || (frameH > deviceH ? shift(g.y, a.h, b.h, f.y, deviceH, false) : 0),
    };
  };

  const patchSelected = (patch: Partial<Item>) => {
    if (!primaryId) return;
    const id = primaryId;
    /* a locked part is not to be changed at all: its panel is behind a blur, and anything that
     * asks for a change anyway -- a shortcut, the phone's panel -- is turned away here */
    if (groupsRef.current.some((g) => g.locked && g.items.some((it) => it.id === id))) {
      showToast(lockedGroupMsg());
      return;
    }
    /* a rail state change resizes it too, so it counts as a resize for the reflow below */
    const resizes = "size" in patch || "size2" in patch || "railExpanded" in patch || "railModal" in patch;
    snapshotFor(id + ":" + Object.keys(patch).join(","));
    if ("size" in patch || "size2" in patch) markSizeEdit(id);
    /* the shift is worked out here, once, from the groups as they stand: the updater below may
     * be run more than once and must not be the one to remember a FAB's corner */
    const home = groupsRef.current.find((g) => g.items.some((it) => it.id === id));
    const was = home?.items.find((it) => it.id === id);
    const shift = resizes && home && was ? resizeShift(home, was, { ...was, ...patch }) : { dx: 0, dy: 0 };
    if (shift.dx || shift.dy) instantRef.current.add(home!.id);
    setGroups((prev) =>
      "railExpanded" in patch || "railModal" in patch ? updateRail(prev, framesRef.current, widthsRef.current, id, patch) : prev.map((g) => {
        const idx = g.items.findIndex((it) => it.id === id);
        if (idx < 0) return g;
        const next = { ...g.items[idx], ...patch };
        const { dx, dy } = g.id === home?.id ? shift : { dx: 0, dy: 0 };
        return {
          ...g,
          x: g.x + dx,
          y: g.y + dy,
          /* the parts of one run share a height; each keeps its own width */
          items: g.free ? g.items.map((it, i) => (i === idx ? next : it)) : runSizePatch(g.items, id, patch),
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
    /* nothing deletable when every selected part sits in a locked group: no snapshot, keep the selection */
    if (groupsRef.current.every((g) => g.locked || !g.items.some((it) => ids.has(it.id)))) {
      showToast(lockedGroupMsg());
      return;
    }
    snapshot();
    /* some of the selection sits in a locked group: the rest goes, and the author is told why that part stayed */
    if (groupsRef.current.some((g) => g.locked && g.items.some((it) => ids.has(it.id)))) showToast(t("lockedKept", getLang()));
    setGroups((prev) =>
      prev
        .map((g) => {
          /* Delete / Backspace leaves a locked group and its parts alone */
          if (g.locked) return g;
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

  /** every group holding a selected part is locked, so the menu offers to unlock instead */
  const selectedLocked = useMemo(() => {
    const ids = new Set(selectedIds);
    const held = groups.filter((g) => g.items.some((it) => ids.has(it.id)));
    return held.length > 0 && held.every((g) => !!g.locked);
  }, [groups, selectedIds]);

  /** the selection can be placed in a screen: something in it is not a bar, and all of that
   *  stands on one screen -- a selection of bars alone, or one spread over several screens,
   *  has no one body to go to */
  const selectionPlaceable = useMemo(() => {
    const ids = new Set(selectedIds);
    const units = groups.filter((g) => g.items.some((it) => ids.has(it.id)) && !holdsEdgeBar(g));
    if (!units.length) return false;
    const f = frameOfGroup(units[0], frames, widths);
    return !!f && units.every((g) => frameOfGroup(g, frames, widths)?.id === f.id);
  }, [groups, frames, widths, selectedIds]);

  /** the selection covers every group it touches, so locking it locks nothing that was not selected */
  const selectionWhole = useMemo(() => {
    const ids = new Set(selectedIds);
    const held = groups.filter((g) => g.items.some((it) => ids.has(it.id)));
    return held.length > 0 && held.every((g) => g.items.every((it) => ids.has(it.id)));
  }, [groups, selectedIds]);

  /** locks every group holding a selected part, or unlocks them all when they already are */
  const toggleLockSelected = useCallback(() => {
    const ids = new Set(selectedIds);
    const held = groupsRef.current.filter((g) => g.items.some((it) => ids.has(it.id)));
    if (!held.length) return;
    const next = !held.every((g) => !!g.locked);
    snapshot();
    setGroups((gs) => gs.map((g) => (g.items.some((it) => ids.has(it.id)) ? { ...g, locked: next || undefined } : g)));
  }, [selectedIds, snapshot]);

  /** The selection as units that can be copied: a group whose parts are all selected goes
   *  whole, keeping its layout; a part picked out of a larger group goes on its own, at its
   *  place on the canvas. A copy starts unlocked; the lock belongs to the original. */
  const selectionUnits = useCallback((): Group[] => {
    const ids = new Set(selectedIds);
    const rects = new Map(itemRects().map((r) => [r.id, r]));
    const out: Group[] = [];
    for (const g of groupsRef.current) {
      const picked = g.items.filter((it) => ids.has(it.id));
      if (!picked.length) continue;
      if (picked.length === g.items.length) {
        out.push({ ...structuredClone(g), locked: undefined });
        continue;
      }
      for (const it of picked) {
        const r = rects.get(it.id);
        if (r) out.push({ id: g.id, x: r.l, y: r.t, axis: connectSpecOf(it)?.axis ?? "x", items: [structuredClone(it)] });
      }
    }
    return out;
  }, [selectedIds, itemRects]);

  /** duplicates everything selected a step aside, and selects the copies */
  const duplicateSelected = useCallback(() => {
    const units = selectionUnits();
    if (!units.length) return;
    const copies = units.map((u) => rekeyed(u, 24, 24));
    const primaryAt = units.flatMap((u) => u.items.map((it) => it.id)).indexOf(primaryId ?? "");
    snapshot();
    setGroups((prev) => [...prev, ...copies]);
    setSelectedIds(copiedIds(copies, primaryAt));
  }, [selectionUnits, primaryId, snapshot]);

  /* The in-app clipboard: Ctrl+C keeps a copy of the selection (whole groups where the
   * selection covers them) with its offset inside its screen, so Ctrl+V can put it at the
   * same spot on another screen, or a step aside on the same one. The offset is that of the
   * selection's top-left corner, so several units keep their places relative to each other. */
  const clipboardRef = useRef<{ groups: Group[]; dx: number; dy: number; frameId: string | null; primaryAt: number } | null>(null);

  const copySelected = useCallback(() => {
    if (!selected) return;
    const g = groupsRef.current.find((x) => x.items.some((it) => it.id === selected.id));
    if (!g) return;
    const groups = selectionUnits();
    if (!groups.length) return;
    const x = Math.min(...groups.map((u) => u.x));
    const y = Math.min(...groups.map((u) => u.y));
    /* a selection on no screen keeps its canvas position; one on a screen keeps its offset there */
    const f = frameOfGroup(g, framesRef.current, widthsRef.current);
    const primaryAt = groups.flatMap((u) => u.items.map((it) => it.id)).indexOf(selected.id);
    clipboardRef.current = { groups, dx: f ? x - f.x : x, dy: f ? y - f.y : y, frameId: f?.id ?? null, primaryAt };
  }, [selected, selectionUnits]);

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
    const x0 = Math.min(...clip.groups.map((u) => u.x));
    const y0 = Math.min(...clip.groups.map((u) => u.y));
    /* with no screen to land on -- none was copied from, or it is gone -- it goes back where it was copied from */
    let dx = target && clip.frameId ? target.x + clip.dx - x0 : 0;
    let dy = target && clip.frameId ? target.y + clip.dy - y0 : 0;
    /* onto a spot already taken (the source, or an earlier paste) it steps aside like a duplicate;
       a part taken from the middle of a run is known by its own corner, not the run's */
    const taken = new Set([...groupsRef.current.map((g) => `${g.x},${g.y}`), ...itemRects().map((r) => `${r.l},${r.t}`)]);
    while (clip.groups.some((u) => taken.has(`${u.x + dx},${u.y + dy}`))) {
      dx += 24;
      dy += 24;
    }
    const copies = clip.groups.map((u) => rekeyed(u, dx, dy));
    snapshot();
    setGroups((prev) => [...prev, ...copies]);
    setSelectedIds(copiedIds(copies, clip.primaryAt));
    setSelectedFrameId(null);
  }, [selected, selectedFrameId, itemRects, snapshot]);

  /** the free group the whole selection belongs to, if it is exactly one */
  const selectedGroup = useMemo(() => {
    if (selectedIds.length === 0) return null;
    const g = groups.find((x) => x.free && x.items.some((it) => it.id === selectedIds[0]));
    if (!g) return null;
    const ids = new Set(g.items.map((it) => it.id));
    return selectedIds.every((id) => ids.has(id)) && selectedIds.length === g.items.length ? g : null;
  }, [groups, selectedIds]);

  /** Puts the selection at one of nine spots in its screen's body, the box Tidy fills between
   *  the bars. Whole groups move, as one block: a connected run or a hand-made group is one
   *  unit, like in Tidy, and several units keep their places relative to each other. A bar in
   *  the selection is not part of the block: it keeps to its edge. Parts already there are
   *  obstacles: the block slides along the vertical axis, away from the edge it was sent to
   *  (down from the top, up from the bottom, the nearer way from the middle), until it sits
   *  clear of them or the body runs out. */
  const placeSelected = useCallback(
    (col: "left" | "centerH" | "right", row: "top" | "centerV" | "bottom") => {
      const ids = new Set(selectedIds);
      const all = groupsRef.current;
      /* a bar stays on the edge it belongs to, and the body it bounds is where the rest goes */
      const units = all.filter((x) => x.items.some((it) => ids.has(it.id)) && !holdsEdgeBar(x));
      if (!units.length) return;
      /* a locked group stays where it is, and the rest does not move without it */
      if (units.some((x) => x.locked)) {
        showToast(lockedGroupMsg());
        return;
      }
      const f = frameOfGroup(units[0], framesRef.current, widthsRef.current);
      /* the block lines up inside one screen; parts spread over several have no one body to fill */
      if (!f || units.some((x) => frameOfGroup(x, framesRef.current, widthsRef.current)?.id !== f.id)) return;
      const unitIds = new Set(units.map((x) => x.id));
      const rects = new Map(all.map((x) => [x.id, groupBounds(x, widthsRef.current)]));
      const r = units
        .map((x) => rects.get(x.id)!)
        .reduce((a, o) => ({ l: Math.min(a.l, o.l), t: Math.min(a.t, o.t), r: Math.max(a.r, o.r), b: Math.max(a.b, o.b) }));
      const w = r.r - r.l;
      const h = r.b - r.t;
      const bb = bodyRect(all, f, framesRef.current, widthsRef.current, unitIds);
      const x = col === "left" ? bb.l : col === "right" ? bb.r - w : Math.round((bb.l + bb.r) / 2 - w / 2);
      const y0 = row === "top" ? bb.t : row === "bottom" ? bb.b - h : Math.round((bb.t + bb.b) / 2 - h / 2);
      const others = all
        .filter((x) => !unitIds.has(x.id) && frameOfGroup(x, framesRef.current, widthsRef.current)?.id === f.id)
        .map((x) => rects.get(x.id)!)
        /* only parts in the same column can be in the way */
        .filter((o) => o.l < x + w && o.r > x);
      const hits = (y: number) => others.filter((o) => o.t < y + h && o.b > y);
      const free = (y: number) => y >= bb.t && y + h <= bb.b && hits(y).length === 0;
      const gap = 8;
      /* candidate rows: just below or just above every obstacle, nearest to the target first */
      const spots = [y0, ...others.flatMap((o) => [o.b + gap, o.t - gap - h])]
        .filter((y) => free(y))
        .sort((a, b) => {
          const da = Math.abs(a - y0);
          const db = Math.abs(b - y0);
          if (da !== db) return da - db;
          /* a tie breaks away from the edge the part was sent to */
          return row === "top" ? a - b : row === "bottom" ? b - a : 0;
        });
      const y = spots[0] ?? y0;
      const dx = x - r.l;
      const dy = y - r.t;
      if (!dx && !dy) return;
      snapshot();
      setGroups((gs) => gs.map((x) => (unitIds.has(x.id) ? { ...x, x: x.x + dx, y: x.y + dy } : x)));
    },
    [selectedIds, snapshot],
  );

  /** Pull the selected parts out of their runs into one free group that keeps
   *  their positions. It takes the layer slot of the topmost run involved. */
  const groupSelected = useCallback(() => {
    const ids = new Set(selectedIds);
    if (ids.size < 2) return;
    /* regrouping would carry a locked group's parts into an unlocked group */
    if (groupsRef.current.some((g) => g.locked && g.items.some((it) => ids.has(it.id)))) {
      showToast(lockedGroupMsg());
      return;
    }
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
    /* ungrouping would replace a locked group with unlocked single runs */
    if (g.locked) {
      showToast(lockedGroupMsg());
      return;
    }
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
      /* a locked group stays where it is, even when its parts are selected */
      const moving = new Set(
        groupsRef.current
          .filter((g) => !g.locked && g.items.some((it) => ids.has(it.id)))
          .map((g) => g.id),
      );
      if (moving.size === 0) return;
      snapshotFor("nudge:" + selectedIds.join(","));
      setGroups((prev) =>
        prev.map((g) =>
          moving.has(g.id) ? { ...g, x: g.x + dx, y: g.y + dy } : g,
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
  const selectedMinLength = useMemo(
    () => (selectedFrame ? minFrameLength(groups, selectedFrame, frames, widths) : 0),
    [groups, selectedFrame, frames, widths],
  );
  /** the selected toggle button is drawn in its "on" look while the panel edits that look */
  const [showOnId, setShowOnId] = useState<string | null>(null);
  /** the FAB whose menu the panel is showing open: it is open while its trigger tab is */
  const [menuId, setMenuId] = useState<string | null>(null);
  useEffect(() => {
    setShowOnId(null);
    setMenuId(null);
  }, [primaryId]);
  const onShowOn = useCallback((on: boolean) => setShowOnId(on ? primaryId : null), [primaryId]);
  const onShowMenu = useCallback((on: boolean) => setMenuId(on ? primaryId : null), [primaryId]);
  const onLook = (it: Item): Item => {
    /* a FAB and a split button show their menu while the panel is on the tab that sets it up */
    if (it.id === menuId && opensMenu(it)) return { ...it, [fabOpen]: true };
    return it.id === showOnId && it.toggle ? { ...it, label: it.toggle.label ?? it.label, icon: toggleIcon(it), variant: it.toggle.variant ?? it.variant } : it;
  };
  const selectedRect = useMemo(() => {
    if (!primaryId) return null;
    const g = groups.find((g) => g.items.some((it) => it.id === primaryId));
    if (!g) return null;
    const b = groupBounds(g, widths);
    return { x: b.l, y: b.t, w: b.r - b.l, h: b.b - b.t };
  }, [primaryId, groups, widths]);

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

  /** A palette tile chosen without a pointer, and the phone's plus button, drop a part where
   *  the view is looking, landing as a drop there would. Over a screen it is kept inside it and
   *  nudged down when that spot is already taken; over empty canvas it stays at the centre of
   *  the view, so the new part is always in sight */
  const addPart = (kind: Kind) => {
    /* a snapped drop still settling is committed and rendered first, so the undo step taken
     * below sees it and the free-spot search counts it */
    if (pendingRef.current) flushSync(flushPending);
    const r = canvasRect();
    const v = viewRef.current;
    const item = makeItem(kind);
    const sz = sizeOf(item, widthsRef.current);
    const cx = ((r?.width ?? 0) / 2 - v.x) / v.z;
    const cy = ((r?.height ?? 0) / 2 - v.y) / v.z;
    /* screens are hidden on a blank canvas; the phone shows one screen at a time, so its plus
     * button always means that screen */
    const f =
      frameRef.current !== "phone"
        ? undefined
        : framesRef.current.find((fr) => {
            const fr2 = frameRect(fr);
            return cx >= fr2.l && cx <= fr2.r && cy >= fr2.t && cy <= fr2.b;
          }) ?? (mobileRef.current ? framesRef.current[0] : undefined);
    let x = cx - sz.w / 2;
    let y = cy - sz.h / 2;
    if (f) {
      const { w } = frameSizeOf(f);
      const h = frameLengthOf(f);
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
    const ng = landNewPart(item, x, y, () => false);
    setGroups((gs) => [...gs, ng]);
    setSelectedIds([item.id]);
    setSelectedFrameId(null);
    setRightTab("edit");
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
    const sized = { ...current, ...framePresetPatch(preset) };
    /* a screen no longer than its new device does not scroll any more */
    const next = sized.length !== undefined && sized.length <= frameSizeOf(sized).h ? { ...sized, length: undefined } : sized;
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

  /** the document a run of length changes started from, and what the last of them made of it */
  const lengthRun = useRef<{ id: string; from: { frames: Frame[]; groups: Group[] }; to: { frames: Frame[]; groups: Group[] } } | null>(null);
  /** makes a screen run longer than its device, or back: what stands at its foot goes with the foot.
   *  A slider sends a stream of lengths; each is worked out from where the stream began, so a part
   *  is never taken for one at the foot halfway through and dragged along from then on. */
  /** One drag of a screen's length handle: the document it started from, and how it takes its one undo step */
  type LengthDrag = { from: { frames: Frame[]; groups: Group[] }; snap: () => void };
  const setFrameLength = (id: string, length: number, drag?: LengthDrag) => {
    const run = lengthRun.current;
    const from = drag
      ? drag.from
      : run && run.id === id && run.to.frames === framesRef.current && run.to.groups === groupsRef.current
        ? run.from
        : { frames: framesRef.current, groups: groupsRef.current };
    const start = from.frames.find((f) => f.id === id);
    const current = framesRef.current.find((f) => f.id === id);
    if (!start || !current) return;
    const to = Math.max(length, minFrameLength(from.groups, start, from.frames, widthsRef.current));
    if (to === frameLengthOf(current)) return;
    const laid = stretchFrame(from.groups, start, to, from.frames, widthsRef.current);
    lengthRun.current = { id, from, to: laid };
    if (drag) drag.snap();
    else snapshotFor("frame:" + id + ":length");
    tidyRef.current = null;
    setFrames(laid.frames);
    setGroups(laid.groups);
  };

  /** the screen whose length handle is being dragged: it follows the pointer without easing */
  const [lengthDragId, setLengthDragId] = useState<string | null>(null);
  /** the grip under the chosen screen: dragging it makes the screen run longer or shorter, as the
   *  length slider does, in steps of 4dp. The whole drag is worked out from the document it began
   *  with, and takes one undo step, and only once the length really changes. */
  const onLengthHandleDown = (e: React.PointerEvent, f: Frame) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const pointerId = e.pointerId;
    const startY = e.clientY;
    const start = frameLengthOf(f);
    const deviceH = frameSizeOf(f).h;
    const max = maxFrameLength(f);
    let snapped = false;
    const drag: LengthDrag = {
      from: { frames: framesRef.current, groups: groupsRef.current },
      snap: () => {
        if (snapped) return;
        snapshot();
        snapped = true;
      },
    };
    lengthRun.current = null;
    setLengthDragId(f.id);
    /* captured, the pointer's events reach the window through the handle wherever it is let go;
     * should the handle go away mid-drag, they reach the window directly */
    (e.currentTarget as HTMLElement).setPointerCapture(pointerId);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      setFrameLength(f.id, clamp(Math.round((start + (ev.clientY - startY) / viewRef.current.z) / 4) * 4, deviceH, max), drag);
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      lengthRun.current = null;
      setLengthDragId(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  /** the same handle from the keyboard: arrows move it by 4dp, with Shift by 40dp */
  const onLengthHandleKey = (e: React.KeyboardEvent, f: Frame) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    e.stopPropagation();
    const step = (e.shiftKey ? 40 : 4) * (e.key === "ArrowDown" ? 1 : -1);
    setFrameLength(f.id, clamp(frameLengthOf(f) + step, frameSizeOf(f).h, maxFrameLength(f)));
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
      const url = await toPng(el, { pixelRatio: 2, cacheBust: true, width: frameSizeOf(f).w, height: frameLengthOf(f) });
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
    const { w } = frameSizeOf(f);
    const h = frameLengthOf(f);
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
              <div key={pl.item.id} style={{ position: "absolute", left: pl.x - f.x, top: pl.y - f.y, zIndex: modalRailOf(g) ? 2 : undefined }}>
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
              zIndex: modalRailOf(g) ? 2 : undefined,
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
        {gs.some((g) => modalRailOf(g)) && (
          <div aria-hidden style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.32)", pointerEvents: "none", zIndex: 1 }} />
        )}
      </div>
    );
  };

  /** the view before the preview opened, restored when it closes */
  const viewBeforePreview = useRef<View | null>(null);
  /** the opening scheduled after the glide, while it is still pending */
  const previewTimer = useRef<number | null>(null);
  /** the camera's return scheduled after a close, with the view it is heading back to */
  const returnTimer = useRef<{ id: number; view: View } | null>(null);
  const cancelReturn = () => {
    if (returnTimer.current !== null) window.clearTimeout(returnTimer.current.id);
    returnTimer.current = null;
  };
  useEffect(() => () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    if (returnTimer.current !== null) window.clearTimeout(returnTimer.current.id);
  }, []);
  /** the camera glides for a moment: a screen is brought to the center before the
   *  preview opens over it, and the view returns once the preview closes */
  const glide = (v: View) => {
    setCameraEasing(true);
    setView(v);
    window.setTimeout(() => setCameraEasing(false), SETTLE_MS + 40);
  };
  /** Brings one screen to the middle of the canvas at the zoom it fits in, gliding there. A
   *  screen already wholly in view is left where it is, so picking it does not move the camera. */
  const glideToFrame = (f: Frame) => {
    const r = canvasRect();
    if (!r) return;
    const { w } = frameSizeOf(f);
    const h = frameLengthOf(f);
    const boxW = w + BEZEL * 2;
    const boxH = h + BEZEL * 2 + FRAME_LABEL_H;
    const v = viewRef.current;
    const left = (f.x - BEZEL) * v.z + v.x;
    const top = (f.y - BEZEL - FRAME_LABEL_H) * v.z + v.y;
    if (left >= GLIDE_PAD && top >= GLIDE_TOP && left + boxW * v.z <= r.width - GLIDE_PAD && top + boxH * v.z <= r.height - GLIDE_PAD) return;
    const z = clamp(Math.min((r.width - GLIDE_PAD * 2) / boxW, (r.height - GLIDE_TOP - GLIDE_PAD) / boxH, v.z), MIN_Z, MAX_Z);
    glide({ x: (r.width - boxW * z) / 2 - (f.x - BEZEL) * z, y: GLIDE_TOP + (r.height - GLIDE_TOP - GLIDE_PAD - boxH * z) / 2 - (f.y - BEZEL - FRAME_LABEL_H) * z, z });
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
        /* reopening while the camera is still returning keeps the view it was returning
         * to; reopening during the opening glide keeps the view already captured */
        if (returnTimer.current !== null) {
          viewBeforePreview.current = returnTimer.current.view;
          cancelReturn();
        } else if (previewTimer.current === null) {
          viewBeforePreview.current = viewRef.current;
        }
        glide({ x: cx - (f.x + w / 2) * z, y: cy - (f.y + h / 2) * z, z });
        if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
        previewTimer.current = window.setTimeout(() => {
          previewTimer.current = null;
          /* the screen may have gone while the camera moved: an undo can remove it */
          if (framesRef.current.some((x) => x.id === id)) setPreviewId(id);
          else abandonPreview();
        }, SETTLE_MS);
      } else {
        setPreviewId(id);
      }
    });
  };
  /** Gives up an opening that has not happened yet and brings the camera straight back. */
  const abandonPreview = () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    previewTimer.current = null;
    cancelReturn();
    const back = viewBeforePreview.current;
    viewBeforePreview.current = null;
    if (back) glide(back);
  };
  const closePreview = () => {
    setPreviewId(null);
    const back = viewBeforePreview.current;
    viewBeforePreview.current = null;
    cancelReturn();
    if (back) returnTimer.current = { id: window.setTimeout(() => { returnTimer.current = null; glide(back); }, 220), view: back };
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") tabbedRef.current = true;
      if (editAccess !== "editable") return;
      const t = e.target as HTMLElement;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);
      if (typing) return;
      // dialogs, the preview and the prompt's full-screen cover own the keyboard while they are up
      if (confirmClear || pendingImport !== null || shareOpen || previewId !== null || promptCoverUp) return;
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
      /* Space presses a control reached with Tab instead of holding the hand tool; a button
       * clicked with the mouse keeps focus too, and must not be pressed again */
      if (e.key === " " && tabbedRef.current && t.closest?.("button, [role=button]")) return;
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
        const s = e.shiftKey ? 8 : 1;
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
    const onPointer = () => {
      tabbedRef.current = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointer, true);
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
    pendingImport,
    shareOpen,
    previewId,
    promptCoverUp,
    editAccess,
  ]);
  const openPreviewRef = useRef(openPreview);
  openPreviewRef.current = openPreview;

  /* ---------- render ---------- */
  /* The hole a run holds for a part: where it is, how big, and whether it is still wanted. It
   * outlives the drag by the moment it takes to close, and is the same element throughout, so
   * the closing is a transition rather than a part vanishing. */
  type Gap = { gid: string; index: number; w: number; h: number; open: boolean; /** the hole the part was pulled out of, which stays its full size while the part is in reach */ from: boolean };
  const [gapOut, setGapOut] = useState<Gap | null>(null);
  const gapRef = useRef<Gap | null>(null);
  const gapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (gapTimer.current) clearTimeout(gapTimer.current); }, []);
  const setGap = useCallback((next: Gap | null) => {
    const cur = gapRef.current;
    if (cur === next) return;
    if (cur && next && cur.gid === next.gid && cur.index === next.index && cur.w === next.w && cur.h === next.h && cur.open === next.open && cur.from === next.from) return;
    gapRef.current = next;
    setGapOut(next);
  }, []);
  /** the run keeps the hole open while the part is in reach, and closes it once it is not */
  const holdGap = useCallback(
    (gid: string, index: number, w: number, h: number, from = false) => {
      if (gapTimer.current) {
        clearTimeout(gapTimer.current);
        gapTimer.current = null;
      }
      /* a part that came out of this run keeps its hole at full size for as long as it is in
       * reach, however the magnet is pulling; a part arriving from elsewhere opens one as it
       * comes, so the run can be seen making room */
      setGap({ gid, index, w, h, open: true, from: from || (gapRef.current?.gid === gid && gapRef.current.index === index && gapRef.current.from) });
    },
    [setGap],
  );
  const closeGap = useCallback(() => {
    const cur = gapRef.current;
    if (!cur || !cur.open) return;
    setGap({ ...cur, open: false });
    if (gapTimer.current) clearTimeout(gapTimer.current);
    gapTimer.current = setTimeout(() => setGap(null), SETTLE_MS + 40);
  }, [setGap]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const doc: Doc = useMemo(
    () => ({ groups, frames, paletteKey, frame, title, brief, promptEdit, promptOptions, platform: platform ?? undefined, customPalette: customPalette ?? undefined, dynamicColor, theme }),
    [groups, frames, paletteKey, frame, title, brief, promptEdit, promptOptions, platform, customPalette, dynamicColor, theme],
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

  /** flips a group's lock from its row's lock icon in the Layers panel */
  const toggleGroupLock = (id: string) => {
    snapshot();
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, locked: !g.locked } : g)));
  };

  /** The parts of one group in a new order: reading order for a connected run, back to
   *  front for a free group. Inside a free group a hidden run keeps its slots, handed out
   *  again in the new order, so reordering a list really moves its rows. */
  const reorderGroupItems = (groupId: string, order: string[]) => {
    const g = groupsRef.current.find((x) => x.id === groupId);
    if (!g || g.locked) return;
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
    const modalRail = modalRailOf(g);
    if (g.free) {
      const instantG = instantRef.current.has(g.id);
      const allOn = g.items.every((it) => selectedSet.has(it.id));
      /* explode once: the runs feed both the corner radii and the lift gate below */
      const runs = explodeGroup(g, widths);
      const corners = radiiOfRuns(runs);
      /* hidden runs are connected too: only their members may lift above siblings when selected */
      const runIds = new Set(
        runs
          .filter((r) => r.items.length > 1)
          .flatMap((r) => r.items.map((it) => it.id)),
      );
      return (
        <motion.div
          key={g.id}
          initial={false}
          animate={{ x: g.x - ox, y: g.y - oy }}
          transition={instantG ? INSTANT : OPEN}
          /* keep any selection lift inside the group, so canvas-wide layer order is preserved */
          style={{ position: "absolute", left: 0, top: 0, zIndex: modalRail ? 2 : undefined, isolation: "isolate" }}
        >
          {layoutOf(g, widths).map((pl) => (
            <div key={pl.item.id} style={{ position: "absolute", left: pl.x - g.x, top: pl.y - g.y }}>
              <M3Node
                item={pl.item}
                palette={p}
                widths={widths}
                radii={corners.get(pl.item.id)}
                pressed={false}
                ripple={!handMode}
                selected={selectedSet.has(pl.item.id)}
                inRun={runIds.has(pl.item.id)}
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
    const hole = gapOut?.gid === g.id ? gapOut : null;
    const pull = snap?.pull ?? 0;
    /* while the part is in reach the hole follows the magnet with no easing of its own, so the
     * run it sits in never wobbles; the closing is eased, and the run's own offset with it */
    /* a hole is either wanted or not: it opens and closes on one curve rather than tracking the
     * magnet, so a part arriving between two others is seen making room for itself. The run's own
     * offset travels on the same curve, so the parts behind the hole never drift. */
    const phMain = hole && hole.open ? (g.axis === "x" ? hole.w : hole.h) : 0;
    /* a hole at the front is taken off the run's own position, so the parts behind it stay put.
     * What it costs the run is its width plus the run's spacing, and a closed hole costs nothing:
     * it has already taken that spacing off its own margin. */
    const front = hole && hole.index === 0 ? -(phMain + (hole.open ? GAP : 0)) : 0;
    const conn = g.items[0] ? connectSpecOf(g.items[0]) : undefined;

    type Cell = { ph: true } | { ph: false; item: Item; index: number };
    const cells: Cell[] = [];
    for (let i = 0; i <= g.items.length; i++) {
      if (hole && hole.index === i) cells.push({ ph: true });
      if (i < g.items.length)
        cells.push({ ph: false, item: g.items[i], index: i });
    }
    const m = cells.length;
    const instant = instantRef.current.has(g.id);
    /* A FAB sits in the corner of a screen, and that is the corner it grows out of: the run is
     * drawn hanging from its own bottom right, so a box changing size moves its top and its left
     * and nothing else. Nothing has to be kept in step, because nothing else moves. */
    /* the corner is the button's own, menu or no menu: the entries rise out of it and the
     * button itself never moves */
    const corner = g.items.length === 1 && isFab(g.items[0].kind) ? sizeOf(g.items[0], widths) : null;
    /* a split button's menu drops below the button or rises above it, whichever its screen has
     * room for; a rising one hangs the run from its own bottom, so the button never moves */
    const menuPart = g.items.length === 1 && g.items[0].id === menuId && splitOpens(g.items[0]) ? g.items[0] : null;
    const rises = !!menuPart && splitMenuRisesAt(menuPart, g.y, frameOfGroup(g, framesRef.current, widths) ?? null);
    /* The corner is held by the run's own translate rather than by the offset it is animated to.
     * Both halves of it -- the size in pixels and the box's own 100% -- are then settled by the
     * browser in the frame React hands them over in, so a size being dragged cannot leave the
     * drawn box a step behind the offset and make it shiver. */
    const hang = corner
      ? `calc(${corner.w}px - 100%) calc(${corner.h}px - 100%)`
      : rises && menuPart
        ? `0 calc(${sizeOf(menuPart, widths).h}px - 100%)`
        : undefined;

    return (
      <motion.div
        key={g.id}
        initial={false}
        animate={{
          x: g.x - ox + (g.axis === "x" ? front : 0),
          y: g.y - oy + (g.axis === "y" ? front : 0),
        }}
        transition={instant ? INSTANT : hole ? GAP_TWEEN : OPEN}
        style={{
          zIndex: modalRail ? 2 : undefined,
          position: "absolute",
          left: 0,
          top: 0,
          marginLeft: widthShift?.gid === g.id ? widthShift.dx : undefined,
          marginTop: widthShift?.gid === g.id ? widthShift.dy : undefined,
          /* hung from its own corner, a FAB changes size without moving that corner */
          translate: hang,
          display: "flex",
          flexDirection: g.axis === "x" ? "row" : "column",
          alignItems: g.axis === "x" ? "center" : "stretch",
          gap: GAP,
          /* keep any selection lift inside the run, so canvas-wide layer order is preserved */
          isolation: "isolate",
        }}
      >
        {cells.map((c, r) => {
          if (c.ph) {
            /* the hole is moved by the same clock the run's own offset is, and on the same
             * curve: a frame where one has moved and the other has not is a frame where the
             * parts behind the hole appear somewhere they never were */
            return (
              <motion.div
                key="__gap"
                /* The hole a part came out of is already the part's size; one a part is arriving
                 * into opens from nothing. The run's own spacing sits beside the hole whatever
                 * its width, so the hole takes that much off its own margin as it closes: what
                 * it costs the run then travels to nothing exactly as the run's offset does. */
                initial={
                  hole?.from
                    ? false
                    : g.axis === "x"
                      ? { width: 0, height: hole?.h ?? 0, marginRight: -GAP }
                      : { height: 0, width: hole?.w ?? 0, marginBottom: -GAP }
                }
                animate={
                  g.axis === "x"
                    ? { width: phMain, height: hole?.h ?? 0, marginRight: hole?.open ? 0 : -GAP }
                    : { height: phMain, width: hole?.w ?? 0, marginBottom: hole?.open ? 0 : -GAP }
                }
                transition={GAP_TWEEN}
                style={{ flex: "0 0 auto" }}
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
              item={menuPart && c.item.id === menuPart.id ? { ...onLook(c.item), [menuUp]: rises } : onLook(c.item)}
              palette={p}
              widths={widths}
              radii={radii}
              pressed={pressedId === c.item.id}
              /* a press lights the part up from inside, the way it does in the preview */
              ripple={!handMode}
              lit={landed && landed.id === c.item.id ? { x: landed.x, y: landed.y, grown: true } : null}
              selected={selectedSet.has(c.item.id)}
              inRun={g.items.length > 1}
              instant={widthDragId === c.item.id || sizeEditId === c.item.id}
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
  const overBin = (!!drag?.active && drag.overBin) || (gesture?.kind === "group" && gesture.overBin);
  const guide = drag?.active ? drag.guide : gesture?.kind === "group" && gesture.moved ? (gesture.guide ?? null) : null;
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
        className={`app-root${revealing ? " m3e-reveal" : ""}${widthDragId || sizeEditId ? " m3-size-now" : ""}`}
        /* the preview sits outside this tree and owns the keyboard while it is up */
        inert={editAccess !== "editable" || previewId !== null}
        aria-hidden={editAccess !== "editable" || previewId !== null}
        style={{
          /* the settle time and curve the stylesheet eases with, from the one place they are set */
          ...(SETTLE_CSS_VARS as React.CSSProperties),
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
          className="m3-measure"
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
            .map(onLook)
            .filter((it) => isMeasured(it))
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


        {/* the part in flight rides above every panel so it stays visible while crossing them */}
        {drag?.active && (() => {
          const r = canvasRect();
          return (
            <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 60, overflow: "hidden" }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  transform: `translate(${(r?.left ?? 0) + view.x}px, ${(r?.top ?? 0) + view.y}px) scale(${view.z})`,
                  transformOrigin: "0 0",
                  fontFamily: fontFamilyOf(theme.font, lang),
                }}
              >
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
            opacity: drag.vanishing ? 0 : drag.overBin ? 0.4 : 1,
            scale: drag.vanishing ? 0.6 : drag.overBin ? 0.84 : 1,
          }}
          transition={
            drag.vanishing
              ? VANISH
              : {
                  type: "spring",
                  stiffness: 520,
                  damping: 34,
                  mass: 0.6,
                }
          }
        >
          <M3Node
            item={drag.item}
            palette={p}
            widths={widths}
            lit={dragLit}
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
              </div>
            </div>
          );
        })()}

        {/* ---- left: rail + parts / layers ---- */}
        {!isMobile && (
          <aside style={{ ...panelStyle, width: leftOpen ? leftW : RAIL_W, flexDirection: "row", transition: "width 200ms cubic-bezier(0.2, 0, 0, 1)" }}>
            {/* dropping a canvas part anywhere on this side deletes it, whichever tab is open */}
            {overBin && (
              <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "rgba(179,38,30,0.10)", display: "grid", placeItems: "center", pointerEvents: "none", color: p.error }}>
                <div style={{ width: 72, height: 72, borderRadius: 36, background: p.errorContainer, color: p.onErrorContainer, display: "grid", placeItems: "center", boxShadow: "0 4px 14px rgba(0,0,0,0.14)" }}>
                  <Icon name="delete" size={34} />
                </div>
              </div>
            )}
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
                    onPartActivate={addPart}
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
                      const f = framesRef.current.find((x) => x.id === id);
                      if (f) glideToFrame(f);
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
                    onToggleLock={toggleGroupLock}
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
                  const { w, h: fold } = frameSizeOf(f);
                  const h = frameLengthOf(f);
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
                          transition: "color 160ms",
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
                          /* the chosen screen's bezel is painted in the theme's primary; the others stay dark */
                          backgroundColor: on ? p.primary : p.inverseSurface,
                          backgroundImage: draftBusy ? draftGradient(p) : undefined,
                          backgroundSize: draftBusy ? "300% 300%" : undefined,
                          animation: draftBusy ? "m3e-drift 3s ease-in-out infinite" : undefined,
                          boxShadow: on ? "0 18px 50px rgba(0,0,0,0.16)" : "0 18px 50px rgba(0,0,0,0.14)",
                          cursor: handMode ? "grab" : "move",
                          transition: lengthDragId === f.id ? "background-color 160ms, box-shadow 120ms" : `background-color 160ms, box-shadow 120ms, ${SIZE_TRANSITION}`,
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
                            transition: lengthDragId === f.id ? undefined : SIZE_TRANSITION,
                          }}
                        >
                          {groups
                            .filter((g) => frameOf.get(g.id) === f.id)
                            .map((g) => renderGroup(g, f.x, f.y))}
                          {groups.some((g) => frameOf.get(g.id) === f.id && modalRailOf(g)) && (
                            <div aria-hidden style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.32)", pointerEvents: "none", zIndex: 1 }} />
                          )}
                          {/* where the device ends on a screen that runs further: below it, the body scrolls */}
                          {h > fold && (
                            <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: fold, borderTop: `2px dashed ${p.outline}`, opacity: 0.6, pointerEvents: "none", zIndex: 2 }} />
                          )}
                          {draftBusy && (
                            <div style={{ position: "absolute", inset: 0, zIndex: 90, background: canvasBg, display: "grid", placeItems: "center" }}>
                              <LoadingIndicator size={96} color="url(#m3e-drafting)" />
                            </div>
                          )}
                        </div>
                      </div>
                      {/* the chosen screen's length grip, a small nub on its bottom bezel: drag it down and the body runs on */}
                      {on && !handMode && !draftBusy && (
                        <div
                          role="slider"
                          tabIndex={0}
                          aria-label={t("screenLength", lang)}
                          aria-valuemin={selectedMinLength}
                          aria-valuemax={maxFrameLength(f)}
                          aria-valuenow={h}
                          onPointerDown={(e) => onLengthHandleDown(e, f)}
                          onKeyDown={(e) => onLengthHandleKey(e, f)}
                          style={{
                            position: "absolute",
                            left: w / 2 - 32,
                            top: h - 4,
                            width: 64,
                            height: BEZEL + 8,
                            display: "grid",
                            placeItems: "center",
                            transform: `scale(${clamp(1 / view.z, 1, 2)})`,
                            cursor: "ns-resize",
                            touchAction: "none",
                            zIndex: 1,
                            transition: lengthDragId === f.id ? undefined : `top ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)`,
                          }}
                        >
                          <div style={{ width: 40, height: 4, borderRadius: 2, background: p.onPrimary, opacity: 0.9 }} />
                        </div>
                      )}
                    </div>
                  );
                })}

              {groups
                .filter((g) => !frameOf.has(g.id))
                .map((g) => renderGroup(g, 0, 0))}

              {/* a lone button shows a handle on each of its four edges, and a lone icon button
                  four points around its circle: dragging one changes the part's size in place,
                  and whatever sits opposite stays where it is */}
              {/* a FAB showing its menu is being edited as a menu, not sized as a button */}
              {!handMode && !drag && selectedIds.length === 1 && selected && selected.id !== menuId && HANDLED.has(selected.kind) && (() => {
                const g = groups.find((x) => x.items.length === 1 && !x.free && !x.locked && x.items[0].id === selected.id);
                if (!g) return null;
                const b = groupBounds(g, widths);
                /* the same offset the group is drawn with while its left or top edge is being dragged */
                const sx = widthShift?.gid === g.id ? widthShift.dx : 0;
                const sy = widthShift?.gid === g.id ? widthShift.dy : 0;
                return (
                  <SizeHandles
                    /* the handles belong to this one part: another part picked gets its own, in
                     * place, rather than these flying across the canvas to it */
                    key={selected.id}
                    /* one measure, so the part is held by the points around it rather than by
                     * its edges: a circle's diameter, a label's height */
                    round={ROUND.has(selected.kind)}
                    /* a bar and a slider have a width and nothing else: they are held by their two
                     * ends; a carousel is the other way about and is held by its top and bottom */
                    sides={WIDE.has(selected.kind) ? BAR_SIDES : TALL.has(selected.kind) ? TALL_SIDES : undefined}
                    /* a part with a height of its own is held by all four edges; one whose height follows its kind by its two ends */
                    box={{ l: b.l + sx, t: b.t + sy, r: b.r + sx, b: b.b + sy }}
                    z={view.z}
                    instant={widthDragId === selected.id || sizeEditId === selected.id}
                    p={p}
                    onDown={(e, side) => onWidthHandleDown(e, g, selected, side)}
                    onNudge={(side, dir) => nudgeSize(g, selected, side, dir)}
                  />
                );
              })()}


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
              onClick={() => addPart("button")}
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
                /* the close button lands exactly where the button that reopens the panel sits */
                padding: "20px 20px 8px 16px",
                /* the band is the panel's own colour; the strip below it carries the fade */
                background: p.surface,
                /* while the prompt stands full screen the band has nothing to do: it fades out as the cover opens and back in as it closes */
                opacity: promptCoverUp ? 0 : 1,
                pointerEvents: promptCoverUp ? "none" : undefined,
                transition: "opacity 220ms ease",
              }}
              inert={promptCoverUp || undefined}
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
              {/* the same button in the same spot as the one that reopens the panel, but plain:
                * the filled look belongs to the one that has to be found over the canvas */}
              <IconBtn
                icon="right_panel_close"
                p={p}
                size={44}
                onClick={() => setRightOpen(false)}
                title={t("closePanel", lang)}
              />
            </div>
            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
              {/* what scrolls past the top of the panel dissolves into the band instead of being cut */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: PANEL_FADE_H,
                  zIndex: 3,
                  background: `linear-gradient(to bottom, ${p.surface}, ${p.surface}00)`,
                  pointerEvents: "none",
                }}
              />
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
                  tidy={tidyState ?? "done"}
                  onTidy={() => tidy(selectedFrame)}
                  onPlace={(pl) => setPlace(selectedFrame, pl)}
                  minLength={selectedMinLength}
                  onLength={(length) => setFrameLength(selectedFrame.id, length)}
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
                  railStandalone={groups.some((g) => g.items.length === 1 && g.items[0].id === selected?.id)}
                  frame={selectedPartFrame}
                  palette={p}
                  frames={frame === "phone" ? frames : []}
                  onChange={patchSelected}
                  onDelete={deleteSelected}
                  onDuplicate={duplicateSelected}
                  locked={selectedLocked}
                  onToggleLock={toggleLockSelected}
                  onPlace={selectionPlaceable ? placeSelected : undefined}
                  widths={widths}
                  selfRect={selectedRect}
                  allFrames={frames}
                  onShowOn={onShowOn}
                  onShowMenu={onShowMenu}
                  multi={selectedIds.length}
                  grouped={!!selectedGroup}
                  selectionWhole={selectionWhole}
                  selectionKey={selectedIds.join(" ")}
                  onGroup={groupSelected}
                  onUngroup={ungroupSelected}
                />
              ) : (
                <PromptPanel
                  doc={doc}
                  widths={widths}
                  palette={p}
                  onCover={setPromptCoverUp}
                  onDoc={(patch) => {
                    if (patch.title !== undefined) setTitle(patch.title);
                    if (patch.brief !== undefined) setBrief(patch.brief);
                    if ("promptEdit" in patch) setPromptEdit(patch.promptEdit);
                    if ("promptOptions" in patch) setPromptOptions(patch.promptOptions);
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
      </div>

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
