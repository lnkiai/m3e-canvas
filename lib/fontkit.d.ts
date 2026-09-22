/**
 * Minimal type declarations for the `fontkit` browser build. fontkit ships no
 * bundled types, so we declare only the API surface the SVG exporter uses.
 * The real loader is a dynamic `import("fontkit")` so the (large) parser is
 * code-split and only downloaded when a frame with icons is exported.
 */
declare module "fontkit" {
  export interface Axis {
    axisTag: string;
    name: { en: string };
    minValue: number;
    defaultValue: number;
    maxValue: number;
  }

  export interface BBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  }

  export interface Path {
    bbox: BBox;
    toSVG(dec?: number): string;
  }

  export interface Glyph {
    name: string;
    id: number;
    advanceWidth: number;
    bbox: BBox;
    path: Path;
  }

  export interface GlyphRun {
    glyphs: Glyph[];
    advanceWidth: number;
  }

  export interface Font {
    unitsPerEm: number;
    fvar: { axis: Axis[] } | null;
    variationCoords: number[] | null;
    layout(text: string): GlyphRun;
  }

  export function create(buffer: Uint8Array | ArrayBuffer): Font;
}