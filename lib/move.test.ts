import { describe, expect, it } from "vitest";

import { joinRun, landMoved, liftSelection, sequenceOf, sequenceSize } from "./move";
import { Frame, GAP, Group, Item, Kind, PHONE_H, PHONE_W, frameRect, groupBounds, layoutOf, makeItem, sizeOf } from "./tokens";

const part = (kind: Kind, id: string): Item => ({ ...makeItem(kind), id });
const run = (id: string, x: number, y: number, items: Item[]): Group => ({ id, x, y, axis: "x", items });
const ids = (...xs: string[]) => new Set(xs);
const counter = () => {
  let n = 0;
  return () => `n${++n}`;
};
const where = (groups: Group[], itemId: string) => {
  for (const g of groups) for (const pl of layoutOf(g, {})) if (pl.item.id === itemId) return { x: pl.x, y: pl.y, group: g };
  throw new Error(itemId);
};

describe("liftSelection", () => {
  it("moves a fully selected group whole, keeping its id", () => {
    const groups = [run("g1", 10, 20, [part("button", "a"), part("button", "b")]), run("g2", 10, 200, [part("chip", "c")])];
    const out = liftSelection(groups, ids("a", "b", "c"), {}, counter());
    expect(out.groups).toEqual(groups);
    expect(out.moving).toEqual(["g1", "g2"]);
  });

  it("lifts a part out of a run at the place it was drawn, and closes the run behind it", () => {
    const a = part("button", "a");
    const b = part("button", "b");
    const c = part("button", "c");
    const groups = [run("g1", 10, 20, [a, b, c])];
    const before = where(groups, "a");
    const out = liftSelection(groups, ids("a"), {}, counter());
    expect(out.moving).toEqual(["n1"]);
    expect(where(out.groups, "a")).toMatchObject({ x: before.x, y: before.y });
    /* the rest of the run starts where its new first part was */
    const rest = out.groups.find((g) => g.id === "g1")!;
    expect(rest.items.map((it) => it.id)).toEqual(["b", "c"]);
    expect(rest.x).toBe(10 + sizeOf(a, {}).w + GAP);
    /* the lifted part sits just above the run it left */
    expect(out.groups.map((g) => g.id)).toEqual(["g1", "n1"]);
  });

  it("keeps picked neighbours of one run connected", () => {
    const groups = [run("g1", 0, 0, [part("button", "a"), part("button", "b"), part("button", "c"), part("button", "d")])];
    const out = liftSelection(groups, ids("a", "b", "d"), {}, counter());
    const lifted = out.groups.filter((g) => out.moving.includes(g.id));
    expect(lifted.map((g) => g.items.map((it) => it.id))).toEqual([["a", "b"], ["d"]]);
    expect(out.groups.find((g) => g.id === "g1")!.items.map((it) => it.id)).toEqual(["c"]);
  });

  it("lets parts go from a hand-made group, which collapses once one part is left", () => {
    const g: Group = { id: "g1", x: 100, y: 100, axis: "x", free: true, items: [part("button", "a"), part("chip", "b")], pos: { a: { x: 0, y: 0 }, b: { x: 40, y: 80 } } };
    const out = liftSelection([g], ids("b"), {}, counter());
    const rest = out.groups.find((x) => x.id === "g1")!;
    expect(rest.free).toBeFalsy();
    expect(rest.items.map((it) => it.id)).toEqual(["a"]);
    expect(where(out.groups, "b")).toMatchObject({ x: 140, y: 180 });
  });
});

describe("landMoved", () => {
  const home: Frame = { id: "f1", name: "Home", x: 0, y: 0 };
  const next: Frame = { id: "f2", name: "Next", x: PHONE_W + 100, y: 0 };
  const frames = [home, next];

  it("pulls a group let go across a screen's edge back inside it", () => {
    const g = run("g1", PHONE_W + 100 - 20, 300, [part("button", "a")]);
    const out = landMoved([g], ids("g1"), new Map([["g1", "f1"]]), frames, {});
    const b = groupBounds(out[0], {});
    expect(b.l).toBeGreaterThanOrEqual(frameRect(next).l);
    expect(b.r).toBeLessThanOrEqual(frameRect(next).r);
  });

  it("leaves a group let go on the empty canvas where it is", () => {
    const g = run("g1", -900, -900, [part("button", "a")]);
    expect(landMoved([g], ids("g1"), new Map([["g1", "f1"]]), frames, {})[0]).toBe(g);
  });

  it("stretches a bar carried onto another screen across it", () => {
    const bar = { ...part("topAppBar", "bar"), size: PHONE_W };
    const g = run("g1", PHONE_W + 140, 0, [bar]);
    const out = landMoved([g], ids("g1"), new Map([["g1", "f1"]]), frames, {});
    expect(out[0].x).toBe(next.x);
    expect(out[0].items[0].size).toBe(PHONE_W);
  });

  it("pulls the groups over one screen in as one block, keeping their spacing", () => {
    const a = run("g1", PHONE_W + 100 - 30, 300, [part("button", "a")]);
    const b = run("g2", PHONE_W + 100 + 60, 340, [part("button", "b")]);
    const out = landMoved([a, b], ids("g1", "g2"), new Map([["g1", "f1"], ["g2", "f1"]]), frames, {});
    expect(out[0].x).toBe(next.x);
    expect(out[1].x - out[0].x).toBe(b.x - a.x);
    expect(out[1].y - out[0].y).toBe(b.y - a.y);
  });

  it("does not touch groups that are not moving", () => {
    const g = run("g1", PHONE_W + 100 - 20, PHONE_H - 10, [part("button", "a")]);
    expect(landMoved([g], ids(), new Map(), frames, {})[0]).toBe(g);
  });
});

describe("sequenceOf", () => {
  it("orders joinable parts along their axis", () => {
    const right = run("g1", 300, 100, [part("button", "a")]);
    const left = run("g2", 100, 140, [part("iconButton", "b"), part("button", "c")]);
    expect(sequenceOf([right, left], {})!.items.map((it) => it.id)).toEqual(["b", "c", "a"]);
  });

  it("refuses parts that cannot share one run", () => {
    expect(sequenceOf([run("g1", 0, 0, [part("button", "a")]), run("g2", 0, 100, [part("chip", "b")])], {})).toBeNull();
    const free: Group = { id: "g3", x: 0, y: 0, axis: "x", free: true, items: [part("button", "c")], pos: { c: { x: 0, y: 0 } } };
    expect(sequenceOf([free], {})).toBeNull();
  });
});

describe("joinRun", () => {
  it("puts the sequence into the run where the hole was, and the moved groups go", () => {
    const host = run("h", 0, 0, [part("button", "x"), part("button", "y")]);
    const a = part("button", "a");
    const b = part("button", "b");
    const out = joinRun([host, run("m1", 500, 0, [a]), run("m2", 600, 0, [b])], ids("m1", "m2"), "h", 1, [a, b], {});
    expect(out).toHaveLength(1);
    expect(out[0].items.map((it) => it.id)).toEqual(["x", "a", "b", "y"]);
    expect(out[0].x).toBe(0);
  });

  it("moves a run joined at its front back by the room the sequence takes", () => {
    const host = run("h", 400, 0, [part("button", "x")]);
    const a = part("button", "a");
    const b = part("button", "b");
    const out = joinRun([host, run("m1", 0, 0, [a, b])], ids("m1"), "h", 0, [a, b], {});
    expect(out[0].x).toBe(400 - sequenceSize([a, b], "x", {}).w - GAP);
    /* the part that was already there has not moved */
    expect(where(out, "x").x).toBe(400);
  });
});
