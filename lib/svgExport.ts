import { elementToSVG } from "dom-to-svg";

import { subsetFontEmbedCSS } from "./svgFonts";
import { collectIconVectors } from "./svgIcons";

const SVG_NS = "http://www.w3.org/2000/svg";

/* Each icon leaf is tagged with a private marker class before conversion.
 * dom-to-svg copies an element's `class` onto the <g> it builds for that
 * element, so after conversion we can find the exact group the icon belongs
 * to and nest its <path> inside instead of flattening everything onto the
 * artboard root. The class is stripped from the output afterwards. */
const ICON_MARKER = "m3-icv";

/**
 * Converts a rendered HTML frame node into a STANDARD, importable SVG file.
 *
 * dom-to-svg maps each box to a real SVG element (`<rect>`, `<path>`,
 * `<text>`, `<image>`, ...), which design tools (Illustrator, Figma, Inkscape…)
 * import without falling back to a raster-stuffed `<foreignObject>`.
 *
 * Two things are handled beyond a plain conversion, keeping the result both
 * design-tool native and free of raster data:
 *  1. Icon fonts (Material Symbols) render by *ligature*, which design tools
 *     never run, so their glyph outlines are resolved to real `<path>` elements
 *     via `fontkit`, nested in the group of the control they belong to.
 *  2. The embedded-font bloat is cut by slicing the `@font-face` rules down to
 *     the characters actually painted (icon fonts are excluded — now paths).
 *
 * Origin fix: the live export layer is parked at `left:-99999` so it is off
 * screen, which would print a ~100,000px artboard offset into the SVG. We
 * convert a fresh clone parked at the true viewport origin instead, so every
 * coordinate starts at 0 and the artboard is naturally a clean `0 0 w h` box —
 * no cross-cutting `translate` that could leave fat borders around the frame.
 */
export async function frameElementToImportableSvg(
  el: HTMLElement,
  width: number,
  height: number,
): Promise<string | undefined> {
  /* clone the frame into a fixed host at the viewport origin so getBoundingClientRect
   * (which dom-to-svg and the icon resolver both key off) is 0-based and the artboard
   * needs no translate offset */
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:0;top:0;z-index:-2147483647;pointer-events:none;";
  const clone = el.cloneNode(true) as HTMLElement;
  /* clones inherit styles, but a font-family resolved on an ancestor (e.g. the
   * theme's Roboto/Noto choice held by a parent) is lost once the node is cut
   * out of the tree. Re-anchor the computed family on the clone so exported
   * text keeps the themed face instead of the document default. */
  clone.style.fontFamily = getComputedStyle(el).fontFamily;
  /* strip ids so dom-to-svg's generated refs (mask/pattern) stay unique */
  clone.querySelectorAll<HTMLElement>("[id]").forEach((n) => n.removeAttribute("id"));
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    await document.fonts?.ready;

    const rect = clone.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      width = rect.width;
      height = rect.height;
    }

    /* 1) resolve icon glyphs to vector paths, then silence their ligature text */
    const { vectors, excludeFamilies } = await collectIconVectors(clone);
    for (let i = 0; i < vectors.length; i += 1) {
      /* tag each leaf so we can find its group later — keep the real classes */
      vectors[i].el.classList.add(`${ICON_MARKER}-${i}`);
    }
    for (const v of vectors) v.el.replaceChildren();

    try {
      /* 2) convert the (now icon-text-empty) clone at the 0 origin */
      const svg = elementToSVG(clone, { keepLinks: false });
      const root = svg.documentElement;

      /* 3) swap in the subset font CSS. Only icon font families whose every
       * painted leaf became a path are removed (their glyphs are real outlines
       * now); any family with a leftover text leaf keeps its font so that leaf
       * still renders. */
      const subsetCss = await subsetFontEmbedCSS(clone, "woff2", excludeFamilies);
      if (subsetCss && subsetCss.length) {
        const styleEl =
          root.querySelector(":scope > style") ??
          svg.createElementNS(SVG_NS, "style");
        /* append a freshly-created node before writing to it, so the subset CSS
         * is never silently dropped */
        if (styleEl.parentNode !== root) root.appendChild(styleEl);
        styleEl.textContent = subsetCss;
      }

      /* 4) inject the real icon outlines, nested inside the <g> dom-to-svg
       * created for each icon's own element (keeps icon with its control) */
      for (let i = 0; i < vectors.length; i += 1) {
        const v = vectors[i];
        const path = svg.createElementNS(SVG_NS, "path");
        path.setAttribute("d", v.d);
        path.setAttribute("fill", v.fill);
        path.setAttribute("transform", v.transform);
        /* the marker landed on the icon's own group; fall back to the root if
         * dom-to-svg folded the element away (e.g. masked out) */
        const hostGroup =
          root.querySelector(`[class~="${ICON_MARKER}-${i}"]`) ?? root;
        if (hostGroup !== root) hostGroup.classList.remove(`${ICON_MARKER}-${i}`);
        hostGroup.appendChild(path);
      }

      root.setAttribute("width", String(Math.round(width)));
      root.setAttribute("height", String(Math.round(height)));
      root.setAttribute(
        "viewBox",
        `0 0 ${Math.round(width)} ${Math.round(height)}`,
      );

      return new XMLSerializer().serializeToString(svg);
    } finally {
      /* 5) restore the icon text and drop the temporary marker */
      for (let i = 0; i < vectors.length; i += 1) {
        const v = vectors[i];
        v.el.textContent = v.text;
        v.el.classList.remove(`${ICON_MARKER}-${i}`);
      }
    }
  } catch (error) {
    console.error("Failed to produce importable SVG", error);
    try {
      const svg = elementToSVG(clone, { keepLinks: false });
      return new XMLSerializer().serializeToString(svg);
    } catch (e) {
      console.error("SVG export failed entirely", e);
      return undefined;
    }
  } finally {
    host.remove();
  }
}