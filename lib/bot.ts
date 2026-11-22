import { getShapes, type Point } from "./shapes";

/* The app's own character: the mark's Material shape with a pair of eyes. Nothing about it is
 * drawn ahead of time. Its body is one of the Material 3 Expressive shapes and morphs into
 * another when its mood changes; its eyes stand on a sphere inside the body, so turning the
 * gaze moves and foreshortens them the way a head turning would; springs carry every change.
 * This file is the arithmetic, kept apart from the component that draws it so it can be tested. */

export type Mood = "idle" | "curious" | "listening" | "thinking" | "happy";

/** the Material shapes by the names used here: indexes into `getShapes()` */
export const SHAPE = { burst: 0, cookie: 1, pentagon: 2, pill: 3, sunny: 4, clover: 5, oval: 6 } as const;

export type MoodSpec = {
  /** the shape the body settles into */
  shape: number;
  /** the body walks through every shape in turn instead of settling, as the loading indicator does */
  cycle: boolean;
  scale: number;
  /** how fast the outline turns, in degrees a second; the face does not turn with it */
  spin: number;
  /** how far the eyes are open: 1 at rest, above 1 wide */
  eyeOpen: number;
  /** 0 for open eyes, 1 for the arcs of a smile */
  smile: number;
  /** where it looks, each from -1 to 1, or null to look at the pointer */
  gaze: [number, number] | null;
  /** how far towards the pointer it looks when it follows it */
  follow: number;
  /** turns a second of the spark around the body */
  orbit: number;
  sparkScale: number;
};

export const MOODS: Record<Mood, MoodSpec> = {
  /* the mark itself, awake */
  idle: { shape: SHAPE.cookie, cycle: false, scale: 1, spin: 8, eyeOpen: 1, smile: 0, gaze: null, follow: 0.6, orbit: 0, sparkScale: 1 },
  /* something has its attention: it sharpens and looks straight at it */
  curious: { shape: SHAPE.sunny, cycle: false, scale: 1.07, spin: 16, eyeOpen: 1.22, smile: 0, gaze: null, follow: 1, orbit: 0, sparkScale: 1.3 },
  /* someone is writing to it: it softens and looks down at the words */
  listening: { shape: SHAPE.clover, cycle: false, scale: 1, spin: 5, eyeOpen: 1.1, smile: 0, gaze: [0, 0.62], follow: 0, orbit: 0, sparkScale: 0.9 },
  /* at work: the loading indicator's own walk through the shapes, eyes up and away */
  thinking: { shape: SHAPE.cookie, cycle: true, scale: 0.96, spin: 110, eyeOpen: 0.9, smile: 0, gaze: [0.42, -0.5], follow: 0, orbit: 0.9, sparkScale: 1.1 },
  /* done: a burst and a smile */
  happy: { shape: SHAPE.burst, cycle: false, scale: 1.05, spin: 30, eyeOpen: 1, smile: 1, gaze: [0, -0.12], follow: 0, orbit: 0, sparkScale: 1.7 },
};

/** how long the body rests on each shape while it cycles, as the loading indicator does */
export const CYCLE_MS = 650;

/* ---------- the body ---------- */

/** the body's radius in the drawing's units; the shapes come with a radius of 1 */
export const BODY_R = 40;

/** the outline between two shapes: `t` 0 is `a`, 1 is `b`; past 1 it overshoots, which is the life in a spring */
export function mixPoints(a: Point[], b: Point[], t: number): Point[] {
  const out: Point[] = new Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = [a[i][0] + (b[i][0] - a[i][0]) * t, a[i][1] + (b[i][1] - a[i][1]) * t];
  return out;
}

/** an outline as path data, turned by `deg` about the middle */
export function outlinePath(points: Point[], radius: number, deg = 0): string {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad) * radius;
  const sin = Math.sin(rad) * radius;
  let d = "";
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    d += `${i ? "L" : "M"}${(x * cos - y * sin).toFixed(2)} ${(x * sin + y * cos).toFixed(2)}`;
  }
  return `${d}Z`;
}

export const shapeOf = (index: number): Point[] => {
  const shapes = getShapes();
  return shapes[((index % shapes.length) + shapes.length) % shapes.length];
};

/* ---------- the eyes ---------- */

/** the sphere the eyes stand on, and where on it they stand when it looks straight out */
const EYE_SPHERE = 27;
const EYE_APART = 0.44;
const EYE_UP = 0.1;
/** how far the head turns for a gaze of 1, sideways and up or down, in radians */
const YAW = 0.6;
const PITCH = 0.5;
export const EYE_W = 9;
export const EYE_H = 14;

export type Eye = {
  /** the middle of the eye in the drawing's units */
  x: number;
  y: number;
  /** how wide it is drawn, of its full width: an eye turned away is seen from the side */
  wide: number;
};

/** Where the two eyes are drawn for a gaze. The gaze turns the sphere they stand on, and the
 *  eyes are then seen from straight ahead: they slide together to one side, and the one turned
 *  away narrows. */
export function eyesFor(gx: number, gy: number): [Eye, Eye] {
  const yaw = Math.max(-1, Math.min(1, gx)) * YAW;
  const pitch = Math.max(-1, Math.min(1, gy)) * PITCH;
  const z0 = Math.cos(EYE_APART) * Math.cos(EYE_UP);
  const eye = (side: -1 | 1): Eye => {
    const x = Math.sin(side * EYE_APART) * Math.cos(EYE_UP);
    const y = -Math.sin(EYE_UP);
    /* about the upright axis, then about the level one */
    const x1 = x * Math.cos(yaw) + z0 * Math.sin(yaw);
    const z1 = -x * Math.sin(yaw) + z0 * Math.cos(yaw);
    const y2 = y * Math.cos(pitch) + z1 * Math.sin(pitch);
    return { x: x1 * EYE_SPHERE, y: y2 * EYE_SPHERE, wide: Math.max(0.5, Math.min(1.06, z1 / z0)) };
  };
  return [eye(-1), eye(1)];
}

/** How far the lids are open during a blink that is `t` of the way through, 0 to 1: shut at
 *  two fifths of the way, quicker to close than to open. */
export function lidAt(t: number): number {
  if (t <= 0 || t >= 1) return 1;
  const shut = 0.4;
  if (t < shut) return 1 - Math.pow(t / shut, 2);
  const u = (t - shut) / (1 - shut);
  return 1 - Math.pow(1 - u, 2);
}
export const BLINK_MS = 220;

/** the gaze for a pointer `dx`, `dy` away from the middle of a character `size` across: it
 *  looks further the further off the pointer is, and never past the edge of its range */
export function gazeTowards(dx: number, dy: number, size: number): [number, number] {
  const far = Math.max(size * 2.2, 160);
  const d = Math.hypot(dx, dy);
  if (d < 1) return [0, 0];
  const reach = Math.min(1, d / far);
  return [(dx / d) * reach, (dy / d) * reach];
}

/* ---------- the spark ---------- */

/** where the spark rests: up and to the right, on the body's edge, like a badge */
export const SPARK_REST_DEG = -42;
export const SPARK_R = 44;
export const SPARK_SIZE = 8;
