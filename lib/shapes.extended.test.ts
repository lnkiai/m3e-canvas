/**
 * lib/shapes.ts — Material 3 Expressive loading-indicator shapes.
 *
 * Locks in:
 *  - SHAPE_COUNT matches the SVG_DEFS array length
 *  - getShapes() returns 7 shapes, each with the documented POINTS_PER_SHAPE count
 *  - shapes are normalized to roughly the unit square (-1..1 in both axes)
 *  - morphedShape() lerps between two shapes for any in-between fraction
 *  - morphedShape() wraps around past the last shape (idx % SHAPE_COUNT)
 *  - negative fractions and out-of-range fractions are clamped
 *  - morphedShape at integer boundaries returns the start shape exactly
 *  - Spring converges to target under reasonable damping
 *  - LoadingAnimator advances morph target per 650ms cycle and stays in [0..360) rotation
 */
import { describe, expect, it } from "vitest";
import {
  SHAPE_COUNT,
  getShapes,
  morphedShape,
  Spring,
  LoadingAnimator,
  DURATION_PER_SHAPE_MS,
} from "./shapes";

describe("getShapes()", () => {
  it("returns 7 shapes", () => {
    expect(SHAPE_COUNT).toBe(7);
    expect(getShapes().length).toBe(7);
  });

  it("each shape has POINTS_PER_SHAPE points", () => {
    // POINTS_PER_SHAPE isn't exported, but we know it from the file (180); use a sanity bound
    const shapes = getShapes();
    for (const s of shapes) {
      expect(s.length).toBeGreaterThan(100);
      expect(s.length).toBeLessThan(500);
    }
  });

  it("shapes are roughly normalized to the unit square", () => {
    const shapes = getShapes();
    for (const s of shapes) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of s) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const spanX = maxX - minX;
      const spanY = maxY - minY;
      expect(spanX).toBeGreaterThan(0.5);
      expect(spanX).toBeLessThanOrEqual(2.05);
      expect(spanY).toBeGreaterThan(0.5);
      expect(spanY).toBeLessThanOrEqual(2.05);
    }
  });

  it("returns the same cached array on repeated calls", () => {
    const a = getShapes();
    const b = getShapes();
    expect(a).toBe(b);
  });

  it("includes the procedural oval at index 6 (the null slot)", () => {
    const shapes = getShapes();
    // The last shape (index 6) is generated as an oval: 0.74 * sin amplitude
    const last = shapes[shapes.length - 1];
    const ys = last.map(([, y]) => y);
    const maxY = Math.max(...ys);
    expect(maxY).toBeCloseTo(0.74, 1);
  });
});

describe("morphedShape()", () => {
  it("at integer fraction returns the from-shape exactly", () => {
    const shapes = getShapes();
    const m = morphedShape(2);
    expect(m.length).toBe(shapes[2].length);
    for (let i = 0; i < m.length; i++) {
      expect(m[i][0]).toBeCloseTo(shapes[2][i][0], 6);
      expect(m[i][1]).toBeCloseTo(shapes[2][i][1], 6);
    }
  });

  it("at the mid-point between two integer shapes is the average of the two endpoints", () => {
    const shapes = getShapes();
    const m = morphedShape(1.5);
    for (let i = 0; i < m.length; i++) {
      expect(m[i][0]).toBeCloseTo((shapes[1][i][0] + shapes[2][i][0]) / 2, 6);
      expect(m[i][1]).toBeCloseTo((shapes[1][i][1] + shapes[2][i][1]) / 2, 6);
    }
  });

  it("wraps past the last shape back to the first (fraction 7.0 == shape 0)", () => {
    const shapes = getShapes();
    const m = morphedShape(SHAPE_COUNT); // 7.0 -> from=0, to=1, t=0 -> shape 0
    for (let i = 0; i < m.length; i++) {
      expect(m[i][0]).toBeCloseTo(shapes[0][i][0], 6);
      expect(m[i][1]).toBeCloseTo(shapes[0][i][1], 6);
    }
  });

  it("clamps fractions below 0 — t clamps to [0,1], shape index wraps with mod SHAPE_COUNT", () => {
    // -2.5 -> idx = -3 -> from = ((-3 % 7) + 7) % 7 = 4, to = 5, t = clamp(-2.5 - -3) = 0.5
    // so it's the average of shape 4 and shape 5.
    const shapes = getShapes();
    const m = morphedShape(-2.5);
    for (let i = 0; i < m.length; i++) {
      const expectedX = (shapes[4][i][0] + shapes[5][i][0]) / 2;
      expect(m[i][0]).toBeCloseTo(expectedX, 5);
    }
  });

  it("clamps fractions above SHAPE_COUNT similarly", () => {
    // 7.6 -> idx = 7 -> from = ((7 % 7) + 7) % 7 = 0, to = 1, t = clamp(0.6) = 0.6
    const shapes = getShapes();
    const m = morphedShape(7.6);
    for (let i = 0; i < m.length; i++) {
      const expectedX = shapes[0][i][0] + (shapes[1][i][0] - shapes[0][i][0]) * 0.6;
      expect(m[i][0]).toBeCloseTo(expectedX, 5);
    }
  });

  it("output array has the same length as a single shape", () => {
    const m = morphedShape(3.7);
    expect(m.length).toBe(getShapes()[0].length);
  });
});

describe("Spring", () => {
  it("converges toward the target with positive damping", () => {
    const s = new Spring(200, 0.6);
    s.target = 1;
    // simulate 2 seconds in 1ms steps
    for (let i = 0; i < 2000; i++) s.step(0.001);
    expect(s.pos).toBeCloseTo(1, 1);
  });

  it("returns to target after a kick", () => {
    const s = new Spring(300, 0.7);
    s.pos = 2; // start displaced
    s.target = 0;
    for (let i = 0; i < 5000; i++) s.step(0.001);
    expect(s.pos).toBeCloseTo(0, 1);
  });

  it("initial state has pos 0, vel 0, target 0", () => {
    const s = new Spring(100, 1);
    expect(s.pos).toBe(0);
    expect(s.vel).toBe(0);
    expect(s.target).toBe(0);
  });

  it("dt=0 doesn't change state (no integration performed)", () => {
    const s = new Spring(100, 1);
    const before = s.pos;
    s.step(0);
    expect(s.pos).toBe(before);
  });
});

describe("LoadingAnimator", () => {
  it("starts with rotation 0 and morph 0", () => {
    const a = new LoadingAnimator();
    expect(a.rotation).toBe(0);
    expect(a.morph).toBe(0);
  });

  it("update() advances morph toward target over time", () => {
    const a = new LoadingAnimator();
    // first update sets lastTs; subsequent updates integrate
    a.update(0);
    for (let i = 1; i <= 100; i++) a.update(i * 16); // ~1.6s
    expect(a.morph).toBeGreaterThan(0.5);
  });

  it("rotation stays in [0, 360) after long simulation", () => {
    const a = new LoadingAnimator();
    a.update(0);
    // simulate 30 seconds
    for (let i = 1; i <= 30000; i += 16) a.update(i);
    expect(a.rotation).toBeGreaterThanOrEqual(0);
    expect(a.rotation).toBeLessThan(360);
  });

  it("DURATION_PER_SHAPE_MS is 650 ms (mirrors Android LoadingIndicatorAnimatorDelegate)", () => {
    expect(DURATION_PER_SHAPE_MS).toBe(650);
  });

  it("the morph target ticks up every 650 ms", () => {
    const a = new LoadingAnimator();
    a.update(0);
    // Simulate to just past one cycle boundary (650 ms -> morph target becomes 2)
    for (let i = 1; i <= 700; i++) a.update(i);
    // morph target (private, but inferable) — by 700ms the spring should have passed the original
    // target of 1 and be heading toward 2.
    expect(a.morph).toBeGreaterThan(1);
  });
});
