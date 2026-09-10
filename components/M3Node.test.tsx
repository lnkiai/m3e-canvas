import { expect, it, vi } from "vitest";
import { GAP, PALETTES } from "../lib/tokens";
import { M3Node } from "./M3Node";

vi.mock("motion/react", () => ({ motion: { div: "div" }, useReducedMotion: () => false }));
vi.mock("@/lib/tokens", () => import("../lib/tokens"));
vi.mock("@/lib/i18n", () => ({ t: vi.fn(), useLang: () => "en" }));
vi.mock("@/lib/theme", () => ({ useTheme: () => "light" }));
vi.mock("@/lib/color", () => import("../lib/color"));
vi.mock("./Loading", () => ({ CircularProgress: "div", LinearProgress: "div", LoadingIndicator: "div" }));

it("keeps adjacent selected run rings within the gap without raising their bodies", () => {
  for (const selected of [false, true]) {
    const node = (inRun: boolean) => M3Node({
      item: { id: "row", kind: "button", label: "Row", icon: "", variant: "filled" },
      palette: PALETTES[0], widths: {}, selected, inRun,
    });
    const style = node(true).props.style;
    // Neither horizontal nor vertical neighbours may cover the ring's outer edge.
    expect(style.outlineOffset + parseFloat(style.outline)).toBeLessThanOrEqual(GAP);
    expect(style.zIndex).toBeUndefined();
    expect(node(false).props.style.outlineOffset).toBe(3);
  }
});
