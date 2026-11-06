import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_THEME, R_FULL, baseRadii, makeItem, normalizeTheme, railLayoutWidth, railMetrics, runCorners, scaleR, setGlobalShape, sizeOf, isScrollableTabs, tabScrollOffset, removeTabPatch, tabCountPatch, SCROLL_TAB_W, type Item } from "./tokens";

afterEach(() => setGlobalShape("rounded")); // restore the module default

describe("navigation rail geometry", () => {
  it("keeps old rails unchanged and creates expressive collapsed rails", () => {
    const fresh = makeItem("navRail");
    expect(fresh.railExpanded).toBe(false);
    expect(sizeOf(fresh, {}).w).toBe(96);
    const legacy = { ...fresh, railExpanded: undefined };
    expect(sizeOf(legacy, {}).w).toBe(80);
    expect(railMetrics(legacy)).toMatchObject({ top: 44, itemHeight: 52, gap: 12 });
  });

  it("shares drawing and hit-area geometry and keeps modal layout collapsed", () => {
    const expanded = { ...makeItem("navRail"), railExpanded: true };
    expect(railMetrics(expanded)).toEqual({ width: 220, headerLeft: 16, inset: 12, top: 100, itemHeight: 56, gap: 0 });
    expect(railLayoutWidth(expanded)).toBe(220);
    const modal = { ...expanded, railModal: true };
    expect(sizeOf(modal, {}).w).toBe(220);
    expect(railLayoutWidth(modal)).toBe(96);
    expect(baseRadii(modal)).toEqual({ tl: 16, tr: 16, bl: 16, br: 16 });
    expect(baseRadii({ ...modal, radiusTop: 0 }).tl).toBe(0);
  });

  it("aligns the menu and destination icon centers in both expressive states", () => {
    const collapsed = railMetrics(makeItem("navRail"));
    expect(collapsed.headerLeft + 24).toBe(collapsed.width / 2);
    const expanded = railMetrics({ ...makeItem("navRail"), railExpanded: true });
    expect(expanded.headerLeft + 24).toBe(expanded.inset + 16 + 12);
  });
});

describe("setGlobalShape / scaleR", () => {
  it("shrinks radii for the square scale and grows them for full", () => {
    setGlobalShape("square");
    expect(scaleR(R_FULL)).toBe(Math.round(R_FULL * 0.35));
    setGlobalShape("full");
    expect(scaleR(R_FULL)).toBe(Math.round(R_FULL * 1.6));
    setGlobalShape("rounded");
    expect(scaleR(R_FULL)).toBe(R_FULL);
  });

  it("flows into a part's default corners", () => {
    setGlobalShape("rounded");
    const rounded = baseRadii(makeItem("button")).tl;
    setGlobalShape("square");
    expect(baseRadii(makeItem("button")).tl).toBeLessThan(rounded);
    setGlobalShape("full");
    expect(baseRadii(makeItem("button")).tl).toBeGreaterThan(rounded);
  });

  it("keeps a radius the author typed in, whatever the scale", () => {
    const card = { ...makeItem("card"), radiusTop: 12 };
    setGlobalShape("full");
    expect(baseRadii(card)).toEqual({ tl: 12, tr: 12, bl: 12, br: 12 });
  });
});

describe("FAB corners", () => {
  // M3's FAB shape tokens: small 40dp is medium (12), FAB 56dp is large (16), medium FAB 80dp is
  // large-increased (20), large FAB 96dp is extra-large (28).
  // https://m3.material.io/components/floating-action-button/specs
  it.each([
    [40, 12],
    [56, 16],
    [80, 20],
    [96, 28],
  ])("a %idp FAB has %idp corners", (size, corner) => {
    expect(baseRadii({ ...makeItem("fab"), size }).tl).toBe(corner);
  });

  it("gives an extended FAB the corners of the FAB its height names", () => {
    for (const [h, corner] of [[56, 16], [80, 20], [96, 28]] as const) {
      expect(baseRadii({ ...makeItem("extendedFab"), size2: h }).tl).toBe(corner);
    }
  });

  it("interpolates linearly between the named sizes, at every slider step", () => {
    // 4dp slider steps; each segment is a straight line between two tokens, rounded.
    const expected: Record<number, number> = {
      40: 12, 44: 13, 48: 14, 52: 15, 56: 16, 60: 17, 64: 17, 68: 18,
      72: 19, 76: 19, 80: 20, 84: 22, 88: 24, 92: 26, 96: 28,
    };
    for (const [size, corner] of Object.entries(expected)) {
      expect(baseRadii({ ...makeItem("fab"), size: Number(size) }).tl, `${size}dp`).toBe(corner);
    }
  });
});

describe("runCorners", () => {
  const outer = 28;
  const inner = 8;

  it("puts the outer corners at the ends of a horizontal run, inner between parts", () => {
    expect(runCorners("x", true, false, outer, inner)).toEqual({ tl: outer, bl: outer, tr: inner, br: inner });
    expect(runCorners("x", false, true, outer, inner)).toEqual({ tl: inner, bl: inner, tr: outer, br: outer });
  });

  it("puts the outer corners at the ends of a vertical run, inner between parts", () => {
    expect(runCorners("y", true, false, outer, inner)).toEqual({ tl: outer, tr: outer, bl: inner, br: inner });
    expect(runCorners("y", false, true, outer, inner)).toEqual({ tl: inner, tr: inner, bl: outer, br: outer });
  });

  it("rounds a lone part all over and a middle part nowhere", () => {
    expect(runCorners("x", true, true, outer, inner)).toEqual({ tl: outer, tr: outer, bl: outer, br: outer });
    expect(runCorners("y", false, false, outer, inner)).toEqual({ tl: inner, tr: inner, bl: inner, br: inner });
  });
});

describe("normalizeTheme", () => {
  it("returns the defaults untouched for undefined or empty input", () => {
    expect(normalizeTheme(undefined)).toEqual(DEFAULT_THEME);
    expect(normalizeTheme({})).toEqual(DEFAULT_THEME);
  });

  it("keeps the valid fields of a partial theme and fills in the rest", () => {
    expect(normalizeTheme({ dark: true, shape: "full" })).toEqual({ ...DEFAULT_THEME, dark: true, shape: "full" });
  });

  it("replaces unknown option values with the default", () => {
    const t = normalizeTheme({ contrast: "blaring" as never, font: "papyrus" as never, shape: "pointy" as never });
    expect(t.contrast).toBe(DEFAULT_THEME.contrast);
    expect(t.font).toBe(DEFAULT_THEME.font);
    expect(t.shape).toBe(DEFAULT_THEME.shape);
  });
});

describe("scrollable tab rows", () => {
  const row = (n: number, selected?: number): Item => ({ ...makeItem("tabs"), tabs: Array.from({ length: n }, (_, i) => ({ label: `T${i + 1}`, icon: "" })), selected });

  it("keeps up to five tabs fixed and lets six or more scroll when they do not fit", () => {
    expect(isScrollableTabs(row(5))).toBe(false);
    expect(isScrollableTabs(row(6))).toBe(true);
    expect(isScrollableTabs({ ...row(6), size: 1280 })).toBe(false);
    expect(isScrollableTabs({ ...makeItem("bottomNav"), tabs: row(6).tabs })).toBe(false);
    expect(tabScrollOffset(row(5, 4), 412)).toBe(0);
    expect(tabScrollOffset(row(0), 412)).toBe(0);
    expect(tabScrollOffset(row(7), 412)).toBe(0);
    expect(tabScrollOffset(row(7, 99), 412)).toBe(7 * SCROLL_TAB_W - 412);
  });

  it("keeps the selection and the per-tab tap targets on their tabs when one is removed", () => {
    const go = (to: string) => ({ to, transition: "slide" as const });
    const it7 = { ...row(7, 3), actions: { "tab:1": go("a"), "tab:3": go("b"), "tab:6": go("c") } };
    expect(removeTabPatch(it7, 1)).toEqual({ tabs: it7.tabs!.filter((_, j) => j !== 1), selected: 2, actions: { "tab:2": go("b"), "tab:5": go("c") } });
    expect(removeTabPatch(it7, 3).selected).toBe(3);
    expect(removeTabPatch(it7, 3).actions).toEqual({ "tab:1": go("a"), "tab:5": go("c") });
    expect(removeTabPatch(row(2, 1), 1).selected).toBe(0);
    expect(removeTabPatch({ ...makeItem("select"), tabs: row(3).tabs, selected: 1 }, 1).selected).toBeUndefined();
    expect(tabCountPatch(it7, 4, [{ label: "x", icon: "" }])).toMatchObject({ selected: 3, actions: { "tab:1": go("a"), "tab:3": go("b") } });
    expect(tabCountPatch(it7, 4, [{ label: "x", icon: "" }]).tabs).toHaveLength(4);
  });

  it("shifts the row only as far as the selected tab needs, never past the end", () => {
    expect(tabScrollOffset(row(7, 0), 412)).toBe(0);
    expect(tabScrollOffset(row(7, 4), 412)).toBe(5.5 * SCROLL_TAB_W - 412);
    expect(tabScrollOffset(row(7, 6), 412)).toBe(7 * SCROLL_TAB_W - 412);
    expect(tabScrollOffset(row(7, 6), 1280)).toBe(0);
  });
});
