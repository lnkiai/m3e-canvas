/**
 * lib/tokens.ts — geometry/corner math and frame helpers.
 *
 * Locks in:
 *  - Math helpers: lerp, clamp, uid uniqueness + format
 *  - Frame helpers: frameSizeOf, isPhoneFrame, framePresetOf, frameRect
 *  - isExpanded boundary at 840 dp
 *  - runCorners: outer/inner assignment for axis, first/last combinations
 *  - uniformRadii: simple all-corners-equal constructor
 *  - carryItemSize: width/height scaling, kind-specific formulas
 *  - connectSpecOf returns connect metadata; canJoin is true only when same axis + family
 *  - iconSlotsOf returns the documented slots per kind
 *  - setIconSlot applies mutations correctly (icon, icon2, tab:N)
 *  - normalizeTheme fills in defaults
 */
import { describe, expect, it } from "vitest";
import {
  H,
  PHONE_W,
  PHONE_H,
  DESKTOP_W,
  DESKTOP_H,
  PHONE_R,
  DESKTOP_R,
  R_FULL,
  R_INNER,
  RAIL_W,
  PHONE_MARGIN,
  EXPANDED_W,
  CONTENT_W,
  HALF_W,
  WIDTH_PRESETS,
  HEIGHT_PRESETS,
  lerp,
  clamp,
  uid,
  uniformRadii,
  runCorners,
  isExpanded,
  frameSizeOf,
  isPhoneFrame,
  framePresetOf,
  framePresetPatch,
  frameRect,
  frameRadius,
  carryItemSize,
  connectSpecOf,
  canJoin,
  iconSlotsOf,
  setIconSlot,
  normalizeTheme,
  defaultPlatformOf,
  isPlatform,
  makeItem,
  Group,
  Frame,
  Item,
  NavTab,
} from "./tokens";

describe("constants", () => {
  it("key M3 dimensions match Material defaults", () => {
    expect(H).toBe(56);
    expect(PHONE_W).toBe(412);
    expect(PHONE_H).toBe(892);
    expect(DESKTOP_W).toBe(1280);
    expect(DESKTOP_H).toBe(800);
    expect(PHONE_R).toBe(40);
    expect(DESKTOP_R).toBe(28);
    expect(RAIL_W).toBe(80);
    expect(PHONE_MARGIN).toBe(16);
    expect(R_FULL).toBe(28);
    expect(R_INNER).toBe(8);
  });

  it("CONTENT_W = PHONE_W - 2 * PHONE_MARGIN", () => {
    expect(CONTENT_W).toBe(PHONE_W - 2 * PHONE_MARGIN);
  });

  it("HALF_W fits two columns in CONTENT_W with one PHONE_MARGIN gutter", () => {
    expect(HALF_W).toBe((CONTENT_W - PHONE_MARGIN) / 2);
    expect(2 * HALF_W + PHONE_MARGIN).toBe(CONTENT_W);
  });

  it("WIDTH_PRESETS contains half / content / phone widths in order", () => {
    expect(WIDTH_PRESETS).toEqual([HALF_W, CONTENT_W, PHONE_W]);
  });

  it("HEIGHT_PRESETS contains PHONE_H/2 and PHONE_H", () => {
    expect(HEIGHT_PRESETS).toEqual([PHONE_H / 2, PHONE_H]);
  });

  it("EXPANDED_W matches the M3 window-size-class boundary (840 dp)", () => {
    expect(EXPANDED_W).toBe(840);
  });
});

describe("lerp / clamp / uid", () => {
  it("lerp at t=0 returns a, t=1 returns b, t=0.5 returns midpoint", () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(10, 20, 0.5)).toBe(15);
  });

  it("lerp extrapolates linearly outside [0, 1]", () => {
    expect(lerp(10, 20, 2)).toBe(30);
    expect(lerp(10, 20, -1)).toBe(0);
  });

  it("clamps values into [lo, hi]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("uid produces unique 8-char base36 strings", () => {
    const a = new Set<string>();
    for (let i = 0; i < 200; i++) a.add(uid());
    expect(a.size).toBe(200);
    for (const id of a) {
      expect(id).toMatch(/^[0-9a-z]{8}$/);
    }
  });
});

describe("uniformRadii", () => {
  it("sets all four corners to the same value", () => {
    expect(uniformRadii(12)).toEqual({ tl: 12, tr: 12, bl: 12, br: 12 });
  });
});

describe("isExpanded", () => {
  it("is true at and above 840 dp, false below", () => {
    expect(isExpanded(839)).toBe(false);
    expect(isExpanded(840)).toBe(true);
    expect(isExpanded(1280)).toBe(true);
  });
});

describe("frame helpers", () => {
  const phone: Frame = { id: "p", name: "P", x: 0, y: 0 };
  const desktop: Frame = { id: "d", name: "D", x: 100, y: 100, w: DESKTOP_W, h: DESKTOP_H };

  it("frameSizeOf fills in phone defaults when w/h are missing", () => {
    expect(frameSizeOf(phone)).toEqual({ w: PHONE_W, h: PHONE_H });
  });

  it("frameSizeOf uses explicit w/h when present", () => {
    expect(frameSizeOf(desktop)).toEqual({ w: DESKTOP_W, h: DESKTOP_H });
  });

  it("isPhoneFrame detects phone vs desktop dimensions", () => {
    expect(isPhoneFrame(phone)).toBe(true);
    expect(isPhoneFrame(desktop)).toBe(false);
  });

  it("framePresetOf maps to phone/desktop string", () => {
    expect(framePresetOf(phone)).toBe("phone");
    expect(framePresetOf(desktop)).toBe("desktop");
  });

  it("framePresetPatch returns the right w/h pair", () => {
    expect(framePresetPatch("phone")).toEqual({ w: undefined, h: undefined });
    expect(framePresetPatch("desktop")).toEqual({ w: DESKTOP_W, h: DESKTOP_H });
  });

  it("frameRect maps x/y to l/t and adds w/h to r/b", () => {
    expect(frameRect(phone)).toEqual({ l: 0, t: 0, r: PHONE_W, b: PHONE_H });
    expect(frameRect(desktop)).toEqual({ l: 100, t: 100, r: 100 + DESKTOP_W, b: 100 + DESKTOP_H });
  });

  it("frameRadius returns PHONE_R for phones and DESKTOP_R otherwise", () => {
    expect(frameRadius(phone)).toBe(PHONE_R);
    expect(frameRadius(desktop)).toBe(DESKTOP_R);
  });
});

describe("runCorners", () => {
  it("x axis: outer on the side that's 'first' or 'last'", () => {
    expect(runCorners("x", true, true, 20, 4)).toEqual({ tl: 20, bl: 20, tr: 20, br: 20 });
    expect(runCorners("x", true, false, 20, 4)).toEqual({ tl: 20, bl: 20, tr: 4, br: 4 });
    expect(runCorners("x", false, true, 20, 4)).toEqual({ tl: 4, bl: 4, tr: 20, br: 20 });
    expect(runCorners("x", false, false, 20, 4)).toEqual({ tl: 4, bl: 4, tr: 4, br: 4 });
  });

  it("y axis: outer on top/bottom, inner on the middle sides", () => {
    expect(runCorners("y", true, true, 20, 4)).toEqual({ tl: 20, tr: 20, bl: 20, br: 20 });
    expect(runCorners("y", true, false, 20, 4)).toEqual({ tl: 20, tr: 20, bl: 4, br: 4 });
    expect(runCorners("y", false, true, 20, 4)).toEqual({ tl: 4, tr: 4, bl: 20, br: 20 });
    expect(runCorners("y", false, false, 20, 4)).toEqual({ tl: 4, tr: 4, bl: 4, br: 4 });
  });
});

describe("carryItemSize", () => {
  const from = { w: 100, h: 100 };
  const to = { w: 200, h: 200 };

  it("a list item resizes both width and height proportionally", () => {
    const it: Item = { id: "1", kind: "listItem", label: "L", icon: null, variant: "filled", size: 100 };
    const out = carryItemSize(it, from, to);
    expect(out.size).toBe(200);
  });

  it("a button has fixed height 56 and keeps variant", () => {
    const it: Item = { id: "1", kind: "button", label: "L", icon: null, variant: "filled" };
    const out = carryItemSize(it, from, to);
    expect(out.size).toBeUndefined();
  });

  it("a box scales its second size dimension", () => {
    const it: Item = { id: "1", kind: "box", label: "", icon: null, variant: "filled", size: 100, size2: 100 };
    const out = carryItemSize(it, from, to);
    expect(out.size2).toBe(200);
  });

  it("a text does not auto-resize (text spec size icon is 'format_size', not 'width')", () => {
    const it: Item = { id: "1", kind: "text", label: "Hello", icon: null, variant: "filled", size: 28 };
    const out = carryItemSize(it, from, to);
    expect(out.size).toBe(28);
  });
});

describe("connectSpecOf / canJoin", () => {
  it("buttons share family 'button' on x axis -> joinable", () => {
    const a: Item = { id: "a", kind: "button", label: "A", icon: null, variant: "filled" };
    const b: Item = { id: "b", kind: "iconButton", label: "B", icon: "add", variant: "filled" };
    expect(canJoin(a, b)).toBe(true);
    expect(connectSpecOf(a)?.axis).toBe("x");
    expect(connectSpecOf(a)?.family).toBe("button");
  });

  it("button + listItem are NOT joinable (different family)", () => {
    const a: Item = { id: "a", kind: "button", label: "A", icon: null, variant: "filled" };
    const b: Item = { id: "b", kind: "listItem", label: "B", icon: null, variant: "filled" };
    expect(canJoin(a, b)).toBe(false);
  });

  it("list items share family 'list' on y axis -> joinable vertically", () => {
    const a: Item = { id: "a", kind: "listItem", label: "A", icon: null, variant: "filled" };
    const b: Item = { id: "b", kind: "listItem", label: "B", icon: null, variant: "filled" };
    expect(canJoin(a, b)).toBe(true);
    expect(connectSpecOf(a)?.axis).toBe("y");
  });

  it("parts with no connect spec return undefined and don't join", () => {
    const a: Item = { id: "a", kind: "divider", label: "", icon: null, variant: "filled" };
    expect(connectSpecOf(a)).toBeUndefined();
    expect(canJoin(a, a)).toBe(false);
  });
});

describe("iconSlotsOf / setIconSlot", () => {
  it("list item exposes icon + icon2 slots", () => {
    const it: Item = { id: "1", kind: "listItem", label: "L", icon: "person", icon2: "chevron_right", variant: "filled" };
    const slots = iconSlotsOf(it);
    expect(slots.map((s) => s.key)).toEqual(["icon", "icon2"]);
    expect(slots[0].value).toBe("person");
    expect(slots[1].value).toBe("chevron_right");
  });

  it("topAppBar exposes icon + icon2 slots", () => {
    const it: Item = { id: "1", kind: "topAppBar", label: "T", icon: "menu", icon2: "search", variant: "filled" };
    const slots = iconSlotsOf(it);
    expect(slots.map((s) => s.key)).toEqual(["icon", "icon2"]);
  });

  it("bottomNav exposes one tab:N slot per tab", () => {
    const tabs: NavTab[] = [{ icon: "home", label: "Home" }, { icon: "search", label: "Search" }];
    const it: Item = { id: "1", kind: "bottomNav", label: "", icon: null, variant: "filled", tabs };
    const slots = iconSlotsOf(it);
    expect(slots.map((s) => s.key)).toEqual(["tab:0", "tab:1"]);
    expect(slots[0].value).toBe("home");
  });

  it("setIconSlot mutates the right field for plain icon slots", () => {
    const it: Item = { id: "1", kind: "topAppBar", label: "T", icon: "menu", icon2: "search", variant: "filled" };
    expect(setIconSlot(it, "icon", "close")).toEqual({ icon: "close" });
    expect(setIconSlot(it, "icon2", "more")).toEqual({ icon2: "more" });
  });

  it("setIconSlot('tab:N', v) updates that tab's icon", () => {
    const tabs: NavTab[] = [{ icon: "home", label: "Home" }, { icon: "search", label: "Search" }];
    const it: Item = { id: "1", kind: "bottomNav", label: "", icon: null, variant: "filled", tabs };
    const out = setIconSlot(it, "tab:1", "favorite");
    expect(out.tabs?.[1].icon).toBe("favorite");
    expect(out.tabs?.[0].icon).toBe("home");
  });

  it("setIconSlot('toggle', v) merges into toggle object", () => {
    const it: Item = { id: "1", kind: "button", label: "B", icon: "add", variant: "filled" };
    const out = setIconSlot(it, "toggle", "check");
    expect(out.toggle?.icon).toBe("check");
  });

  it("setIconSlot with unknown key returns empty patch", () => {
    const it: Item = { id: "1", kind: "button", label: "B", icon: "add", variant: "filled" };
    expect(setIconSlot(it, "made-up", "x")).toEqual({});
  });
});

describe("normalizeTheme", () => {
  it("returns the documented defaults when given undefined", () => {
    const t = normalizeTheme(undefined);
    expect(t).toEqual({
      dark: false,
      bothModes: false,
      contrast: "standard",
      shape: "rounded",
      font: "roboto",
      emphasized: false,
      motion: "standard",
    });
  });

  it("fills missing fields but preserves overrides", () => {
    const t = normalizeTheme({ dark: true, shape: "full" } as any);
    expect(t.dark).toBe(true);
    expect(t.shape).toBe("full");
    expect(t.contrast).toBe("standard");
    expect(t.font).toBe("roboto");
  });
});

describe("isPlatform / defaultPlatformOf", () => {
  it("isPlatform narrows to 'android' | 'web'", () => {
    expect(isPlatform("android")).toBe(true);
    expect(isPlatform("web")).toBe(true);
    expect(isPlatform("ios")).toBe(false);
    expect(isPlatform(undefined)).toBe(false);
  });

  it("defaultPlatformOf: web as soon as a desktop frame exists in phone mode", () => {
    const phone: Frame = { id: "p", name: "P", x: 0, y: 0 };
    const desk: Frame = { id: "d", name: "D", x: 100, y: 0, w: DESKTOP_W, h: DESKTOP_H };
    expect(defaultPlatformOf([phone], "phone")).toBe("android");
    expect(defaultPlatformOf([phone, desk], "phone")).toBe("web");
    expect(defaultPlatformOf([phone, desk], "blank")).toBe("android");
  });
});

describe("makeItem", () => {
  it("produces a sane default Item per kind", () => {
    const btn = makeItem("button");
    expect(btn.kind).toBe("button");
    expect(btn.id).toMatch(/^[0-9a-z]{8}$/);
    expect(["filled", "tonal", "elevated", "outlined", "text"]).toContain(btn.variant);
  });

  it("a bottom nav comes with default tabs", () => {
    const nav = makeItem("bottomNav");
    expect(nav.tabs).toBeDefined();
    expect(nav.tabs!.length).toBeGreaterThan(0);
  });

  it("a box has size2 / radiusTop / radiusBottom defaults", () => {
    const box = makeItem("box");
    expect(box.size2).toBe(220);
    expect(box.radiusTop).toBe(28);
    expect(box.radiusBottom).toBe(28);
  });
});

describe("Group construction smoke", () => {
  it("can build a minimal Group referencing a single Item (sanity)", () => {
    const it: Item = { id: "a", kind: "button", label: "A", icon: null, variant: "filled" };
    const g: Group = { id: "g1", x: 0, y: 0, axis: "x", items: [it] };
    expect(g.items[0].kind).toBe("button");
    expect(g.axis).toBe("x");
  });
});
