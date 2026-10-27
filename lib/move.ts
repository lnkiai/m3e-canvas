import { barSlotOf, pullInto } from "./tidy";
import { Axis, FULL_WIDTH, GAP, Frame, Group, Item, PHONE_H, PHONE_W, canJoin, carryItemSize, collapseFree, connectSpecOf, fitHeight, frameOfGroup, frameRect, frameSizeOf, groupBounds, layoutOf, matchRunSize, sizeOf } from "./tokens";

/** Moving several parts at once. A group whose parts are all selected moves whole, keeping
 *  its id and layout; parts picked out of a larger group are lifted out of it first, the way
 *  a single part is when it is dragged away: a run closes up behind them, and a hand-made
 *  group lets them go. Neighbours picked from the same run stay connected. */

/** The selection made ready to move: every group it touches is either moving whole or has
 *  had its picked parts taken out into groups of their own, each at the place it was drawn.
 *  The lifted groups come right after the group they left, so the layer order holds. */
export function liftSelection(
  groups: Group[],
  ids: Set<string>,
  widths: Record<string, number>,
  newId: () => string,
): { groups: Group[]; moving: string[] } {
  const out: Group[] = [];
  const moving: string[] = [];
  for (const g of groups) {
    const picked = g.items.filter((it) => ids.has(it.id));
    if (!picked.length) {
      out.push(g);
      continue;
    }
    if (picked.length === g.items.length) {
      out.push(g);
      moving.push(g.id);
      continue;
    }
    const placed = layoutOf(g, widths);
    const lifted: Group[] = [];
    if (g.free) {
      out.push(collapseFree({ ...g, items: g.items.filter((it) => !ids.has(it.id)) }, widths));
      for (const pl of placed) {
        if (!ids.has(pl.item.id)) continue;
        lifted.push({ id: newId(), x: pl.x, y: pl.y, axis: connectSpecOf(pl.item)?.axis ?? "x", items: [pl.item] });
      }
    } else {
      /* the run keeps its parts that were not picked, closed up the way a delete closes it */
      let x = g.x;
      let y = g.y;
      let items = g.items;
      while (items.length && ids.has(items[0].id)) {
        const sz = sizeOf(items[0], widths);
        if (g.axis === "x") x += sz.w + GAP;
        else y += sz.h + GAP;
        items = items.slice(1);
      }
      out.push({ ...g, x, y, items: items.filter((it) => !ids.has(it.id)) });
      /* picked neighbours go out as one run, so a pair of connected buttons stays a pair */
      let seg: typeof placed = [];
      const flush = () => {
        if (seg.length) lifted.push({ id: newId(), x: seg[0].x, y: seg[0].y, axis: g.axis, items: seg.map((pl) => pl.item) });
        seg = [];
      };
      for (const pl of placed) {
        if (ids.has(pl.item.id)) seg.push(pl);
        else flush();
      }
      flush();
    }
    for (const l of lifted) {
      out.push(l);
      moving.push(l.id);
    }
  }
  return { groups: out, moving };
}

/** The moved groups settled where they were let go. The groups over one screen are pulled
 *  inside it as one block, so they keep their places relative to each other; one that still
 *  sticks out (the block is larger than the screen) is then pulled in on its own. A lone part
 *  carried onto another screen first takes the sizes that screen calls for, as a single part
 *  does when it lands there: a bar spans the screen beside its rails, and nothing is taller
 *  than the screen. Such a bar keeps to its own slot rather than moving with the block. A
 *  group let go on the empty canvas stays as it is. `from` names the screen each group was
 *  on when the move began. Each group stays with the screen it was let go over: shifting the
 *  block can carry a group's centre past that screen's edge, and it is pulled back into the
 *  same screen rather than handed to a neighbour. */
export function landMoved(
  groups: Group[],
  moving: Set<string>,
  from: Map<string, string | undefined>,
  frames: Frame[],
  widths: Record<string, number>,
): Group[] {
  const next = new Map<string, Group>();
  const dest = new Map<string, Frame>();
  const blocks = new Map<string, Group[]>();
  const bars = new Set<string>();
  for (const g of groups) {
    if (!moving.has(g.id)) continue;
    const to = frameOfGroup(g, frames, widths);
    if (!to) continue;
    let sized = g;
    const src = from.get(g.id);
    if (src !== to.id && g.items.length === 1 && !g.free) {
      const it = g.items[0];
      const was = frames.find((f) => f.id === src);
      const size = frameSizeOf(to);
      if (FULL_WIDTH.includes(it.kind)) {
        const slot = barSlotOf(
          groups.filter((x) => x.id !== g.id),
          to,
          frames,
          widths,
        );
        sized = { ...g, x: Math.round(slot.x), items: [carryItemSize(it, was ? frameSizeOf(was) : { w: PHONE_W, h: PHONE_H }, { w: slot.w, h: size.h })] };
        bars.add(g.id);
      } else {
        sized = { ...g, items: [fitHeight(it, size.h)] };
      }
    }
    next.set(g.id, sized);
    dest.set(g.id, to);
    if (bars.has(g.id)) continue;
    blocks.set(to.id, [...(blocks.get(to.id) ?? []), sized]);
  }
  for (const [fid, block] of blocks) {
    const fr = frameRect(frames.find((f) => f.id === fid)!);
    const bb = block.map((g) => groupBounds(g, widths)).reduce((a, o) => ({ l: Math.min(a.l, o.l), t: Math.min(a.t, o.t), r: Math.max(a.r, o.r), b: Math.max(a.b, o.b) }));
    /* the least shift that puts the block inside, keeping its top-left in when it cannot all fit */
    const dx = Math.round(bb.r > fr.r ? Math.max(fr.l - bb.l, fr.r - bb.r) : bb.l < fr.l ? fr.l - bb.l : 0);
    const dy = Math.round(bb.b > fr.b ? Math.max(fr.t - bb.t, fr.b - bb.b) : bb.t < fr.t ? fr.t - bb.t : 0);
    if (dx || dy) for (const g of block) next.set(g.id, { ...g, x: g.x + dx, y: g.y + dy });
  }
  return groups.map((g) => {
    const n = next.get(g.id);
    if (!n) return g;
    return pullInto(n, dest.get(g.id)!, widths);
  });
}

/** The parts of the moving groups as one connected run could take them, in order along the
 *  axis, or null when they cannot all join one: every group must be a connected run (not a
 *  hand-made group) on one axis, and every part of one family. */
export function sequenceOf(units: Group[], widths: Record<string, number>): { units: Group[]; items: Item[] } | null {
  if (!units.length || units.some((g) => g.free)) return null;
  const first = units[0].items[0];
  const axis = connectSpecOf(first)?.axis;
  if (!axis) return null;
  if (units.some((g) => g.axis !== axis || g.items.some((it) => !canJoin(first, it)))) return null;
  const at = new Map(units.map((g) => [g.id, groupBounds(g, widths)]));
  const sorted = [...units].sort((a, b) => {
    const ra = at.get(a.id)!;
    const rb = at.get(b.id)!;
    return axis === "x" ? ra.l - rb.l || ra.t - rb.t : ra.t - rb.t || ra.l - rb.l;
  });
  return { units: sorted, items: sorted.flatMap((g) => g.items) };
}

/** how much room a sequence takes inside a run of the given axis: its length along the axis,
 *  joined by the run's gaps, and the largest of its sizes across it */
export function sequenceSize(items: Item[], axis: Axis, widths: Record<string, number>): { w: number; h: number } {
  const sizes = items.map((it) => sizeOf(it, widths));
  const along = sizes.reduce((s, z) => s + (axis === "x" ? z.w : z.h), 0) + GAP * Math.max(0, items.length - 1);
  const across = sizes.reduce((m, z) => Math.max(m, axis === "x" ? z.h : z.w), 0);
  return axis === "x" ? { w: along, h: across } : { w: across, h: along };
}

/** The moving groups joined into a run at `index`, in the order of `items`: they leave their own
 *  groups, take the run's size the way a single part joining it does, and a run joined at its
 *  front moves back by the room they take, so the parts already in it stay where they were. */
export function joinRun(
  groups: Group[],
  moving: Set<string>,
  targetId: string,
  index: number,
  items: Item[],
  widths: Record<string, number>,
): Group[] {
  const target = groups.find((g) => g.id === targetId);
  if (!target || moving.has(targetId)) return groups;
  const host = target.items[0];
  const joined = items.map((it) => matchRunSize(it, host));
  const room = sequenceSize(joined, target.axis, widths);
  return groups
    .filter((g) => !moving.has(g.id))
    .map((g) => {
      if (g.id !== targetId) return g;
      const front = index === 0;
      return {
        ...g,
        x: front && g.axis === "x" ? g.x - room.w - GAP : g.x,
        y: front && g.axis === "y" ? g.y - room.h - GAP : g.y,
        items: [...g.items.slice(0, index), ...joined, ...g.items.slice(index)],
      };
    });
}
