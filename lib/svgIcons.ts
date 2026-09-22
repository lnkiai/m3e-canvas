"use client";

/* Exports every icon-font leaf of a frame as a real vector `<path>` outline.
 *
 * Material Symbols renders its icons by *ligature*: the DOM text owns the icon
 * word ("search_off") and the glyph is produced by a GSUB substitution. Design
 * tools never run that substitution, so a plain `<text>` export shows the word
 * instead of the picture. The correct fix is to resolve the ligature ourselves
 * and emit the resulting glyph outline as an SVG path. fontkit reads the WOFF2
 * directly, applies `liga` shaping, and hands back the exact vector contour —
 * keeping every element a true SVG path with no raster data.
 *
 * Coordinate note: fontkit exposes the outline in TrueType space — y points up
 * and the origin sits on the baseline. We keep `d` untouched there and place it
 * with a transform that (a) flips y into SVG space, (b) scales from font units
 * to pixels, and (c) centers the glyph's bounding box on the element's box. */

import { iconFontFamilies } from "./svgFonts";
import type { Font } from "fontkit";

export interface IconVector {
  /** the icon leaf in the live DOM (so the caller can silence/restore its text) */
  el: HTMLElement;
  /** the original icon word, restored after export */
  text: string;
  /** SVG path data in the font's own units (y-up, baseline origin) */
  d: string;
  /** paint colour = the element's computed text colour */
  fill: string;
  /** places the glyph into SVG viewport coordinates (already includes y-flip) */
  transform: string;
}

interface GlyphData {
  d: string;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  upem: number;
}

function normalizeFamily(family: string) {
  return family.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

/** e.g. `"FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24` -> { fill, wght } */
function readVariation(settings: string, fontWeight: string | number) {
  let fill = 0;
  let wght = Number(fontWeight);
  if (!Number.isFinite(wght)) wght = 400;
  for (const m of settings.matchAll(/["']?([A-Za-z]{4})["']?\s+(-?\d+(?:\.\d+)?)/g)) {
    const value = Number(m[2]);
    if (m[1] === "FILL") fill = value;
    else if (m[1] === "wght") wght = value;
  }
  return { fill, wght };
}

/* ---- font source resolution (reuses the document's @font-face rules) ---- */

async function iconFontSources(): Promise<Map<string, string>> {
  // Avoid a static import cycle: svgFonts exports the rule table we need.
  const { fontFaceRuleSources } = await import("./svgFonts");
  return fontFaceRuleSources();
}

const sourceCache = new Map<string, string>();

async function sourceFor(family: string): Promise<string | null> {
  if (sourceCache.has(family)) return sourceCache.get(family) ?? null;
  const url = (await iconFontSources()).get(family);
  sourceCache.set(family, url ?? "");
  return url ?? null;
}

/* ---- font byte + instance caches ---- */

const bytesCache = new Map<string, Uint8Array | null>();

async function fontBytes(family: string): Promise<Uint8Array | null> {
  if (bytesCache.has(family)) return bytesCache.get(family) ?? null;
  let bytes: Uint8Array | null = null;
  try {
    const url = await sourceFor(family);
    if (url) {
      const res = await fetch(url, { cache: "force-cache" });
      if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
    }
  } catch {
    bytes = null;
  }
  bytesCache.set(family, bytes);
  return bytes;
}

type FontInstance = { font: Font };

const instanceCache = new Map<string, FontInstance>();

async function fontInstance(
  family: string,
  fill: number,
  wght: number,
): Promise<Font | null> {
  const key = `${family}|${fill}|${wght}`;
  const hit = instanceCache.get(key);
  if (hit) return hit.font;

  const bytes = await fontBytes(family);
  if (!bytes) return null;

  let font: Font | null = null;
  try {
    const kit = await import("fontkit");
    font = kit.create(bytes);
    /* apply the variable-font axes (FILL solid/outline, wght) so the outline
     * matches the on-screen rendering; the browser instance is WOFF2-backed and
     * fontkit's `getVariation` chokes on its lazy tables, so we inject the
     * normalized coordinates directly */
    if (font.fvar && font.fvar.axis && font.fvar.axis.length) {
      const settings: Record<string, number> = { FILL: fill, wght: wght };
      font.variationCoords = font.fvar.axis.map((axis) => {
        const tag = (axis.axisTag || "").trim();
        return tag in settings ? settings[tag] : axis.defaultValue;
      });
    }
  } catch {
    font = null;
  }
  if (font) instanceCache.set(key, { font });
  return font;
}

/* ---- glyph outline cache (d is font-unit based, so size-independent) ---- */

const glyphCache = new Map<string, GlyphData | null>();

async function glyphData(
  family: string,
  text: string,
  fill: number,
  wght: number,
): Promise<GlyphData | null> {
  const key = `${family}|${text}|${fill}|${wght}`;
  if (glyphCache.has(key)) return glyphCache.get(key) ?? null;

  let result: GlyphData | null = null;
  try {
    const font = await fontInstance(family, fill, wght);
    if (font) {
      const run = font.layout(text);
      const glyph = run.glyphs[0];
      /* wrap in an array for text with more than one glyph (a non-ligating icon
       * word would otherwise vanish) — callers rely on a single contour, so we
       * still take the first glyph here */
      if (glyph && glyph.path) {
        result = {
          d: glyph.path.toSVG(2),
          bbox: glyph.path.bbox,
          upem: font.unitsPerEm || 960,
        };
      }
    }
  } catch {
    result = null;
  }
  glyphCache.set(key, result);
  return result;
}

function num(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Enumerates every icon-font glyph in `root` and resolves it to a vector path,
 * positioned in the SVG viewport. Returns the elements and their transforms so
 * the caller can hide the ligature text, export the rest, then inject the paths.
 */
export async function collectIconVectors(root: HTMLElement): Promise<IconVector[]> {
  try {
    const iconFamilies = await iconFontFamilies();
    if (!iconFamilies.size) return [];

    const leaves: HTMLElement[] = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
      const cs = getComputedStyle(el);
      const family = normalizeFamily((cs.fontFamily || "").split(",")[0]);
      if (!family || !iconFamilies.has(family)) continue;
      const text = (el.textContent || "").trim();
      if (!text) continue;
      if (el.children.length > 0) continue; // pure glyph leaf only
      const bg = cs.backgroundColor || "";
      if (bg !== "transparent" && !/^rgba?\(\s*0,\s*0,\s*0,\s*0\)/.test(bg))
        continue;
      if (cs.backgroundImage && cs.backgroundImage !== "none") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      leaves.push(el);
    }
    if (!leaves.length) return [];

    const out: IconVector[] = [];
    for (const el of leaves) {
      const cs = getComputedStyle(el);
      const family = normalizeFamily((cs.fontFamily || "").split(",")[0]);
      const text = (el.textContent || "").trim();
      const { fill, wght } = readVariation(
        cs.getPropertyValue("font-variation-settings"),
        cs.fontWeight,
      );
      const fontSize = parseFloat(cs.fontSize) || 24;
      const rect = el.getBoundingClientRect();

      const data = await glyphData(family, text, fill, wght);
      if (!data) continue;

      const scale = fontSize / data.upem;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const gx = (data.bbox.minX + data.bbox.maxX) / 2;
      const gy = (data.bbox.minY + data.bbox.maxY) / 2;
      const transform = `translate(${num(cx)} ${num(cy)}) scale(${num(scale)} ${num(-scale)}) translate(${num(-gx)} ${num(-gy)})`;

      out.push({ el, text, d: data.d, fill: cs.color, transform });
    }
    return out;
  } catch {
    return [];
  }
}