import { describe, expect, it } from "vitest";
import { BODY_R, EYE_H, EYE_W, MOODS, SHAPE, eyesFor, gazeTowards, lidAt, mixPoints, outlinePath, shapeOf, type Mood } from "./bot";
import { SHAPE_COUNT, getShapes } from "./shapes";

describe("the character's moods", () => {
  it("each settles on a Material shape there is, within sensible bounds", () => {
    for (const mood of Object.keys(MOODS) as Mood[]) {
      const spec = MOODS[mood];
      expect(spec.shape).toBeGreaterThanOrEqual(0);
      expect(spec.shape).toBeLessThan(SHAPE_COUNT);
      expect(spec.scale).toBeGreaterThan(0.8);
      expect(spec.scale).toBeLessThan(1.2);
      expect(spec.smile === 0 || spec.smile === 1).toBe(true);
      /* it either looks where its mood says or follows the pointer, never neither */
      expect(spec.gaze !== null || spec.follow > 0).toBe(true);
    }
  });

  it("at rest it is the app's own mark, and only work sends it through the shapes", () => {
    expect(MOODS.idle.shape).toBe(SHAPE.cookie);
    expect((Object.keys(MOODS) as Mood[]).filter((m) => MOODS[m].cycle)).toEqual(["thinking"]);
    expect(MOODS.thinking.orbit).toBeGreaterThan(0);
  });

  it("names the shapes in the order the library keeps them", () => {
    expect(Object.values(SHAPE).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(shapeOf(SHAPE_COUNT + 1)).toBe(getShapes()[1]);
    expect(shapeOf(-1)).toBe(getShapes()[SHAPE_COUNT - 1]);
  });
});

describe("the body", () => {
  const a = shapeOf(SHAPE.cookie);
  const b = shapeOf(SHAPE.sunny);

  it("is one shape at 0, the other at 1, and halfway between at a half", () => {
    const start = mixPoints(a, b, 0);
    const end = mixPoints(a, b, 1);
    for (const i of [0, 7, 90, 179]) {
      expect(start[i][0]).toBeCloseTo(a[i][0]);
      expect(start[i][1]).toBeCloseTo(a[i][1]);
      expect(end[i][0]).toBeCloseTo(b[i][0]);
      expect(end[i][1]).toBeCloseTo(b[i][1]);
    }
    const mid = mixPoints(a, b, 0.5);
    expect(mid[7][0]).toBeCloseTo((a[7][0] + b[7][0]) / 2);
    expect(mid[7][1]).toBeCloseTo((a[7][1] + b[7][1]) / 2);
  });

  it("goes past the target when a spring overshoots", () => {
    const past = mixPoints(a, b, 1.1);
    expect(past[3][0]).toBeCloseTo(b[3][0] + (b[3][0] - a[3][0]) * 0.1);
  });

  it("is written as one closed path with a point for every point", () => {
    const d = outlinePath(a, BODY_R);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.split("L")).toHaveLength(a.length);
  });

  it("turns about its middle: a quarter turn sends right to down", () => {
    expect(outlinePath([[1, 0]], 10, 90)).toBe("M0.00 10.00Z");
    expect(outlinePath([[1, 0]], 10)).toBe("M10.00 0.00Z");
  });
});

describe("the eyes", () => {
  it("looking straight out, they stand level and evenly either side, at full width", () => {
    const [l, r] = eyesFor(0, 0);
    expect(l.x).toBeCloseTo(-r.x);
    expect(l.y).toBeCloseTo(r.y);
    expect(l.x).toBeLessThan(0);
    expect(l.wide).toBeCloseTo(1);
    expect(r.wide).toBeCloseTo(1);
    /* a little above the middle, and clear of each other */
    expect(l.y).toBeLessThan(0);
    expect(r.x - l.x).toBeGreaterThan(EYE_W * 1.5);
  });

  it("looking right, both slide right and the far one narrows", () => {
    const [l0, r0] = eyesFor(0, 0);
    const [l, r] = eyesFor(1, 0);
    expect(l.x).toBeGreaterThan(l0.x);
    expect(r.x).toBeGreaterThan(r0.x);
    expect(r.wide).toBeLessThan(l.wide);
    expect(r.wide).toBeGreaterThanOrEqual(0.5);
  });

  it("looking left is the mirror of looking right", () => {
    const [l, r] = eyesFor(-0.7, 0.2);
    const [ml, mr] = eyesFor(0.7, 0.2);
    expect(l.x).toBeCloseTo(-mr.x);
    expect(r.x).toBeCloseTo(-ml.x);
    expect(l.wide).toBeCloseTo(mr.wide);
  });

  it("looking down lowers them, looking up raises them", () => {
    expect(eyesFor(0, 1)[0].y).toBeGreaterThan(eyesFor(0, 0)[0].y);
    expect(eyesFor(0, -1)[0].y).toBeLessThan(eyesFor(0, 0)[0].y);
  });

  it("never leave the body, however far the gaze is asked to go", () => {
    for (const [gx, gy] of [[5, 5], [-5, 5], [5, -5], [-5, -5]]) {
      for (const eye of eyesFor(gx, gy)) expect(Math.hypot(eye.x, eye.y) + EYE_H / 2).toBeLessThan(BODY_R);
    }
  });
});

describe("a blink", () => {
  it("is open at both ends and shut two fifths of the way through", () => {
    expect(lidAt(0)).toBe(1);
    expect(lidAt(1)).toBe(1);
    expect(lidAt(-1)).toBe(1);
    expect(lidAt(2)).toBe(1);
    expect(lidAt(0.4)).toBeCloseTo(0);
  });

  it("closes, then opens, without a jump", () => {
    let last = lidAt(0);
    for (let t = 0.02; t <= 0.4; t += 0.02) {
      const now = lidAt(t);
      expect(now).toBeLessThanOrEqual(last + 1e-9);
      last = now;
    }
    last = lidAt(0.4);
    for (let t = 0.42; t < 1; t += 0.02) {
      const now = lidAt(t);
      expect(now).toBeGreaterThanOrEqual(last - 1e-9);
      last = now;
    }
  });
});

describe("following the pointer", () => {
  it("looks nowhere in particular at a pointer on top of it", () => {
    expect(gazeTowards(0, 0, 64)).toEqual([0, 0]);
  });

  it("looks the way the pointer is, further for a pointer further off, and no further than 1", () => {
    const near = gazeTowards(40, 0, 64);
    const far = gazeTowards(4000, 0, 64);
    expect(near[0]).toBeGreaterThan(0);
    expect(near[0]).toBeLessThan(far[0]);
    expect(far[0]).toBeCloseTo(1);
    expect(near[1]).toBeCloseTo(0);
    const up = gazeTowards(0, -4000, 64);
    expect(up[1]).toBeCloseTo(-1);
    expect(Math.hypot(...gazeTowards(3000, 3000, 64))).toBeCloseTo(1);
  });
});
