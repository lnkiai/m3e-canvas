"use client";

import { Frame, GAP, Group, MEASURED, Palette, Radii, baseRadii, connectSpecOf, frameLengthOf, frameOfGroup, frameSizeOf, freeRadii, layoutOf, sizeOf, uniformRadii } from "@/lib/tokens";
import { modalRailOf } from "@/lib/rail";
import { M3Static } from "./M3Node";

/** the corners of one part in a settled connected run: outer at the ends, inner between */
const settledRadii = (axis: Group["axis"], first: boolean, last: boolean, outer: number, inner: number): Radii => {
  const s = first ? outer : inner;
  const e = last ? outer : inner;
  return axis === "x" ? { tl: s, bl: s, tr: e, br: e } : { tl: s, tr: s, bl: e, br: e };
};

/** One screen drawn at 1:1 with plain, unanimated parts and nothing of the editor around
 *  it: the picture the PNG export captures and the projects list scales down. `widths` are
 *  the measured widths when the editor has them; without them text-sized parts size themselves. */
export function FrameStatic({
  frame: f,
  groups,
  frames,
  widths,
  palette: p,
  exportId,
}: {
  frame: Frame;
  groups: Group[];
  frames: Frame[];
  widths: Record<string, number>;
  palette: Palette;
  /** marks the element for the PNG export to find */
  exportId?: string;
}) {
  const gs = groups.filter((g) => frameOfGroup(g, frames, widths)?.id === f.id);
  const { w } = frameSizeOf(f);
  const h = frameLengthOf(f);
  return (
    <div
      data-export={exportId}
      style={{
        position: "relative",
        width: w,
        height: h,
        background: p[f.bg ?? "surface"],
        overflow: "hidden",
      }}
    >
      {gs.map((g) => {
        if (g.free) {
          const corners = freeRadii(g, widths);
          return layoutOf(g, widths).map((pl) => (
            <div key={pl.item.id} style={{ position: "absolute", left: pl.x - f.x, top: pl.y - f.y, zIndex: modalRailOf(g) ? 2 : undefined }}>
              <M3Static item={pl.item} palette={p} radii={corners.get(pl.item.id)} style={MEASURED.includes(pl.item.kind) ? undefined : { width: pl.w, height: pl.h }} />
            </div>
          ));
        }
        return (
          <div
            key={g.id}
            style={{
              position: "absolute",
              left: g.x - f.x,
              top: g.y - f.y,
              zIndex: modalRailOf(g) ? 2 : undefined,
              display: "flex",
              flexDirection: g.axis === "x" ? "row" : "column",
              alignItems: g.axis === "x" ? "center" : "stretch",
              gap: GAP,
            }}
          >
            {g.items.map((it, i) => {
              const conn = connectSpecOf(it);
              const n = g.items.length;
              const radii = conn && n > 1 ? settledRadii(g.axis, i === 0, i === n - 1, conn.outer, conn.inner) : conn ? uniformRadii(conn.outer) : baseRadii(it);
              const size = sizeOf(it, widths);
              return <M3Static key={it.id} item={it} palette={p} radii={radii} style={MEASURED.includes(it.kind) ? undefined : { width: size.w, height: size.h }} />;
            })}
          </div>
        );
      })}
      {gs.some((g) => modalRailOf(g)) && <div aria-hidden style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.32)", pointerEvents: "none", zIndex: 1 }} />}
    </div>
  );
}
