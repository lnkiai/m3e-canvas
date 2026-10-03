import type { CSSProperties } from "react";
import { FAB_MENU_TABS, KIND_TEXT, Lang, NAV_TABS, SPLIT_MENU_TABS, TAB_LABELS, getLang, t, SELECT_OPTIONS } from "./i18n";
import { Contrast, isLightColor, schemeFromSeed } from "./color";

/* ---------- geometry ---------- */
export const H = 56; // M3 medium button height (dp)

/** The five button sizes M3 Expressive names, and what each one is made of: the height,
 *  the padding on either side, the gap between icon and label, the icon and the label.
 *  A height between two steps takes values between theirs, so the slider stays M3-shaped
 *  the whole way rather than only on the five stops. */
export const BUTTON_SIZES = [
  { key: "xs", h: 32, padX: 12, gap: 8, icon: 20, font: 14 },
  { key: "s", h: 40, padX: 16, gap: 8, icon: 20, font: 14 },
  { key: "m", h: 56, padX: 24, gap: 8, icon: 24, font: 16 },
  { key: "l", h: 96, padX: 48, gap: 12, icon: 32, font: 24 },
  { key: "xl", h: 136, padX: 64, gap: 16, icon: 40, font: 32 },
] as const;
export type ButtonSizeKey = (typeof BUTTON_SIZES)[number]["key"];
export const BUTTON_H_MIN = BUTTON_SIZES[0].h;
export const BUTTON_H_MAX = BUTTON_SIZES[BUTTON_SIZES.length - 1].h;
export type ButtonMetrics = { h: number; padX: number; gap: number; icon: number; font: number };

/** the two named sizes a height falls between, and a way to read any measure off them mixed in
 *  proportion, so a scale stays M3-shaped the whole way rather than only on its own stops */
function onScale<T extends { h: number }>(steps: readonly T[], height: number) {
  const h = clamp(Math.round(height), steps[0].h, steps[steps.length - 1].h);
  let lo: T = steps[0];
  let hi: T = steps[steps.length - 1];
  for (let i = 0; i < steps.length - 1; i++) {
    if (h >= steps[i].h && h <= steps[i + 1].h) {
      lo = steps[i];
      hi = steps[i + 1];
      break;
    }
  }
  const f = hi.h === lo.h ? 0 : (h - lo.h) / (hi.h - lo.h);
  return { h, of: (read: (s: T) => number) => Math.round(lerp(read(lo), read(hi), f)) };
}

/** what a button of this height is made of; between two named sizes the parts are mixed in proportion */
export function buttonMetrics(height: number): ButtonMetrics {
  const s = onScale(BUTTON_SIZES, height);
  return { h: s.h, padX: s.of((b) => b.padX), gap: s.of((b) => b.gap), icon: s.of((b) => b.icon), font: s.of((b) => b.font) };
}

/** M3's chip sizes: the 32dp one it has always had, and the two roomier ones Expressive adds.
 *  A chip is as wide as its label makes it, so its height is the one measure it has.
 *  `lead` is the tighter padding on the side an icon sits on. */
export const CHIP_SIZES = [
  { key: "xs", h: 32, padX: 16, lead: 8, gap: 8, icon: 18, font: 14 },
  { key: "s", h: 40, padX: 20, lead: 12, gap: 8, icon: 20, font: 14 },
  { key: "m", h: 56, padX: 24, lead: 16, gap: 8, icon: 24, font: 16 },
] as const;
export type ChipSizeKey = (typeof CHIP_SIZES)[number]["key"];
export const CHIP_H_MIN = CHIP_SIZES[0].h;
export const CHIP_H_MAX = CHIP_SIZES[CHIP_SIZES.length - 1].h;
export type ChipMetrics = { h: number; padX: number; lead: number; gap: number; icon: number; font: number };

/** what a chip of this height is made of, read off the same kind of scale a button has */
export function chipMetrics(height: number): ChipMetrics {
  const s = onScale(CHIP_SIZES, height);
  return { h: s.h, padX: s.of((c) => c.padX), lead: s.of((c) => c.lead), gap: s.of((c) => c.gap), icon: s.of((c) => c.icon), font: s.of((c) => c.font) };
}

/** the hairline a split button's two segments stand apart */
export const SPLIT_GAP = 2;
export type SplitMetrics = ButtonMetrics & { trailPadX: number; trailW: number };
/** A split button is a button cut in two: the segment that carries the action, and the arrow
 *  segment that opens its menu. Both stand on the button scale, so the leading segment is made
 *  of exactly what a button of that height is made of, and the arrow segment is its icon with
 *  tighter padding on either side of it. */
export function splitMetrics(height: number): SplitMetrics {
  const m = buttonMetrics(height);
  const trailPadX = Math.round(m.padX * 0.6);
  return { ...m, trailPadX, trailW: m.icon + trailPadX * 2 };
}

/** The menu a split button's arrow opens: an M3 menu sheet of its entries, standing a hairline
 *  away from the button on the side it has room for. */
export const SPLIT_MENU_ITEM_H = 48;
export const SPLIT_MENU_PAD = 8;
export const SPLIT_MENU_SHEET_GAP = 4;

/** M3's three FAB sizes; an extended FAB is the same three, given room for its label */
export const FAB_SIZES = [
  { key: "s", d: 40, h: 56 },
  { key: "m", d: 56, h: 80 },
  { key: "l", d: 96, h: 96 },
] as const;
export const FAB_H_MIN = 40;
export const FAB_H_MAX = 96;

/** The sizes a ring, a loading indicator and a progress bar are offered at. They are asked for by
 *  the letters Material names every other size by -- S, M, L, XL -- and the dp each comes to rides in
 *  the hover text, because a row of raw numbers says nothing about which one to reach for. */
export const RING_SIZES = [
  { key: "s", value: 24 },
  { key: "m", value: 48 },
  { key: "l", value: 64 },
] as const;
export const LOADING_SIZES = [
  { key: "s", value: 32 },
  { key: "m", value: 48 },
  { key: "l", value: 64 },
  { key: "xl", value: 96 },
] as const;
/** a bar is measured across the screen it sits on, so its three sizes are read off that width */
export const barWidths = (frameW: number) => [
  { key: "s", value: halfWidth(frameW) },
  { key: "m", value: contentWidth(frameW) },
  { key: "l", value: frameW },
];

/** the named size a height lands exactly on, if it lands on one */
export const buttonSizeKeyOf = (height: number): ButtonSizeKey | null => BUTTON_SIZES.find((s) => s.h === height)?.key ?? null;
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
/** the same time and curve, as the CSS custom properties the stylesheet eases with */
export const SETTLE_CSS_VARS = { "--m3-settle": `${SETTLE_MS}ms`, "--m3-ease": "cubic-bezier(0.2, 0, 0, 1)" } as const;
/** the size handles stand above everything on the canvas but the panels */
export const SIZE_HANDLE_Z = 55;

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
/** M3's three top app bars: small, medium and large, by the height of the bar under the status bar.
 *  Past the small one the title leaves the icon row and stands on its own line at the foot. */
export const TOP_BAR_SIZES = [
  { key: "s", h: 64, font: 22 },
  { key: "m", h: 112, font: 24 },
  { key: "l", h: 152, font: 28 },
] as const;
/** how tall the bar itself is, without the status bar it may carry */
export const topBarHeightOf = (it: Item) => clamp(Math.round(it.size2 ?? TOP_BAR_SIZES[0].h), TOP_BAR_SIZES[0].h, TOP_BAR_SIZES[TOP_BAR_SIZES.length - 1].h);
/** the title size the bar's height asks for: the named size it lands on, or the nearest below */
export const topBarFontOf = (it: Item) => {
  const h = topBarHeightOf(it);
  let font: number = TOP_BAR_SIZES[0].font;
  for (const b of TOP_BAR_SIZES) if (h >= b.h) font = b.font;
  return font;
};
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

/** the band of colour a part takes while a model writes into it: the screens wear it as a fill,
 *  a field as a ring. It drifts with the `m3e-drift` keyframes. */
export const draftGradient = (p: Palette) =>
  `linear-gradient(120deg, ${p.primaryContainer}, ${p.tertiaryContainer}, ${p.primary}, ${p.secondaryContainer}, ${p.primaryContainer})`;

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
  | "bottomSheet"
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
  | "carousel"
  | "datePicker"
  | "timePicker";

/** how a carousel arranges its items: M3's four layouts */
export type CarouselLayout = "multiBrowse" | "uncontained" | "hero" | "fullScreen";
export const CAROUSEL_LAYOUTS: { key: CarouselLayout; icon: string; text: "carouselMultiBrowse" | "carouselUncontained" | "carouselHero" | "carouselFullScreen" }[] = [
  { key: "multiBrowse", icon: "view_carousel", text: "carouselMultiBrowse" },
  { key: "uncontained", icon: "view_week", text: "carouselUncontained" },
  { key: "hero", icon: "view_sidebar", text: "carouselHero" },
  { key: "fullScreen", icon: "crop_din", text: "carouselFullScreen" },
];
/** a date picker is a dialog, a calendar hanging off a field, or the field on its own */
export type DateLayout = "modal" | "docked" | "input";
export const DATE_LAYOUTS: { key: DateLayout; icon: string; text: "dateModal" | "dateDocked" | "dateInput" }[] = [
  { key: "modal", icon: "calendar_month", text: "dateModal" },
  { key: "docked", icon: "event", text: "dateDocked" },
  { key: "input", icon: "keyboard", text: "dateInput" },
];
/** a time picker is read off a dial or typed in */
export type TimeLayout = "dial" | "input";
export const TIME_LAYOUTS: { key: TimeLayout; icon: string; text: "timeDial" | "dateInput" }[] = [
  { key: "dial", icon: "schedule", text: "timeDial" },
  { key: "input", icon: "keyboard", text: "dateInput" },
];
export type PartLayout = CarouselLayout | DateLayout | TimeLayout;
export const carouselLayoutOf = (it: Item): CarouselLayout =>
  CAROUSEL_LAYOUTS.some((l) => l.key === it.layout) ? (it.layout as CarouselLayout) : "multiBrowse";
export const dateLayoutOf = (it: Item): DateLayout =>
  DATE_LAYOUTS.some((l) => l.key === it.layout) ? (it.layout as DateLayout) : "modal";
export const timeLayoutOf = (it: Item): TimeLayout => (it.layout === "input" ? "input" : "dial");
/** the share a progress indicator counts up to when it is first asked for one, and where a
 *  slider's handle first sits */
export const PROGRESS_DEFAULT_VALUE = 60;
export const SLIDER_DEFAULT_VALUE = 40;
/** how many cards a carousel holds */
export const carouselCountOf = (it: Item) => clamp(Math.round(it.count ?? 4), 2, 8);
/** The cards themselves: one per card, carrying the picture and the words put on it. They are
 *  kept in the same list a bar keeps its destinations in, so a card is a place a tap can be sent
 *  from as well. */
export const carouselCardsOf = (it: Item): NavTab[] =>
  Array.from({ length: carouselCountOf(it) }, (_, i) => it.tabs?.[i] ?? { icon: "", label: "" });
/** the patch that changes one card: the picture on it, or what it says */
export function carouselCardPatch(it: Item, index: number, patch: Partial<NavTab>): Partial<Item> {
  return { tabs: carouselCardsOf(it).map((c, i) => (i === index ? { ...c, ...patch } : c)) };
}
/** A sketch saved when a carousel was one box with one caption and one destination: both belong
 *  to a card now, so they become the first card's -- the row itself is no longer tapped. */
export function migrateCarousel(it: Item): Item {
  if (it.kind !== "carousel" || (!it.label && !it.action)) return it;
  const next: Item = { ...it, label: "" };
  if (it.label) next.tabs = carouselCardsOf(it).map((c, i) => (i === 0 && !c.label ? { ...c, label: it.label } : c));
  if (it.action) {
    next.actions = { "tab:0": it.action, ...(it.actions ?? {}) };
    next.action = undefined;
  }
  return next;
}

/** A sketch saved when a picker carried a chosen day and time: the fields are gone, since a
 *  picker shows today and now, and they are dropped rather than written back out forever. */
type PickerFields = { day?: unknown; hour?: unknown; minute?: unknown };
export const hasPickerFields = (it: Item) => {
  const old = it as Item & PickerFields;
  return old.day !== undefined || old.hour !== undefined || old.minute !== undefined;
};
/** A box used to become a bottom sheet when its handle was switched on; the sheet is a part of
 *  its own now, so such a box is read back as one. */
export const isSheetBox = (it: Item) => it.kind === "box" && !!it.checked;
export function migrateSheetBox(it: Item): Item {
  if (!isSheetBox(it)) return it;
  const { checked: _checked, radiusBottom: _bottom, corners: _corners, ...rest } = it;
  return { ...rest, kind: "bottomSheet", radiusTop: it.corners?.tl ?? it.radiusTop ?? 28 };
}

export function migratePicker(it: Item): Item {
  if (!hasPickerFields(it)) return it;
  const rest = { ...it } as Item & PickerFields;
  delete rest.day;
  delete rest.hour;
  delete rest.minute;
  return rest;
}

/** the gap between a carousel's cards */
export const CARD_GAP = 8;

/** The widths of a carousel's cards, in order, for the layout it was given. They are the sizes
 *  M3's keylines name -- a large card, a medium one, and small ones -- measured against the box
 *  rather than shared out between the cards, so a row of them runs past the edge and scrolls,
 *  which is what a carousel is. */
export function cardWidths(layout: string, width: number, count: number): number[] {
  /* The arrangement is read off the screen it is on, so a carousel fills the row it is given
   * whatever that screen is: the same picture on a phone and on a desktop, at that screen's size. */
  const small = Math.max(24, Math.round(width * 0.14));
  const large = Math.round(width * 0.56);
  const medium = Math.round(width * 0.3);
  if (layout === "fullScreen") {
    /* one card fills the row and the next one only peeks in */
    return Array(count).fill(Math.round(width * 0.86));
  }
  if (layout === "hero") {
    /* one card is the hero; the rest are the small ones beside it */
    return [Math.round(width * 0.72), ...Array(Math.max(0, count - 1)).fill(small)];
  }
  if (layout === "uncontained") {
    /* every card is the same width, and the row runs past the edge */
    return Array(count).fill(Math.max(40, Math.round(width / 2.4)));
  }
  /* multi-browse: a large card, a medium one, then small ones -- the large one leaves room for
   * a sliver of the third, so the row says at a glance that it carries on */
  return [large, medium, ...Array(Math.max(0, count - 2)).fill(small)];
}

/** an edge-to-edge carousel keeps the screen's margin at its start, an inset one sits flush */
export const carouselInset = (width: number) => (width >= PHONE_W ? PHONE_MARGIN : 0);

/** how far the row of cards runs at rest, which on some layouts is past the part's own box */
export function carouselRowWidth(it: Item, width: number): number {
  const inset = carouselInset(width);
  const ws = cardWidths(carouselLayoutOf(it), width - inset, carouselCountOf(it));
  return inset + ws.reduce((a, b) => a + b, 0) + CARD_GAP * Math.max(0, ws.length - 1);
}

/** How many stops the row has past its first: enough for every card to pass out at the head, plus
 *  the one that turns the arrangement around at the end, where the last card is the large one. */
export function carouselScrollMax(it: Item, width: number): number {
  const inset = carouselInset(width);
  const count = carouselCountOf(it);
  const ws = cardWidths(carouselLayoutOf(it), width - inset, count);
  /* a row that fits the screen it is on has nowhere to go */
  if (carouselRowWidth(it, width) <= width) return 0;
  return clamp(count - carouselFill(ws, width - inset) + 1, 0, count - 1);
}

/** the row is longer than the box it sits in, so in the preview it scrolls sideways */
export const isScrollableCarousel = (it: Item, width: number) => carouselScrollMax(it, width) > 0;

/** Where the row rests: one stop per card, each the scroll at which that card stands at the head
 *  of the arrangement. A scroll let go between two is pulled to the nearer one, so the card on the
 *  left is always a whole card at its own size rather than something caught mid-growth.
 *
 *  Every stop is the same distance from the last. A card leaves the row from the large keyline
 *  whichever card it is, so every card costs the same scroll to pass, and the row travels with
 *  the hand that carries it rather than crawling through the wide cards and bolting through the
 *  narrow ones. (The first stop also takes back the margin the row starts with.) */
export function carouselStops(it: Item, width: number): number[] {
  const inset = carouselInset(width);
  const ws = cardWidths(carouselLayoutOf(it), width - inset, carouselCountOf(it));
  const stride = ws[0] + CARD_GAP;
  const stops = [0];
  for (let i = 0; i < carouselScrollMax(it, width); i++) stops.push(stops[i] + stride + (i ? 0 : inset));
  return stops;
}

/** how far the row may be scrolled, in pixels: the last stop, plus the box it is seen through */
export function carouselTrack(it: Item, width: number): number {
  const stops = carouselStops(it, width);
  return width + stops[stops.length - 1];
}

/** how many cards the head of the row takes to fill the box: the rest are what there is to scroll */
function carouselFill(ws: number[], width: number): number {
  let acc = 0;
  for (let i = 0; i < ws.length; i++) {
    acc += ws[i] + (i ? CARD_GAP : 0);
    if (acc >= width - 1) return i + 1;
  }
  return ws.length;
}

/** the width a card takes at a given place in the arrangement: on a stop it is that stop's own
 *  width, and between two it is read off both, so a card grows into the next size as it travels */
function slotWidth(ws: number[], at: number): number {
  if (at <= -1) return 0;
  /* The card at the head is on its way out. It draws in towards the small size and slides past
   * the near edge, where the row cuts it off -- the same way the cards at the far end are cut
   * off -- rather than thinning away to nothing while it stands there. */
  if (at < 0) return lerp(ws[ws.length - 1], ws[0], at + 1);
  const k = Math.floor(at);
  const a = ws[Math.min(k, ws.length - 1)];
  const b = ws[Math.min(k + 1, ws.length - 1)];
  return lerp(a, b, at - k);
}

/** Where every card stands and how wide it is at a given scroll. Scrolling does not slide the row
 *  past the box: each card travels through the arrangement instead, growing into the next size as
 *  the one ahead of it shrinks away -- which is what makes a Material carousel read as one. At the
 *  end of the list the arrangement turns around, so the last card finishes at the large keyline
 *  rather than the row trailing off into space. */
export function carouselShapes(it: Item, width: number, scroll = 0): { x: number; w: number; lead: number }[] {
  const inset = carouselInset(width);
  const count = carouselCountOf(it);
  const ws = cardWidths(carouselLayoutOf(it), width - inset, count);
  const stops = carouselStops(it, width);
  /* how many cards the scroll has carried past, counted in cards rather than pixels */
  let passed = stops.length - 1;
  for (let i = 0; i < stops.length - 1; i++) {
    if (scroll < stops[i + 1]) {
      passed = i + (scroll - stops[i]) / (stops[i + 1] - stops[i]);
      break;
    }
  }
  if (!(scroll > 0)) passed = 0;
  /* The last cards keep the row full between them: from there on the arrangement turns around.
   * The sizes are read into their new ones on a curve that sets off and settles, so the row is
   * not seen starting or stopping on the turn. */
  const fill = carouselFill(ws, width - inset);
  const turning = clamp(passed - (count - fill), 0, 1);
  const turn = turning * turning * (3 - 2 * turning);
  /* The row also gives way to the last card as it comes to rest against the far edge. Where that
   * is a pull against the travel it is taken early, while the row is still moving fast enough to
   * swallow it, and is all but over by the time the travel dies away: spread evenly it outlives
   * the travel and the row is seen backing up at the very end. A pull that goes with the travel
   * has nothing to fight, and is spread evenly so the row does not bolt on it. */
  const settle = 1 - (1 - turning) * (1 - turning) * (1 - turning);
  const out: { x: number; w: number; lead: number }[] = [];
  /* The margin is the list's, not the edge's: the first card stands off the near edge, and past
   * it the row simply runs to the edge and is cut there, so nothing is held in a margin on its
   * way out. The card leaving carries the row's start with it as it goes. */
  const leaving = passed - Math.floor(passed);
  const start = inset * clamp(1 - passed, 0, 1);
  /* The card at the head goes out at a steady rate: it travels the width it is left with when it
   * finally goes, and draws the rest of the way in instead of moving. Travelling its own width
   * while that width is shrinking would carry it past where it ends up and bring it back, which
   * the whole row would be seen doing. */
  let x = start - leaving * (ws[ws.length - 1] + CARD_GAP);
  for (let i = 0; i < count; i++) {
    const running = slotWidth(ws, i - passed);
    /* turned around, a card takes its size from the end of the row rather than the head of it */
    const ended = i < count - fill ? 0 : ws[Math.min(count - 1 - i, ws.length - 1)];
    const w = turn > 0 ? lerp(running, ended, turn) : running;
    /* how far this card has grown into the large keyline: the one standing in it is the main
     * card, and the only one that says anything */
    const lead = ws.length > 1 ? clamp((w - ws[1]) / Math.max(1, ws[0] - ws[1]), 0, 1) : 1;
    out.push({ x, w, lead });
    /* the gap goes with the card: it closes as the card it follows shrinks away */
    x += w + CARD_GAP * Math.min(1, w / 8);
  }
  /* Turned around, the row is measured from its far edge instead of its near one: the last card
   * stands whole against the same margin the first one started from, and what runs over does so
   * at the head, where the cards are leaving anyway. */
  if (turn > 0) {
    const right = x - CARD_GAP * Math.min(1, out[count - 1].w / 8);
    const span = width - inset - right;
    const want = lerp(0, span, span > 0 ? settle : turn);
    for (const c of out) c.x += want;
  }
  return out;
}

/** the three heights M3 gives a carousel, named the way every other size is */
export const CAROUSEL_HEIGHTS = [
  { key: "s", value: 140 },
  { key: "m", value: 180 },
  { key: "l", value: 260 },
] as const;

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
    hasFill: true,
    size: { min: 40, max: PHONE_W, step: 4, icon: "width", presets: WIDTH_PRESETS },
    size2: { min: 24, max: PHONE_H, step: 4, icon: "height", presets: HEIGHT_PRESETS },
    defLabel: "",
    defIcon: null,
    defSize: PHONE_W,
  },
  /* a modal sheet that slides up from the bottom edge: a drag handle at its top, its top corners
   * rounded and its bottom ones flush with the screen */
  bottomSheet: {
    label: "Bottom sheet",
    noun: "ボトムシート",
    category: "containment",
    paletteIcon: "bottom_sheets",
    w: PHONE_W,
    h: 320,
    radius: 28,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: false,
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
    /* 56 is the height: an icon-only button is a circle at its narrowest */
    size: { min: 56, max: PHONE_W, step: 4, icon: "width", presets: [HALF_W, CONTENT_W] },
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
    /* the same five sizes a button has: an icon button is the one that is all icon */
    size: { min: BUTTON_H_MIN, max: BUTTON_H_MAX, step: 4, icon: "open_in_full", presets: BUTTON_SIZES.map((b) => b.h) },
    defLabel: "",
    defIcon: "favorite",
    defSize: H,
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
    size: { min: FAB_H_MIN, max: FAB_H_MAX, step: 4, icon: "open_in_full", presets: FAB_SIZES.map((f) => f.d) },
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
    size2: { min: 56, max: 96, step: 4, icon: "height", presets: [56, 80, 96] },
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
    connect: { axis: "x", outer: CHIP_H_MIN / 2, inner: 4, family: "chip" },
    /* as wide as its label makes it: the height is the one measure the author sets */
    size2: { min: CHIP_H_MIN, max: CHIP_H_MAX, step: 4, icon: "height", presets: CHIP_SIZES.map((c) => c.h) },
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
    /* M3's small, medium and large bars: the title moves under the icons as the bar grows */
    size2: { min: TOP_BAR_SIZES[0].h, max: TOP_BAR_SIZES[TOP_BAR_SIZES.length - 1].h, step: 4, icon: "height", presets: TOP_BAR_SIZES.map((b) => b.h) },
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
    hasVariant: true,
    hasLabel: true,
    hasSupporting: false,
    hasIcon: true,
    size: { min: 200, max: PHONE_W, step: 4, icon: "width", presets: WIDTH_PRESETS },
    defLabel: "検索",
    defIcon: "search",
    defIcon2: "mic",
    defSize: CONTENT_W,
    defVariant: "filled",
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
    size: { min: 48, max: PHONE_W, step: 4, icon: "width", presets: [96, HALF_W, CONTENT_W, PHONE_W] },
    size2: { min: 48, max: PHONE_H, step: 4, icon: "height", presets: [96, 200, 280] },
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
    label: "Loading",
    noun: "ローディング",
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
    size: { min: 32, max: 128, step: 4, icon: "open_in_full", presets: LOADING_SIZES.map((s) => s.value) },
    defLabel: "",
    defIcon: null,
    defSize: 48,
  },
  linearProgress: {
    label: "Progress",
    noun: "プログレス",
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
    label: "Progress",
    noun: "プログレス",
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
    size: { min: 24, max: 120, step: 4, icon: "open_in_full", presets: RING_SIZES.map((s) => s.value) },
    defLabel: "",
    defIcon: null,
    defSize: 48,
  },
  carousel: {
    label: "Carousel",
    noun: "カルーセル",
    category: "content",
    paletteIcon: "view_carousel",
    w: PHONE_W,
    h: 180,
    radius: 16,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: false,
    size: { min: 200, max: PHONE_W, step: 4, icon: "width", presets: [CONTENT_W, PHONE_W] },
    size2: { min: 100, max: 400, step: 4, icon: "height", presets: [140, 180, 260] },
    defLabel: "",
    defIcon: null,
    defSize: PHONE_W,
  },
  datePicker: {
    label: "Date Picker",
    noun: "日付ピッカー",
    category: "inputs",
    paletteIcon: "calendar_month",
    w: 328,
    h: 484,
    radius: 28,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: false,
    size: { min: 280, max: PHONE_W, step: 4, icon: "width", presets: [328, CONTENT_W, PHONE_W] },
    defLabel: "",
    defIcon: null,
    defSize: 328,
  },
  timePicker: {
    label: "Time Picker",
    noun: "時刻ピッカー",
    category: "inputs",
    paletteIcon: "schedule",
    w: 328,
    h: 420,
    radius: 28,
    hasVariant: false,
    hasLabel: false,
    hasSupporting: false,
    hasIcon: false,
    size: { min: 280, max: PHONE_W, step: 4, icon: "width", presets: [328, CONTENT_W] },
    defLabel: "",
    defIcon: null,
    defSize: 328,
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
    /* as wide as its label makes it, so the height is the one measure it is given */
    size2: { min: BUTTON_H_MIN, max: BUTTON_H_MAX, step: 4, icon: "height", presets: BUTTON_SIZES.map((b) => b.h) },
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
  "bottomSheet",
  "dialog",
  "snackbar",
  "textField",
  "select",
  "switch",
  "checkbox",
  "radio",
  "slider",
  "datePicker",
  "timePicker",
  "text",
  "image",
  "carousel",
  "camera",
  "map",
  "divider",
  "loadingIndicator",
  "linearProgress",
  "circularProgress",
];

/* ---------- screen data ---------- */
/** an entry in a bar, a menu or a carousel: what it shows, and -- on a carousel card -- the
 *  picture put on it */
export type NavTab = { icon: string; label: string; src?: string };

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
  /** cards: where the words sit across the card; the start when unset */
  textAlign?: CardAlign;
  /** cards: a color role for the headline and body instead of the automatic one */
  textColor?: TextToken;
  /** on/off state for switches, checkboxes and chips */
  checked?: boolean;
  /** a switch whose handle stays plain when on, without the check icon */
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
  /** height for free-form boxes, and for a button following the M3 size scale */
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
  /** which arrangement a carousel or a picker takes */
  layout?: PartLayout;
  /** how many cards a carousel holds */
  count?: number;
  /** runtime-only: the editor is showing this FAB's menu open. Never written to JSON. */
  [fabOpen]?: boolean;
  /** runtime-only: the menu rises out of the part's top rather than dropping below it. */
  [menuUp]?: boolean;
};

export type ToggleLook = { icon?: string | null; variant?: Variant; label?: string };

/** kinds that can act as a toggle button in the preview */
export const TOGGLEABLE: Kind[] = ["button", "iconButton", "fab", "extendedFab"];

/** target id that pops the preview stack instead of opening a frame */
export const BACK_TARGET = "back";

/** target id that opens a web page in the browser instead of a screen */
export const LINK_TARGET = "link";

/** the address a link action opens, once it is one a browser may follow; a bare host is read as https */
export function linkUrlOf(a: Action | undefined): string | null {
  const raw = a?.url?.trim();
  if (!raw) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** the host the small browser in the trigger tab shows */
export function linkHostOf(a: Action | undefined): string | null {
  const href = linkUrlOf(a);
  if (!href) return null;
  try {
    return new URL(href).host;
  } catch {
    return null;
  }
}

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
export type Action = { to: string; transition: Transition; /** the address a `LINK_TARGET` action opens */ url?: string };

/** the height a button is drawn at: the author's, else M3's medium button. An icon button has
 *  only the one measure -- it is a circle -- so its diameter is its height. */
export const buttonHeightOf = (it: Item) =>
  clamp(Math.round(it.kind === "iconButton" ? (it.size ?? H) : (it.size2 ?? H)), BUTTON_H_MIN, BUTTON_H_MAX);
/** the height a chip is drawn at: the M3 32dp one unless the author set another */
export const chipHeightOf = (it: Item) => clamp(Math.round(it.size2 ?? CHIP_H_MIN), CHIP_H_MIN, CHIP_H_MAX);

/** The two shapes a FAB takes: the circle and the one that carries a label. Opening a menu is
 *  something either of them can be asked to do, so it is a tap action rather than a shape. */
export const FAB_KINDS = ["fab", "extendedFab"] as const;
export type FabKind = (typeof FAB_KINDS)[number];
export const isFab = (k: Kind): k is FabKind => (FAB_KINDS as readonly string[]).includes(k);
/** parts the palette does not list on their own: a FAB's other two shapes are reached from its
 *  own panel, where the three sit side by side. A saved sketch may still hold any of them. */
export const PALETTE_HIDDEN: Kind[] = ["extendedFab", "fabMenu", "circularProgress"];
/** how tall an extended FAB is drawn, and what it is made of at that height */
export const extendedFabHeight = (it: Item) => clamp(Math.round(it.size2 ?? 56), 56, FAB_H_MAX);
export function extendedFabMetrics(h: number) {
  /* the label and the icon grow with the container, the way the three named sizes do */
  const k = (h - 56) / (FAB_H_MAX - 56);
  return {
    h,
    padX: Math.round(lerp(20, 28, k)),
    gap: Math.round(lerp(12, 16, k)),
    icon: Math.round(lerp(24, 32, k)),
    font: Math.round(lerp(14, 20, k)),
    radius: Math.round(lerp(16, 28, k)),
  };
}

/** the patch that turns one shape of FAB into the other, carrying what the two have in common */
export function fabTypePatch(it: Item, to: FabKind): Partial<Item> {
  if (it.kind === to) return {};
  const base: Partial<Item> = { kind: to };
  if (to === "fab") return { ...base, size: it.size2 ?? 56, size2: undefined };
  return { ...base, size: undefined, size2: Math.max(56, it.size ?? 56), label: it.label || KIND_SPEC.extendedFab.defLabel };
}

/** The two shapes a progress indicator takes: the bar and the ring. They are one part in the
 *  palette, and the panel switches between them. */
export const PROGRESS_KINDS = ["linearProgress", "circularProgress"] as const;
export type ProgressKind = (typeof PROGRESS_KINDS)[number];
export const isProgress = (k: Kind): k is ProgressKind => (PROGRESS_KINDS as readonly string[]).includes(k);
/** the patch that turns one shape into the other: a bar is measured by its width and a ring by
 *  its diameter, so neither carries the other's measure and each takes its own. What the two
 *  share -- how far along it is, the wave, the thickness of the track -- travels across. */
export function progressTypePatch(it: Item, to: ProgressKind): Partial<Item> {
  if (it.kind === to) return {};
  return { kind: to, size: to === "linearProgress" ? CONTENT_W : 48 };
}

/** The three selection controls, one panel: a switch, a checkbox and a radio button say the same
 *  thing in three shapes. A switch is the only one given a width; the other two are as wide as
 *  their label. */
export const CHOICE_KINDS = ["switch", "checkbox", "radio"] as const;
export type ChoiceKind = (typeof CHOICE_KINDS)[number];
export const isChoice = (k: Kind): k is ChoiceKind => (CHOICE_KINDS as readonly string[]).includes(k);
/** the three pictures a screen shows: a picture, the camera's viewfinder and a map, each a box
 *  with something different in it and the same panel around it */
export const PICTURE_KINDS = ["image", "camera", "map"] as const;
export type PictureKind = (typeof PICTURE_KINDS)[number];
export const isPicture = (k: Kind): k is PictureKind => (PICTURE_KINDS as readonly string[]).includes(k);
/** the two fields that hold a value: a text field, and the dropdown that picks one from a list */
export const FIELD_KINDS = ["textField", "select"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];
export const isField = (k: Kind): k is FieldKind => (FIELD_KINDS as readonly string[]).includes(k);

/** M3's type scale, as the sizes a line of text on the canvas is offered at. The letter names
 *  the role -- body, title, headline, display -- and the number is the sp it comes to. */
export const TEXT_SIZES = [
  { key: "body", value: 16 },
  { key: "title", value: 22 },
  { key: "headline", value: 28 },
  { key: "display", value: 45 },
] as const;

/** how many destinations a bar, a rail and a toolbar may carry: M3's own bounds */
export const ENTRY_BOUNDS: Partial<Record<Kind, { min: number; max: number }>> = {
  bottomNav: { min: 3, max: 5 },
  navRail: { min: 3, max: 7 },
  toolbar: { min: 2, max: 6 },
};

/** target id for the menu a FAB opens: the entries rise out of the button itself */
export const MENU_TARGET = "menu";
/** the half of a split button a tap landed on: the words, or the arrow beside them */
export const SPLIT_MAIN_SLOT = "main";
/** the slot a split button's arrow segment carries: the label segment keeps the part's own action,
 *  and the arrow -- which is what opens the menu -- is sent somewhere of its own */
export const SPLIT_MENU_SLOT = "menu";
/** the FAB has a menu to open */
export const hasMenu = (it: Item) => isFab(it.kind) && it.action?.to === MENU_TARGET;
/** a split button's arrow opens the entries the button carries; with none it opens nothing */
export const splitOpens = (it: Item) => it.kind === "splitButton" && (it.tabs?.length ?? 0) > 0;
/** the part has a menu to open: a FAB asked to, and a split button because that is what its
 *  arrow segment is for */
export const opensMenu = (it: Item) => hasMenu(it) || splitOpens(it);
/** runtime-only: the editor is showing that menu open. Never part of a saved sketch. */
export const fabOpen = Symbol("fabOpen");
/** runtime-only: the menu is drawn rising out of the part's top. Never part of a saved sketch. */
export const menuUp = Symbol("menuUp");
/** the menu is drawn open: in the editor while it is being set up, in the preview once tapped */
export const menuOpen = (it: Item) => opensMenu(it) && it[fabOpen] === true;
/** how tall the sheet of entries stands */
export const splitMenuHeight = (it: Item) => (it.tabs?.length ?? 0) * SPLIT_MENU_ITEM_H + SPLIT_MENU_PAD * 2;
/** the menu is drawn above the button rather than below it */
export const menuRises = (it: Item) => it[menuUp] === true;
/** Which way a split button's menu unrolls: down while the sheet fits under the button, and up
 *  when it does not and there is more room above -- so a button near the foot of a screen opens
 *  upwards and one near its head opens down. A part on no screen at all drops, the way a menu
 *  usually does. A FAB's menu always stacks above the FAB, so it never asks. */
export function splitMenuRisesAt(it: Item, top: number, frame: Frame | null): boolean {
  if (!frame || !splitOpens(it)) return false;
  const y = top - frame.y;
  const below = frameSizeOf(frame).h - (y + buttonHeightOf(it));
  return SPLIT_MENU_SHEET_GAP + splitMenuHeight(it) > below && y > below;
}
/** the patch that gives a FAB a menu, or takes it away again; its entries are kept either way */
export function menuPatch(it: Item, on: boolean): Partial<Item> {
  if (!on) return { action: undefined, [fabOpen]: undefined };
  return { action: { to: MENU_TARGET, transition: "none" }, tabs: it.tabs ?? defaultTabsFor("fabMenu") };
}
/** how tall a FAB stands with its menu open: the entries, then the button that closes them */
export const menuHeight = (it: Item, fabH: number) => fabH + (it.tabs?.length ?? 0) * (FAB_MENU_ITEM_H + FAB_MENU_GAP);

/** a sketch saved when a menu was a part of its own: the FAB keeps its entries and is asked to
 *  open them instead */
export function migrateFabMenu(it: Item): Item {
  if (it.kind !== "fabMenu") return it;
  const { size: _drop, ...rest } = it;
  return { ...rest, kind: "fab", size: 56, icon: KIND_SPEC.fab.defIcon, action: { to: MENU_TARGET, transition: "none" } };
}

/** the one measure a run of buttons shares: the part that is standing still sets it, and
 *  whatever joins the run takes it, so the run reads as one band rather than a staircase.
 *  A button keeps the width it was given unless it is now narrower than it is tall. */
export function matchRunSize(item: Item, host: Item): Item {
  const family = KIND_SPEC[item.kind].connect?.family;
  if (!family || family !== KIND_SPEC[host.kind].connect?.family) return item;
  if (family === "chip") {
    const h = chipHeightOf(host);
    return chipHeightOf(item) === h ? item : { ...item, size2: h };
  }
  /* list items stack, so the measure they share is their width */
  if (family === "list") {
    const w = host.size ?? KIND_SPEC[host.kind].defSize ?? KIND_SPEC[host.kind].w;
    return (item.size ?? KIND_SPEC[item.kind].defSize ?? KIND_SPEC[item.kind].w) === w ? item : { ...item, size: w };
  }
  if (family !== "button") return item;
  const h = buttonHeightOf(host);
  if (buttonHeightOf(item) === h) return item;
  if (item.kind === "iconButton") return { ...item, size: h };
  return { ...item, size2: h, ...(item.size && item.size < h ? { size: h } : {}) };
}

/** the patch that sets a part's measure, carried across a run it belongs to: the parts of one
 *  run share a height, and each keeps its own width -- or, in a stack of list items, a width. */
export function runSizePatch(items: Item[], id: string, patch: Partial<Item>): Item[] {
  const at = items.findIndex((it) => it.id === id);
  if (at < 0) return items;
  const next = { ...items[at], ...patch };
  const stacked = KIND_SPEC[items[at].kind].connect?.family === "list";
  const carries = items.length > 1 && ("size2" in patch || ((items[at].kind === "iconButton" || stacked) && "size" in patch));
  if (!carries) return items.map((it, i) => (i === at ? next : it));
  return items.map((it, i) => (i === at ? next : matchRunSize(it, next)));
}

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
  if (it.kind === "topAppBar" || it.kind === "searchBar" || it.kind === "bottomNav" || it.kind === "navRail" || it.kind === "toolbar") return iconSlotsOf(it).filter((s) => !!s.value);
  /* the entries of a menu, whichever FAB opens it */
  if (it.kind === "fabMenu" || opensMenu(it)) return (it.tabs ?? []).map((t, i) => ({ key: `tab:${i}`, label: t.label || `${i + 1}`, value: t.icon || null }));
  if (it.kind === "tabs") return (it.tabs ?? []).map((t, i) => ({ key: `tab:${i}`, label: t.label || `${i + 1}`, value: null }));
  /* every card of a carousel is a place of its own to be sent from */
  if (it.kind === "carousel") return carouselCardsOf(it).map((_, i) => ({ key: `tab:${i}`, label: `${i + 1}`, value: null }));
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

/** The parts a press lights up from inside: the button family, each in its own shape. A bar, a
 *  slider, an indicator is not something a finger presses, so it is left as it was drawn. */
export const RIPPLE_KINDS: Kind[] = ["button", "iconButton", "chip", "fab", "extendedFab", "splitButton"];

/** kinds a user can tap in the preview */
export const TAPPABLE: Kind[] = ["button", "iconButton", "fab", "extendedFab", "chip", "listItem", "card", "image", "text", "splitButton", "radio", "datePicker", "timePicker"];

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

/** where a card's image area sits: a band along the top or the bottom, a column down a side, or
 *  the whole background; sketches saved before placement existed stay on top */
export type CardImagePos = "top" | "bottom" | "leading" | "trailing" | "background";
export const isCardImagePos = (v: unknown): v is CardImagePos => v === "top" || v === "bottom" || v === "leading" || v === "trailing" || v === "background";
/** a band runs across the card and is measured down; a column runs down it and is measured across */
export const isCardImageBand = (pos: CardImagePos) => pos === "top" || pos === "bottom";
export const cardImagePosOf = (it: Item): CardImagePos => it.imagePos ?? "top";


export type CardAlign = "start" | "center" | "end";
export const isCardAlign = (v: unknown): v is CardAlign => v === "start" || v === "center" || v === "end";
/** the text block's vertical position: the top, or the bottom when it lies over a background image */
export const cardTextAlignOf = (it: Item): CardAlign => it.textAlign ?? "start";
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
  const room = isCardImageBand(cardImagePosOf(it)) ? h - CARD_MIN_TEXT_H : w - CARD_MIN_TEXT_W;
  return Math.max(CARD_IMAGE_MIN, room - CARD_PADDING * 2 - CARD_MEDIA_GAP);
}
/** the image area's extent in dp: the author's value, else 28% of the card's width
 *  on top or the standard column on a side, never beyond cardImageMaxOf */
export function cardImageSizeOf(it: Item): number {
  const top = isCardImageBand(cardImagePosOf(it));
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

/** The looks a list item comes in, named the way a FAB's are: each is a row colour and the
 *  colour of the disc behind its leading icon, set together so the icon always reads on the row.
 *  The surface look is what a list item wears when nothing was chosen. */
export type ListStyle = "surface" | "primary" | "secondary";
export const LIST_STYLES: { key: ListStyle; fill: ColorToken; iconFill: ColorToken; text: "styleSurface" | "stylePrimary" | "styleSecondary" }[] = [
  { key: "surface", fill: "surfaceContainerLow", iconFill: "primaryContainer", text: "styleSurface" },
  { key: "primary", fill: "primaryContainer", iconFill: "primary", text: "stylePrimary" },
  { key: "secondary", fill: "secondaryContainer", iconFill: "surface", text: "styleSecondary" },
];
/** the look a list item wears, or null when its colours were set some other way: a sketch
 *  from before the looks existed keeps its colours until a look is picked on purpose */
export const listStyleOf = (it: Item): ListStyle | null => {
  const fill = it.fill ?? "surfaceContainerLow";
  const icon = it.iconFill ?? "primaryContainer";
  return LIST_STYLES.find((s) => s.fill === fill && s.iconFill === icon)?.key ?? null;
};
/** the fields a look sets; the surface look is the unset default so old sketches stay untouched */
export const listStylePatch = (style: ListStyle): Pick<Item, "fill" | "iconFill"> => {
  const s = LIST_STYLES.find((l) => l.key === style) ?? LIST_STYLES[0];
  return style === "surface" ? { fill: undefined, iconFill: undefined } : { fill: s.fill, iconFill: s.iconFill };
};

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
  /** how far the screen runs when it is longer than the device: its body scrolls under the bars */
  length?: number;
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

export type FramePreset = "phone" | "desktop";
export const frameSizeOf = (f: Frame) => ({ w: f.w ?? PHONE_W, h: f.h ?? PHONE_H });
export const isPhoneFrame = (f: Frame) => {
  const { w, h } = frameSizeOf(f);
  return w === PHONE_W && h === PHONE_H;
};
export const framePresetOf = (f: Frame): FramePreset => (isPhoneFrame(f) ? "phone" : "desktop");
export const framePresetPatch = (preset: FramePreset): Pick<Frame, "w" | "h"> =>
  preset === "desktop" ? { w: DESKTOP_W, h: DESKTOP_H } : { w: undefined, h: undefined };
/** the device a screen is drawn for is `frameSizeOf`; the screen itself may run further down,
 *  and everything laid out on it -- what it holds, where Tidy puts its bars -- goes by this */
export const frameLengthOf = (f: Frame) => Math.max(f.length ?? 0, frameSizeOf(f).h);
export const scrollsOf = (f: Frame) => frameLengthOf(f) > frameSizeOf(f).h;
export const frameRect = (f: Frame) => {
  const { w } = frameSizeOf(f);
  return { l: f.x, t: f.y, r: f.x + w, b: f.y + frameLengthOf(f) };
};
/** the corner radius of a screen: a phone's rounded glass, a flatter window for the desktop */
export const frameRadius = (f: Frame) => (isPhoneFrame(f) ? PHONE_R : DESKTOP_R);

/** parts that span the screen edge to edge and follow its width when it changes */
/** parts that span the screen they are on: the bars, and a carousel, whose row is the screen */
export const FULL_WIDTH: Kind[] = ["topAppBar", "bottomNav", "tabs", "carousel"];

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
    else if (cur > contentWidth(to.w) && it.kind !== "box" && it.kind !== "bottomSheet") patch.size = contentWidth(to.w);
  }
  if ((it.kind === "box" || it.kind === "bottomSheet" || it.kind === "navRail") && (it.size2 ?? spec.h) === from.h) patch.size2 = to.h;
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

/** the corner radii of every part across the given runs */
export function radiiOfRuns(runs: Group[]): Map<string, Radii> {
  const out = new Map<string, Radii>();
  for (const run of runs) {
    const n = run.items.length;
    run.items.forEach((it, i) => {
      const c = connectSpecOf(it);
      out.set(it.id, c ? runCorners(run.axis, i === 0, i === n - 1, c.outer, c.inner) : baseRadii(it));
    });
  }
  return out;
}

/** the corner radii of every part in a free group, with its hidden runs kept connected */
export function freeRadii(g: Group, widths: Record<string, number>): Map<string, Radii> {
  return radiiOfRuns(explodeGroup(g, widths));
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
  /** the guidance lines the author switched on; undefined means the default set */
  promptOptions?: string[];
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
    case "splitButton":
      return SPLIT_MENU_TABS[getLang()].map((t) => ({ ...t }));
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
  if (s.hasChecked) it.checked = kind !== "chip";
  if (kind === "box") {
    it.size2 = 220;
    it.radiusTop = 28;
    it.radiusBottom = 28;
    it.fill = "surfaceContainerHigh";
  }
  if (kind === "bottomSheet") {
    it.size2 = 320;
    it.radiusTop = 28;
    it.fill = "surfaceContainerLow";
  }
  if (kind === "slider") it.value = 40;
  if (kind === "carousel") {
    it.layout = "multiBrowse";
    it.count = 4;
    it.size2 = 180;
  }
  if (kind === "datePicker") it.layout = "modal";
  if (kind === "timePicker") it.layout = "dial";
  if (kind === "bottomNav") {
    it.tabs = defaultTabs();
    it.radiusTop = 0;
    it.radiusBottom = 0;
  }
  if (kind === "navRail") {
    it.tabs = defaultTabs();
    it.railExpanded = false;
  }
  if (kind === "tabs" || kind === "fabMenu" || kind === "select" || kind === "splitButton") it.tabs = defaultTabsFor(kind);
  if (kind === "toolbar") it.tabs = defaultTabsFor(kind).slice(0, 4);
  return it;
}

/** Content-sized kinds are measured in the DOM; the rest derive from spec + size. */
export const MEASURED: Kind[] = ["button", "extendedFab", "chip", "switch", "checkbox", "text", "splitButton", "radio", "fabMenu"];
/** the part is as wide as its own content makes it, whatever kind it is */
export const isMeasured = (it: Item) => (MEASURED.includes(it.kind) && !((it.kind === "switch" || it.kind === "button") && it.size)) || menuOpen(it);

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
      return { w: it.size ?? widths[it.id] ?? s.w, h: s.h };
    case "button":
      return { w: it.size ?? widths[it.id] ?? s.w, h: buttonHeightOf(it) };
    case "extendedFab":
      return menuOpen(it)
        ? { w: widths[it.id] ?? 220, h: menuHeight(it, extendedFabHeight(it)) }
        : { w: widths[it.id] ?? 128, h: extendedFabHeight(it) };
    case "chip":
      return { w: widths[it.id] ?? 128, h: chipHeightOf(it) };
    case "splitButton":
      return { w: widths[it.id] ?? 128, h: buttonHeightOf(it) + (menuOpen(it) ? SPLIT_MENU_SHEET_GAP + splitMenuHeight(it) : 0) };
    case "checkbox":
    case "radio":
      return { w: widths[it.id] ?? 128, h: s.h };
    case "fabMenu":
      /* the menu is as wide as its widest entry: nothing to set, so nothing to get wrong */
      return { w: widths[it.id] ?? n, h: 56 + (it.tabs?.length ?? 0) * (FAB_MENU_ITEM_H + FAB_MENU_GAP) };
    case "toolbar":
      return { w: toolbarWidth(it), h: s.h };
    case "tabs":
      return { w: n, h: s.h };
    case "text":
      return { w: widths[it.id] ?? 120, h: Math.round(n * 1.3) };
    case "fab":
      return menuOpen(it) ? { w: widths[it.id] ?? 220, h: menuHeight(it, FAB_MENU_CLOSE) } : { w: n, h: n };
    case "iconButton":
    case "circularProgress":
    case "loadingIndicator":
      return { w: n, h: n };
    /* a picture is as tall as it was made; square until it is given a height of its own */
    case "image":
      return { w: n, h: it.size2 ?? n };
    case "camera":
      return { w: n, h: it.size2 ?? Math.round((n * 4) / 3) };
    case "map":
      return { w: n, h: it.size2 ?? Math.round((n * 3) / 4) };
    case "topAppBar":
      /* the status-bar inset belongs to a phone: a bar wider than one has no status bar above it.
       * (An Android tablet does; the canvas leaves that to the prompt.) */
      return { w: n, h: topBarHeightOf(it) + (n > PHONE_W ? 0 : STATUS_BAR_H) };
    case "searchBar":
    case "bottomNav":
    case "listItem":
    case "textField":
    case "select":
    case "slider":
    case "linearProgress":
    case "divider":
      return { w: n, h: s.h };
    case "carousel":
      return { w: n, h: it.size2 ?? s.h };
    case "datePicker": {
      const l = dateLayoutOf(it);
      /* the calendar's rows follow its width, so a wider dialog is a taller one */
      const cell = Math.round((n - 24 * 2) / 7);
      /* the headline, the month row, seven rows of days and the two text buttons */
      return { w: n, h: l === "input" ? 96 : l === "docked" ? 120 + cell * 7 : 164 + cell * 7 };
    }
    case "timePicker": {
      const dial = Math.min(256, n - 48);
      /* the heading, the two plates, the dial and the two text buttons */
      return { w: n, h: timeLayoutOf(it) === "input" ? 204 : 196 + dial };
    }
    case "card":
      return { w: n, h: it.size2 ?? Math.round(n * 0.5875) };
    case "box":
    case "bottomSheet":
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
    /* a button stays fully round whatever height it is given */
    case "button":
      return uniformRadii(scaleR(buttonHeightOf(it) / 2));
    /* a sheet rounds only the edge it rises with; its bottom stays flush with the screen */
    case "bottomSheet": {
      const t = it.radiusTop ?? s.radius;
      return { tl: t, tr: t, bl: 0, br: 0 };
    }
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
    case "extendedFab":
      return uniformRadii(scaleR(extendedFabMetrics(extendedFabHeight(it)).radius));
    case "fabMenu":
      return uniformRadii(0);
    case "iconButton":
      return uniformRadii(scaleR((it.size ?? 48) / 2));
    case "circularProgress":
    case "loadingIndicator":
      return uniformRadii((it.size ?? 48) / 2);
    case "card":
    case "image":
      if (it.corners) return { ...it.corners };
    // falls through
    case "camera":
    case "map":
      return uniformRadii(it.radiusTop ?? scaleR(s.radius));
    case "carousel":
      return uniformRadii(it.radiusTop ?? 0);
    /* the two segments keep their own corners, so what the box is asked for is the outer one */
    case "splitButton":
      return uniformRadii(scaleR(buttonHeightOf(it) / 2));
    case "radio":
      return uniformRadii(s.radius);
    default:
      return uniformRadii(scaleR(s.radius));
  }
}

export const FAB_MENU_ITEM_H = 56;
/** the button an open menu hangs off: the M size, whatever size the FAB itself is drawn at */
export const FAB_MENU_CLOSE = 56;

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

/** the patch that puts the entries in a new order, carrying each one's tap target with it.
 *  `order` holds the old index of every entry, in the order they are to be read. */
export function reorderTabsPatch(it: Item, order: number[]): Pick<Item, "tabs" | "selected" | "actions"> {
  const cur = it.tabs ?? [];
  const tabs = order.map((j) => ({ ...cur[j] }));
  const to = new Map(order.map((from, at) => [from, at]));
  return {
    tabs,
    selected: it.selected === undefined ? undefined : to.get(it.selected) ?? it.selected,
    actions: remapTabActions(it.actions, (j) => to.get(j)),
  };
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
  /* the ends of a run are as round as the part is tall, so a taller button keeps its full corners */
  const outer =
    it.kind === "button" || it.kind === "iconButton"
      ? buttonHeightOf(it) / 2
      : it.kind === "chip"
        ? chipHeightOf(it) / 2
        : c?.outer ?? 0;
  return c && { ...c, outer: scaleR(outer), inner: scaleR(c.inner) };
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
