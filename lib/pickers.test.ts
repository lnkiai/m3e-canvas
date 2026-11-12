/**
 * The parts that are surfaces rather than controls: the carousel and the two pickers, and the
 * two families that switch shape in their own panel, a FAB and a progress indicator.
 *
 * Locks in:
 *  - each one falls back to the layout it was built with
 *  - the box follows the layout: a calendar is as tall as its rows, a typed date is a field
 *  - the prompt names the layout and the cards; a picker shows today and now, never a set value
 */
import { describe, expect, it } from "vitest";
import { buildPrompt } from "./prompt";
import { dateHeadline, monthHeadline } from "./i18n";
import {
  DEFAULT_THEME,
  KIND_ORDER,
  PALETTE_HIDDEN,
  PHONE_MARGIN,
  PROGRESS_KINDS,
  extendedFabHeight,
  extendedFabMetrics,
  fabTypePatch,
  FAB_MENU_CLOSE,
  fabOpen,
  hasMenu,
  menuHeight,
  menuOpen,
  menuPatch,
  migrateFabMenu,
  Doc,
  Item,
  CARD_GAP,
  TOP_BAR_SIZES,
  topBarHeightOf,
  KIND_SPEC,
  CAROUSEL_LAYOUTS,
  carouselCountOf,
  carouselLayoutOf,
  carouselScrollMax,
  carouselShapes,
  carouselStops,
  carouselTrack,
  cardWidths,
  migrateCarousel,
  dateLayoutOf,
  makeItem,
  progressTypePatch,
  sizeOf,
  timeLayoutOf,
} from "./tokens";

const docWith = (item: Item): Doc => ({
  title: "MyApp",
  brief: "",
  paletteKey: "purple",
  frame: "phone",
  platform: "android",
  theme: DEFAULT_THEME,
  frames: [{ id: "f", name: "Home", x: 0, y: 0 }],
  groups: [{ id: "g", x: 16, y: 100, axis: "x", items: [item] }],
});

describe("carousel", () => {
  it("starts as a multi-browse row of four cards", () => {
    const it = makeItem("carousel");
    expect(carouselLayoutOf(it)).toBe("multiBrowse");
    expect(carouselCountOf(it)).toBe(4);
    expect(sizeOf(it, {})).toEqual({ w: 412, h: 180 });
  });

  it("keeps the count and the layout within what it can draw", () => {
    expect(carouselCountOf({ ...makeItem("carousel"), count: 99 })).toBe(8);
    expect(carouselLayoutOf({ ...makeItem("carousel"), layout: "dial" })).toBe("multiBrowse");
  });

  it("names its layout and its cards in the prompt", () => {
    const out = buildPrompt(docWith({ ...makeItem("carousel"), layout: "hero", count: 3 }), {}, undefined, "en");
    expect(out).toContain("a hero carousel of 3 cards");
  });
});

describe("date picker", () => {
  it("is a dialog until it is told otherwise", () => {
    const it = makeItem("datePicker");
    expect(dateLayoutOf(it)).toBe("modal");
    /* the calendar's rows follow its width, and a typed date is only a field */
    expect(sizeOf(it, {}).h).toBeGreaterThan(400);
    expect(sizeOf({ ...it, layout: "input" }, {}).h).toBe(96);
    expect(sizeOf({ ...it, layout: "docked" }, {}).h).toBeLessThan(sizeOf(it, {}).h);
  });

  it("writes the date it is given in the sketch's language", () => {
    const at = new Date(2026, 0, 2);
    expect(dateHeadline("en", at)).toBe("Fri, Jan 2");
    expect(dateHeadline("ja", at)).toContain("1月2日");
    expect(monthHeadline("en", at)).toBe("January 2026");
    expect(monthHeadline("ja", at)).toBe("2026年1月");
  });

  it("tells the prompt today is selected, without naming the day", () => {
    const out = buildPrompt(docWith(makeItem("datePicker")), {}, undefined, "en");
    expect(out).toContain("today's date selected");
    expect(out).toContain("modal dialog");
    expect(out).not.toMatch(/day \d+ selected/);
  });
});

describe("time picker", () => {
  it("starts on the dial", () => {
    const it = makeItem("timePicker");
    expect(timeLayoutOf(it)).toBe("dial");
    expect(sizeOf({ ...it, layout: "input" }, {}).h).toBeLessThan(sizeOf(it, {}).h);
  });

  it("tells the prompt the clock shows the current time, without a reading", () => {
    const out = buildPrompt(docWith(makeItem("timePicker")), {}, undefined, "en");
    expect(out).toContain("set to the current time");
    expect(out).toContain("dial");
    expect(out).not.toMatch(/\d\d:\d\d [AP]M/);
  });
});

describe("the FAB's three shapes", () => {
  it("switches between them in place, keeping what they share", () => {
    const fab = { ...makeItem("fab"), icon: "edit", size: 96 };
    const ext = { ...fab, ...fabTypePatch(fab, "extendedFab") };
    expect(ext.kind).toBe("extendedFab");
    /* the circle's diameter becomes the height the label sits in */
    expect(ext.size2).toBe(96);
    expect(ext.icon).toBe("edit");
    expect({ ...ext, ...fabTypePatch(ext, "fab") }.size).toBe(96);
  });

  it("clears the extended FAB scroll setting when switching to a standard FAB", () => {
    const extended = { ...makeItem("extendedFab"), collapseOnScroll: true };
    const standard = { ...extended, ...fabTypePatch(extended, "fab") };
    const restored = { ...standard, ...fabTypePatch(standard, "extendedFab") };
    expect(standard.collapseOnScroll).toBeUndefined();
    expect(restored.collapseOnScroll).toBeUndefined();
  });

  it("opens a menu as a tap action, and keeps the entries when it is taken off again", () => {
    const fab = makeItem("fab");
    const withMenu = { ...fab, ...menuPatch(fab, true) };
    expect(hasMenu(withMenu)).toBe(true);
    expect(withMenu.tabs?.length).toBeGreaterThan(1);
    /* shut, it is a circle; open, it is as tall as its entries make it */
    expect(sizeOf(withMenu, {})).toEqual({ w: 56, h: 56 });
    const shown = { ...withMenu, [fabOpen]: true };
    expect(menuOpen(shown)).toBe(true);
    expect(sizeOf(shown, { [fab.id]: 200 })).toEqual({ w: 200, h: menuHeight(shown, 56) });
    /* the button that shuts the menu is the M one whatever size the FAB itself is */
    const large = { ...withMenu, size: 96, [fabOpen]: true };
    expect(sizeOf(large, { [fab.id]: 200 })).toEqual({ w: 200, h: menuHeight(large, FAB_MENU_CLOSE) });
    expect(sizeOf(large, { [fab.id]: 200 }).h).toBe(sizeOf(shown, { [fab.id]: 200 }).h);
    const off = { ...shown, ...menuPatch(shown, false) };
    expect(hasMenu(off)).toBe(false);
    expect(off.tabs?.length).toBeGreaterThan(1);
  });

  it("reads a sketch saved when a menu was a part of its own", () => {
    const old = { ...makeItem("fab"), kind: "fabMenu" as const, size: 220, tabs: [{ icon: "edit", label: "Note" }] };
    const now = migrateFabMenu(old);
    expect(now.kind).toBe("fab");
    expect(hasMenu(now)).toBe(true);
    expect(now.tabs).toEqual(old.tabs);
    expect(sizeOf(now, {})).toEqual({ w: 56, h: 56 });
  });

  it("gives an extended FAB the three heights M3 names", () => {
    const ext = makeItem("extendedFab");
    expect(extendedFabHeight(ext)).toBe(56);
    expect(extendedFabHeight({ ...ext, size2: 80 })).toBe(80);
    expect(extendedFabHeight({ ...ext, size2: 400 })).toBe(96);
    /* the label and the icon grow with the container */
    expect(extendedFabMetrics(56).icon).toBe(24);
    expect(extendedFabMetrics(96).icon).toBe(32);
    expect(sizeOf({ ...ext, size2: 96 }, { [ext.id]: 140 })).toEqual({ w: 140, h: 96 });
  });

  it("keeps the two other shapes out of the palette but still openable", () => {
    /* the shapes a part is only switched into from its own panel: a FAB's other two, and the
       ring a progress indicator becomes */
    expect(PALETTE_HIDDEN).toContain("extendedFab");
    expect(PALETTE_HIDDEN).toContain("fabMenu");
    expect(PALETTE_HIDDEN).toContain("circularProgress");
    /* a sketch saved with any of them still names a kind the editor knows */
    expect(KIND_ORDER).toContain("extendedFab");
    expect(KIND_ORDER).toContain("fabMenu");
    expect(KIND_ORDER).toContain("circularProgress");
  });
});

describe("a FAB that opens a menu", () => {
  it("says so in the prompt, with the entries it raises", () => {
    const fab = { ...makeItem("fab"), id: "fb", icon: "edit" };
    const doc = docWith({ ...fab, ...menuPatch(fab, true), tabs: [{ icon: "edit", label: "Note" }, { icon: "mic", label: "Voice" }] });
    const out = buildPrompt(doc, {}, undefined, "en");
    expect(out).toContain("raises a menu of 2 items");
    expect(out).toContain('"Note"(edit)');
  });
});

describe("the two shapes of a progress indicator", () => {
  it("switches between them in place, keeping how far along it is", () => {
    const bar = { ...makeItem("linearProgress"), value: 40, wavy: true, trackThickness: 8 };
    const ring = { ...bar, ...progressTypePatch(bar, "circularProgress") };
    expect(ring.kind).toBe("circularProgress");
    /* the value, the wave and the track travel; the measure does not, because a bar is drawn by
       its width and a ring by its diameter */
    expect(ring.value).toBe(40);
    expect(ring.wavy).toBe(true);
    expect(ring.trackThickness).toBe(8);
    expect(sizeOf(ring, {})).toEqual({ w: 48, h: 48 });
    expect({ ...ring, ...progressTypePatch(ring, "linearProgress") }.size).toBe(380);
    expect(PROGRESS_KINDS).toEqual(["linearProgress", "circularProgress"]);
  });

  it("still says which shape it is in the prompt", () => {
    const bar = buildPrompt(docWith({ ...makeItem("linearProgress"), wavy: true, value: 40 }), {}, undefined, "en");
    expect(bar).toContain("a wavy linear progress indicator (40%)");
    const ring = buildPrompt(docWith({ ...makeItem("circularProgress"), trackThickness: 8 }), {}, undefined, "en");
    expect(ring).toContain("a circular progress indicator (indeterminate, 8dp track thickness)");
  });
});

describe("a carousel's row of cards", () => {
  const row = (patch: Partial<Item> = {}): Item => ({ ...makeItem("carousel"), id: "c", ...patch });
  const W = 412;

  it("stops once per card that can pass out at the head, every stop the same distance on", () => {
    const it = row();
    const ws = cardWidths("multiBrowse", W - 16, carouselCountOf(it));
    const stops = carouselStops(it, W);
    expect(stops[0]).toBe(0);
    expect(stops.length).toBe(carouselScrollMax(it, W) + 1);
    /* a card leaves the row from the large keyline whichever card it is, so every card costs the
       same scroll to pass; the first stop also takes back the margin the row starts with */
    const stride = ws[0] + CARD_GAP;
    for (let i = 1; i < stops.length; i++) expect(stops[i]).toBe(stops[i - 1] + stride + (i === 1 ? PHONE_MARGIN : 0));
    expect(carouselTrack(it, W)).toBe(W + stops[stops.length - 1]);
  });

  it("goes with the hand that carries it: the cards travel forward, and none of them bolts", () => {
    for (const l of CAROUSEL_LAYOUTS) {
      const it = row({ layout: l.key, count: 8 });
      const end = carouselStops(it, W).at(-1)!;
      let prev = carouselShapes(it, W, 0);
      for (let s = 1; s <= end; s++) {
        const cur = carouselShapes(it, W, s);
        cur.forEach((c, i) => {
          /* a card that is not on the screen is not travelling on it */
          if (c.w < 2) return;
          const step = c.x - prev[i].x;
          /* nothing drifts back while the row is scrolled forward, not even where the last card
             is settling against the far edge and the row is giving way to it */
          expect(step).toBeLessThan(0.05);
          /* and nothing runs away from the scroll that is carrying it */
          expect(step).toBeGreaterThan(-2);
        });
        prev = cur;
      }
    }
  });

  it("turns the arrangement around at the end: the last card finishes at the large keyline", () => {
    const it = row({ layout: "hero" });
    const ws = cardWidths("hero", W - 16, carouselCountOf(it));
    const last = carouselStops(it, W).at(-1)!;
    const shapes = carouselShapes(it, W, last);
    /* the card standing in the large keyline is the last card of the list, at the large width */
    const lead = shapes.findIndex((s) => s.lead === 1);
    expect(lead).toBe(carouselCountOf(it) - 1);
    expect(shapes[lead].w).toBe(ws[0]);
    /* and every card before it has drawn in to the small size or slid out at the head */
    for (let i = 0; i < lead; i++) expect(shapes[i].w).toBeLessThanOrEqual(ws[ws.length - 1]);
  });

  it("stays put when the row fits its box", () => {
    const it = row({ layout: "uncontained", count: 2 });
    expect(carouselScrollMax(it, 2000)).toBe(0);
    expect(carouselStops(it, 2000)).toEqual([0]);
  });

  it("reads a sketch saved when the row was one box with one caption and one destination", () => {
    const old = row({ label: "Trips", action: { to: "f2", transition: "slide" } });
    const next = migrateCarousel(old);
    expect(next.label).toBe("");
    expect(next.action).toBeUndefined();
    expect(next.tabs?.[0]).toEqual({ icon: "", label: "Trips" });
    expect(next.actions?.["tab:0"]).toEqual({ to: "f2", transition: "slide" });
    /* a row already made of cards is left exactly as it is */
    expect(migrateCarousel(next)).toBe(next);
  });
});

describe("the top app bar's three sizes", () => {
  const bar = (patch: Partial<Item> = {}): Item => ({ ...makeItem("topAppBar"), id: "b", ...patch });

  it("is the small bar until it is given a height, and never taller than the large one", () => {
    expect(topBarHeightOf(bar())).toBe(64);
    expect(topBarHeightOf(bar({ size2: 112 }))).toBe(112);
    expect(topBarHeightOf(bar({ size2: 400 }))).toBe(TOP_BAR_SIZES[TOP_BAR_SIZES.length - 1].h);
    expect(TOP_BAR_SIZES.map((b) => b.h)).toEqual([64, 112, 152]);
  });

  it("keeps the status bar above whatever height it takes on a phone", () => {
    expect(sizeOf(bar(), {}).h).toBe(64 + 24);
    expect(sizeOf(bar({ size2: 152 }), {}).h).toBe(152 + 24);
    expect(KIND_SPEC.topAppBar.size2?.presets).toEqual([64, 112, 152]);
  });

  it("names the size in the prompt", () => {
    const out = buildPrompt(docWith(bar({ label: "Inbox", size2: 112 })), {}, undefined, "en");
    expect(out).toContain("medium size, 112dp tall");
    expect(buildPrompt(docWith(bar({ label: "Inbox" })), {}, undefined, "en")).not.toContain("dp tall, title");
  });
});
