"use client";

/* html-to-image inlines every `@font-face` rule of every family the exported node
 * touches, and a CJK family is shipped by Google Fonts as hundreds of
 * `unicode-range` slices (Noto Sans SC is ~200 slices per weight). One screen of
 * placeholder copy therefore drags in glyph data for tens of thousands of hanzi it
 * never draws -- the single reason a simple screen used to export at ~50 MB.
 *
 * So we build the embed CSS ourselves: keep a rule only when its family is actually
 * painted and its slice can supply a character that is actually on screen, then
 * inline just those files. The result is the same rendering with a fraction of the
 * payload. Falls back to html-to-image's own embedding if anything goes wrong. */

/** resolved file data URL per source URL, so repeat exports cost one fetch */
const files = new Map<string, Promise<string>>();

type Range = [number, number];

const isFontFaceRule = (rule: CSSRule) =>
  rule.type === CSSRule.FONT_FACE_RULE;

/** a family list as it is written in CSS, compared without quotes or casing */
function normalizeFamily(family: string) {
  return family.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

function parseUnicodeRange(spec: string | null): Range[] | null {
  if (!spec) return null;
  const out: Range[] = [];
  for (const part of spec.split(",")) {
    const m = /^\s*u\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?\s*$/i.exec(part);
    if (!m) continue;
    const lo = parseInt(m[1].replace(/\?/g, "0"), 16);
    const hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, "f"), 16);
    out.push([lo, hi]);
  }
  return out.length ? out : null;
}

/** every character the node paints, as code points */
function paintedChars(node: HTMLElement) {
  const chars = new Set<number>();
  const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue;
    if (!text) continue;
    for (const ch of text) {
      const code = ch.codePointAt(0);
      /* whitespace and control characters are never drawn from a webfont */
      if (code != null && code > 32) chars.add(code);
    }
  }
  return chars;
}

/** every family the node paints with, ourselves included */
function paintedFamilies(node: HTMLElement) {
  const families = new Set<string>();
  const add = (value: string) =>
    value.split(",").forEach((f) => families.add(normalizeFamily(f)));
  add(getComputedStyle(node).fontFamily);
  node.querySelectorAll<HTMLElement>("*").forEach((child) => {
    add(getComputedStyle(child).fontFamily);
  });
  return families;
}

/** every `@font-face` rule the document can see, including cross-origin sheets
 *  (the Google Fonts one is), which have to be re-fetched to be read at all */
async function fontFaceRules(): Promise<{ family: string; text: string; href: string | null }[]> {
  const out: { family: string; text: string; href: string | null }[] = [];
  const push = (cssText: string, href: string | null) => {
    for (const m of cssText.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
      const family = /font-family\s*:\s*([^;]+)/i.exec(m[1]);
      if (family) out.push({ family: normalizeFamily(family[1]), text: m[1], href });
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      let text = "";
      for (const rule of Array.from(sheet.cssRules)) {
        if (isFontFaceRule(rule)) text += `${rule.cssText}\n`;
      }
      push(text, sheet.href);
    } catch {
      /* cross-origin: read it the way the browser did */
      if (!sheet.href) continue;
      try {
        push(await (await fetch(sheet.href)).text(), sheet.href);
      } catch {
        /* an unreachable sheet simply contributes nothing */
      }
    }
  }
  return out;
}

/** the one source worth keeping: the preferred format wins, a bare url is next */
function pickSource(
  body: string,
  base: string | null,
  preferred: string,
): { url: string; format: string | null } | null {
  const entries: { url: string; format: string | null }[] = [];
  const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)\s*(?:format\(\s*["']?([^"')]*)["']?\s*\))?/gi;
  for (const m of body.matchAll(re)) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (!raw) continue;
    let url = raw;
    try {
      url = new URL(raw, base ?? undefined).href;
    } catch {
      /* a data URL or an unresolved relative path is used as written */
    }
    entries.push({ url, format: m[4] ? m[4].toLowerCase() : null });
  }
  return (
    entries.find((e) => e.format === preferred) ??
    entries.find((e) => e.format == null) ??
    entries[0] ??
    null
  );
}

function fileAsDataUrl(url: string) {
  let pending = files.get(url);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const type = (res.headers.get("content-type") || "font/woff2").split(";")[0];
      return `data:${type};base64,${btoa(binary)}`;
    })();
    /* a failed download must not poison every later export */
    pending.catch(() => files.delete(url));
    files.set(url, pending);
  }
  return pending;
}

/**
 * Families that act as symbol fonts (their `@font-face` declares no
 * `unicode-range`, e.g. Material Symbols). Text set in one of these is a
 * *ligature* - the visible glyph is a substitution of the plain word, so it
 * must be rasterized rather than kept as `<text>` to survive design-tool import.
 */
export async function iconFontFamilies(): Promise<Set<string>> {
  const out = new Set<string>();
  for (const rule of await fontFaceRules()) {
    if (!/unicode-range\s*:/i.test(rule.text)) out.add(normalizeFamily(rule.family));
  }
  return out;
}

/**
 * The symbol-font families (those whose `@font-face` declares no
 * `unicode-range`) mapped to their preferred source URL. Used to fetch the raw
 * font binary so the glyph outlines can be resolved to true vector paths.
 */
export async function fontFaceRuleSources(
  preferredFontFormat = "woff2",
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const rule of await fontFaceRules()) {
    if (/unicode-range\s*:/i.test(rule.text)) continue;
    if (out.has(rule.family)) continue;
    const source = pickSource(rule.text, rule.href, preferredFontFormat);
    if (source) out.set(rule.family, source.url);
  }
  return out;
}

/**
 * A self-contained `@font-face` block with every *symbol* font (families whose
 * `@font-face` declares no `unicode-range`, e.g. Material Symbols) inlined as
 * data URLs. Used to render icon glyphs into a raster for design-tool export.
 * Built once and cached across exports.
 */
let iconCssPromise: Promise<string | undefined> | null = null;
export function iconFontEmbedCss(preferredFontFormat = "woff2") {
  if (iconCssPromise) return iconCssPromise;
  iconCssPromise = (async () => {
    try {
      const rules = await fontFaceRules();
      const icon = new Set<string>();
      for (const r of rules) {
        if (!/unicode-range\s*:/i.test(r.text)) icon.add(normalizeFamily(r.family));
      }
      if (!icon.size) return undefined;

      const faces: string[] = [];
      const seen = new Set<string>();
      const downloads: string[] = [];
      for (const rule of rules) {
        if (!icon.has(rule.family)) continue;
        const source = pickSource(rule.text, rule.href, preferredFontFormat);
        if (!source) continue;
        const key = `${rule.family}|${source.url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        downloads.push(source.url);
        const body = rule.text.replace(/src\s*:\s*[^;]*;?/i, "").trim();
        const src = `src: url("${source.url}")${source.format ? ` format("${source.format}")` : ""};`;
        faces.push(`@font-face { ${body}${body.endsWith(";") ? " " : "; "}${src} }`);
      }
      if (!faces.length || !downloads.length) return undefined;

      const resolved = await Promise.all(downloads.map((url) => fileAsDataUrl(url)));
      let css = faces.join("\n");
      const order = downloads
        .map((_, i) => i)
        .sort((a, b) => downloads[b].length - downloads[a].length);
      for (const i of order) css = css.split(downloads[i]).join(resolved[i]);
      return css;
    } catch {
      return undefined;
    }
  })();
  return iconCssPromise;
}

/**
 * The `fontEmbedCSS` for `node`: the smallest set of `@font-face` rules that can
 * still paint every glyph on it. Returns `undefined` when there is nothing safe to
 * hand back, so the caller keeps html-to-image's default embedding.
 */
export async function subsetFontEmbedCSS(
  node: HTMLElement,
  preferredFontFormat = "woff2",
  excludeFamilies?: ReadonlySet<string>,
): Promise<string | undefined> {
  try {
    await document.fonts?.ready;
    const families = paintedFamilies(node);
    const chars = paintedChars(node);
    const rules = await fontFaceRules();
    if (!rules.length || !families.size) return undefined;

    /* an icon font ligates on plain words ("search" -> the magnifier), so a slice
     * of it is never droppable on the strength of unicode-range alone */
    const ligature = new Set(
      rules.filter((r) => !/unicode-range\s*:/i.test(r.text)).map((r) => r.family),
    );
    const keep = (family: string, text: string) => {
      if (ligature.has(family)) return true;
      if (!chars.size) return true;
      const ranges = parseUnicodeRange(
        /unicode-range\s*:\s*([^;}]+)/i.exec(text)?.[1] ?? null,
      );
      if (!ranges) return true;
      for (const code of chars) {
        for (const [lo, hi] of ranges) if (code >= lo && code <= hi) return true;
      }
      return false;
    };

    const faces: string[] = [];
    const seen = new Set<string>();
    const downloads: string[] = [];
    for (const rule of rules) {
      if (!families.has(rule.family)) continue;
      if (excludeFamilies?.has(rule.family)) continue;
      if (!keep(rule.family, rule.text)) continue;

      const source = pickSource(rule.text, rule.href, preferredFontFormat);
      if (!source) continue;
      const ranges = /unicode-range\s*:\s*([^;}]+)/i.exec(rule.text)?.[1] ?? "";
      const key = `${rule.family}|${ranges}|${source.url}`;
      if (seen.has(key)) continue;
      seen.add(key);

      downloads.push(source.url);
      const body = rule.text.replace(/src\s*:\s*[^;]*;?/i, "").trim();
      const src = `src: url("${source.url}")${source.format ? ` format("${source.format}")` : ""};`;
      faces.push(`@font-face { ${body}${body.endsWith(";") ? " " : "; "}${src} }`);
    }
    if (!faces.length || !downloads.length) return undefined;

    /* download once per file, then swap every mention for its data URL */
    const resolved = await Promise.all(downloads.map((url) => fileAsDataUrl(url)));
    let css = faces.join("\n");
    /* longest first, so one URL can never be clobbered by another it contains */
    const order = downloads
      .map((url, i) => i)
      .sort((a, b) => downloads[b].length - downloads[a].length);
    for (const i of order) {
      css = css.split(downloads[i]).join(resolved[i]);
    }
    return css;
  } catch {
    return undefined;
  }
}
