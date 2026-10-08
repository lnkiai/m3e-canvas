import { describe, expect, it } from "vitest";

import { carryFrame, minFrameLength, pinOf, stretchFrame, tidyFrame } from "./tidy";
import { DESKTOP_H, DESKTOP_W, Frame, Group, Item, Kind, NAV_BAR_H, PHONE_H, PHONE_MARGIN, PHONE_W, frameLengthOf, frameOfGroup, frameRect, groupBounds, isPhoneFrame, makeItem } from "./tokens";

const frame: Frame = { id: "f1", name: "Home", x: 0, y: 0 };
const frames = [frame];

const grp = (id: string, x: number, y: number, items: Item[]): Group => ({ id, x, y, axis: "x", items });
const part = (kind: Kind, id: string): Item => ({ ...makeItem(kind), id });

describe("tidyFrame", () => {
  it("snaps the app bar to the top edge and the navigation bar to the bottom", () => {
    const groups = [grp("g-bar", 40, 300, [part("topAppBar", "bar")]), grp("g-nav", 40, 100, [part("bottomNav", "nav")])];
    const out = tidyFrame(groups, frame, frames, {});
    const bar = out!.find((g) => g.id === "g-bar")!;
    const nav = out!.find((g) => g.id === "g-nav")!;
    expect([bar.x, bar.y]).toEqual([0, 0]);
    expect([nav.x, nav.y]).toEqual([0, PHONE_H - (80 + NAV_BAR_H)]);
  });

  it("moves a FAB to the bottom-right corner, one margin in", () => {
    const out = tidyFrame([grp("g-fab", 40, 100, [part("fab", "fab")])], frame, frames, {});
    expect([out![0].x, out![0].y]).toEqual([PHONE_W - PHONE_MARGIN - 56, PHONE_H - PHONE_MARGIN - 56]);
  });

  it("joins neighbouring buttons into one connected run in reading order", () => {
    const out = tidyFrame([grp("g1", 16, 300, [part("button", "b1")]), grp("g2", 150, 300, [part("button", "b2")])], frame, frames, {});
    expect(out).toHaveLength(1);
    expect(out![0].items.map((it) => it.id)).toEqual(["b1", "b2"]);
  });

  it("joins buttons dropped onto each other, in reading order", () => {
    const out = tidyFrame([grp("g1", 150, 300, [part("button", "b1")]), grp("g2", 100, 304, [part("button", "b2")])], frame, frames, {});
    expect(out).toHaveLength(1);
    expect(out![0].items.map((it) => it.id)).toEqual(["b2", "b1"]);
  });

  it("joins neighbouring list items into one connected column", () => {
    const out = tidyFrame([grp("g1", 16, 100, [part("listItem", "l1")]), grp("g2", 16, 180, [part("listItem", "l2")])], frame, frames, {});
    expect(out).toHaveLength(1);
    expect(out![0].axis).toBe("y");
    expect(out![0].items.map((it) => it.id)).toEqual(["l1", "l2"]);
  });

  it("returns null for a frame that is already tidy", () => {
    const messy = [grp("g-bar", 40, 300, [part("topAppBar", "bar")]), grp("g-fab", 10, 10, [part("fab", "fab")])];
    const once = tidyFrame(messy, frame, frames, {});
    expect(once).not.toBeNull();
    expect(tidyFrame(once!, frame, frames, {})).toBeNull();
  });
});

describe("tidyFrame placement", () => {
  /* two rows of buttons under a top app bar, above a navigation bar */
  const stage = () => [
    grp("g-bar", 40, 300, [part("topAppBar", "bar")]),
    grp("g-nav", 40, 100, [part("bottomNav", "nav")]),
    grp("g-a", 60, 500, [part("button", "a")]),
    grp("g-b", 60, 620, [part("button", "b")]),
  ];
  const rowsOf = (out: Group[]) => out.filter((g) => g.id === "g-a" || g.id === "g-b").map((g) => g.y).sort((a, b) => a - b);
  const bodyTop = 64 + 24 + PHONE_MARGIN; // app bar with its status inset, then the margin
  const bodyBottom = PHONE_H - (80 + NAV_BAR_H) - PHONE_MARGIN;

  it("stacks the body from the top by default", () => {
    const out = tidyFrame(stage(), frame, frames, {})!;
    expect(rowsOf(out)[0]).toBe(bodyTop);
  });

  it("pushes the body against the bottom bar when the screen asks for it", () => {
    const f: Frame = { ...frame, place: "bottom" };
    const out = tidyFrame(stage(), f, [f], {})!;
    const ys = rowsOf(out);
    expect(ys[1] + 56).toBe(bodyBottom);
    expect(ys[1] - ys[0]).toBe(56 + 16); // rows keep their gap
  });

  it("centers the body between the bars", () => {
    const f: Frame = { ...frame, place: "center" };
    const out = tidyFrame(stage(), f, [f], {})!;
    const ys = rowsOf(out);
    const above = ys[0] - bodyTop;
    const below = bodyBottom - (ys[1] + 56);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
  });

  it("centers a single row when asked to spread", () => {
    const f: Frame = { ...frame, place: "spread" };
    const one = stage().filter((g) => g.id !== "g-b");
    const out = tidyFrame(one, f, [f], {})!;
    const y = out.find((g) => g.id === "g-a")!.y;
    expect(Math.abs(y - bodyTop - (bodyBottom - (y + 56)))).toBeLessThanOrEqual(1);
  });

  it("keeps the block at the top when some rows do not fit", () => {
    const f: Frame = { ...frame, place: "bottom" };
    /* two buttons, then a 600dp box that no longer fits under them: the buttons stack from
     * the top as before and the box stays where it was */
    const tall = [
      grp("g-bar", 40, 300, [part("topAppBar", "bar")]),
      grp("g-nav", 40, 100, [part("bottomNav", "nav")]),
      grp("g-a", 60, 400, [part("button", "a")]),
      grp("g-b", 60, 470, [part("button", "b")]),
      grp("g-box", 0, 560, [{ ...part("box", "box"), size2: 600 }]),
    ];
    const out = tidyFrame(tall, f, [f], {})!;
    expect(rowsOf(out)).toEqual([bodyTop, bodyTop + 56 + 16]);
    expect(out.find((g) => g.id === "g-box")!.y).toBe(560);
  });

  it("spreads the rows with equal gaps above, between and below", () => {
    const f: Frame = { ...frame, place: "spread" };
    const out = tidyFrame(stage(), f, [f], {})!;
    const ys = rowsOf(out);
    const above = ys[0] - bodyTop;
    const between = ys[1] - (ys[0] + 56);
    const below = bodyBottom - (ys[1] + 56);
    expect(Math.abs(above - between)).toBeLessThanOrEqual(1);
    expect(Math.abs(between - below)).toBeLessThanOrEqual(1);
  });
});

describe("tidyFrame with locked groups", () => {
  /* a locked run of two list items, with a lone list item close enough above it to fuse when unlocked */
  const lockedRun = (): Group => ({ ...grp("g-lock", 16, 500, [part("listItem", "l1"), part("listItem", "l2")]), axis: "y", locked: true });
  const neighbour = (): Group => grp("g-nb", 16, 412, [part("listItem", "n1")]);
  const buttons = (): Group => grp("g-btns", 100, 60, [part("button", "b1"), part("button", "b2")]);
  const find = (out: Group[], id: string) => out.find((g) => g.id === id)!;

  it("keeps a locked group at its exact position, never merging it into a run", () => {
    const run = lockedRun();
    const out = tidyFrame([run, neighbour(), buttons()], frame, frames, {})!;
    expect(find(out, "g-lock")).toEqual(run);
  });

  it("still tidies the unlocked groups, unchanged by a locked one that stands clear of them", () => {
    const mixed = tidyFrame([lockedRun(), neighbour(), buttons()], frame, frames, {})!;
    const solo = tidyFrame([neighbour(), buttons()], frame, frames, {})!;
    for (const id of ["g-nb", "g-btns"]) expect(find(mixed, id)).toEqual(find(solo, id));
    /* and tidying really did move them */
    expect(find(mixed, "g-btns")).not.toEqual(buttons());
    expect(find(mixed, "g-nb")).not.toEqual(neighbour());
  });

  it("merges the same runs when the group is not locked", () => {
    const out = tidyFrame([{ ...lockedRun(), locked: undefined }, neighbour(), buttons()], frame, frames, {})!;
    const lists = out.filter((g) => g.items.some((it) => it.kind === "listItem"));
    expect(lists).toHaveLength(1);
    expect(lists[0].items.map((it) => it.id).sort()).toEqual(["l1", "l2", "n1"]);
  });

  it("yields no change when every group on the screen is locked", () => {
    const other = { ...grp("g-other", 60, 300, [part("listItem", "o1")]), locked: true };
    expect(tidyFrame([lockedRun(), other], frame, frames, {})).toBeNull();
  });

  /* Locked sections keep the room they stand in: the rest is laid out around them,
   * never on top of them. */
  const bounds = (g: Group) => groupBounds(g, {});
  const overlaps = (a: Group, b: Group) => {
    const ra = bounds(a);
    const rb = bounds(b);
    return Math.min(ra.r, rb.r) > Math.max(ra.l, rb.l) && Math.min(ra.b, rb.b) > Math.max(ra.t, rb.t);
  };

  it("starts the body below a locked app bar instead of flowing over it", () => {
    const bar = { ...grp("g-bar", 0, 0, [part("topAppBar", "bar")]), locked: true };
    const card = grp("g-card", 40, 400, [part("card", "c1")]);
    const out = tidyFrame([bar, card], frame, frames, {})!;
    expect(find(out, "g-bar")).toEqual(bar);
    expect(find(out, "g-card").y).toBe(bounds(bar).b + PHONE_MARGIN);
    expect(overlaps(find(out, "g-bar"), find(out, "g-card"))).toBe(false);
  });

  it("stacks an unlocked bar beyond a locked one at the same edge", () => {
    const bar = { ...grp("g-bar", 0, 0, [part("topAppBar", "bar")]), locked: true };
    const tabs = grp("g-tabs", 30, 300, [part("tabs", "tabs")]);
    const out = tidyFrame([bar, tabs], frame, frames, {})!;
    expect([find(out, "g-tabs").x, find(out, "g-tabs").y]).toEqual([0, bounds(bar).b]);
  });

  it("keeps the body to the right of a locked navigation rail", () => {
    const rail = { ...grp("g-rail", 0, 0, [part("navRail", "rail")]), locked: true };
    const card = grp("g-card", 10, 200, [part("card", "c1")]);
    const out = tidyFrame([rail, card], frame, frames, {})!;
    expect(find(out, "g-rail")).toEqual(rail);
    expect(find(out, "g-card").x).toBe(bounds(rail).r + PHONE_MARGIN);
    expect(overlaps(find(out, "g-rail"), find(out, "g-card"))).toBe(false);
  });

  it("flows the rows around a locked section in the body", () => {
    const fixed = { ...grp("g-fixed", 16, 200, [part("card", "c0")]), locked: true };
    const above = grp("g-a", 60, 40, [part("listItem", "l1")]);
    const below = grp("g-b", 60, 600, [part("listItem", "l2")]);
    const out = tidyFrame([fixed, above, below], frame, frames, {})!;
    expect(find(out, "g-fixed")).toEqual(fixed);
    for (const id of ["g-a", "g-b"]) expect(overlaps(find(out, "g-fixed"), find(out, id))).toBe(false);
    /* the row that fit above stays above; the one that did not goes under the section */
    expect(bounds(find(out, "g-a")).b).toBeLessThanOrEqual(bounds(fixed).t);
    expect(bounds(find(out, "g-b")).t).toBeGreaterThanOrEqual(bounds(fixed).b);
  });

  it("keeps a FAB and the body above a locked navigation bar", () => {
    const nav = { ...grp("g-nav", 0, PHONE_H - 80, [part("bottomNav", "nav")]), locked: true };
    const fab = grp("g-fab", 40, 100, [part("fab", "fab")]);
    const out = tidyFrame([nav, fab], frame, frames, {})!;
    expect(find(out, "g-nav")).toEqual(nav);
    expect(bounds(find(out, "g-fab")).b).toBeLessThanOrEqual(bounds(nav).t - PHONE_MARGIN);
  });
});

describe("a screen longer than the device", () => {
  const long: Frame = { ...frame, length: PHONE_H * 2 };
  const navH = 80 + NAV_BAR_H;
  const stage = () => [
    grp("g-bar", 0, 0, [part("topAppBar", "bar")]),
    grp("g-row", 16, 400, [part("button", "row")]),
    grp("g-fab", PHONE_W - PHONE_MARGIN - 56, PHONE_H - navH - PHONE_MARGIN - 56, [part("fab", "fab")]),
    grp("g-nav", 0, PHONE_H - navH, [part("bottomNav", "nav")]),
  ];
  const ys = (groups: Group[]) => Object.fromEntries(groups.map((g) => [g.id, g.y]));

  it("is still drawn for a phone, and holds what lies past the device", () => {
    expect(isPhoneFrame(long)).toBe(true);
    expect(frameRect(long).b).toBe(PHONE_H * 2);
    expect(frameOfGroup(grp("g-low", 16, PHONE_H + 200, [part("button", "low")]), [long], {})?.id).toBe("f1");
    /* a length the device already covers is no length at all */
    expect(frameLengthOf({ ...frame, length: 300 })).toBe(PHONE_H);
  });

  it("takes what stands at its foot along when it grows, and brings it back when it shrinks", () => {
    const grown = stretchFrame(stage(), frame, PHONE_H * 2, frames, {});
    expect(grown.frames[0].length).toBe(PHONE_H * 2);
    expect(ys(grown.groups)).toEqual({ "g-bar": 0, "g-row": 400, "g-fab": PHONE_H * 2 - navH - PHONE_MARGIN - 56, "g-nav": PHONE_H * 2 - navH });
    const back = stretchFrame(grown.groups, grown.frames[0], PHONE_H, grown.frames, {});
    expect(back.frames[0].length).toBeUndefined();
    expect(ys(back.groups)).toEqual(ys(stage()));
  });

  it("leaves a FAB the author put near the head where it is", () => {
    const groups = [grp("g-fab", 300, 120, [part("fab", "fab")])];
    expect(stretchFrame(groups, frame, PHONE_H * 2, frames, {}).groups[0].y).toBe(120);
  });

  it("moves the screens and loose parts below it, and leaves the ones beside it", () => {
    const below: Frame = { id: "f2", name: "Below", x: 0, y: PHONE_H + 300 };
    const beside: Frame = { id: "f3", name: "Beside", x: PHONE_W + 80, y: 0 };
    const all = [frame, below, beside];
    const groups = [
      grp("g-under", 16, PHONE_H + 400, [part("button", "under")]),
      grp("g-side", PHONE_W + 96, 200, [part("button", "side")]),
      grp("g-loose", 16, PHONE_H + 100, [part("button", "loose")]),
    ];
    const out = stretchFrame(groups, frame, PHONE_H + 400, all, {});
    expect(out.frames.map((f) => f.y)).toEqual([0, PHONE_H + 700, 0]);
    expect(ys(out.groups)).toEqual({ "g-under": PHONE_H + 800, "g-side": 200, "g-loose": PHONE_H + 500 });
    /* the loose part stays off the screen it was off */
    expect(frameOfGroup(out.groups[2], out.frames, {})).toBeUndefined();
  });

  it("is never made shorter than its body needs with its foot still below it", () => {
    const grown = stretchFrame(stage(), frame, PHONE_H * 2, frames, {}).groups.map((g) => (g.id === "g-row" ? { ...g, y: PHONE_H + 300 } : g));
    const row = groupBounds(grown.find((g) => g.id === "g-row")!, {});
    const foot = PHONE_H * 2 - grown.find((g) => g.id === "g-fab")!.y;
    expect(minFrameLength(grown, long, [long], {})).toBe(Math.ceil((row.b + foot) / 4) * 4);
    /* a body that fits the device lets the screen go back to it */
    expect(minFrameLength(stretchFrame(stage(), frame, PHONE_H * 2, frames, {}).groups, long, [long], {})).toBe(PHONE_H);
  });

  it("runs a rail to the new foot, and does not let it hold the screen long", () => {
    const groups = [grp("g-rail", 0, 0, [{ ...part("navRail", "rail"), size2: PHONE_H }])];
    const grown = stretchFrame(groups, frame, PHONE_H * 2, frames, {});
    expect(grown.groups[0].items[0].size2).toBe(PHONE_H * 2);
    expect(minFrameLength(grown.groups, grown.frames[0], grown.frames, {})).toBe(PHONE_H);
    const back = stretchFrame(grown.groups, grown.frames[0], PHONE_H, grown.frames, {});
    expect(back.groups[0].items[0].size2).toBe(PHONE_H);
    /* a shorter rail is the author's drawing and keeps its height */
    const short = [grp("g-rail", 0, 0, [{ ...part("navRail", "rail"), size2: 400 }])];
    expect(stretchFrame(short, frame, PHONE_H * 2, frames, {}).groups[0].items[0].size2).toBe(400);
    /* and so does one drawn between the device and the length */
    const between = [grp("g-rail", 0, 0, [{ ...part("navRail", "rail"), size2: PHONE_H + 200 }])];
    expect(stretchFrame(between, { ...frame, length: PHONE_H * 2 }, PHONE_H * 3, frames, {}).groups[0].items[0].size2).toBe(PHONE_H + 200);
  });

  it("keeps a rail running the length when the screen turns into a desktop one", () => {
    const groups = stretchFrame(stage(), frame, PHONE_H * 2, frames, {}).groups;
    const to: Frame = { ...long, w: DESKTOP_W, h: DESKTOP_H };
    const out = carryFrame(groups, long, to, [long], {});
    const rail = out.groups.flatMap((g) => g.items).find((it) => it.kind === "navRail");
    expect(rail?.size2).toBe(PHONE_H * 2);
    /* a rail only as tall as the device takes the new device */
    const short = [grp("g-rail", 0, 0, [{ ...part("navRail", "rail"), size2: PHONE_H }])];
    const desk: Frame = { ...long, w: DESKTOP_W, h: DESKTOP_H };
    const wide = carryFrame(short, long, desk, [long], {});
    expect(wide.groups[0].items[0].size2).toBe(DESKTOP_H);
  });

  it("pins what stays put to the same end a change of length carries it with", () => {
    /* grown only a little, the FAB is still in the first screenful but goes with the foot */
    const grown = stretchFrame(stage(), frame, PHONE_H + 40, frames, {});
    const pin = (id: string) => pinOf(grown.groups.find((g) => g.id === id)!, grown.frames[0], {});
    expect([pin("g-bar"), pin("g-row"), pin("g-fab"), pin("g-nav")]).toEqual(["head", null, "foot", "foot"]);
    const rail = stretchFrame([grp("g-rail", 0, 0, [part("navRail", "rail")])], frame, PHONE_H * 3, frames, {});
    expect(pinOf(rail.groups[0], rail.frames[0], {})).toBe("head");
    /* a FAB left in the middle of a very long screen scrolls with the body */
    expect(pinOf(grp("g-mid", 300, PHONE_H * 1.5, [part("fab", "mid")]), { ...frame, length: PHONE_H * 3 }, {})).toBeNull();
  });

  it("moves a loose part whose middle is below the foot, even when it reaches over it", () => {
    const loose = grp("g-loose", 16, PHONE_H - 10, [{ ...part("box", "loose"), size2: 60 }]);
    expect(frameOfGroup(loose, frames, {})).toBeUndefined();
    const out = stretchFrame([loose], frame, PHONE_H + 400, frames, {});
    expect(out.groups[0].y).toBe(PHONE_H + 390);
    expect(frameOfGroup(out.groups[0], out.frames, {})).toBeUndefined();
  });

  it("lays its bars out on the whole length and centers a dialog on the device", () => {
    const out = tidyFrame([grp("g-nav", 0, 300, [part("bottomNav", "nav")]), grp("g-dialog", 40, 1200, [part("dialog", "dialog")])], long, [long], {})!;
    const dialog = groupBounds(out.find((g) => g.id === "g-dialog")!, {});
    expect(out.find((g) => g.id === "g-nav")!.y).toBe(PHONE_H * 2 - navH);
    expect(dialog.t).toBe(Math.round((PHONE_H - (dialog.b - dialog.t)) / 2));
  });
});
