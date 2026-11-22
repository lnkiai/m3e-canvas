import {
  SPLIT_GAP,
  buttonHeightOf,
  buttonMetrics,
  chipHeightOf,
  chipMetrics,
  extendedFabHeight,
  extendedFabMetrics,
  isMeasured,
  menuOpen,
  splitMetrics,
  type Group,
  type Item,
} from "./tokens";

/* The widths of the parts that are as wide as their own text, worked out without drawing them.
 *
 * The editor measures these parts once the browser has laid them out, and everything that asks
 * where a part ends (which screen it is on, what it lines up with) is handed those widths. Where
 * there is no browser, as in the MCP server, the same question still has to be answered, and the
 * width a part has before it is measured is a poor stand-in: a chip reading "All" is nowhere
 * near as wide as one reading "Shared with me". So the width is put together the way the part
 * itself is: its padding, its icon, its gaps, and its words at their size.
 *
 * The words are the estimate. A glyph's advance is read off a small table of the classes Roboto
 * and the Noto faces share, which lands within a few percent of the real line for ordinary
 * labels. That is close enough to place a part; it is not a measurement, and the editor never
 * uses it. */

/** a glyph's advance as a share of the font size, by the class it falls in */
function advance(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  /* CJK, kana, hangul, full-width forms and emoji fill the whole square */
  if (code >= 0x1100 && (code <= 0x11ff || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7af) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6) || code >= 0x1f000)) return 1;
  if (ch === " ") return 0.25;
  if ("ijl.,:;'|!".includes(ch)) return 0.25;
  if ("ftrI()[]-\"/\\".includes(ch)) return 0.34;
  if (ch === "m" || ch === "M" || ch === "W" || ch === "@") return 0.88;
  if (ch === "w") return 0.76;
  if (ch >= "0" && ch <= "9") return 0.55;
  if (ch >= "A" && ch <= "Z") return 0.62;
  if (ch >= "a" && ch <= "z") return 0.52;
  return 0.55;
}

/** how wide a line of text comes out, in the units the font size is given in */
export function textWidth(text: string, fontSize: number, weight = 400, letterSpacing = 0): number {
  let ems = 0;
  let glyphs = 0;
  for (const ch of text) {
    ems += advance(ch);
    glyphs++;
  }
  /* a heavier face sets a little wider */
  const heavier = weight >= 700 ? 1.05 : weight >= 500 ? 1.02 : 1;
  return ems * fontSize * heavier + glyphs * letterSpacing;
}

/** the wrapper a measured part is drawn in carries a hairline border on these when outlined */
const BORDERED: Item["kind"][] = ["button", "chip", "extendedFab"];

/** How wide one part comes out, or undefined where its width is not a matter of its text: a part
 *  the author gave a width, a kind with a fixed one, and a menu standing open, whose width is
 *  that of its entries. */
export function estimatedWidth(it: Item): number | undefined {
  if (!isMeasured(it) || menuOpen(it)) return undefined;
  const label = it.label ?? "";
  const hasLabel = label.trim().length > 0;
  const border = it.variant === "outlined" && BORDERED.includes(it.kind) ? 2 : 0;
  switch (it.kind) {
    case "button": {
      const m = buttonMetrics(buttonHeightOf(it));
      const padX = hasLabel ? m.padX : Math.round((m.h - m.icon) / 2);
      return Math.ceil(padX * 2 + (it.icon ? m.icon : 0) + (it.icon && hasLabel ? m.gap : 0) + (hasLabel ? textWidth(label, m.font, 500, 0.1) : 0) + border);
    }
    case "extendedFab": {
      const m = extendedFabMetrics(extendedFabHeight(it));
      return Math.ceil(m.padX * 2 + (it.icon ? m.icon : 0) + (it.icon && hasLabel ? m.gap : 0) + (hasLabel ? textWidth(label, m.font, 500) : 0) + border);
    }
    case "chip": {
      const m = chipMetrics(chipHeightOf(it));
      const lead = it.checked || it.icon;
      return Math.ceil((lead ? m.lead + m.icon + m.gap : m.padX) + textWidth(label, m.font, 500) + m.padX + border);
    }
    case "switch":
      return Math.ceil((hasLabel ? textWidth(label, 16) + 14 : 0) + 52);
    case "checkbox":
    case "radio":
      return Math.ceil(40 + (hasLabel ? 4 + textWidth(label, 16) + 8 : 0));
    case "text": {
      const size = it.size ?? 28;
      const weight = it.bold ? 700 : 400;
      return Math.ceil(textWidth(label || " ", size, weight, size >= 28 ? -0.25 : 0) + 4);
    }
    case "splitButton": {
      const m = splitMetrics(buttonHeightOf(it));
      const padX = hasLabel ? m.padX : Math.round((m.h - m.icon) / 2);
      const main = padX * 2 + (it.icon ? m.icon : 0) + (it.icon && hasLabel ? m.gap : 0) + (hasLabel ? textWidth(label, m.font, 500) : 0);
      return Math.ceil(main + SPLIT_GAP + m.trailW);
    }
    default:
      return undefined;
  }
}

/** the estimate for every part of a design that has one, keyed by the part's id the way the
 *  editor's measured widths are */
export function estimatedWidths(groups: Group[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of groups)
    for (const it of g.items) {
      const w = estimatedWidth(it);
      if (w !== undefined) out[it.id] = w;
    }
  return out;
}
