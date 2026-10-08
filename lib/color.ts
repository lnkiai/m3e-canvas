/**
 * A small Material-style scheme generator: one seed color becomes a light
 * color scheme by placing each role at a fixed tone (CIE L*) with the seed's
 * hue and a role-specific chroma, then clipping chroma into the sRGB gamut.
 * It follows the shape of Material's HCT tonal palettes without the full
 * CAM16 model, which is more than enough for a mockup palette.
 */

import type { Palette } from "./tokens";

export type Lab = { L: number; a: number; b: number };
export type Lch = { L: number; C: number; h: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const gam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

const WHITE = [0.95047, 1, 1.08883];
const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const fInv = (t: number) => (t > 0.2069 ? t * t * t : (t - 16 / 116) / 7.787);

export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / WHITE[0];
  const y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / WHITE[1];
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / WHITE[2];
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** sRGB in 0..255, or null when the color is outside the gamut */
function labToRgb(lab: Lab): [number, number, number] | null {
  const fy = (lab.L + 16) / 116;
  const fx = lab.a / 500 + fy;
  const fz = fy - lab.b / 200;
  const x = fInv(fx) * WHITE[0];
  const y = fInv(fy) * WHITE[1];
  const z = fInv(fz) * WHITE[2];
  const R = x * 3.2406 + y * -1.5372 + z * -0.4986;
  const G = x * -0.9689 + y * 1.8758 + z * 0.0415;
  const B = x * 0.0557 + y * -0.204 + z * 1.057;
  const out = [R, G, B].map(gam);
  if (out.some((v) => v < -0.002 || v > 1.002)) return null;
  return out.map((v) => clamp01(v) * 255) as [number, number, number];
}

export function labToLch(lab: Lab): Lch {
  const C = Math.hypot(lab.a, lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: lab.L, C, h };
}

/** the color at a tone / chroma / hue, with chroma reduced until it fits sRGB */
export function tone(L: number, C: number, h: number): string {
  const rad = (h * Math.PI) / 180;
  let c = C;
  for (let i = 0; i < 40; i++) {
    const rgb = labToRgb({ L, a: c * Math.cos(rad), b: c * Math.sin(rad) });
    if (rgb) return rgbToHex(rgb[0], rgb[1], rgb[2]);
    c *= 0.88;
  }
  const rgb = labToRgb({ L, a: 0, b: 0 }) ?? [128, 128, 128];
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

export type Contrast = "standard" | "medium" | "high";
export type SchemeOptions = { dark?: boolean; contrast?: Contrast; /** keep a muted seed muted instead of lifting it to a vivid accent */ keepChroma?: boolean };

/** tone (CIE L*) of every role, light and dark, at each contrast level.
 *  The standard tones are Material's; medium and high push the accents and
 *  outlines further from their backgrounds the way Material Theme Builder does. */
type Tones = Record<
  | "primary" | "onPrimary" | "primaryContainer" | "onPrimaryContainer" | "inversePrimary"
  | "secondary" | "secondaryContainer" | "onSecondaryContainer" | "tertiaryContainer" | "onTertiaryContainer"
  | "surface" | "surfaceContainerLow" | "surfaceContainer" | "surfaceContainerHigh" | "surfaceContainerHighest"
  | "onSurface" | "onSurfaceVariant" | "outline" | "outlineVariant" | "inverseSurface" | "inverseOnSurface",
  number
>;

const LIGHT: Tones = {
  primary: 40, onPrimary: 100, primaryContainer: 90, onPrimaryContainer: 10, inversePrimary: 80,
  secondary: 40, secondaryContainer: 90, onSecondaryContainer: 10, tertiaryContainer: 90, onTertiaryContainer: 10,
  surface: 98, surfaceContainerLow: 96, surfaceContainer: 94, surfaceContainerHigh: 92, surfaceContainerHighest: 90,
  onSurface: 10, onSurfaceVariant: 30, outline: 50, outlineVariant: 80, inverseSurface: 20, inverseOnSurface: 95,
};
const DARK: Tones = {
  primary: 80, onPrimary: 20, primaryContainer: 30, onPrimaryContainer: 90, inversePrimary: 40,
  secondary: 80, secondaryContainer: 30, onSecondaryContainer: 90, tertiaryContainer: 30, onTertiaryContainer: 90,
  surface: 6, surfaceContainerLow: 10, surfaceContainer: 12, surfaceContainerHigh: 17, surfaceContainerHighest: 22,
  onSurface: 90, onSurfaceVariant: 80, outline: 60, outlineVariant: 30, inverseSurface: 90, inverseOnSurface: 20,
};

function tonesFor(dark: boolean, contrast: Contrast): Tones {
  const t = { ...(dark ? DARK : LIGHT) };
  if (contrast === "medium") {
    t.secondary = dark ? 85 : 30;
    if (dark) Object.assign(t, { primary: 85, onPrimaryContainer: 95, onSecondaryContainer: 95, onTertiaryContainer: 95, onSurfaceVariant: 85, outline: 70, outlineVariant: 50 });
    else Object.assign(t, { primary: 30, onPrimaryContainer: 20, onSecondaryContainer: 20, onTertiaryContainer: 20, onSurfaceVariant: 25, outline: 40, outlineVariant: 65 });
  } else if (contrast === "high") {
    t.secondary = dark ? 95 : 20;
    if (dark) Object.assign(t, { primary: 95, onPrimary: 0, primaryContainer: 80, onPrimaryContainer: 0, secondaryContainer: 80, onSecondaryContainer: 0, tertiaryContainer: 80, onTertiaryContainer: 0, onSurface: 100, onSurfaceVariant: 95, outline: 90, outlineVariant: 90 });
    else Object.assign(t, { primary: 20, primaryContainer: 30, onPrimaryContainer: 100, secondaryContainer: 30, onSecondaryContainer: 100, tertiaryContainer: 30, onTertiaryContainer: 100, onSurface: 0, onSurfaceVariant: 10, outline: 20, outlineVariant: 20 });
  }
  return t;
}

const ERROR_LIGHT = { error: "#B3261E", onError: "#FFFFFF", errorContainer: "#F9DEDC", onErrorContainer: "#410E0B" };
const ERROR_DARK = { error: "#F2B8B5", onError: "#601410", errorContainer: "#8C1D18", onErrorContainer: "#F9DEDC" };

/** Material 3 scheme from a seed color: light by default, dark and higher
 *  contrast on request. */
export function schemeFromSeed(seedHex: string, label = "Custom", opts: SchemeOptions = {}): Palette {
  const parsed = hexToRgb(seedHex);
  const rgb = parsed ?? [103, 80, 164];
  const lch = labToLch(rgbToLab(rgb[0], rgb[1], rgb[2]));
  const h = lch.h;
  const primaryC = opts.keepChroma ? Math.min(lch.C, 60) : Math.max(36, Math.min(lch.C, 60));
  const secondaryC = primaryC / 3;
  const tertiaryH = (h + 60) % 360;
  const tertiaryC = primaryC / 2;
  const neutralC = 3;
  const neutralVarC = 7;
  const P = (L: number) => tone(L, primaryC, h);
  const S = (L: number) => tone(L, secondaryC, h);
  const T = (L: number) => tone(L, tertiaryC, tertiaryH);
  const N = (L: number) => tone(L, neutralC, h);
  const NV = (L: number) => tone(L, neutralVarC, h);
  const dark = !!opts.dark;
  const k = tonesFor(dark, opts.contrast ?? "standard");
  return {
    key: "custom",
    label,
    seed: parsed ? rgbToHex(rgb[0], rgb[1], rgb[2]) : seedHex.toUpperCase(),
    primary: P(k.primary),
    onPrimary: P(k.onPrimary),
    primaryContainer: P(k.primaryContainer),
    onPrimaryContainer: P(k.onPrimaryContainer),
    inversePrimary: P(k.inversePrimary),
    secondary: S(k.secondary),
    secondaryContainer: S(k.secondaryContainer),
    onSecondaryContainer: S(k.onSecondaryContainer),
    tertiaryContainer: T(k.tertiaryContainer),
    onTertiaryContainer: T(k.onTertiaryContainer),
    surface: N(k.surface),
    surfaceContainerLow: N(k.surfaceContainerLow),
    surfaceContainer: N(k.surfaceContainer),
    surfaceContainerHigh: N(k.surfaceContainerHigh),
    surfaceContainerHighest: N(k.surfaceContainerHighest),
    onSurface: N(k.onSurface),
    onSurfaceVariant: NV(k.onSurfaceVariant),
    outline: NV(k.outline),
    outlineVariant: NV(k.outlineVariant),
    inverseSurface: N(k.inverseSurface),
    inverseOnSurface: N(k.inverseOnSurface),
    ...(dark ? ERROR_DARK : ERROR_LIGHT),
  };
}

/** readable text color for an arbitrary background: the same hue at tone 10 or 100 */
export function onColorFor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#000000";
  const lch = labToLch(rgbToLab(rgb[0], rgb[1], rgb[2]));
  return lch.L > 60 ? tone(10, Math.min(lch.C, 30), lch.h) : tone(100, 0, lch.h);
}

export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v.trim());

/** WCAG relative luminance of an opaque sRGB color, 0 (black) to 1 (white) */
export function luminance(hex: string): number {
  const [r, g, b] = (hexToRgb(hex) ?? [0, 0, 0]).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** whether a color reads as light, i.e. wants a dark backdrop behind it */
export const isLightColor = (hex: string) => luminance(hex) > 0.35;

/** WCAG relative luminance contrast for two opaque sRGB colors. */
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Collapsed labels sit outside the indicator; expanded labels sit inside it. */
export function railSelectedLabelColor(p: Palette, expanded: boolean): string {
  const background = expanded ? p.secondaryContainer : p.surfaceContainer;
  return contrastRatio(p.secondary, background) >= 4.5
    ? p.secondary
    : expanded ? p.onSecondaryContainer : p.onSurface;
}
