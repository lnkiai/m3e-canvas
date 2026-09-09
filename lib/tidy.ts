import { CONTENT_W, FULL_WIDTH, Frame, Group, Item, KIND_SPEC, Kind, PHONE_MARGIN, RAIL_COLLAPSED_W, railExpansionSide, railWidth, railLayoutWidth, canJoin, isPhoneFrame, scaleR, carryItemSize, connectSpecOf, frameOfGroup, frameRect, frameSizeOf, groupBounds, layoutOf, isExpanded } from "./tokens";

/* Rule-based layout for one screen. Nothing here is guessed by a model.
 *
 * 1. Parts of one connectable family that sit next to each other, or on top of
 *    each other, fuse into a connected run, the same way the magnetic drop does:
 *    list items stacked in a column, buttons or icon buttons side by side in a row.
 * 2. Bars stick to the edges they belong to (app bar and tabs at the top, the
 *    navigation bar at the bottom, toolbars and snackbars hovering above it,
 *    a bottom sheet on the bottom edge), a FAB takes the bottom-right corner,
 *    a dialog is centered.
 * 3. Everything else is stacked between the bars on the 16dp layout margins, from
 *    the top unless the screen asks for the body centered, at the bottom or spread. Rows,
 *    hand-made groups and intentional overlaps (a badge on an icon, parts on a
 *    box) are kept as one unit, and a part keeps the side it was on. A run
 *    nearly as wide as the content sits on the margin; a text with a switch,
 *    checkbox or radio beside it spans the row, the control on the right.
 *
 * 4. Inside one unit (parts on a box, a hand-made group) edges that are almost
 *    aligned snap to the common line; across the screen, boxes whose corners are
 *    almost the same radius become the same, and likewise cards. Both only act on
 *    differences a hand would call a slip, never on a gap someone clearly meant.
 *
 * Only positions change and runs are joined; sizes, order and contents stay,
 * apart from a corner radius evened out by rule 4. */

/** the farthest two edges may be apart and still count as meant to line up */
const SNAP = 6;
/** the farthest two corner radii may be apart and still count as meant to match */
const RADIUS_SNAP = 4;

type Rect = { l: number; t: number; r: number; b: number };

/** vertical distance between stacked rows */
const ROW_GAP = 16;
/** a tighter gap after a heading and between list-like rows of one kind */
const TIGHT_GAP = 8;
/** horizontal distance between parts packed into one row */
const ROW_ITEM_GAP = 8;
/** the farthest two parts of one family may be apart and still be joined: side by side, and stacked */
const JOIN_GAP_X = 24;
const JOIN_GAP_Y = 48;
/** parts of one family the author kept apart stay clearly apart, beyond the joining distance */
const APART_GAP_X = JOIN_GAP_X + 8;
const APART_GAP_Y = JOIN_GAP_Y + 8;

const LIST_KINDS = new Set(["listItem", "textField", "select", "checkbox", "radio", "switch", "chip", "divider", "card"]);

/** one movable unit: a group plus everything nested inside or overlapping it */
type Unit = { ids: string[]; bb: Rect; kind: string; checked?: boolean; /** the first part, for family checks */ probe: Item };

const overlap = (a: Rect, b: Rect) => Math.min(a.r, b.r) > Math.max(a.l, b.l) && Math.min(a.b, b.b) > Math.max(a.t, b.t);
const union = (a: Rect, b: Rect): Rect => ({ l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) });
/** how much of the smaller extent two spans share, 0..1 */
const share = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(1, Math.min(a1 - a0, b1 - b0));

/* ---------- 1. join runs ---------- */

/** whether the whole run is one connectable family, so a neighbour can join it */
const runFamily = (g: Group): { axis: "x" | "y"; probe: Item } | null => {
  if (g.free) return null;
  const spec = connectSpecOf(g.items[0]);
  if (!spec) return null;
  if (!g.items.every((it) => canJoin(g.items[0], it))) return null;
  return { axis: spec.axis, probe: g.items[0] };
};

/** Neighbouring runs of one family fuse into a single run, in reading order. */
function joinRuns(groups: Group[], widths: Record<string, number>): Group[] {
  const out = [...groups];
  for (;;) {
    let joined = false;
    const bounds = new Map(out.map((g) => [g.id, groupBounds(g, widths)]));
    outer: for (let i = 0; i < out.length; i++) {
      const a = out[i];
      const fa = runFamily(a);
      if (!fa) continue;
      for (let j = 0; j < out.length; j++) {
        if (i === j) continue;
        const b = out[j];
        const fb = runFamily(b);
        if (!fb || fa.axis !== fb.axis || !canJoin(fa.probe, fb.probe)) continue;
        const ra = bounds.get(a.id)!;
        const rb = bounds.get(b.id)!;
        /* b must come right after a along the axis, and line up across it; parts dropped onto
         * each other count as neighbours too, read from the one that starts first */
        const gap = fa.axis === "x" ? rb.l - ra.r : rb.t - ra.b;
        if (gap > (fa.axis === "x" ? JOIN_GAP_X : JOIN_GAP_Y)) continue;
        const ahead = fa.axis === "x" ? ra.l < rb.l || (ra.l === rb.l && i < j) : ra.t < rb.t || (ra.t === rb.t && i < j);
        if (gap < -2 && !ahead) continue;
        const lined = fa.axis === "x" ? share(ra.t, ra.b, rb.t, rb.b) : share(ra.l, ra.r, rb.l, rb.r);
        if (lined < 0.5) continue;
        /* nothing else may sit between them */
        const between: Rect = fa.axis === "x" ? { l: ra.r, t: Math.min(ra.t, rb.t), r: rb.l, b: Math.max(ra.b, rb.b) } : { l: Math.min(ra.l, rb.l), t: ra.b, r: Math.max(ra.r, rb.r), b: rb.t };
        if (out.some((o) => o !== a && o !== b && overlap(bounds.get(o.id)!, between))) continue;
        const merged: Group = { ...a, axis: fa.axis, items: [...a.items, ...b.items] };
        /* the run keeps the later layer so the joined parts still draw above whatever they were over */
        const at = Math.max(i, j);
        out.splice(at, 1, merged);
        out.splice(Math.min(i, j), 1);
        joined = true;
        break outer;
      }
    }
    if (!joined) return out;
  }
}

/* ---------- 2 and 3. place ---------- */

const area = (r: Rect) => Math.max(0, r.r - r.l) * Math.max(0, r.b - r.t);

/** Groups that touch each other stay together, so a badge on an icon or parts on a box move as one.
 *  Bars, FABs and dialogs never join a cluster: they have their own place and are often drawn over content. */
function clusters(groups: Group[], widths: Record<string, number>): Unit[] {
  const units: Unit[] = groups.map((g) => ({ ids: [g.id], bb: groupBounds(g, widths), kind: g.items[0].kind, checked: g.items[0].checked, probe: g.items[0] }));
  for (;;) {
    let merged = false;
    outer: for (let i = 0; i < units.length; i++) {
      if (isAnchored(units[i])) continue;
      for (let j = i + 1; j < units.length; j++) {
        if (isAnchored(units[j]) || !overlap(units[i].bb, units[j].bb)) continue;
        /* the larger member names the cluster: it is the container, the rest sits on it */
        const big = area(units[i].bb) >= area(units[j].bb) ? units[i] : units[j];
        units[i] = { ...big, ids: [...units[i].ids, ...units[j].ids], bb: union(units[i].bb, units[j].bb) };
        units.splice(j, 1);
        merged = true;
        break outer;
      }
    }
    if (!merged) return units;
  }
}

/** Units whose vertical extents overlap and that sit side by side form one row. */
function rowsOf(units: Unit[]): Unit[][] {
  const sorted = [...units].sort((a, b) => a.bb.t - b.bb.t || a.bb.l - b.bb.l);
  const out: Unit[][] = [];
  for (const u of sorted) {
    const row = out[out.length - 1];
    if (row) {
      const rt = Math.min(...row.map((r) => r.bb.t));
      const rb = Math.max(...row.map((r) => r.bb.b));
      const cy = (u.bb.t + u.bb.b) / 2;
      const rcy = (rt + rb) / 2;
      const beside = row.every((r) => r.bb.r <= u.bb.l + 2 || r.bb.l >= u.bb.r - 2);
      if (beside && ((cy >= rt && cy <= rb) || (rcy >= u.bb.t && rcy <= u.bb.b))) {
        row.push(u);
        continue;
      }
    }
    out.push([u]);
  }
  for (const r of out) r.sort((a, b) => a.bb.l - b.bb.l);
  return out;
}

/** the only fields the classifiers below read; a Unit and a bare part both satisfy it */
type Placement = { kind: string; checked?: boolean };

const isRail = (u: Placement) => u.kind === "navRail";
const isTop = (u: Placement) => u.kind === "topAppBar" || u.kind === "tabs";
const isBottomBar = (u: Placement) => u.kind === "bottomNav" || (u.kind === "box" && !!u.checked);
const isFloatingBottom = (u: Placement) => u.kind === "toolbar" || u.kind === "snackbar";
const isFab = (u: Placement) => u.kind === "fab" || u.kind === "extendedFab" || u.kind === "fabMenu";
const isOverlay = (u: Placement) => u.kind === "dialog";
/** a line of text, and the small controls that pair with one across a row */
const isLabel = (u: Placement) => u.kind === "text";
const isControl = (u: Placement) => u.kind === "switch" || u.kind === "checkbox" || u.kind === "radio" || u.kind === "iconButton";
const isAnchored = (u: Placement) => isRail(u) || isTop(u) || isBottomBar(u) || isFloatingBottom(u) || isFab(u) || isOverlay(u);

/** Whether Tidy stacks this run in the body, rather than pinning it to an edge, floating it
 *  above the bottom bar or centring it. A run takes its place from its first part, as the
 *  clusters do. Placing a part outside Tidy reads the same split, so the two cannot
 *  disagree about what shapes the body and what fills it. */
export const isBodyRun = (g: Group) => !isAnchored({ kind: g.items[0].kind, checked: g.items[0].checked });

/** where a unit sits horizontally, so tidying keeps a right-aligned part on the right.
 *  Judged from the edges, so a part already on the margin reads the same way after tidying. */
function align(bb: Rect, fr: Rect): "left" | "center" | "right" | "fill" {
  const w = bb.r - bb.l;
  if (w >= fr.r - fr.l - PHONE_MARGIN * 2 - 8) return "fill";
  const near = PHONE_MARGIN + 12;
  const left = bb.l - fr.l <= near;
  const right = fr.r - bb.r <= near;
  if (left && !right) return "left";
  if (right && !left) return "right";
  return "center";
}

/** the gap above a row, from what came before it */
function gapBefore(prev: Unit[] | null, row: Unit[]): number {
  if (!prev) return 0;
  /* two stacked runs of one family were left separate on purpose: keep them beyond the joining distance */
  if (prev.length === 1 && row.length === 1 && canJoin(prev[0].probe, row[0].probe) && connectSpecOf(prev[0].probe)?.axis === "y") return APART_GAP_Y;
  const pk = prev.length === 1 ? prev[0].kind : null;
  const k = row.length === 1 ? row[0].kind : null;
  if (pk === "text") return TIGHT_GAP;
  if (pk === "divider" || k === "divider") return TIGHT_GAP;
  if (pk && k && pk === k && LIST_KINDS.has(k)) return TIGHT_GAP;
  return ROW_GAP;
}

/** A group moved the least distance that puts it inside a screen; an edge-to-edge
 *  part sits on the left edge. A group that fits already is returned as is. */
export function pullInto(g: Group, frame: Frame, widths: Record<string, number>): Group {
  const fr = frameRect(frame);
  const bb = groupBounds(g, widths);
  let dx = bb.r > fr.r ? Math.max(fr.l - bb.l, fr.r - bb.r) : bb.l < fr.l ? fr.l - bb.l : 0;
  const dy = bb.b > fr.b ? Math.max(fr.t - bb.t, fr.b - bb.b) : bb.t < fr.t ? fr.t - bb.t : 0;
  /* a bar as wide as the screen sits on its left edge; a narrower one keeps its place */
  if (g.items.length === 1 && FULL_WIDTH.includes(g.items[0].kind) && bb.r - bb.l >= fr.r - fr.l) dx = fr.l - bb.l;
  return dx || dy ? { ...g, x: g.x + Math.round(dx), y: g.y + Math.round(dy) } : g;
}

/** A screen changing size, and everything that follows from it: the screens to its
 *  right move over with their parts so nothing overlaps, the parts of the screen
 *  take the sizes the new screen calls for, anything that fell outside is pulled
 *  back in, and the screen is laid out again by the rules above. */
export function carryFrame(groups: Group[], frame: Frame, to: Frame, frames: Frame[], widths: Record<string, number>): { frames: Frame[]; groups: Group[] } {
  const from = frameSizeOf(frame);
  const after = frameSizeOf(to);
  const owner = new Map(groups.map((g) => [g.id, frameOfGroup(g, frames, widths)?.id] as const));
  /* screens whose left edge is past the old right edge keep their distance from it */
  const shift = after.w - from.w;
  const moved = new Map(frames.filter((f) => f.id !== frame.id && f.x >= frame.x + from.w).map((f) => [f.id, shift] as const));
  const nextFrames = frames.map((f) => (f.id === to.id ? to : moved.has(f.id) ? { ...f, x: f.x + shift } : f));
  /* The navigation bar of a compact screen is the rail of an expanded one, and back: M3 has
   * no rail below 840dp and no bar above it, so a rail placed on a phone becomes a bar too.
   * Only a bar or rail standing on its own is swapped, and only the first of them: one
   * inside a hand-made group is part of that group's drawing. Other standalone rails keep their kind. */
  const expanded = isExpanded(after.w);
  const mine = groups.filter((g) => owner.get(g.id) === frame.id);
  const standsAlone = (g: Group, kind: Kind) => g.items.length === 1 && g.items[0].kind === kind;
  const navGroup = mine.find((g) => standsAlone(g, "bottomNav") || standsAlone(g, "navRail"));
  const swapNav = (g: Group, it: Item): Item => {
    if (g !== navGroup) return it;
    if (expanded && it.kind === "bottomNav") return { ...it, kind: "navRail", railExpanded: false, size: undefined, size2: after.h, radiusTop: it.radiusBottom, radiusBottom: it.radiusTop };
    if (!expanded && it.kind === "navRail") {
      const { railExpanded: _expanded, railModal: _modal, [railExpansionSide]: _side, ...bar } = it;
      return { ...bar, kind: "bottomNav", size: after.w, size2: undefined, radiusTop: it.radiusBottom, radiusBottom: it.radiusTop };
    }
    return it;
  };
  /* a rail keeps the side it stood on; one that grows out of a bar starts on the left */
  const side = navGroup && standsAlone(navGroup, "navRail") ? railSide(navGroup, frame, widths) : "left";
  const railSlots = (swap: boolean) => mine.reduce((slot, g) => {
    if (g.items.length !== 1) return slot;
    const item = swap ? swapNav(g, g.items[0]) : g.items[0];
    if (item.kind !== "navRail") return slot;
    const w = railLayoutWidth(item);
    const right = g.items[0].kind === "navRail" && railSide(g, frame, widths) === "right";
    return { total: slot.total + w, left: slot.left + (right ? 0 : w) };
  }, { total: 0, left: 0 });
  const beforeSlots = railSlots(false);
  const afterSlots = railSlots(true);
  /* parts live in the body beside the rail: their widths follow the body, and their
   * positions are measured from its left edge, on both ends of the change */
  const fromBody = { w: from.w - beforeSlots.total, h: from.h };
  const toBody = { w: after.w - afterSlots.total, h: after.h };
  const resized = groups.map((g) => {
    const o = owner.get(g.id);
    if (o === frame.id) {
      const isRail = g === navGroup && expanded;
      const items = g.items.map((it) => swapNav(g, carryItemSize(it, isRail ? from : fromBody, isRail ? after : toBody)));
      const x = isRail ? (side === "right" ? to.x + after.w - railWidth(items[0]) : to.x) : g.x + afterSlots.left - beforeSlots.left;
      return pullInto({ ...g, x, items }, to, widths);
    }
    const dx = o ? moved.get(o) : undefined;
    return dx ? { ...g, x: g.x + dx } : g;
  });
  return { frames: nextFrames, groups: tidyFrame(resized, to, nextFrames, widths) ?? resized };
}

/** Keep the expanded rail's collapsed footprint on its original edge until moved across the midpoint. */
export function railSide(g: Group, frame: Frame, widths: Record<string, number>): "left" | "right" {
  const item = g.items[0];
  const fr = frameRect(frame);
  const placed = g.items.length === 1 ? layoutOf(g, widths)[0] : undefined;
  const bb = placed ? { l: placed.x, r: placed.x + placed.w } : groupBounds(g, widths);
  const side = item[railExpansionSide];
  if (g.items.length === 1 && item.railExpanded && side) {
    const middle = side === "right" ? bb.r - RAIL_COLLAPSED_W / 2 : bb.l + RAIL_COLLAPSED_W / 2;
    return middle > (fr.l + fr.r) / 2 ? "right" : "left";
  }
  return (bb.l + bb.r) / 2 > (fr.l + fr.r) / 2 ? "right" : "left";
}

/** where a bar dropped on a screen goes: the screen's width less its rails, starting after a rail on the left */
export function barSlotOf(groups: Group[], frame: Frame, frames: Frame[], widths: Record<string, number>): { x: number; w: number } {
  const { w } = frameSizeOf(frame);
  const rails = groups.filter((g) => frameOfGroup(g, frames, widths)?.id === frame.id && g.items.length === 1 && g.items[0].kind === "navRail");
  const left = rails.filter((g) => railSide(g, frame, widths) === "left").reduce((sum, g) => sum + railLayoutWidth(g.items[0]), 0);
  return { x: frame.x + left, w: w - rails.reduce((sum, g) => sum + railLayoutWidth(g.items[0]), 0) };
}

/** The value most of a set share, within `tol`: the biggest cluster wins; `prefer` breaks a tie, else the first seen. */
function commonValue(values: number[], tol: number, prefer?: number): number | null {
  let best: { v: number; n: number } | null = null;
  for (const v of values) {
    const n = values.filter((w) => Math.abs(w - v) <= tol).length;
    if (!best || n > best.n || (n === best.n && v === prefer && best.v !== prefer)) best = { v, n };
  }
  return best && best.n >= 2 ? best.v : null;
}

/** Runs inside one unit whose left, right or top edges nearly agree move to the shared line.
 *  A run is only ever nudged by up to SNAP, so the picture stays what the author drew. */
function snapEdges(unit: Unit, groups: Map<string, Group>, widths: Record<string, number>): boolean {
  if (unit.ids.length < 2) return false;
  const runs = unit.ids.map((id) => groups.get(id)!);
  const rects = new Map(runs.map((g) => [g.id, groupBounds(g, widths)]));
  /* the container (the biggest run) sets the line; the parts on it follow */
  const container = runs.reduce((a, b) => (area(rects.get(a.id)!) >= area(rects.get(b.id)!) ? a : b));
  const others = runs.filter((g) => g !== container);
  if (!others.length) return false;
  let moved = false;
  const nudge = (g: Group, dx: number, dy: number) => {
    if (!dx && !dy) return;
    groups.set(g.id, { ...groups.get(g.id)!, x: groups.get(g.id)!.x + dx, y: groups.get(g.id)!.y + dy });
    moved = true;
  };
  const lefts = commonValue(others.map((g) => rects.get(g.id)!.l), SNAP);
  const rights = commonValue(others.map((g) => rects.get(g.id)!.r), SNAP);
  for (const g of others) {
    const r = rects.get(g.id)!;
    /* a run already on one shared line is left alone, so a left snap never turns into a right snap later */
    if (r.l === lefts || r.r === rights) continue;
    const dl = lefts === null ? Infinity : Math.abs(r.l - lefts);
    const dr = rights === null ? Infinity : Math.abs(r.r - rights);
    if (dl <= SNAP && dl <= dr) nudge(g, Math.round(lefts! - r.l), 0);
    else if (dr <= SNAP) nudge(g, Math.round(rights! - r.r), 0);
  }
  /* parts side by side that nearly share a top edge: the neighbours set the line, not the part itself */
  for (const g of others) {
    const r = groupBounds(groups.get(g.id)!, widths);
    const beside = others.filter((o) => o !== g && share(r.t, r.b, rects.get(o.id)!.t, rects.get(o.id)!.b) > 0.5).map((o) => groupBounds(groups.get(o.id)!, widths).t);
    const tops = beside.length === 1 ? beside[0] : commonValue(beside, SNAP);
    if (tops !== null && r.t !== tops && Math.abs(r.t - tops) <= SNAP) nudge(g, 0, Math.round(tops - r.t));
  }
  return moved;
}

/** Boxes on the screen whose corner radii almost agree take the common radius, and so do
 *  cards, each kind among its own. A card still on the shape scale is not touched: writing a
 *  radius into it would cut it loose from the Shape control. */
function evenCorners(groups: Map<string, Group>): boolean {
  const boxes: { g: Group; it: Item; r: number }[] = [];
  const cards: { g: Group; it: Item; r: number }[] = [];
  for (const g of groups.values())
    for (const it of g.items) {
      if (it.kind === "card" && !it.corners && it.radiusTop !== undefined) cards.push({ g, it, r: it.radiusTop });
      else if (it.kind === "box" && !it.corners && (it.radiusTop ?? 0) === (it.radiusBottom ?? 0)) boxes.push({ g, it, r: it.radiusTop ?? 0 });
    }
  let changed = false;
  const even = (list: typeof boxes, prefer: number) => {
    const common = commonValue(list.map((b) => b.r), RADIUS_SNAP, prefer);
    if (common === null) return;
    for (const { g, it, r } of list) {
      if (r === common || Math.abs(r - common) > RADIUS_SNAP) continue;
      const cur = groups.get(g.id)!;
      groups.set(g.id, { ...cur, items: cur.items.map((x) => (x.id === it.id ? (x.kind === "card" ? { ...x, radiusTop: common } : { ...x, radiusTop: common, radiusBottom: common }) : x)) });
      changed = true;
    }
  };
  even(boxes, 28);
  even(cards, scaleR(KIND_SPEC.card.radius));
  return changed;
}

/** The tidied groups of the document, or null when `frame` is already tidy. */
/** The area Tidy fills with body rows: inside the layout margins, beside the rails, between
 *  the top bars and the bottom bars. Aligning a part on the screen uses the same box, so
 *  it lands where Tidy would put it and not under a bar. */
export function bodyRect(groups: Group[], frame: Frame, frames: Frame[], widths: Record<string, number>, except: Set<string> = new Set()): Rect {
  const screen = frameRect(frame);
  /* `except` names groups being moved: a bar that is itself being aligned must not shape the body */
  const mine = groups.filter((g) => !except.has(g.id) && frameOfGroup(g, frames, widths)?.id === frame.id);
  const units = clusters(mine, widths);
  const onRight = (u: Unit) => railSide(mine.find((g) => g.id === u.ids[0])!, frame, widths) === "right";
  const rails = units.filter(isRail);
  const leftRails = rails.filter((u) => !onRight(u)).reduce((sum, u) => sum + railLayoutWidth(u.probe), 0);
  const rightRails = rails.filter(onRight).reduce((sum, u) => sum + railLayoutWidth(u.probe), 0);
  let top = screen.t;
  for (const u of units.filter(isTop)) top += u.bb.b - u.bb.t;
  let bottom = screen.b;
  for (const u of units.filter(isBottomBar)) bottom -= u.bb.b - u.bb.t;
  for (const u of units.filter(isFloatingBottom)) bottom -= PHONE_MARGIN + (u.bb.b - u.bb.t);
  /* a crowded short screen must not turn the box inside out */
  const l = screen.l + leftRails + PHONE_MARGIN;
  const t = top + PHONE_MARGIN;
  return { l, t, r: Math.max(l, screen.r - rightRails - PHONE_MARGIN), b: Math.max(t, bottom - PHONE_MARGIN) };
}

export function tidyFrame(groups: Group[], frame: Frame, frames: Frame[], widths: Record<string, number>): Group[] | null {
  const screen: Rect = frameRect(frame);
  const mineIds = new Set(groups.filter((g) => frameOfGroup(g, frames, widths)?.id === frame.id).map((g) => g.id));
  if (!mineIds.size) return null;

  /* joining rewrites the list; the other screens' groups keep their slots.
   * Locked groups are finished sections: they never join, cluster or move, but they
   * keep the room they stand in, so the rest is laid out around them. */
  const before = groups.filter((g) => mineIds.has(g.id) && !g.locked);
  const fixed = clusters(groups.filter((g) => mineIds.has(g.id) && !!g.locked), widths);
  const fixedRails = fixed.filter(isRail);
  const fixedTops = fixed.filter(isTop);
  const fixedBottoms = fixed.filter((u) => isBottomBar(u) || isFloatingBottom(u));
  const fixedFabs = fixed.filter(isFab);
  /* the bands of body height a locked section takes, which the rows flow around */
  const bands = fixed.filter((u) => !isAnchored(u)).map((u) => u.bb).sort((a, b) => a.t - b.t);
  /* a labelled switch standing on its own on a phone screen reads as a settings row: it takes
   * the content width, label left, switch right. One on a box, in a group or on a desktop
   * screen keeps its size. */
  let widened = false;
  const alone = (g: Group) => {
    const r = groupBounds(g, widths);
    /* nothing on it, and nothing beside it on the same row, which would have to share the width */
    return ![...before, ...groups.filter((o) => mineIds.has(o.id) && o.locked)].some((o) => {
      if (o === g) return false;
      const ob = groupBounds(o, widths);
      return overlap(ob, r) || share(r.t, r.b, ob.t, ob.b) > 0.5;
    });
  };
  const spanned = before.map((g) => {
    const it = g.items[0];
    if (!isPhoneFrame(frame) || g.items.length !== 1 || it.kind !== "switch" || !it.label.trim() || it.size || !alone(g)) return g;
    widened = true;
    return { ...g, items: [{ ...it, size: CONTENT_W }] };
  });
  const mine = joinRuns(spanned, widths);
  const joined = mine.length !== before.length || widened;

  const units = clusters(mine, widths);
  const target = new Map<Unit, { l: number; t: number }>();

  /* a navigation rail stands on the edge it is nearer to, left or right (a second one beside it);
   * the rest of the screen is the body between them */
  const onRight = (u: Unit) => railSide(groups.find((g) => g.id === u.ids[0]) ?? mine.find((g) => g.id === u.ids[0])!, frame, widths) === "right";
  const slotLeft = (u: Unit) => onRight(u) ? u.bb.r - railLayoutWidth(u.probe) : u.bb.l;
  const rails = units.filter(isRail).sort((a, b) => slotLeft(a) - slotLeft(b) || a.bb.t - b.bb.t);
  const leftRails = rails.filter((u) => !onRight(u));
  const rightRails = rails.filter(onRight).reverse();
  /* locked rails keep their place; the others line up outside them */
  let leftWidth = Math.max(0, ...fixedRails.filter((u) => !onRight(u)).map((u) => u.bb.r - screen.l));
  let rightWidth = Math.max(0, ...fixedRails.filter(onRight).map((u) => screen.r - u.bb.l));
  /* Only the modal rail overhangs its reserved slot; neighbours keep their layout positions. */
  leftRails.forEach((u) => {
    target.set(u, { l: screen.l + leftWidth, t: screen.t });
    leftWidth += railLayoutWidth(u.probe);
  });
  rightRails.forEach((u) => {
    /* A modal rail overlays the body, but its visible outer edge stays on the screen. */
    target.set(u, { l: screen.r - rightWidth - railWidth(u.probe), t: screen.t });
    rightWidth += railLayoutWidth(u.probe);
  });
  const fr: Rect = { ...screen, l: screen.l + leftWidth, r: screen.r - rightWidth };
  const frameW = fr.r - fr.l;
  const frameH = fr.b - fr.t;

  /* locked bars keep their place too; the others stack beyond them */
  let top = Math.max(fr.t, ...fixedTops.map((u) => u.bb.b));
  for (const u of units.filter(isTop).sort((a, b) => a.bb.t - b.bb.t)) {
    target.set(u, { l: fr.l, t: top });
    top += u.bb.b - u.bb.t;
  }
  let bottom = Math.min(fr.b, ...fixedBottoms.map((u) => u.bb.t));
  for (const u of units.filter(isBottomBar).sort((a, b) => b.bb.t - a.bb.t)) {
    bottom -= u.bb.b - u.bb.t;
    target.set(u, { l: fr.l + Math.max(0, Math.round((frameW - (u.bb.r - u.bb.l)) / 2)), t: bottom });
  }
  for (const u of units.filter(isFloatingBottom).sort((a, b) => b.bb.t - a.bb.t)) {
    const h = u.bb.b - u.bb.t;
    const w = u.bb.r - u.bb.l;
    bottom -= PHONE_MARGIN + h;
    target.set(u, { l: fr.l + Math.round((frameW - w) / 2), t: bottom });
  }
  let fabBottom = Math.min(bottom, ...fixedFabs.map((u) => u.bb.t));
  for (const u of units.filter(isFab).sort((a, b) => b.bb.t - a.bb.t)) {
    const h = u.bb.b - u.bb.t;
    const w = u.bb.r - u.bb.l;
    fabBottom -= PHONE_MARGIN + h;
    target.set(u, { l: fr.r - PHONE_MARGIN - w, t: fabBottom });
  }
  for (const u of units.filter(isOverlay)) {
    target.set(u, { l: fr.l + Math.round((frameW - (u.bb.r - u.bb.l)) / 2), t: fr.t + Math.round((frameH - (u.bb.b - u.bb.t)) / 2) });
  }

  /* everything else flows in rows between the top and bottom bars, on the layout margins;
   * rows that would not fit are left where they are rather than pushed off the screen.
   * The rows are measured first, then the whole block is placed the way the screen asks:
   * from the top, centered, against the bottom, or spread out with equal gaps. */
  const rows = rowsOf(units.filter((u) => !target.has(u)));
  const limit = bottom - PHONE_MARGIN;
  const start = top + PHONE_MARGIN;
  const laid: { row: Unit[]; y: number; rowH: number }[] = [];
  let y = start;
  let prev: Unit[] | null = null;
  for (const row of rows) {
    y += gapBefore(prev, row);
    const rowH = Math.max(...row.map((u) => u.bb.b - u.bb.t));
    /* a row that would land on a locked section goes below it instead */
    for (const band of bands) if (y < band.b + ROW_GAP && y + rowH > band.t - ROW_GAP) y = band.b + ROW_GAP;
    if (y + rowH > limit) break;
    laid.push({ row, y, rowH });
    y += rowH;
    prev = row;
  }
  const used = laid.length ? y - start : 0;
  const spare = Math.max(0, limit - start - used);
  const place = frame.place ?? "top";
  /* spreading shares all the free height equally above, between and below the rows,
   * in place of the rows' own gaps; a lone row spreads to the middle, like centering */
  const heights = laid.map((r) => r.rowH);
  /* when some rows did not fit they stay where they were, below the block, so the block
   * stays at the top rather than moving down onto them */
  const fits = laid.length === rows.length;
  /* rows flowed around a locked section stay where the flow put them: shifting the block
   * to the center or the bottom would put them back onto it */
  const spreading = fits && !bands.length && place === "spread" && laid.length > 1;
  const even = spreading ? (spare + used - heights.reduce((a, h) => a + h, 0)) / (laid.length + 1) : 0;
  const offset = !fits || bands.length ? 0 : place === "center" || (place === "spread" && laid.length <= 1) ? Math.round(spare / 2) : place === "bottom" ? spare : 0;
  let stacked = 0;
  laid.forEach(({ row, y: rowY, rowH }, index) => {
    const yy = spreading ? start + Math.round(even * (index + 1)) + stacked : rowY + offset;
    stacked += rowH;
    const inner = frameW - PHONE_MARGIN * 2;
    if (row.length === 1) {
      const u = row[0];
      const w = u.bb.r - u.bb.l;
      const a = align(u.bb, fr);
      /* a run nearly as wide as the content (a button row, a chip row) sits on the left margin,
       * so its edge lines up with the cards and lists above and below it */
      const wide = w >= inner * 0.7;
      const l = wide || a === "left" ? fr.l + PHONE_MARGIN : a === "right" ? fr.r - PHONE_MARGIN - w : fr.l + Math.round((frameW - w) / 2);
      target.set(u, { l, t: yy });
    } else if (row.length === 2 && row.some(isLabel) && row.some(isControl)) {
      /* a label with its control: the label on the left margin, the control on the right, like a settings row */
      const label = row.find(isLabel)!;
      const control = row.find(isControl)!;
      const cw = control.bb.r - control.bb.l;
      target.set(label, { l: fr.l + PHONE_MARGIN, t: yy + Math.round((rowH - (label.bb.b - label.bb.t)) / 2) });
      target.set(control, { l: fr.r - PHONE_MARGIN - cw, t: yy + Math.round((rowH - (control.bb.b - control.bb.t)) / 2) });
    } else {
      const ws = row.map((u) => u.bb.r - u.bb.l);
      const total = ws.reduce((s, w) => s + w, 0);
      /* neighbours of one family that were not joined were kept apart on purpose */
      const gaps = row.slice(1).map((u, i) => (canJoin(row[i].probe, u.probe) ? APART_GAP_X : ROW_ITEM_GAP));
      const minPacked = total + gaps.reduce((s, g) => s + g, 0);
      const span = row[row.length - 1].bb.r - row[0].bb.l;
      const spread = span >= inner * 0.7 && minPacked <= inner;
      const packed = spread ? inner : minPacked;
      const extra = spread ? (inner - minPacked) / gaps.length : 0;
      const a = spread ? "left" : align({ l: row[0].bb.l, t: 0, r: row[row.length - 1].bb.r, b: 0 }, fr);
      let x = a === "right" ? fr.r - PHONE_MARGIN - packed : a === "center" ? fr.l + (frameW - packed) / 2 : fr.l + PHONE_MARGIN;
      row.forEach((u, i) => {
        const h = u.bb.b - u.bb.t;
        target.set(u, { l: Math.round(x), t: yy + Math.round((rowH - h) / 2) });
        x += ws[i] + (gaps[i] ?? 0) + extra;
      });
    }
  });

  /* apply each unit's shift to every group it holds */
  const shift = new Map<string, { dx: number; dy: number }>();
  for (const [u, to] of target) {
    const dx = Math.round(to.l - u.bb.l);
    const dy = Math.round(to.t - u.bb.t);
    for (const id of u.ids) shift.set(id, { dx, dy });
  }
  let moved = joined;
  const placed = new Map(
    mine.map((g) => {
      const s = shift.get(g.id);
      if (!s || (s.dx === 0 && s.dy === 0)) return [g.id, g] as const;
      moved = true;
      const x = g.x + s.dx;
      return [g.id, { ...g, x, y: g.y + s.dy }] as const;
    }),
  );
  for (const u of units) if (snapEdges(u, placed, widths)) moved = true;
  if (evenCorners(placed)) moved = true;
  if (!moved) return null;
  /* keep canvas order: a joined run takes the slot of its last original member */
  const survivorOf = new Map<string, Group>();
  for (const m of mine) for (const it of m.items) survivorOf.set(it.id, m);
  const lastSlot = new Map<string, number>();
  groups.forEach((g, i) => {
    if (mineIds.has(g.id) && !g.locked) lastSlot.set(survivorOf.get(g.items[0].id)!.id, i);
  });
  const out: Group[] = [];
  groups.forEach((g, i) => {
    if (!mineIds.has(g.id)) {
      out.push(g);
      return;
    }
    /* a locked group keeps its position and its slot untouched */
    if (g.locked) {
      out.push(g);
      return;
    }
    const m = survivorOf.get(g.items[0].id)!;
    if (lastSlot.get(m.id) === i) out.push(placed.get(m.id)!);
  });
  return out;
}
