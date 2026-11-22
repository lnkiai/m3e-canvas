"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useReducedMotion } from "motion/react";
import { BLINK_MS, BODY_R, CYCLE_MS, EYE_H, EYE_W, MOODS, SHAPE, SPARK_R, SPARK_REST_DEG, SPARK_SIZE, eyesFor, gazeTowards, lidAt, mixPoints, outlinePath, shapeOf, type Mood } from "@/lib/bot";
import { SHAPE_COUNT, Spring, type Point } from "@/lib/shapes";
import type { Palette } from "@/lib/tokens";

/* The character, drawn. Every frame is worked out from a handful of springs and written
 * straight onto the SVG; React draws it once, at rest, and after that only changes its colours.
 * The arithmetic is lib/bot.ts. */

/** how near the pointer has to come before a calm character looks at it */
const CALM_REACH = 240;
const EYE_MIN = 1.8;

const arcPath = (x: number, y: number, w: number) => `M${(x - w * 0.78).toFixed(2)} ${(y + 3).toFixed(2)}Q${x.toFixed(2)} ${(y - 8.5).toFixed(2)} ${(x + w * 0.78).toFixed(2)} ${(y + 3).toFixed(2)}`;
const sparkAt = (deg: number) => [Math.cos((deg * Math.PI) / 180) * SPARK_R, Math.sin((deg * Math.PI) / 180) * SPARK_R];
const settled = (s: Spring) => Math.abs(s.pos - s.target) < 0.002 && Math.abs(s.vel) < 0.02;

export function Bot({
  p,
  size = 64,
  mood = "idle",
  calm = false,
  spark = true,
  style,
}: {
  p: Palette;
  size?: number;
  mood?: Mood;
  /** A calm character keeps still when nothing asks for its attention: no turning, no
   *  breathing, and it only looks at a pointer that comes near. For one that sits in a toolbar
   *  all day. */
  calm?: boolean;
  /** the small shape that keeps the body company; a character drawn very small goes without */
  spark?: boolean;
  style?: CSSProperties;
}) {
  const reduced = useReducedMotion();
  const svg = useRef<SVGSVGElement>(null);
  const body = useRef<SVGGElement>(null);
  const outline = useRef<SVGPathElement>(null);
  const eyeL = useRef<SVGRectElement>(null);
  const eyeR = useRef<SVGRectElement>(null);
  const arcL = useRef<SVGPathElement>(null);
  const arcR = useRef<SVGPathElement>(null);
  const sparkG = useRef<SVGGElement>(null);
  const moodRef = useRef(mood);
  /** set by the engine below; lets a change of mood reach a loop that is already running */
  const onMood = useRef<(next: Mood) => void>(() => {});

  /* what React draws: the character at rest. These never change, so React never writes over
     what the engine has drawn since. */
  const rest = useMemo(() => {
    const [l, r] = eyesFor(0, 0);
    const [sx, sy] = sparkAt(SPARK_REST_DEG);
    return {
      outline: outlinePath(shapeOf(MOODS.idle.shape), BODY_R),
      eyes: [l, r].map((e) => ({ x: e.x - EYE_W / 2, y: e.y - EYE_H / 2, arc: arcPath(e.x, e.y, EYE_W) })),
      spark: outlinePath(shapeOf(SHAPE.clover), SPARK_SIZE, 45),
      sparkAt: `translate(${sx.toFixed(2)} ${sy.toFixed(2)})`,
    };
  }, []);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const spec0 = MOODS[moodRef.current];
    let from: Point[] = shapeOf(spec0.shape);
    let to: Point[] = from;
    let shapeIndex = spec0.shape;
    const swap = new Spring(170, 0.55);
    swap.pos = swap.target = 1;
    const scale = new Spring(230, 0.5);
    scale.pos = scale.target = spec0.scale;
    const gx = new Spring(150, 0.85);
    const gy = new Spring(150, 0.85);
    const open = new Spring(280, 0.6);
    open.pos = open.target = spec0.eyeOpen;
    const smile = new Spring(210, 0.9);
    smile.pos = smile.target = spec0.smile;
    /* the body's height off its place: a kick sends it up, the spring brings it back with a bounce */
    const hop = new Spring(200, 0.3);
    const sparkScale = new Spring(240, 0.45);
    sparkScale.pos = sparkScale.target = spec0.sparkScale;
    const springs = [swap, scale, gx, gy, open, smile, hop, sparkScale];
    let spin = 0;
    let sparkDeg = SPARK_REST_DEG;
    let sparkTurn = 0;
    /** how far the spark still is from its place, in degrees */
    let sparkOff = 0;
    let pointer: [number, number] = [0, 0];
    let blinkFrom = -1;
    let nextShape = 0;
    let last = 0;
    let raf = 0;
    let running = false;
    let seen = true;

    const retarget = (index: number) => {
      /* from wherever the outline is now, so a change of mind mid-morph does not jump */
      from = mixPoints(from, to, Math.max(0, Math.min(1.15, swap.pos)));
      to = shapeOf(index);
      shapeIndex = ((index % SHAPE_COUNT) + SHAPE_COUNT) % SHAPE_COUNT;
      swap.pos = 0;
      swap.vel = 0;
      swap.target = 1;
    };

    const draw = (now: number) => {
      const spec = MOODS[moodRef.current];
      const lid = blinkFrom < 0 ? 1 : lidAt((now - blinkFrom) / BLINK_MS);
      const breath = calm || reduced ? 1 : 1 + 0.014 * Math.sin((now / 1000) * Math.PI * 2 * 0.3);
      const stretch = 1 + Math.min(0.16, Math.abs(hop.vel) * 0.0011);
      const s = scale.pos * breath;
      outline.current?.setAttribute("d", outlinePath(mixPoints(from, to, Math.max(-0.1, Math.min(1.15, swap.pos))), BODY_R, spin));
      body.current?.setAttribute("transform", `translate(0 ${hop.pos.toFixed(2)}) scale(${(s / stretch).toFixed(4)} ${(s * stretch).toFixed(4)})`);
      const eyes = eyesFor(gx.pos, gy.pos);
      const smiling = Math.max(0, Math.min(1, smile.pos));
      [
        [eyeL.current, arcL.current, eyes[0]] as const,
        [eyeR.current, arcR.current, eyes[1]] as const,
      ].forEach(([pill, arc, eye]) => {
        if (!pill || !arc) return;
        const w = EYE_W * eye.wide;
        const h = Math.max(EYE_MIN, EYE_H * Math.max(0, open.pos) * lid);
        pill.setAttribute("x", (eye.x - w / 2).toFixed(2));
        pill.setAttribute("y", (eye.y - h / 2).toFixed(2));
        pill.setAttribute("width", w.toFixed(2));
        pill.setAttribute("height", h.toFixed(2));
        pill.setAttribute("rx", (Math.min(w, h) / 2).toFixed(2));
        pill.setAttribute("opacity", (1 - smiling).toFixed(3));
        arc.setAttribute("d", arcPath(eye.x, eye.y, w));
        arc.setAttribute("opacity", smiling.toFixed(3));
      });
      if (sparkG.current) {
        const [x, y] = sparkAt(sparkDeg);
        sparkG.current.setAttribute("transform", `translate(${x.toFixed(2)} ${(y + hop.pos * 0.6).toFixed(2)}) rotate(${sparkTurn.toFixed(1)}) scale(${Math.max(0, sparkScale.pos).toFixed(3)})`);
      }
      return spec;
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const spec = MOODS[moodRef.current];
      if (spec.cycle && now >= nextShape) {
        retarget(shapeIndex + 1);
        nextShape = now + CYCLE_MS;
      }
      /* where it looks: where its mood says, or at the pointer; at work the eyes wander a little */
      let [tx, ty] = spec.gaze ?? [pointer[0] * spec.follow, pointer[1] * spec.follow];
      if (spec.cycle) {
        tx += 0.14 * Math.cos(now / 620);
        ty += 0.09 * Math.sin(now / 410);
      }
      gx.target = tx;
      gy.target = ty;
      for (const spring of springs) spring.step(dt);
      /* a calm character turns only while it works */
      const turning = !calm || spec.cycle;
      if (turning) spin = (spin + spec.spin * dt) % 360;
      if (spec.orbit > 0) {
        sparkDeg += spec.orbit * 360 * dt;
        sparkTurn += 260 * dt;
      } else {
        /* back to its place by the shorter way round, and upright again */
        sparkOff = ((((SPARK_REST_DEG - sparkDeg) % 360) + 540) % 360) - 180;
        sparkDeg += sparkOff * Math.min(1, dt * 7);
        /* the spark looks the same every quarter turn, so the nearest one will do */
        sparkTurn += ((((-sparkTurn % 90) + 135) % 90) - 45) * Math.min(1, dt * 7);
      }
      if (blinkFrom >= 0 && now - blinkFrom >= BLINK_MS) blinkFrom = -1;
      draw(now);
      const moving = turning || spec.orbit > 0 || blinkFrom >= 0 || Math.abs(sparkOff) > 0.5 || springs.some((spring) => !settled(spring));
      if (moving && seen) raf = requestAnimationFrame(frame);
      else running = false;
    };

    const wake = () => {
      if (running || reduced || !seen) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    onMood.current = (next: Mood) => {
      const spec = MOODS[next];
      moodRef.current = next;
      scale.target = spec.scale;
      open.target = spec.eyeOpen;
      smile.target = spec.smile;
      sparkScale.target = spec.sparkScale;
      if (spec.cycle) nextShape = 0;
      else if (shapeIndex !== spec.shape || swap.target !== 1) retarget(spec.shape);
      /* a start at something new, and a jump for joy */
      if (next === "happy") hop.vel = -260;
      else if (next === "curious") hop.vel = -80;
      if (reduced) {
        /* no motion wanted: the new pose, at once */
        for (const spring of springs) {
          spring.pos = spring.target;
          spring.vel = 0;
        }
        [gx.pos, gy.pos] = spec.gaze ?? [0, 0];
        from = to;
        draw(performance.now());
      } else wake();
    };
    onMood.current(moodRef.current);

    const onPointer = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const near = !calm || Math.hypot(dx, dy) < CALM_REACH;
      const next: [number, number] = near ? gazeTowards(dx, dy, r.width) : [0, 0];
      if (next[0] === pointer[0] && next[1] === pointer[1]) return;
      pointer = next;
      wake();
    };
    /* a blink now and then, rarer while it works */
    let blinkTimer = 0;
    const blinkLater = () => {
      blinkTimer = window.setTimeout(
        () => {
          if (!document.hidden && seen) {
            blinkFrom = performance.now();
            wake();
          }
          blinkLater();
        },
        (MOODS[moodRef.current].cycle ? 4200 : 2400) + Math.random() * 3600,
      );
    };
    /* out of view, nothing is drawn */
    const watcher =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            seen = entry.isIntersecting;
            if (seen) wake();
          });
    watcher?.observe(el);
    if (!reduced) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      blinkLater();
    }
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(blinkTimer);
      window.removeEventListener("pointermove", onPointer);
      watcher?.disconnect();
      onMood.current = () => {};
    };
  }, [calm, reduced]);

  useEffect(() => {
    onMood.current(mood);
  }, [mood]);

  /* room around the body for the hop and, where there is one, the spark */
  const box = spark ? 58 : 47;
  return (
    <svg ref={svg} aria-hidden width={size} height={size} viewBox={`${-box} ${-box} ${box * 2} ${box * 2}`} style={{ display: "block", flex: "0 0 auto", overflow: "visible", ...style }}>
      <g ref={body}>
        <path ref={outline} d={rest.outline} fill={p.primary} />
        <rect ref={eyeL} x={rest.eyes[0].x} y={rest.eyes[0].y} width={EYE_W} height={EYE_H} rx={EYE_W / 2} fill={p.onPrimary} />
        <rect ref={eyeR} x={rest.eyes[1].x} y={rest.eyes[1].y} width={EYE_W} height={EYE_H} rx={EYE_W / 2} fill={p.onPrimary} />
        <path ref={arcL} d={rest.eyes[0].arc} fill="none" stroke={p.onPrimary} strokeWidth={3.6} strokeLinecap="round" opacity={0} />
        <path ref={arcR} d={rest.eyes[1].arc} fill="none" stroke={p.onPrimary} strokeWidth={3.6} strokeLinecap="round" opacity={0} />
      </g>
      {spark && (
        <g ref={sparkG} transform={rest.sparkAt}>
          <path d={rest.spark} fill={p.tertiaryContainer} stroke={p.primary} strokeWidth={1.6} strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}
