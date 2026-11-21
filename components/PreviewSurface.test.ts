import { describe, expect, it, vi } from "vitest";
import { liveLook } from "./PreviewSurface";
import { makeItem, sizeOf, timeInlineOf, timeLive } from "../lib/tokens";

vi.mock("@/lib/tokens", () => import("../lib/tokens"));
vi.mock("@/lib/timeLive", () => import("../lib/timeLive"));

describe("a time picker in the preview", () => {
  const state = (layout: "scroll" | "input" | "dial") => ({ h24: 7, minute: 0, field: "hour" as const, layout });

  it("stays a dialog when a dial left with an old inline setting is switched to typing", () => {
    /* the author turned Inline on for the wheels, then chose the dial: inline is still stored */
    const dial = { ...makeItem("timePicker"), layout: "dial" as const, inline: true };
    const typing = liveLook(dial, state("input"));
    expect(timeInlineOf(typing)).toBe(false);
    expect(sizeOf(typing, {})).toEqual({ w: 304, h: 200 });
  });

  it("keeps an inline picker inline", () => {
    const wheels = { ...makeItem("timePicker"), layout: "scroll" as const, inline: true, size: 328 };
    expect(timeInlineOf(liveLook(wheels, state("input")))).toBe(true);
  });

  it("remembers which wheels or dial the mode switch goes back to", () => {
    expect(liveLook({ ...makeItem("timePicker"), layout: "scroll" as const }, state("input"))[timeLive]?.back).toBe("scroll");
    expect(liveLook({ ...makeItem("timePicker"), layout: "dial" as const }, state("input"))[timeLive]?.back).toBe("dial");
  });
});
