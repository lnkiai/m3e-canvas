import type { CSSProperties } from "react";
import { FAB_MENU_TABS, KIND_TEXT, Lang, NAV_TABS, TAB_LABELS, getLang, t, SELECT_OPTIONS } from "./i18n";
import { Contrast, isLightColor, schemeFromSeed } from "./color";

/* ---------- geometry ---------- */
export const H = 56; // M3 medium button height (dp)
export const GAP = 3; // connected group spacing
export const R_FULL = 28; // outer corner of a connected run
export const R_INNER = 8; // inner corner when connected (M3 small)

/** magnetic field size, along the run and across it */
export const SNAP_MAIN = 44;
export const SNAP_CROSS = 24;
/** how sharply the pull ramps up (higher = gentler at the edge) */
export const PULL_EXP = 2.2;
/** ms allowed for the landing animation before the item is committed */
export const SETTLE_MS = 340;

/** phone screen used by the "phone" canvas mode (Pixel-like, dp) */
/* Pixel-class phone, 412 dp wide; kept at 892 dp tall so the whole screen fits the canvas */
export const PHONE_W = 412;
export const PHONE_H = 892;
export const PHONE_R = 40;
export const DESKTOP_W = 1280;
export const DESKTOP_H = 800;
export const DESKTOP_R = 28;
/** M3 window size classes: a screen this wide is "expanded", where the navigation bar becomes a rail */
export const EXPANDED_W = 840;
export const isExpanded = (w: number) => w >= EXPANDED_W;
/** navigation rail: width, top inset and the pitch of one destination (56×32 indicator, label, gap) */
export const RAIL_W = 80;
export const RAIL_TOP = 44;
export const RAIL_ITEM_H = 52;
export const RAIL_GAP = 12;
/** M3 Expressive navigation rail tokens; the 80dp rail above is kept for saved sketches. */
export const RAIL_COLLAPSED_W = 96;
export const RAIL_EXPANDED_W = 220;
export const isWideRail = (it: Item) => it.railExpanded !== undefined || it.railModal === true;
export const railWidth = (it: Item) => it.railExpanded ? RAIL_EXPANDED_W : isWideRail(it) ? RAIL_COLLAPSED_W : RAIL_W;
/** Modal expansion overlays the body, retaining only the collapsed rail's layout slot. */
export const railLayoutWidth = (it: Item) => it.railModal ? RAIL_COLLAPSED_W : railWidth(it);
/** Runtime-only expansion edge: copied by item edits, never included in JSON. */
export const railExpansionSide = Symbol("railExpansionSide");
/** Shared drawing / hit-area geometry. The header is a 48dp menu button with an 8dp gap. */
export function railMetrics(it: Item) {
  const wide = isWideRail(it);
  return {
    width: railWidth(it),
    headerLeft: it.railExpanded ? 16 : (railWidth(it) - 48) / 2,
    inset: wide ? 12 : 6,
    top: RAIL_TOP + (wide ? 56 : 0),
    itemHeight: wide ? 56 : RAIL_ITEM_H,
    gap: wide ? (it.railExpanded ? 0 : 4) : RAIL_GAP,
  };
}
/** system insets: the status bar above a top app bar and the gesture area below a navigation bar.
 *  Both bars carry their inset as extra height so their background reaches the rounded screen edge. */
export const STATUS_BAR_H = 24;
export const NAV_BAR_H = 24;
/** M3 layout margin: parts that are not edge-to-edge sit this far from the screen edge */
export const PHONE_MARGIN = 16;
export const contentWidth = (width: number) => width - PHONE_MARGIN * 2;
export const halfWidth = (width: number) => (contentWidth(width) - PHONE_MARGIN) / 2;
/** width of a part that spans the screen with a margin on both sides */
export const CONTENT_W = contentWidth(PHONE_W);
/** width of one of two parts sharing a row, with a margin-sized gutter between them */
export const HALF_W = halfWidth(PHONE_W);
/** width presets offered in the inspector: two columns, with margins, edge-to-edge */
export const WIDTH_PRESETS = [HALF_W, CONTENT_W, PHONE_W];
/** height presets for free-form boxes: half the screen, the whole screen */
export const HEIGHT_PRESETS = [PHONE_H / 2, PHONE_H];
/** bezel around the screen and the label above it */
export const BEZEL = 10;
export const FRAME_LABEL_H = 44;
/** horizontal distance between newly added frames */
export const FRAME_GAP = 120;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const uid = () => Math.random().toString(36).slice(2, 10);

export type Radii = { tl: number; tr: number; bl: number; br: number };
export const uniformRadii = (r: number): Radii => ({ tl: r, tr: r, bl: r, br: r });

/* ---------- color ---------- */
export type Palette = {
  key: string;
  label: string;
  /** the color a custom scheme was generated from */
  seed?: string;
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  inversePrimary: string;
  secondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  surface: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
};

const ERROR = {
  error: "#B3261E",
  onError: "#FFFFFF",
  errorContainer: "#F9DEDC",
  onErrorContainer: "#410E0B",
};

/* presets are authored without secondary; it is derived from the seed below */
const PRESETS: Omit<Palette, "secondary">[] = [
  {
    key: "purple",
    label: "Purple",
    primary: "#6750A4",
    onPrimary: "#FFFFFF",
    primaryContainer: "#EADDFF",
    onPrimaryContainer: "#21005D",
    inversePrimary: "#D0BCFF",
    secondaryContainer: "#E8DEF8",
    onSecondaryContainer: "#1D192B",
    tertiaryContainer: "#FFD8E4",
    onTertiaryContainer: "#31111D",
    surface: "#FEF7FF",
    surfaceContainerLow: "#F7F2FA",
    surfaceContainer: "#F3EDF7",
    surfaceContainerHigh: "#ECE6F0",
    surfaceContainerHighest: "#E6E0E9",
    onSurface: "#1D1B20",
    onSurfaceVariant: "#49454F",
    outline: "#79747E",
    outlineVariant: "#CAC4D0",
    inverseSurface: "#322F35",
    inverseOnSurface: "#F5EFF7",
    ...ERROR,
  },
  {
    key: "blue",
    label: "Blue",
    primary: "#0B57D0",
    onPrimary: "#FFFFFF",
    primaryContainer: "#D3E3FD",
    onPrimaryContainer: "#041E49",
    inversePrimary: "#A8C7FA",
    secondaryContainer: "#DCE2F9",
    onSecondaryContainer: "#131C2B",
    tertiaryContainer: "#FFD8EE",
    onTertiaryContainer: "#2E1125",
    surface: "#FAF9FD",
    surfaceContainerLow: "#F3F3FA",
    surfaceContainer: "#EEEDF3",
    surfaceContainerHigh: "#E9E8EF",
    surfaceContainerHighest: "#E3E2E6",
    onSurface: "#1B1B1F",
    onSurfaceVariant: "#44474E",
    outline: "#74777F",
    outlineVariant: "#C4C6D0",
    inverseSurface: "#303034",
    inverseOnSurface: "#F2F0F4",
    ...ERROR,
  },
  {
    key: "green",
    label: "Green",
    primary: "#2E6A45",
    onPrimary: "#FFFFFF",
    primaryContainer: "#B0F1C2",
    onPrimaryContainer: "#00210F",
    inversePrimary: "#95D5A7",
    secondaryContainer: "#D3E8D8",
    onSecondaryContainer: "#102016",
    tertiaryContainer: "#C2E8FF",
    onTertiaryContainer: "#001E2C",
    surface: "#F6FBF4",
    surfaceContainerLow: "#F0F5EE",
    surfaceContainer: "#EAF0E8",
    surfaceContainerHigh: "#E4EAE2",
    surfaceContainerHighest: "#DEE4DC",
    onSurface: "#181D18",
    onSurfaceVariant: "#414941",
    outline: "#707972",
    outlineVariant: "#BFC9C0",
    inverseSurface: "#2D322D",
    inverseOnSurface: "#EEF2EB",
    ...ERROR,
  },
  {
    key: "coral",
    label: "Coral",
    primary: "#984061",
    onPrimary: "#FFFFFF",
    primaryContainer: "#FFD9E2",
    onPrimaryContainer: "#3E001D",
    inversePrimary: "#FFB0C8",
    secondaryContainer: "#F6DDE4",
    onSecondaryContainer: "#31101D",
    tertiaryContainer: "#FFDBCA",
    onTertiaryContainer: "#2C1600",
    surface: "#FFF8F8",
    surfaceContainerLow: "#FCF0F2",
    surfaceContainer: "#F6EBED",
    surfaceContainerHigh: "#F3E5E9",
    surfaceContainerHighest: "#EEE0E3",
    onSurface: "#201A1B",
    onSurfaceVariant: "#524346",
    outline: "#847377",
    outlineVariant: "#D5C2C6",
    inverseSurface: "#352F30",
    inverseOnSurface: "#FAEEEF",
    ...ERROR,
  },
  {
    key: "amber",
    label: "Amber",
    primary: "#8B5000",
    onPrimary: "#FFFFFF",
    primaryContainer: "#FFDCC2",
    onPrimaryContainer: "#2C1600",
    inversePrimary: "#FFB77C",
    secondaryContainer: "#F6DFC8",
    onSecondaryContainer: "#271905",
    tertiaryContainer: "#D5EDC0",
    onTertiaryContainer: "#0E2004",
    surface: "#FFF8F5",
    surfaceContainerLow: "#FCF1EA",
    surfaceContainer: "#F7ECE4",
    surfaceContainerHigh: "#F3E6DE",
    surfaceContainerHighest: "#EDE0D8",
    onSurface: "#211A14",
    onSurfaceVariant: "#51443B",
    outline: "#83746A",
    outlineVariant: "#D6C3B6",
    inverseSurface: "#362F28",
    inverseOnSurface: "#FBEEE5",
    ...ERROR,
  },
  {
    key: "teal",
    label: "Teal",
    primary: "#00696E",
    onPrimary: "#FFFFFF",
    primaryContainer: "#9CF1F6",
    onPrimaryContainer: "#002022",
    inversePrimary: "#80D5DA",
    secondaryContainer: "#CCE8E9",
    onSecondaryContainer: "#051F20",
    tertiaryContainer: "#D2E4FF",
    onTertiaryContainer: "#001C3B",
    surface: "#F4FBFB",
    surfaceContainerLow: "#EEF5F5",
    surfaceContainer: "#E8EFEF",
    surfaceContainerHigh: "#E2EAEA",
    surfaceContainerHighest: "#DDE4E4",
    onSurface: "#161D1D",
    onSurfaceVariant: "#3F4948",
    outline: "#6F7979",
    outlineVariant: "#BEC8C8",
    inverseSurface: "#2B3232",
    inverseOnSurface: "#ECF2F2",
    ...ERROR,
  },
  {
    key: "mono",
    label: "Mono",
    primary: "#4A4459",
    onPrimary: "#FFFFFF",
    primaryContainer: "#E6E0F0",
    onPrimaryContainer: "#1A1626",
    inversePrimary: "#CFC3E0",
    secondaryContainer: "#E6E1E6",
    onSecondaryContainer: "#1B1B1F",
    tertiaryContainer: "#E9E0EA",
    onTertiaryContainer: "#1E1A22",
    surface: "#FCF8FD",
    surfaceContainerLow: "#F5F1F6",
    surfaceContainer: "#EFEBF0",
    surfaceContainerHigh: "#E9E5EA",
    surfaceContainerHighest: "#E4E0E5",
    onSurface: "#1C1B1F",
    onSurfaceVariant: "#48454E",
    outline: "#79747E",
    outlineVariant: "#CAC4D0",
    inverseSurface: "#313033",
    inverseOnSurface: "#F4EFF4",
    ...ERROR,
  },
];
export const PALETTES: Palette[] = PRESETS.map((p) => ({ ...p, secondary: schemeFromSeed(p.primary, p.label, { keepChroma: true }).secondary }));

/* ---------- theme: the four expressive axes ---------- */
export type ShapeScale = "square" | "rounded" | "full";
export type FontKey = "roboto" | "robotoFlex" | "robotoSerif" | "system";
export type MotionScheme = "standard" | "expressive";
export type { Contrast };

export type Theme = {
  dark: boolean;
  /** the app follows the system setting; the canvas shows the mode chosen in `dark` */
  bothModes: boolean;
  contrast: Contrast;
  shape: ShapeScale;
  font: FontKey;
  /** headings and labels take the heavier M3 Expressive "emphasized" styles */
  emphasized: boolean;
  motion: MotionScheme;
};

export const DEFAULT_THEME: Theme = { dark: false, bothModes: false, contrast: "standard", shape: "rounded", font: "roboto", emphasized: false, motion: "standard" };

/** a stored theme with any missing or unknown field replaced by its default */
export function normalizeTheme(t: Partial<Theme> | undefined): Theme {
  const d = DEFAULT_THEME;
  if (!t) return d;
  return {
    dark: typeof t.dark === "boolean" ? t.dark : d.dark,
    bothModes: typeof t.bothModes === "boolean" ? t.bothModes : d.bothModes,
    contrast: CONTRASTS.some((c) => c.key === t.contrast) ? (t.contrast as Contrast) : d.contrast,
    shape: SHAPES.some((c) => c.key === t.shape) ? (t.shape as ShapeScale) : d.shape,
    font: FONTS.some((c) => c.key === t.font) ? (t.font as FontKey) : d.font,
    emphasized: typeof t.emphasized === "boolean" ? t.emphasized : d.emphasized,
    motion: t.motion === "expressive" || t.motion === "standard" ? t.motion : d.motion,
  };
}

export const SHAPES: { key: ShapeScale; label: string; icon: string }[] = [
  { key: "square", label: "Square", icon: "crop_square" },
  { key: "rounded", label: "Rounded", icon: "rounded_corner" },
  { key: "full", label: "Full", icon: "circle" },
];

export const FONTS: { key: FontKey; label: string; family: string; /** Google Fonts family to fetch, if any */ google?: string }[] = [
  { key: "roboto", label: "Roboto", family: "Roboto, system-ui, sans-serif" },
  { key: "robotoFlex", label: "Roboto Flex", family: "'Roboto Flex', Roboto, system-ui, sans-serif", google: "Roboto+Flex:wght@400;500;600;700" },
  { key: "robotoSerif", label: "Roboto Serif", family: "'Roboto Serif', Georgia, serif", google: "Roboto+Serif:wght@400;500;600;700" },
  { key: "system", label: "System", family: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
];

/** The Noto Sans face that covers a language's script, spliced in behind the chosen
 *  face so CJK text renders the same on every OS. English needs none. */
export const LANG_FONT: Record<Lang, { family: string; google: string } | null> = {
  ja: { family: "'Noto Sans JP'", google: "Noto+Sans+JP:wght@400;500;600;700" },
  zh: { family: "'Noto Sans SC'", google: "Noto+Sans+SC:wght@400;500;600;700" },
  ko: { family: "'Noto Sans KR'", google: "Noto+Sans+KR:wght@400;500;600;700" },
  ar: { family: "'Noto Sans Arabic'", google: "Noto+Sans+Arabic:wght@400;500;600;700" },
  en: null,
};

/** a family list with the language's Noto face placed before the generic fallbacks */
const withLangFont = (family: string, lang?: Lang) => {
  const extra = lang ? LANG_FONT[lang]?.family : undefined;
  if (!extra) return family;
  const parts = family.split(",").map((s) => s.trim());
  const at = parts.findIndex((s) => /^(system-ui|-apple-system|Georgia|serif|sans-serif)$/.test(s));
  parts.splice(at < 0 ? parts.length : at, 0, extra);
  return parts.join(", ");
};

/** the chosen face, with the language's Noto face behind it; the system font is left to the device */
export const fontFamilyOf = (f: FontKey, lang?: Lang) => {
  const family = FONTS.find((x) => x.key === f)?.family ?? FONTS[0].family;
  return f === "system" ? family : withLangFont(family, lang);
};
/** the editor's own font: Roboto, then the language's Noto face */
export const uiFontFamily = (lang?: Lang) => withLangFont("Roboto, system-ui, sans-serif", lang);

export const CONTRASTS: { key: Contrast; label: string }[] = [
  { key: "standard", label: "Standard" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
];

/** the shape scale that rendering helpers read outside React; the page sets it once per render */
let curShape: ShapeScale = "rounded";
export const setGlobalShape = (s: ShapeScale) => {
  curShape = s;
};
export const getShape = () => curShape;

/** a default corner radius under the document's shape scale */
export function scaleR(r: number): number {
  if (curShape === "square") return Math.round(r * 0.35);
  if (curShape === "full") return Math.round(r * 1.6);
  return r;
}

/** The scheme the document renders with. Hand-written presets and the author's
 *  fine-tuned custom scheme are light and standard contrast; dark mode and the
 *  other contrast levels are generated from the same seed. */
export function paletteOf(key: string, custom?: Palette | null, theme?: Theme): Palette {
  const base = (key === "custom" && custom) || PALETTES.find((p) => p.key === key) || PALETTES[0];
  if (!theme || (!theme.dark && theme.contrast === "standard")) {
    /* Saved custom schemes may predate the secondary role. */
    return base.secondary ? base : { ...base, secondary: schemeFromSeed(base.seed ?? base.primary).secondary };
  }
  const seed = base.seed ?? base.primary;
  /* a preset's hue and chroma are deliberate (Mono is nearly grey), so they are kept as they are */
  return { ...schemeFromSeed(seed, base.label, { dark: theme.dark, contrast: theme.contrast, keepChroma: base.key !== "custom" }), key: base.key };
}

/* ---------- contrast roles a component can take ---------- */
export type Variant = "filled" | "tonal" | "elevated" | "outlined" | "text";

export const VARIANTS: { key: Variant; label: string }[] = [
  { key: "filled", label: "Filled" },
  { key: "tonal", label: "Tonal" },
  { key: "elevated", label: "Elevated" },
  { key: "outlined", label: "Outlined" },
  { key: "text", label: "Text" },
];

export function variantStyle(v: Variant, p: Palette): CSSProperties {
  switch (v) {
    case "filled":
      return { background: p.primary, color: p.onPrimary, border: "none" };
    case "tonal":
      return { background: p.secondaryContainer, color: p.onSecondaryContainer, border: "none" };
    case "elevated":
      return { background: p.surfaceContainerLow, color: p.primary, border: "none" };
    case "outlined":
      return { background: "transparent", color: p.primary, border: `1px solid ${p.outline}` };
    case "text":
      return { background: "transparent", color: p.primary, border: "none" };
  }
}

export function variantShadow(v: Variant): string {
  if (v === "elevated") return "0 1px 3px rgba(0,0,0,0.20), 0 4px 8px rgba(0,0,0,0.10)";
  return "none";
}

/* ---------- component kinds ---------- */
export type Kind =
  | "box"
  | "button"
  | "iconButton"
  | "fab"
  | "extendedFab"
  | "chip"
  | "topAppBar"
  | "bottomNav"
  | "navRail"
  | "searchBar"
  | "card"
  | "listItem"
  | "dialog"
  | "snackbar"
  | "textField"
  | "select"
  | "switch"
  | "checkbox"
  | "slider"
  | "text"
  | "image"
  | "camera"
  | "map"
  | "divider"
  | "loadingIndicator"
  | "linearProgress"
  | "circularProgress"
  | "splitButton"
  | "fabMenu"
  | "toolbar"
  | "tabs"
  | "radio"
  | "badge";

export type Axis = "x" | "y";
/** kinds that fuse into a run: buttons side by side, list items stacked */
export type ConnectSpec = { axis: Axis; outer: number; inner: number; family: string };

/** `presets` are quick picks shown as chips; values outside min..max are hidden */
export type SizeSpec = { min: number; max: number; step: number; icon: string; presets?: number[] };

export type Category = "actions" | "navigation" | "containment" | "inputs" | "content" | "progress";

export const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: "actions", label: "Actions", icon: "touch_app" },
  { key: "navigation", label: "Navigation", icon: "explore" },
  { key: "containment", label: "Containment", icon: "web_asset" },
  { key: "inputs", label: "Inputs", icon: "toggle_on" },
  { key: "content", label: "Content", icon: "notes" },
  { key: "progress", label: "Progress", icon: "progress_activity" },
];

export type KindSpec = {
  label: string;
  /** short Japanese noun used by the prompt generator */
  noun: string;
  category: Category;
  paletteIcon: string;
  /** intrinsic size; buttons measure their content, sized kinds use `size` */
  w: number;
  h: number;
  radius: number;
  hasVariant: boolean;
  hasLabel: boolean;
  hasSupporting: boolean;
  hasIcon: boolean;
  hasChecked?: boolean;
  /** carries a list of icon + label entries (navigation bar, tabs, FAB menu, toolbar) */
  hasTabs?: boolean;
  /** second dimension (height) for free-form boxes */
  size2?: SizeSpec;
  hasFill?: boolean;
  hasValue?: boolean;
  hasWavy?: boolean;
  hasContained?: boolean;
  connect?: ConnectSpec;
  size?: SizeSpec;
  defLabel: string;
  defIcon: string | null;
  defSupporting?: string;
  defIcon2?: string;
  defSize?: number;
  defVariant?: Variant;
};

export const KIND_SPEC: Record<Kind, KindSpec> = {
  box: {
    label: "Box",
    noun: "ボックス",
    category: "containment",
    paletteIcon: "check_box_outline_blank",
    w: PHONE_W,
    h: 220,
    radius: 28,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: false,
    hasChecked: true,
    hasFill: true,
    size: { min: 40, max: PHONE_W, step: 4, icon: "width", presets: WIDTH_PRESETS },
    size2: { min: 24, max: PHONE_H, step: 4, icon: "height", presets: HEIGHT_PRESETS },
    defLabel: "",
    defIcon: null,
    defSize: PHONE_W,
  },
  button: {
    label: "Button",
    noun: "ボタン",
    category: "actions",
    paletteIcon: "buttons_alt",
    w: 128,
    h: H,
    radius: R_FULL,
    hasVariant: true,
    hasLabel: true,
    hasSupporting: false,
    hasIcon: true,
    connect: { axis: "x", outer: R_FULL, inner: R_INNER, family: "button" },
    size: { min: 64, max: PHONE_W, step: 4, icon: "width", presets: [HALF_W, CONTENT_W] },
    defLabel: "ボタン",
    defIcon: "add",
  },
  iconButton: {
    label: "Icon Button",
    noun: "アイコンボタン",
    category: "actions",
    paletteIcon: "radio_button_checked",
    w: 48,
    h: 48,
    radius: 24,
    hasVariant: true,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: true,
    connect: { axis: "x", outer: 24, inner: R_INNER, family: "button" },
    size: { min: 40, max: 96, step: 4, icon: "open_in_full", presets: [40, 48, 56, 96] },
    defLabel: "",
    defIcon: "favorite",
    defSize: 48,
    defVariant: "tonal",
  },
  fab: {
    label: "FAB",
    noun: "FAB（フローティングボタン）",
    category: "actions",
    paletteIcon: "add_circle",
    w: 56,
    h: 56,
    radius: 16,
    hasVariant: true,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: true,
    size: { min: 40, max: 128, step: 4, icon: "open_in_full", presets: [40, 56, 96] },
    defLabel: "",
    defIcon: "edit",
    defSize: 56,
    defVariant: "tonal",
  },
  extendedFab: {
    label: "Extended FAB",
    noun: "拡張 FAB",
    category: "actions",
    paletteIcon: "add_box",
    w: 0,
    h: 56,
    radius: 16,
    hasVariant: true,
    hasLabel: true,
    hasSupporting: false,
    hasIcon: true,
    defLabel: "作成",
    defIcon: "edit",
    defVariant: "tonal",
  },
  chip: {
    label: "Chip",
    noun: "チップ",
    category: "actions",
    paletteIcon: "label",
    w: 0,
    h: 32,
    radius: 8,
    hasVariant: true,
    hasLabel: true,
    hasSupporting: false,
    hasIcon: true,
    hasChecked: true,
    connect: { axis: "x", outer: 16, inner: 4, family: "chip" },
    defLabel: "チップ",
    defIcon: null,
    defVariant: "outlined",
  },
  topAppBar: {
    label: "Top App Bar",
    noun: "トップアプリバー",
    category: "navigation",
    paletteIcon: "toolbar",
    w: PHONE_W,
    h: 64 + STATUS_BAR_H,
    radius: 0,
    hasVariant: false,
    hasLabel: true,
    hasSupporting: false,
    hasIcon: true,
    size: { min: 200, max: PHONE_W, step: 4, icon: "width", presets: WIDTH_PRESETS },
    defLabel: "タイトル",
    defIcon: "menu",
    defIcon2: "more_vert",
    defSize: PHONE_W,
  },
  bottomNav: {
    label: "Navigation Bar",
    noun: "ナビゲーションバー",
    category: "navigation",
    paletteIcon: "bottom_navigation",
    w: PHONE_W,
    h: 80 + NAV_BAR_H,
    radius: 0,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: false,
    hasTabs: true,
    size: { min: 200, max: PHONE_W, step: 4, icon: "width", presets: WIDTH_PRESETS },
    defLabel: "",
    defIcon: null,
    defSize: PHONE_W,
  },
  navRail: {
    label: "Navigation Rail",
    noun: "ナビゲーションレール",
    category: "navigation",
    paletteIcon: "side_navigation",
    w: RAIL_W,
    h: PHONE_H,
    radius: 0,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: false,
    hasTabs: true,
    size2: { min: 200, max: PHONE_H, step: 4, icon: "height", presets: HEIGHT_PRESETS },
    defLabel: "",
    defIcon: null,
  },
  searchBar: {
    label: "Search Bar",
    noun: "検索バー",
    category: "navigation",
    paletteIcon: "search",
    w: CONTENT_W,
    h: 56,
    radius: 28,
    hasVariant: false,
    hasLabel: true,
    hasSupporting: false,
    hasIcon: true,
    size: { min: 200, max: PHONE_W, step: 4, icon: "width", presets: WIDTH_PRESETS },
    defLabel: "検索",
    defIcon: "search",
    defIcon2: "mic",
    defSize: CONTENT_W,
  },
  card: {
    label: "Card",
    noun: "カード",
    category: "containment",
    paletteIcon: "web_asset",
    w: CONTENT_W,
    h: 223,
    radius: 20,
    hasVariant: true,
    hasLabel: true,
    hasSupporting: true,
    hasIcon: true,
    size: { min: 160, max: PHONE_W, step: 4, icon: "width", presets: WIDTH_PRESETS },
    size2: { min: 96, max: PHONE_H, step: 4, icon: "height", presets: [120, 188, 280] },
    hasFill: true,
    defLabel: "カードの見出し",
    defIcon: "image",
    defSupporting: "補足テキストがここに入ります。",
    defSize: CONTENT_W,
    defVariant: "tonal",
  },
  listItem: {
    label: "List Item",
    noun: "リスト項目",
    category: "containment",
    paletteIcon: "list",
    w: CONTENT_W,
    h: 72,
    radius: R_FULL,
    hasVariant: false,
    hasLabel: true,
    hasSupporting: true,
    hasIcon: true,
    hasFill: true,
    connect: { axis: "y", outer: R_FULL, inner: R_INNER, family: "list" },
    size: { min: 200, max: PHONE_W, step: 4, icon: "width", presets: WIDTH_PRESETS },
    defLabel: "リスト項目",
    defIcon: "person",
    defSupporting: "サブテキスト",
    defIcon2: "chevron_right",
    defSize: CONTENT_W,
  },
  dialog: {
    label: "Dialog",
    noun: "ダイアログ",
    category: "containment",
    paletteIcon: "chat_bubble",
    w: 312,
    h: 220,
    radius: 28,
    hasVariant: false,
    hasLabel: true,
    hasSupporting: true,
    hasIcon: true,
    defLabel: "確認",
    defIcon: "info",
    defSupporting: "この操作を実行しますか？",
  },
  snackbar: {
    label: "Snackbar",
    noun: "スナックバー",
    category: "containment",
    paletteIcon: "call_to_action",
    w: 344,
    h: 48,
    radius: 8,
    hasVariant: false,
    hasLabel: true,
    hasSupporting: true,
    hasIcon: false,
    defLabel: "保存しました",
    defIcon: null,
    defSupporting: "元に戻す",
  },
  textField: {
    label: "Text Field",
    noun: "テキスト入力",
    category: "inputs",
    paletteIcon: "text_fields",
    w: CONTENT_W,
    h: 56,
    radius: 16,
    hasVariant: true,
    hasLabel: true,
    hasSupporting: true,
    hasIcon: true,
    size: { min: 160, max: PHONE_W, step: 4, icon: "width", presets: WIDTH_PRESETS },
    defLabel: "ラベル",
    defIcon: "search",
    defSupporting: "",
    defSize: CONTENT_W,
    defVariant: "outlined",
  },
  select: {
    label: "Dropdown",
    noun: "ドロップダウン",
    category: "inputs",
    paletteIcon: "arrow_drop_down_circle",
    w: CONTENT_W,
    h: 56,
    radius: 16,
    hasVariant: true,
    hasLabel: true,
    hasSupporting: true,
    hasIcon: true,
    hasTabs: true,
    size: { min: 160, max: PHONE_W, step: 4, icon: "width", presets: WIDTH_PRESETS },
    defLabel: "ラベル",
    defIcon: null,
    defSupporting: "",
    defSize: CONTENT_W,
    defVariant: "outlined",
  },
  switch: {
    label: "Switch",
    noun: "スイッチ",
    category: "inputs",
    paletteIcon: "toggle_on",
    w: 160,
    h: 48,
    radius: 16,
    hasVariant: false,
    hasLabel: true,
    hasSupporting: false,
    hasIcon: false,
    hasChecked: true,
    size: { min: 120, max: PHONE_W, step: 4, icon: "width", presets: WIDTH_PRESETS },
    defLabel: "通知",
    defIcon: null,
  },
  checkbox: {
    label: "Checkbox",
    noun: "チェックボックス",
    category: "inputs",
    paletteIcon: "check_box",
    w: 0,
    h: 40,
    radius: 4,
    hasVariant: false,
    hasLabel: true,
    hasSupporting: false,
    hasIcon: false,
    hasChecked: true,
    defLabel: "同意する",
    defIcon: null,
  },
  slider: {
    label: "Slider",
    noun: "スライダー",
    category: "inputs",
    paletteIcon: "sliders",
    w: CONTENT_W,
    h: 44,
    radius: 22,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: false,
    hasValue: true,
    size: { min: 120, max: PHONE_W, step: 4, icon: "width", presets: WIDTH_PRESETS },
    defLabel: "",
    defIcon: null,
    defSize: CONTENT_W,
  },
  text: {
    label: "Text",
    noun: "テキスト",
    category: "content",
    paletteIcon: "title",
    w: 0,
    h: 40,
    radius: 0,
    hasVariant: false,
    hasLabel: true,
    hasSupporting: false,
    hasIcon: false,
    size: { min: 12, max: 57, step: 1, icon: "format_size", presets: [14, 16, 22, 28, 32, 45, 57] },
    defLabel: "見出し",
    defIcon: null,
    defSize: 28,
  },
  image: {
    label: "Image",
    noun: "画像",
    category: "content",
    paletteIcon: "image",
    w: 200,
    h: 200,
    radius: 20,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: true,
    size: { min: 48, max: PHONE_W, step: 4, icon: "open_in_full", presets: [96, HALF_W, CONTENT_W, PHONE_W] },
    defLabel: "",
    defIcon: "image",
    defSize: 200,
  },
  camera: {
    label: "Camera",
    noun: "カメラ",
    category: "content",
    paletteIcon: "photo_camera",
    w: CONTENT_W,
    h: Math.round((CONTENT_W * 4) / 3),
    radius: 20,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: true,
    size: { min: 96, max: PHONE_W, step: 4, icon: "width", presets: [HALF_W, CONTENT_W, PHONE_W] },
    size2: { min: 96, max: PHONE_H, step: 4, icon: "height", presets: [280, 507, PHONE_H] },
    defLabel: "",
    defIcon: "photo_camera",
    defSize: CONTENT_W,
  },
  map: {
    label: "Map",
    noun: "地図",
    category: "content",
    paletteIcon: "map",
    w: CONTENT_W,
    h: Math.round((CONTENT_W * 3) / 4),
    radius: 20,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: true,
    size: { min: 96, max: PHONE_W, step: 4, icon: "width", presets: [HALF_W, CONTENT_W, PHONE_W] },
    size2: { min: 96, max: PHONE_H, step: 4, icon: "height", presets: [200, 285, PHONE_H] },
    defLabel: "",
    defIcon: "map",
    defSize: CONTENT_W,
  },
  divider: {
    label: "Divider",
    noun: "区切り線",
    category: "content",
    paletteIcon: "horizontal_rule",
    w: CONTENT_W,
    h: 16,
    radius: 0,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: false,
    size: { min: 40, max: PHONE_W, step: 4, icon: "width", presets: WIDTH_PRESETS },
    defLabel: "",
    defIcon: null,
    defSize: CONTENT_W,
  },
  loadingIndicator: {
    label: "Loading Indicator",
    noun: "ローディングインジケータ",
    category: "progress",
    paletteIcon: "motion_blur",
    w: 48,
    h: 48,
    radius: 24,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: false,
    hasContained: true,
    size: { min: 32, max: 128, step: 4, icon: "open_in_full", presets: [32, 48, 64, 96] },
    defLabel: "",
    defIcon: null,
    defSize: 48,
  },
  linearProgress: {
    label: "Linear Progress",
    noun: "リニアプログレス",
    category: "progress",
    paletteIcon: "linear_scale",
    w: CONTENT_W,
    h: 24,
    radius: 12,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: false,
    hasValue: true,
    hasWavy: true,
    size: { min: 120, max: PHONE_W, step: 4, icon: "width", presets: WIDTH_PRESETS },
    defLabel: "",
    defIcon: null,
    defSize: CONTENT_W,
  },
  circularProgress: {
    label: "Circular Progress",
    noun: "サーキュラープログレス",
    category: "progress",
    paletteIcon: "progress_activity",
    w: 48,
    h: 48,
    radius: 24,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: false,
    hasValue: true,
    hasWavy: true,
    size: { min: 24, max: 120, step: 4, icon: "open_in_full", presets: [24, 40, 48, 52, 64] },
    defLabel: "",
    defIcon: null,
    defSize: 48,
  },
  splitButton: {
    label: "Split Button",
    noun: "スプリットボタン",
    category: "actions",
    paletteIcon: "splitscreen_right",
    w: 0,
    h: H,
    radius: R_FULL,
    hasVariant: true,
    hasLabel: true,
    hasSupporting: false,
    hasIcon: true,
    defLabel: "送信",
    defIcon: "send",
    defVariant: "filled",
  },
  fabMenu: {
    label: "FAB Menu",
    noun: "FAB メニュー",
    category: "actions",
    paletteIcon: "add_circle",
    w: 220,
    h: 56,
    radius: 16,
    hasVariant: true,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: true,
    hasTabs: true,
    size: { min: 160, max: CONTENT_W, step: 4, icon: "width", presets: [220, HALF_W, CONTENT_W] },
    defLabel: "",
    defIcon: "close",
    defSize: 220,
    defVariant: "filled",
  },
  toolbar: {
    label: "Toolbar",
    noun: "ツールバー",
    category: "navigation",
    paletteIcon: "toolbar",
    w: 0,
    h: 64,
    radius: 32,
    hasVariant: true,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: false,
    hasTabs: true,
    defLabel: "",
    defIcon: null,
    defVariant: "tonal",
  },
  tabs: {
    label: "Tabs",
    noun: "タブ",
    category: "navigation",
    paletteIcon: "tab",
    w: PHONE_W,
    h: 48,
    radius: 0,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: false,
    hasTabs: true,
    size: { min: 200, max: PHONE_W, step: 4, icon: "width", presets: WIDTH_PRESETS },
    defLabel: "",
    defIcon: null,
    defSize: PHONE_W,
  },
  radio: {
    label: "Radio Button",
    noun: "ラジオボタン",
    category: "inputs",
    paletteIcon: "radio_button_checked",
    w: 0,
    h: 40,
    radius: 20,
    hasVariant: false,
    hasLabel: true,
    hasSupporting: false,
    hasIcon: false,
    hasChecked: true,
    defLabel: "選択肢",
    defIcon: null,
  },
  badge: {
    label: "Badge",
    noun: "バッジ",
    category: "content",
    paletteIcon: "notifications_unread",
    w: 0,
    h: 16,
    radius: 8,
    hasVariant: false,
    hasLabel: true,
    hasSupporting: false,
    hasIcon: false,
    defLabel: "3",
    defIcon: null,
  },
};

export const KIND_ORDER: Kind[] = [
  "button",
  "iconButton",
  "fab",
  "extendedFab",
  "splitButton",
  "fabMenu",
  "chip",
  "topAppBar",
  "bottomNav",
  "navRail",
  "toolbar",
  "tabs",
  "searchBar",
  "card",
  "listItem",
  "box",
  "dialog",
  "snackbar",
  "textField",
  "select",
  "switch",
  "checkbox",
  "radio",
  "slider",
  "text",
  "image",
  "camera",
  "map",
  "badge",
  "divider",
  "loadingIndicator",
  "linearProgress",
  "circularProgress",
];

/* ---------- screen data ---------- */
export type NavTab = { icon: string; label: string };

export type Item = {
  id: string;
  kind: Kind;
  label: string;
  icon: string | null;
  icon2?: string | null;
  variant: Variant;
  supporting?: string;
  size?: number;
  radiusTop?: number;
  radiusBottom?: number;
  /** boxes only: each corner on its own, when the pairs above are not enough */
  corners?: Radii;
  tabs?: NavTab[];
  /** navigation bars, rails and tab rows: index of the selected destination (0 when unset) */
  selected?: number;
  /** list items: a switch at the trailing end instead of an icon; `checked` is its state */
  switch?: boolean;
  /** cards: no image area; `src` puts a picture in it */
  noImage?: boolean;
  /** cards: where the image area sits — the top when unset, a full-height side column, or the whole background behind the text */
  imagePos?: CardImagePos;
  /** cards: the image area's size in dp — its height on top, its width at a side; a background image fills the card */
  imageSize?: number;
  /** cards: where the text block sits vertically; unset means the top, or the bottom over a background image */
  contentAlign?: CardAlign;
  /** cards: a color role for the headline and body instead of the automatic one */
  textColor?: TextToken;
  /** on/off state for switches, checkboxes and chips */
  checked?: boolean;
  /** a switch whose handle stays plain when on, without the check icon */
  noCheck?: boolean;
  /** 0..100 for sliders and determinate progress; undefined = indeterminate */
  value?: number;
  wavy?: boolean;
  /** Undefined retains the original rail; false/true select the collapsed/expanded expressive rail. */
  railExpanded?: boolean;
  /** Expanded rail overlays a scrim rather than taking additional layout space. */
  railModal?: boolean;
  [railExpansionSide]?: "left" | "right";
  /** Progress track thickness in dp (TRACK_MIN..TRACK_MAX); omitted uses the standard 4dp stroke. */
  trackThickness?: number;
  contained?: boolean;
  /** free text the author writes about what this part does */
  note?: string;
  /** what `note` said before the AI rewrote it, so the rewrite can be undone */
  noteHistory?: string[];
  bold?: boolean;
  /** height for free-form boxes */
  size2?: number;
  /** palette token used as background (boxes, list items) */
  fill?: ColorToken;
  /** background behind a list item's leading icon; "none" draws the icon bare */
  iconFill?: ColorToken | "none";
  /** data URL of a user-picked image */
  src?: string;
  /** tap navigation to another frame */
  action?: Action;
  /** per-slot tap navigation for bars: "icon" / "icon2" on a top app bar, "tab:N" on a navigation bar */
  actions?: Record<string, Action>;
  /** the look a toggle button takes once tapped; undefined = not a toggle */
  toggle?: ToggleLook;
};

export type ToggleLook = { icon?: string | null; variant?: Variant; label?: string };

/** kinds that can act as a toggle button in the preview */
export const TOGGLEABLE: Kind[] = ["button", "iconButton", "fab", "extendedFab"];

/** target id that pops the preview stack instead of opening a frame */
export const BACK_TARGET = "back";

/** a swipe on a frame: the finger's direction */
export type SwipeDir = "left" | "right" | "up" | "down";
export const SWIPE_DIRS: { key: SwipeDir; icon: string; transition: Transition }[] = [
  { key: "left", icon: "swipe_left", transition: "slide" },
  { key: "right", icon: "swipe_right", transition: "slideLeft" },
  { key: "up", icon: "swipe_up", transition: "slideUp" },
  { key: "down", icon: "swipe_down", transition: "slideDown" },
];

/** how a sliding transition moves: the axis, where the new screen enters from and
 *  where the old one parks, as fractions of the screen */
export const SLIDE_SPEC: Partial<Record<Transition, { axis: "x" | "y"; enter: number; exit: number }>> = {
  slide: { axis: "x", enter: 1, exit: -0.3 },
  slideLeft: { axis: "x", enter: -1, exit: 0.3 },
  slideUp: { axis: "y", enter: 1, exit: -0.3 },
  slideDown: { axis: "y", enter: -1, exit: 0.3 },
};

export type Transition = "slide" | "slideLeft" | "slideUp" | "slideDown" | "fade" | "expand" | "none";
export type Action = { to: string; transition: Transition };

export const TRANSITIONS: { key: Transition; label: string; icon: string }[] = [
  { key: "slide", label: "Slide from right", icon: "arrow_back" },
  { key: "slideLeft", label: "Slide from left", icon: "arrow_forward" },
  { key: "slideUp", label: "Slide from bottom", icon: "arrow_upward" },
  { key: "slideDown", label: "Slide from top", icon: "arrow_downward" },
  { key: "fade", label: "Fade", icon: "blur_on" },
  { key: "expand", label: "Expand", icon: "open_in_full" },
  { key: "none", label: "None", icon: "block" },
];

/** slots on a bar that can each carry their own tap action */
export function actionSlotsOf(it: Item): IconSlot[] {
  if (it.kind === "topAppBar" || it.kind === "bottomNav" || it.kind === "navRail" || it.kind === "toolbar") return iconSlotsOf(it).filter((s) => !!s.value);
  if (it.kind === "fabMenu") return (it.tabs ?? []).map((t, i) => ({ key: `tab:${i}`, label: t.label || `${i + 1}`, value: t.icon || null }));
  if (it.kind === "tabs") return (it.tabs ?? []).map((t, i) => ({ key: `tab:${i}`, label: t.label || `${i + 1}`, value: null }));
  return [];
}

/** the icon a toggle button shows when on: an explicit null means none */
export const toggleIcon = (it: Item): string | null => (it.toggle && it.toggle.icon !== undefined ? it.toggle.icon : it.icon);

/** a free group down to one part is just that part again */
export function collapseFree(g: Group, widths: Record<string, number>): Group {
  if (!g.free || g.items.length !== 1) return g;
  const pl = layoutOf(g, widths)[0];
  return { id: g.id, x: pl.x, y: pl.y, axis: connectSpecOf(g.items[0])?.axis ?? "x", items: g.items };
}

/** every navigation an item carries: its own action plus per-slot ones */
export function actionsOf(it: Item): { slot: string; action: Action }[] {
  const out: { slot: string; action: Action }[] = [];
  if (it.action) out.push({ slot: "", action: it.action });
  for (const [slot, action] of Object.entries(it.actions ?? {})) if (action) out.push({ slot, action });
  return out;
}

/** kinds a user can tap in the preview */
export const TAPPABLE: Kind[] = ["button", "iconButton", "fab", "extendedFab", "chip", "listItem", "card", "image", "text", "splitButton", "radio"];

/** palette roles a user may pick as a background */
export type ColorToken =
  | "surface"
  | "surfaceContainerLow"
  | "surfaceContainer"
  | "surfaceContainerHigh"
  | "surfaceContainerHighest"
  | "primaryContainer"
  | "secondaryContainer"
  | "tertiaryContainer"
  | "primary"
  | "inverseSurface";

export const COLOR_TOKENS: { key: ColorToken; label: string }[] = [
  { key: "surface", label: "Surface" },
  { key: "surfaceContainerLow", label: "Container low" },
  { key: "surfaceContainer", label: "Container" },
  { key: "surfaceContainerHigh", label: "Container high" },
  { key: "surfaceContainerHighest", label: "Container highest" },
  { key: "primaryContainer", label: "Primary container" },
  { key: "secondaryContainer", label: "Secondary container" },
  { key: "tertiaryContainer", label: "Tertiary container" },
  { key: "primary", label: "Primary" },
  { key: "inverseSurface", label: "Inverse surface" },
];

/** readable foreground for a chosen background token */
/** the background a card draws when no token is set: it follows the variant */
export const cardDefaultFillOf = (variant: Variant): ColorToken =>
  variant === "outlined" ? "surface" : variant === "elevated" ? "surfaceContainerLow" : "surfaceContainerHighest";
export const cardFillOf = (it: Item): ColorToken => it.fill ?? cardDefaultFillOf(it.variant);

/** where a card's image area sits; sketches saved before placement existed stay on top */
export type CardImagePos = "top" | "leading" | "trailing" | "background";
export const isCardImagePos = (v: unknown): v is CardImagePos => v === "top" || v === "leading" || v === "trailing" || v === "background";
export const cardImagePosOf = (it: Item): CardImagePos => it.imagePos ?? "top";

/** the five card layouts the editor offers: the placements plus "no image", as one choice */
export type CardLayout = CardImagePos | "none";
export const cardLayoutOf = (it: Item): CardLayout => (it.noImage ? "none" : cardImagePosOf(it));
/** the fields a layout choice sets; the top layout is the unset default so old sketches stay untouched */
export const cardLayoutPatch = (layout: CardLayout): Pick<Item, "noImage" | "imagePos"> =>
  layout === "none" ? { noImage: true, imagePos: undefined } : { noImage: undefined, imagePos: layout === "top" ? undefined : layout };

export type CardAlign = "start" | "center" | "end";
export const isCardAlign = (v: unknown): v is CardAlign => v === "start" || v === "center" || v === "end";
/** the text block's vertical position: the top, or the bottom when it lies over a background image */
export const cardContentAlignOf = (it: Item): CardAlign => it.contentAlign ?? (!it.noImage && cardImagePosOf(it) === "background" ? "end" : "start");

/** the color roles a card's text may be set to; "on" roles pair with the containers offered as backgrounds */
export type TextToken = "primary" | "secondary" | "onSurface" | "onSurfaceVariant" | "onPrimaryContainer" | "onSecondaryContainer" | "onTertiaryContainer" | "inverseOnSurface";
export const TEXT_TOKENS: { key: TextToken; label: string }[] = [
  { key: "onSurface", label: "On surface" },
  { key: "onSurfaceVariant", label: "On surface variant" },
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "onPrimaryContainer", label: "On primary container" },
  { key: "onSecondaryContainer", label: "On secondary container" },
  { key: "onTertiaryContainer", label: "On tertiary container" },
  { key: "inverseOnSurface", label: "Inverse on surface" },
];
export const isTextToken = (v: unknown): v is TextToken => TEXT_TOKENS.some((t) => t.key === v);
/** the card's text color: the chosen role, else white over a photo, the container's
 *  "on" color over a placeholder background or a chosen fill, and onSurface otherwise */
export function cardTextColorOf(it: Item, p: Palette): string {
  if (it.textColor) return p[it.textColor];
  if (!it.noImage && cardImagePosOf(it) === "background") return it.src ? "#ffffff" : p.onPrimaryContainer;
  return it.fill ? onToken(it.fill, p) : p.onSurface;
}
/** the body's color: a plain card keeps M3's onSurfaceVariant at full opacity; anything
 *  colored, filled or over an image reuses the headline color at reduced opacity */
export function cardBodyColorOf(it: Item, p: Palette): { color: string; opacity: number } {
  const plain = !it.textColor && !it.fill && (it.noImage || cardImagePosOf(it) !== "background");
  return plain ? { color: p.onSurfaceVariant, opacity: 1 } : { color: cardTextColorOf(it, p), opacity: 0.8 };
}
/** the scrim under text on a photo: it fades in from the text's side, dark under light
 *  text and light under dark text, so the words stay readable either way */
export function cardScrimOf(ink: string, align: CardAlign): string {
  const c = isLightColor(ink) ? "0,0,0" : "255,255,255";
  const a = isLightColor(ink) ? 0.65 : 0.72;
  if (align === "start") return `linear-gradient(rgba(${c},${a}), rgba(${c},0) 60%)`;
  if (align === "center") return `rgba(${c},${a * 0.65})`;
  return `linear-gradient(rgba(${c},0) 40%, rgba(${c},${a}))`;
}

/* Card spacing is fixed: content sits 20dp from the edge, the headline and body are
 * 4dp apart, and the image area keeps 12dp from the text. */
export const CARD_PADDING = 20;
export const CARD_TEXT_GAP = 4;
export const CARD_MEDIA_GAP = 12;

/** default width of a card's side image column (an M3 horizontal-card thumbnail) */
export const CARD_SIDE_IMAGE_W = 80;
/** the least room an image must leave the text: one headline and one body line tall, or a readable column wide */
const CARD_MIN_TEXT_H = 48;
const CARD_MIN_TEXT_W = 96;
/** the smallest image area the editor offers */
export const CARD_IMAGE_MIN = 40;
/** the largest the image area can be inside this card without pushing its text out:
 *  a top band is bounded by the drawn height, a side column by the drawn width */
export function cardImageMaxOf(it: Item): number {
  const { w, h } = sizeOf(it, {});
  const room = cardImagePosOf(it) === "top" ? h - CARD_MIN_TEXT_H : w - CARD_MIN_TEXT_W;
  return Math.max(CARD_IMAGE_MIN, room - CARD_PADDING * 2 - CARD_MEDIA_GAP);
}
/** the image area's extent in dp: the author's value, else 28% of the card's width
 *  on top or the standard column on a side, never beyond cardImageMaxOf */
export function cardImageSizeOf(it: Item): number {
  const top = cardImagePosOf(it) === "top";
  const size = it.imageSize ?? (top ? Math.round((it.size ?? KIND_SPEC.card.defSize ?? KIND_SPEC.card.w) * 0.28) : CARD_SIDE_IMAGE_W);
  return Math.min(size, cardImageMaxOf(it));
}

export function onToken(t: ColorToken, p: Palette): string {
  switch (t) {
    case "primary":
      return p.onPrimary;
    case "primaryContainer":
      return p.onPrimaryContainer;
    case "secondaryContainer":
      return p.onSecondaryContainer;
    case "tertiaryContainer":
      return p.onTertiaryContainer;
    case "inverseSurface":
      return p.inverseOnSurface;
    default:
      return p.onSurface;
  }
}

export type Frame = {
  id: string;
  name: string;
  x: number;
  y: number;
  /** dimensions are optional so documents saved before desktop frames remain phone-sized */
  w?: number;
  h?: number;
  bg?: ColorToken;
  /** what this screen is for, in the author's words; goes into the prompt */
  note?: string;
  /** what `note` said before the AI rewrote it */
  noteHistory?: string[];
  /** frame ids reached by swiping in each direction */
  swipe?: Partial<Record<SwipeDir, string>>;
  /** where Tidy puts the body rows between the bars: from the top unless the author says otherwise */
  place?: Place;
};

/** how Tidy stacks the body of a screen: from the top, centered, against the bottom bar, or spread out */
export type Place = "top" | "center" | "bottom" | "spread";
export const PLACES: { key: Place; icon: string }[] = [
  { key: "top", icon: "vertical_align_top" },
  { key: "center", icon: "vertical_align_center" },
  { key: "bottom", icon: "vertical_align_bottom" },
  { key: "spread", icon: "expand" },
];
export const isPlace = (v: unknown): v is Place => v === "top" || v === "center" || v === "bottom" || v === "spread";

/** how a selection of parts is lined up: an edge or centre to share, or equal gaps along an axis */
export type AlignKind = "left" | "centerH" | "right" | "distributeH" | "top" | "centerV" | "bottom" | "distributeV";

export type FramePreset = "phone" | "desktop";
export const frameSizeOf = (f: Frame) => ({ w: f.w ?? PHONE_W, h: f.h ?? PHONE_H });
export const isPhoneFrame = (f: Frame) => {
  const { w, h } = frameSizeOf(f);
  return w === PHONE_W && h === PHONE_H;
};
export const framePresetOf = (f: Frame): FramePreset => (isPhoneFrame(f) ? "phone" : "desktop");
export const framePresetPatch = (preset: FramePreset): Pick<Frame, "w" | "h"> =>
  preset === "desktop" ? { w: DESKTOP_W, h: DESKTOP_H } : { w: undefined, h: undefined };
export const frameRect = (f: Frame) => {
  const { w, h } = frameSizeOf(f);
  return { l: f.x, t: f.y, r: f.x + w, b: f.y + h };
};
/** the corner radius of a screen: a phone's rounded glass, a flatter window for the desktop */
export const frameRadius = (f: Frame) => (isPhoneFrame(f) ? PHONE_R : DESKTOP_R);

/** parts that span the screen edge to edge and follow its width when it changes */
export const FULL_WIDTH: Kind[] = ["topAppBar", "bottomNav", "tabs"];

/** a part no taller than the screen it is placed on: a box or a rail sized to a phone shrinks to a shorter screen */
export function fitHeight(it: Item, screenH: number): Item {
  const spec = KIND_SPEC[it.kind];
  if (!spec.size2 && it.kind !== "navRail") return it;
  const h = it.size2 ?? spec.h;
  return h > screenH ? { ...it, size2: screenH } : it;
}

/** A part carried from one screen size to another: edge-to-edge parts take the new
 *  width, a part sized to the old content or screen width takes the new one, and a
 *  box as tall as the old screen takes the new height. A card or an image keeps its
 *  size, since its height follows its width. Nothing ends up wider than the new
 *  content area. */
export function carryItemSize(it: Item, from: { w: number; h: number }, to: { w: number; h: number }): Item {
  const spec = KIND_SPEC[it.kind];
  const patch: Partial<Item> = {};
  const keepsShape = it.kind === "card" || it.kind === "image" || it.kind === "camera" || it.kind === "map";
  if (spec.size && (spec.size.icon === "width" || keepsShape)) {
    /* only a size that is a width; a text size or an icon button's square are left alone */
    const cur = it.size ?? spec.defSize ?? spec.w;
    if (FULL_WIDTH.includes(it.kind)) {
      /* a bar the author narrowed on purpose stays narrow; one that spanned the screen still does */
      if (cur === from.w || cur > to.w) patch.size = to.w;
    } else if (keepsShape) {
      if (cur > contentWidth(to.w)) patch.size = contentWidth(to.w);
    } else if (cur === from.w) patch.size = to.w;
    else if (cur === contentWidth(from.w)) patch.size = contentWidth(to.w);
    else if (cur === halfWidth(from.w)) patch.size = halfWidth(to.w);
    else if (cur > to.w) patch.size = to.w;
    else if (cur > contentWidth(to.w) && it.kind !== "box") patch.size = contentWidth(to.w);
  }
  if ((it.kind === "box" || it.kind === "navRail") && (it.size2 ?? spec.h) === from.h) patch.size2 = to.h;
  /* a camera or map the author gave a height keeps its aspect ratio when its width changes */
  if ((it.kind === "camera" || it.kind === "map") && it.size2 !== undefined && patch.size !== undefined) {
    const cur = it.size ?? spec.defSize ?? spec.w;
    patch.size2 = Math.round((it.size2 * patch.size) / cur);
  }
  return Object.keys(patch).length ? { ...it, ...patch } : it;
}

export type Placed = { item: Item; index: number; x: number; y: number; w: number; h: number };

/** where each part of a run sits in world space: a connected run lays its parts
 *  out along its axis, a free group keeps the offsets it was grouped with */
export function layoutOf(g: Group, widths: Record<string, number>): Placed[] {
  const out: Placed[] = [];
  let off = 0;
  g.items.forEach((it, index) => {
    const sz = sizeOf(it, widths);
    if (g.free) {
      const o = g.pos?.[it.id] ?? { x: 0, y: 0 };
      out.push({ item: it, index, x: g.x + o.x, y: g.y + o.y, w: sz.w, h: sz.h });
      return;
    }
    out.push({ item: it, index, x: g.axis === "x" ? g.x + off : g.x, y: g.axis === "x" ? g.y : g.y + off, w: sz.w, h: sz.h });
    off += (g.axis === "x" ? sz.w : sz.h) + GAP;
  });
  return out;
}

/** world-space bounds of a whole run */
export function groupBounds(g: Group, widths: Record<string, number>) {
  let l = g.x;
  let t = g.y;
  let r = g.x;
  let b = g.y;
  for (const pl of layoutOf(g, widths)) {
    l = Math.min(l, pl.x);
    t = Math.min(t, pl.y);
    r = Math.max(r, pl.x + pl.w);
    b = Math.max(b, pl.y + pl.h);
  }
  return { l, t, r, b };
}

/** A free group written as the runs it holds: parts of one family that still sit
 *  one GAP apart along their axis stay a connected run, everything else is a run
 *  of one. Layout logic, the prompt and ungrouping all see the same runs, in the
 *  group's own order (later = drawn on top), which is what the layers panel edits. */
export function explodeGroup(g: Group, widths: Record<string, number>): Group[] {
  if (!g.free) return [g];
  const placed = [...layoutOf(g, widths)].sort((a, b) => a.y - b.y || a.x - b.x);
  const rank = new Map(g.items.map((it, i) => [it.id, i]));
  const used = new Set<string>();
  const out: Group[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) <= 3;
  for (const start of placed) {
    if (used.has(start.item.id)) continue;
    used.add(start.item.id);
    const run = [start];
    const axis = connectSpecOf(start.item)?.axis ?? "x";
    let last = start;
    for (;;) {
      const next = placed.find(
        (q) =>
          !used.has(q.item.id) &&
          canJoin(last.item, q.item) &&
          (axis === "x" ? near(q.y, last.y) && near(q.x, last.x + last.w + GAP) : near(q.x, last.x) && near(q.y, last.y + last.h + GAP)),
      );
      if (!next) break;
      used.add(next.item.id);
      run.push(next);
      last = next;
    }
    /* named after the member the group lists first, so the name survives a reorder */
    const anchor = run.reduce((a, b) => ((rank.get(a.item.id) ?? 0) <= (rank.get(b.item.id) ?? 0) ? a : b));
    out.push({ id: `${g.id}:${anchor.item.id}`, x: start.x, y: start.y, axis, items: run.map((r) => r.item) });
  }
  const first = (r: Group) => Math.min(...r.items.map((it) => rank.get(it.id) ?? 0));
  return out.sort((a, b) => first(a) - first(b));
}

/** corners of one part of a run: round outside, small where it meets a neighbour */
export function runCorners(axis: Axis, first: boolean, last: boolean, outer: number, inner: number): Radii {
  const a = first ? outer : inner;
  const b = last ? outer : inner;
  return axis === "x" ? { tl: a, bl: a, tr: b, br: b } : { tl: a, tr: a, bl: b, br: b };
}

/** the corner radii of every part in a free group, with its hidden runs kept connected */
export function freeRadii(g: Group, widths: Record<string, number>): Map<string, Radii> {
  const out = new Map<string, Radii>();
  for (const run of explodeGroup(g, widths)) {
    const n = run.items.length;
    run.items.forEach((it, i) => {
      const c = connectSpecOf(it);
      out.set(it.id, c ? runCorners(run.axis, i === 0, i === n - 1, c.outer, c.inner) : baseRadii(it));
    });
  }
  return out;
}

/** a run belongs to the frame that contains its centre */
export function frameOfGroup(g: Group, frames: Frame[], widths: Record<string, number>): Frame | undefined {
  const bb = groupBounds(g, widths);
  const cx = (bb.l + bb.r) / 2;
  const cy = (bb.t + bb.b) / 2;
  return frames.find((f) => {
    const fr = frameRect(f);
    return cx >= fr.l && cx <= fr.r && cy >= fr.t && cy <= fr.b;
  });
}

export const groupsInFrame = (groups: Group[], f: Frame, frames: Frame[], widths: Record<string, number>) =>
  groups.filter((g) => frameOfGroup(g, frames, widths)?.id === f.id);

export type Group = {
  id: string;
  x: number;
  y: number;
  axis: Axis;
  items: Item[];
  /** a finished section the author locked from the Layers panel: it cannot be dragged, deleted or tidied, but stays selectable */
  locked?: boolean;
  /** a hand-made group: parts keep their own offsets (in `pos`) and move as one layer */
  free?: boolean;
  pos?: Record<string, { x: number; y: number }>;
};

export type FrameMode = "blank" | "phone";

/** where the generated prompt asks for the app to be built */
export type Platform = "android" | "web";
export const DEFAULT_PLATFORM: Platform = "android";
export const isPlatform = (v: unknown): v is Platform => v === "android" || v === "web";
/** The target the prompt assumes when the author has not picked one: the web as
 *  soon as a desktop screen exists, Android otherwise. */
export const defaultPlatformOf = (frames: Frame[], mode: FrameMode): Platform => (mode === "phone" && frames.some((f) => !isPhoneFrame(f)) ? "web" : DEFAULT_PLATFORM);

export type Doc = {
  groups: Group[];
  frames: Frame[];
  paletteKey: string;
  /** the author's own scheme, used when paletteKey is "custom" */
  customPalette?: Palette;
  /** the app should take its colors from the user's wallpaper (Material You) */
  dynamicColor?: boolean;
  frame: FrameMode;
  /** the implementation target the prompt names; Android unless the author picks the web */
  platform?: Platform;
  title: string;
  brief: string;
  /** the prompt as the author rewrote it by hand; undefined means the generated one */
  promptEdit?: string;
  /** shape, type, motion and the light / dark and contrast switches */
  theme?: Theme;
};

export const defaultTabs = (): NavTab[] => NAV_TABS[getLang()].map((t) => ({ ...t }));

const TOOLBAR_ICONS = ["format_bold", "format_italic", "format_underlined", "attach_file", "format_color_text", "more_vert"];

/** the entries a kind starts with, also used to fill in rows the author adds */
export function defaultTabsFor(kind: Kind): NavTab[] {
  switch (kind) {
    case "tabs":
      return TAB_LABELS[getLang()].map((label) => ({ icon: "", label }));
    case "select":
      return SELECT_OPTIONS[getLang()].map((label) => ({ icon: "", label }));
    case "fabMenu":
      return FAB_MENU_TABS[getLang()].map((t) => ({ ...t }));
    case "toolbar":
      return TOOLBAR_ICONS.map((icon) => ({ icon, label: "" }));
    default:
      return defaultTabs();
  }
}

export function makeItem(kind: Kind): Item {
  const s = KIND_SPEC[kind];
  const text = KIND_TEXT[getLang()][kind];
  const it: Item = {
    id: uid(),
    kind,
    label: text?.label ?? s.defLabel,
    icon: s.defIcon,
    variant: s.defVariant ?? "filled",
  };
  if (s.defSupporting !== undefined) it.supporting = text?.supporting ?? s.defSupporting;
  if (s.defIcon2 !== undefined) it.icon2 = s.defIcon2;
  if (s.defSize !== undefined) it.size = s.defSize;
  if (s.hasChecked) it.checked = kind !== "chip" && kind !== "box";
  if (kind === "box") {
    it.size2 = 220;
    it.radiusTop = 28;
    it.radiusBottom = 28;
    it.fill = "surfaceContainerHigh";
  }
  if (kind === "slider") it.value = 40;
  if (kind === "bottomNav") {
    it.tabs = defaultTabs();
    it.radiusTop = 0;
    it.radiusBottom = 0;
  }
  if (kind === "navRail") {
    it.tabs = defaultTabs();
    it.railExpanded = false;
  }
  if (kind === "tabs" || kind === "fabMenu" || kind === "select") it.tabs = defaultTabsFor(kind);
  if (kind === "toolbar") it.tabs = defaultTabsFor(kind).slice(0, 4);
  return it;
}

/** Content-sized kinds are measured in the DOM; the rest derive from spec + size. */
export const MEASURED: Kind[] = ["button", "extendedFab", "chip", "switch", "checkbox", "text", "splitButton", "radio", "badge"];

/** Progress track thickness range in dp; Material's standard bar is 4 and its thick bar 8. */
export const TRACK_MIN = 2;
export const TRACK_MAX = 16;
export const TRACK_DEFAULT = 4;
/** A ring can only be so thick before its gap swallows it: a sixth of the diameter, never under 4. */
export const maxRingThickness = (size: number) => Math.max(TRACK_DEFAULT, Math.min(TRACK_MAX, Math.floor(size / 6)));
export const isTrackThickness = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= TRACK_MIN && v <= TRACK_MAX;
/** The thickness actually drawn: a ring caps the value by its own diameter. */
export const progressThickness = (it: Item): number => {
  const v = isTrackThickness(it.trackThickness) ? it.trackThickness : TRACK_DEFAULT;
  return it.kind === "circularProgress" ? Math.min(v, maxRingThickness(it.size ?? KIND_SPEC.circularProgress.w)) : v;
};

export function sizeOf(it: Item, widths: Record<string, number>) {
  const s = KIND_SPEC[it.kind];
  const n = it.size ?? s.defSize ?? s.w;
  switch (it.kind) {
    case "switch":
    case "button":
      return { w: it.size ?? widths[it.id] ?? s.w, h: s.h };
    case "extendedFab":
    case "chip":
    case "checkbox":
    case "splitButton":
    case "radio":
      return { w: widths[it.id] ?? 128, h: s.h };
    case "badge":
      return { w: widths[it.id] ?? 16, h: it.label.trim() ? s.h : 6 };
    case "fabMenu":
      return { w: n, h: 56 + (it.tabs?.length ?? 0) * (FAB_MENU_ITEM_H + FAB_MENU_GAP) };
    case "toolbar":
      return { w: toolbarWidth(it), h: s.h };
    case "tabs":
      return { w: n, h: s.h };
    case "text":
      return { w: widths[it.id] ?? 120, h: Math.round(n * 1.3) };
    case "iconButton":
    case "fab":
    case "circularProgress":
    case "loadingIndicator":
    case "image":
      return { w: n, h: n };
    case "camera":
      return { w: n, h: it.size2 ?? Math.round((n * 4) / 3) };
    case "map":
      return { w: n, h: it.size2 ?? Math.round((n * 3) / 4) };
    case "topAppBar":
      /* the status-bar inset belongs to a phone: a bar wider than one has no status bar above it.
       * (An Android tablet does; the canvas leaves that to the prompt.) */
      return { w: n, h: 64 + (n > PHONE_W ? 0 : STATUS_BAR_H) };
    case "searchBar":
    case "bottomNav":
    case "listItem":
    case "textField":
    case "select":
    case "slider":
    case "linearProgress":
    case "divider":
      return { w: n, h: s.h };
    case "card":
      return { w: n, h: it.size2 ?? Math.round(n * 0.5875) };
    case "box":
      return { w: n, h: it.size2 ?? s.h };
    case "navRail":
      return { w: railWidth(it), h: it.size2 ?? s.h };
    default:
      return { w: s.w, h: s.h };
  }
}

/** Corners for a part that is not part of a connected run. Defaults follow the
 *  document's shape scale; a radius the author typed in is kept as is. */
export function baseRadii(it: Item): Radii {
  const s = KIND_SPEC[it.kind];
  switch (it.kind) {
    case "box":
      if (it.corners) return { ...it.corners };
    // falls through
    case "bottomNav":
    case "topAppBar":
    case "tabs": {
      const t = it.radiusTop ?? 0;
      const b = it.radiusBottom ?? 0;
      return { tl: t, tr: t, bl: b, br: b };
    }
    case "navRail": {
      /* a rail's corners are its left and right sides: radiusTop is the left pair, radiusBottom the right */
      const modalRadius = it.railExpanded && it.railModal ? 16 : 0;
      const l = it.radiusTop ?? modalRadius;
      const r = it.radiusBottom ?? modalRadius;
      return { tl: l, bl: l, tr: r, br: r };
    }
    case "fab":
      return uniformRadii(scaleR(Math.round((it.size ?? 56) * 0.28)));
    case "fabMenu":
      return uniformRadii(0);
    case "iconButton":
      return uniformRadii(scaleR((it.size ?? 48) / 2));
    case "circularProgress":
    case "loadingIndicator":
      return uniformRadii((it.size ?? 48) / 2);
    case "card":
      if (it.corners) return { ...it.corners };
    // falls through
    case "image":
    case "camera":
    case "map":
      return uniformRadii(it.radiusTop ?? scaleR(s.radius));
    case "badge":
    case "radio":
    case "splitButton":
      return uniformRadii(s.radius);
    default:
      return uniformRadii(scaleR(s.radius));
  }
}

export const FAB_MENU_ITEM_H = 56;

/** a tab row fits up to this many fixed tabs; more become M3 scrollable tabs */
export const FIXED_TABS_MAX = 5;
/** width of one scrollable tab; M3 asks for at least 90dp */
export const SCROLL_TAB_W = 96;

/** a tab row scrolls once it holds more tabs than M3 fixes in place and they would not fit its width */
export const isScrollableTabs = (it: Item) => {
  const n = it.tabs?.length ?? 0;
  return it.kind === "tabs" && n > FIXED_TABS_MAX && n * SCROLL_TAB_W > sizeOf(it, {}).w;
};

/** per-tab tap targets renumbered after the tab list changed; `to(j)` gives the old index j its new one, or nothing */
function remapTabActions(actions: Item["actions"], to: (j: number) => number | undefined): Item["actions"] {
  if (!actions) return undefined;
  const next: NonNullable<Item["actions"]> = {};
  for (const [key, a] of Object.entries(actions)) {
    const m = /^tab:(\d+)$/.exec(key);
    if (!m) {
      next[key] = a;
      continue;
    }
    const j = to(Number(m[1]));
    if (j !== undefined) next[`tab:${j}`] = a;
  }
  return Object.keys(next).length ? next : undefined;
}

/** the patch that drops entry i: later entries, the selected index and the tap targets move up one; a
 *  dropdown may end with no initial value, a bar or tab row keeps the entry that takes the removed one's place */
export function removeTabPatch(it: Item, i: number): Pick<Item, "tabs" | "selected" | "actions"> {
  const tabs = (it.tabs ?? []).filter((_, j) => j !== i);
  const sel = it.selected;
  const last = Math.max(0, tabs.length - 1);
  const selected =
    sel === undefined ? undefined : sel > i ? sel - 1 : sel < i ? sel : it.kind === "select" ? undefined : Math.min(i, last);
  return { tabs, selected, actions: remapTabActions(it.actions, (j) => (j === i ? undefined : j > i ? j - 1 : j)) };
}

/** the patch that sets the entry count: extra entries come from the defaults, and the tap targets of dropped entries go */
export function tabCountPatch(it: Item, n: number, defaults: NavTab[]): Pick<Item, "tabs" | "selected" | "actions"> {
  const cur = it.tabs ?? [];
  const tabs: NavTab[] = [];
  for (let i = 0; i < n; i++) tabs.push(cur[i] ? { ...cur[i] } : { ...defaults[i % defaults.length] });
  return {
    tabs,
    selected: it.selected !== undefined && it.selected >= n ? undefined : it.selected,
    actions: remapTabActions(it.actions, (j) => (j < n ? j : undefined)),
  };
}

/** how far a scrollable tab row is shifted left so the selected tab is in view with half of the
 *  next one peeking in; the drawing and the preview's hit areas share it, so a tap lands on the tab that is shown */
export function tabScrollOffset(it: Item, width: number): number {
  if (!isScrollableTabs(it)) return 0;
  const n = it.tabs?.length ?? 0;
  const sel = Math.min(it.selected ?? 0, Math.max(0, n - 1));
  const max = Math.max(0, n * SCROLL_TAB_W - width);
  return Math.max(0, Math.min(max, (sel + 1.5) * SCROLL_TAB_W - width));
}
export const FAB_MENU_GAP = 8;
/** a toolbar hugs its icon buttons: 48dp each with 4dp between, 8dp at the ends */
export const toolbarWidth = (it: Item) => {
  const n = Math.max(1, it.tabs?.length ?? 0);
  return 16 + n * 48 + (n - 1) * 4;
};

export const connectSpecOf = (it: Item): ConnectSpec | undefined => {
  const c = KIND_SPEC[it.kind].connect;
  return c && { ...c, outer: scaleR(c.outer), inner: scaleR(c.inner) };
};
export const connectable = (it: Item) => !!KIND_SPEC[it.kind].connect;
/** two parts fuse when they share an axis and a family (buttons and icon buttons mix) */
export const canJoin = (a: Item, b: Item) => {
  const sa = connectSpecOf(a);
  const sb = connectSpecOf(b);
  return !!sa && !!sb && sa.axis === sb.axis && sa.family === sb.family;
};

/* ---------- icon slots ---------- */
export type IconSlot = { key: string; label: string; value: string | null };

export function iconSlotsOf(it: Item): IconSlot[] {
  switch (it.kind) {
    case "listItem":
    case "topAppBar":
    case "searchBar":
      return [
        { key: "icon", label: t("leading"), value: it.icon },
        { key: "icon2", label: t("trailing"), value: it.icon2 ?? null },
      ];
    case "bottomNav":
    case "navRail":
    case "toolbar":
      return (it.tabs ?? []).map((t, i) => ({
        key: `tab:${i}`,
        label: `${i + 1}`,
        value: t.icon || null,
      }));
    case "fabMenu":
      return [
        { key: "icon", label: t("icon"), value: it.icon },
        ...(it.tabs ?? []).map((t, i) => ({ key: `tab:${i}`, label: `${i + 1}`, value: t.icon || null })),
      ];
    default:
      return KIND_SPEC[it.kind].hasIcon
        ? [{ key: "icon", label: t("icon"), value: it.icon }]
        : [];
  }
}

export function setIconSlot(it: Item, key: string, v: string | null): Partial<Item> {
  if (key === "icon") return { icon: v };
  if (key === "icon2") return { icon2: v };
  if (key === "toggle") return { toggle: { ...(it.toggle ?? {}), icon: v } };
  if (key.startsWith("tab:")) {
    const i = Number(key.slice(4));
    const tabs = (it.tabs ?? []).map((t, j) => (j === i ? { ...t, icon: v ?? "" } : t));
    return { tabs };
  }
  return {};
}
