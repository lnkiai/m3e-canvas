/**
 * lib/tokens.ts — geometry/corner math and frame helpers.
 *
 * Locks in:
 *  - Math helpers: lerp, clamp, uid uniqueness + format
 *  - Frame helpers: frameSizeOf, isPhoneFrame, framePresetOf, frameRect
 *  - isExpanded boundary at 840 dp
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
  isExpanded,
  frameSizeOf,
  isPhoneFrame,
  framePresetOf,
  framePresetPatch,
  frameRect,
  frameRadius,
  carryItemSize,
  baseRadii,
  migrateSheetBox,
  connectSpecOf,
  canJoin,
  iconSlotsOf,
  setIconSlot,
  normalizeTheme,
  defaultPlatformOf,
  isPlatform,
  makeItem,
  cardDefaultFillOf,
  cardFillOf,
  cardContentAlignOf,
  cardImageMaxOf,
  cardScrimOf,
  cardTextColorOf,
  isCardAlign,
  isTextToken,
  cardImagePosOf,
  cardImageSizeOf,
  CARD_IMAGE_MIN,
  sizeOf,
  isCardImagePos,
  paletteOf,
  DEFAULT_THEME,
  CARD_MEDIA_GAP,
  CARD_PADDING,
  CARD_SIDE_IMAGE_W,
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

  it("uid produces unique short base36 strings", () => {
    const a = new Set<string>();
    for (let i = 0; i < 200; i++) a.add(uid());
    expect(a.size).toBe(200);
    for (const id of a) {
      // Math.random().toString(36).slice(2, 10) is at most 8 chars and can
      // rarely come up short — assert the contract (base36, bounded, unique),
      // not an exact length.
      expect(id).toMatch(/^[0-9a-z]{1,8}$/);
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


describe("carryItemSize", () => {
  const from = { w: 100, h: 100 };
  const to = { w: 200, h: 200 };

  it("a list item resizes both width and height proportionally", () => {
    const it: Item = { id: "1", kind: "listItem", label: "L", icon: null, variant: "filled", size: 100 };
    const out = carryItemSize(it, from, to);
    expect(out.size).toBe(200);
  });

  it("a button carries no explicit size across frames and keeps its variant", () => {
    const it: Item = { id: "1", kind: "button", label: "L", icon: null, variant: "filled" };
    const out = carryItemSize(it, from, to);
    expect(out.size).toBeUndefined();
    expect(out.variant).toBe("filled");
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

  it("a new bottom nav and top app bar hide on scroll, and nothing else carries the switch", () => {
    expect(makeItem("bottomNav").hideOnScroll).toBe(true);
    expect(makeItem("topAppBar").hideOnScroll).toBe(true);
    expect(makeItem("navRail").hideOnScroll).toBeUndefined();
    expect(makeItem("tabs").hideOnScroll).toBeUndefined();
  });

  it("a box has size2 / radiusTop / radiusBottom defaults", () => {
    const box = makeItem("box");
    expect(box.size2).toBe(220);
    expect(box.radiusTop).toBe(28);
    expect(box.radiusBottom).toBe(28);
  });

  it("a box is no longer made with a handle state", () => {
    expect(makeItem("box").checked).toBeUndefined();
  });

  it("a bottom sheet starts 320dp tall on surfaceContainerLow, rounded only at the top", () => {
    const sheet = makeItem("bottomSheet");
    expect(sheet.size2).toBe(320);
    expect(sheet.fill).toBe("surfaceContainerLow");
    expect(sheet.radiusTop).toBe(28);
    expect(sheet.radiusBottom).toBeUndefined();
    expect(baseRadii({ ...sheet, radiusTop: 12 })).toEqual({ tl: 12, tr: 12, bl: 0, br: 0 });
  });

  it("a box saved with its handle on is read back as a bottom sheet", () => {
    const old: Item = { id: "1", kind: "box", label: "", icon: null, variant: "filled", checked: true, size2: 300, radiusTop: 20, radiusBottom: 20, fill: "surfaceContainerHigh" };
    const out = migrateSheetBox(old);
    expect(out.kind).toBe("bottomSheet");
    expect(out.checked).toBeUndefined();
    expect(out.radiusBottom).toBeUndefined();
    expect(out.radiusTop).toBe(20);
    expect(out.size2).toBe(300);
    expect(out.fill).toBe("surfaceContainerHigh");
    const plain = { ...old, checked: false };
    expect(migrateSheetBox(plain)).toBe(plain);
  });
});

describe("card image placement helpers", () => {
  it("uses each variant's M3 palette role until the author overrides it", () => {
    expect(cardDefaultFillOf("tonal")).toBe("surfaceContainerHighest");
    expect(cardDefaultFillOf("elevated")).toBe("surfaceContainerLow");
    expect(cardDefaultFillOf("outlined")).toBe("surface");
    expect(cardFillOf({ ...makeItem("card"), variant: "elevated" })).toBe("surfaceContainerLow");
    expect(cardFillOf({ ...makeItem("card"), variant: "outlined", fill: "primaryContainer" })).toBe("primaryContainer");
  });

  it("accepts exactly the four placements", () => {
    for (const pos of ["top", "bottom", "leading", "trailing", "background"]) expect(isCardImagePos(pos)).toBe(true);
    for (const bad of [undefined, null, "middle", "left", 3]) expect(isCardImagePos(bad)).toBe(false);
  });

  it("keeps sketches saved before placement existed on top", () => {
    expect(cardImagePosOf(makeItem("card"))).toBe("top");
    expect(cardImagePosOf({ ...makeItem("card"), imagePos: "background" })).toBe("background");
  });

  it("defaults the top image to 28% of the card's width and a side column to the standard width", () => {
    const card = makeItem("card");
    expect(cardImageSizeOf(card)).toBe(Math.round(CONTENT_W * 0.28));
    // a narrow unsized card is short too, so its default band is clamped to what fits
    expect(cardImageSizeOf({ ...card, size: 200 })).toBe(Math.min(Math.round(200 * 0.28), cardImageMaxOf({ ...card, size: 200 })));
    expect(cardImageSizeOf({ ...card, imagePos: "leading" })).toBe(CARD_SIDE_IMAGE_W);
    expect(cardImageSizeOf({ ...card, imagePos: "trailing" })).toBe(CARD_SIDE_IMAGE_W);
  });

  it("keeps a size the author set, whatever the placement", () => {
    const card = { ...makeItem("card"), imageSize: 120 };
    expect(cardImageSizeOf(card)).toBe(120);
    expect(cardImageSizeOf({ ...card, imagePos: "leading" })).toBe(120);
  });

  it("never lets an image push the text out of the card", () => {
    const card = { ...makeItem("card"), imageSize: 320 };
    // the bound follows the drawn height, which an unsized card takes from its width
    const drawnH = sizeOf(card, {}).h;
    expect(cardImageSizeOf(card)).toBe(cardImageMaxOf(card));
    expect(cardImageMaxOf(card)).toBe(drawnH - CARD_PADDING * 2 - CARD_MEDIA_GAP - 48);
    expect(cardImageSizeOf({ ...card, size2: 420 })).toBe(320);
    // a side column is bounded by the card's width, leaving a readable text column
    const drawnW = sizeOf(card, {}).w;
    expect(cardImageSizeOf({ ...card, imagePos: "leading" })).toBe(drawnW - CARD_PADDING * 2 - CARD_MEDIA_GAP - 96);
    expect(cardImageSizeOf({ ...card, imagePos: "trailing", imageSize: 80 })).toBe(80);
    // the smallest card still reports the floor rather than a negative bound
    expect(cardImageMaxOf({ ...card, size: 160, size2: 96 })).toBe(CARD_IMAGE_MIN);
  });

  it("puts the text at the top, or at the bottom over a background image, until told otherwise", () => {
    expect(cardContentAlignOf(makeItem("card"))).toBe("start");
    expect(cardContentAlignOf({ ...makeItem("card"), imagePos: "background" })).toBe("end");
    expect(cardContentAlignOf({ ...makeItem("card"), imagePos: "background", noImage: true })).toBe("start");
    expect(cardContentAlignOf({ ...makeItem("card"), contentAlign: "center" })).toBe("center");
    for (const align of ["start", "center", "end"]) expect(isCardAlign(align)).toBe(true);
    for (const bad of ["left", "top", "", null]) expect(isCardAlign(bad)).toBe(false);
  });

  it("colors the text from its role, else from where it sits", () => {
    const p = paletteOf("purple", undefined, DEFAULT_THEME);
    const card = makeItem("card");
    expect(cardTextColorOf(card, p)).toBe(p.onSurface);
    expect(cardTextColorOf({ ...card, fill: "primary" }, p)).toBe(p.onPrimary);
    expect(cardTextColorOf({ ...card, imagePos: "background" }, p)).toBe(p.onPrimaryContainer);
    expect(cardTextColorOf({ ...card, imagePos: "background", src: "data:x" }, p)).toBe("#ffffff");
    expect(cardTextColorOf({ ...card, imagePos: "background", src: "data:x", textColor: "primary" }, p)).toBe(p.primary);
    expect(isTextToken("primary")).toBe(true);
    expect(isTextToken("surface")).toBe(false);
  });

  it("fades a dark scrim under light text and a light one under dark text, from the text's side", () => {
    expect(cardScrimOf("#ffffff", "end")).toMatch(/^linear-gradient\(rgba\(0,0,0,0\) 40%/);
    expect(cardScrimOf("#1a1a1a", "start")).toMatch(/^linear-gradient\(rgba\(255,255,255,0\.72\)/);
    expect(cardScrimOf("#ffffff", "center")).toMatch(/^rgba\(0,0,0,/);
  });

});

