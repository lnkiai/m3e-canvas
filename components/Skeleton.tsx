import { Logo } from "@/components/Logo";

/* The editor before the editor: the same shell drawn with nothing in it. It is static markup,
 * so the browser paints it from the first HTML before any script runs, and it fades away once
 * the editor has read the document and stands under it. Every measure here is the editor's own,
 * so the real panels land where their ghosts were: the rail, the parts panel, the canvas with
 * its pills of tools, the panel on the right. The screens themselves are not drawn: they are the
 * document's, and arrive with it. On a phone there is only the canvas and the pill. Widths saved from the last visit are read into CSS variables by a script
 * in the page head, so a closed or resized panel is drawn the way it was left. */

/** a block where something will be: rounded, faint, and breathing until it is replaced */
function Bone({ w, h, r = 8, style, fill }: { w?: number | string; h: number | string; r?: number; style?: React.CSSProperties; fill?: string }) {
  return <span className="m3e-bone" style={{ width: w ?? "100%", height: h, borderRadius: r, background: fill, ...style }} />;
}

/** a floating pill of round buttons, the way the canvas carries its tools */
function Pill({ icons, size = 40, tail, style }: { icons: number; size?: number; tail?: number; style?: React.CSSProperties }) {
  return (
    <span className="m3e-skel-pill" style={style}>
      {Array.from({ length: icons }, (_, i) => (
        <Bone key={i} w={size} h={size} r={size / 2} />
      ))}
      {tail ? <Bone w={tail} h={size} r={size / 2} fill="var(--skel-primary)" style={{ opacity: 0.9 }} /> : null}
    </span>
  );
}

/** the parts panel: its title and search, then the sections of tiles a part is dragged out from */
function PartsGhost() {
  const tiles = (n: number) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, padding: "6px 12px 14px" }}>
      {Array.from({ length: n }, (_, i) => (
        <Bone key={i} h={72} r={12} />
      ))}
    </div>
  );
  const head = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px 8px 14px" }}>
      <Bone w={18} h={18} r={5} />
      <Bone w={72} h={12} r={6} />
      <span style={{ flex: 1 }} />
      <Bone w={18} h={18} r={9} />
    </div>
  );
  return (
    <div className="m3e-skel-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 14px 8px" }}>
        <Bone w={40} h={14} r={7} />
        <span style={{ flex: 1 }} />
        <Bone w={24} h={24} r={6} />
      </div>
      <div style={{ padding: "6px 12px 10px" }}>
        <Bone h={40} r={20} />
      </div>
      {head}
      {tiles(5)}
      {head}
      {tiles(6)}
      {head}
      {tiles(4)}
    </div>
  );
}

/** the inspector: its two tabs, and the empty middle that waits for a part to be picked */
function InspectorGhost() {
  return (
    <div className="m3e-skel-panel" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "20px 20px 8px 16px" }}>
        <Bone w={56} h={40} r={20} fill="var(--skel-primary)" style={{ opacity: 0.9 }} />
        <Bone h={40} r={20} style={{ flex: 1, width: "auto" }} />
        <Bone w={24} h={24} r={6} style={{ margin: "0 10px" }} />
      </div>
      <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
        <Bone w={44} h={44} r={22} />
      </div>
    </div>
  );
}

export function Skeleton() {
  return (
    <div className="m3e-skel" aria-hidden>
      <aside className="m3e-skel-left">
        <div className="m3e-skel-rail">
          <div style={{ width: 40, height: 40, display: "grid", placeItems: "center" }}>
            <Logo size={32} color="var(--skel-primary)" />
          </div>
          {/* the way out to the projects list, then the four tabs */}
          <Bone w={44} h={44} r={14} style={{ margin: "6px 0 8px" }} />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ width: 44, height: 44, display: "grid", placeItems: "center", marginTop: 6 }}>
              <Bone w={26} h={26} r={13} />
            </div>
          ))}
          <span style={{ flex: 1 }} />
          <div style={{ width: 44, height: 44, display: "grid", placeItems: "center" }}>
            <Bone w={26} h={26} r={13} />
          </div>
          <div style={{ width: 44, height: 44, display: "grid", placeItems: "center" }}>
            <Bone w={26} h={26} r={13} />
          </div>
        </div>
        <PartsGhost />
      </aside>
      <main className="m3e-skel-main">
        <div className="m3e-skel-canvas">
          <div className="m3e-skel-tools m3e-skel-desk">
            <Pill icons={2} />
            <Pill icons={2} />
            <Pill icons={4} />
          </div>
          <div className="m3e-skel-tools m3e-skel-mobile">
            <Pill icons={5} size={42} tail={112} />
          </div>
          <span className="m3e-skel-mobile">
            <Bone w={180} h={10} r={5} style={{ position: "absolute", left: "50%", top: 84, transform: "translateX(-50%)" }} />
          </span>
          <span className="m3e-skel-desk">
            <Pill icons={0} tail={86} style={{ position: "absolute", left: 22, bottom: 22 }} />
            <Pill icons={3} style={{ position: "absolute", right: 22, bottom: 22 }} />
          </span>
          <span className="m3e-skel-mobile">
            <Bone w={56} h={56} r={18} fill="var(--skel-primary)" style={{ position: "absolute", right: 22, bottom: 22, opacity: 0.9 }} />
          </span>
        </div>
      </main>
      <aside className="m3e-skel-right">
        <InspectorGhost />
      </aside>
    </div>
  );
}
