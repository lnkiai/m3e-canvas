import type { Palette } from "@/lib/tokens";
import { LOGO_GLYPH, LOGO_MARK } from "./Logo";
import { Icon } from "./M3Node";

/** The app's mark as a way to somewhere else. Its shape stays; while the control around it is
 *  hovered or has keyboard focus, the layers inside give way to the icon of the place it leads
 *  to. The control is whatever carries the class `m3e-logo-hit`; the swap is in globals.css. */
export function LogoSwap({ p, icon, size = 32 }: { p: Palette; icon: string; size?: number }) {
  return (
    <span aria-hidden style={{ position: "relative", display: "block", width: size, height: size, flex: "0 0 auto" }}>
      <svg width={size} height={size} viewBox="0 0 144 144" style={{ display: "block" }}>
        <path fill={p.primary} d={LOGO_MARK} />
        <path className="m3e-logo-glyph" fill={p.onPrimary} transform="translate(72 74) scale(1.35) translate(-32 -32)" d={LOGO_GLYPH} />
      </svg>
      <span className="m3e-logo-icon" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: p.onPrimary }}>
        <Icon name={icon} size={Math.round(size * 0.56)} />
      </span>
    </span>
  );
}
