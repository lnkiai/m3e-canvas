import { describe, expect, it } from "vitest";
import { makeItem } from "./tokens";
import { TimeState, dialAt, pickDial, setPeriod, startTime, stepTime, toggleMode, typeDigit } from "./timeLive";

const at = (h24: number, minute: number, field: "hour" | "minute" = "hour", fresh = true): TimeState => ({ h24, minute, field, layout: "input", fresh });

describe("a time picker set in the preview", () => {
  it("opens on the time it is now, on the hour, in its own layout", () => {
    const s = startTime({ ...makeItem("timePicker"), layout: "scroll" }, new Date(2026, 10, 22, 7, 30));
    expect(s).toMatchObject({ h24: 7, minute: 30, field: "hour", layout: "scroll" });
  });

  it("steps the wheels round the day and round the hour without carrying", () => {
    expect(stepTime(at(23, 0), "hour", 1).h24).toBe(0);
    expect(stepTime(at(0, 0), "hour", -1).h24).toBe(23);
    expect(stepTime(at(7, 59), "minute", 1)).toMatchObject({ h24: 7, minute: 0 });
  });

  it("moves the hour into the other half of the day for AM and PM", () => {
    expect(setPeriod(at(7, 0), true).h24).toBe(19);
    expect(setPeriod(at(19, 0), false).h24).toBe(7);
    expect(setPeriod(at(0, 0), true).h24).toBe(12);
  });

  it("reads the number under a point on the dial", () => {
    expect(dialAt("hour", false, 0, -100)).toBe(12);
    expect(dialAt("hour", false, 100, 0)).toBe(3);
    expect(dialAt("hour", false, 0, 100)).toBe(6);
    expect(dialAt("minute", false, -100, 0)).toBe(45);
    /* a 24-hour face: the outer circle is 0 to 11, the inner one 12 to 23 */
    expect(dialAt("hour", true, 0, -102)).toBe(0);
    expect(dialAt("hour", true, 0, -70)).toBe(12);
    expect(dialAt("hour", true, -70, 0)).toBe(21);
  });

  it("keeps the half of the day when an hour is picked on a 12-hour dial", () => {
    expect(pickDial(at(19, 0), 3, false).h24).toBe(15);
    expect(pickDial(at(7, 0), 12, false).h24).toBe(0);
    expect(pickDial(at(7, 0), 20, true).h24).toBe(20);
    expect(pickDial(at(7, 0, "minute"), 45, false)).toMatchObject({ h24: 7, minute: 45 });
  });

  it("types an hour and moves on to the minutes", () => {
    let s = typeDigit(at(7, 0), 1, false);
    expect(s).toMatchObject({ h24: 1, field: "hour" });
    s = typeDigit(s, 0, false);
    expect(s).toMatchObject({ h24: 10, field: "minute" });
    s = typeDigit(s, 4, false);
    s = typeDigit(s, 5, false);
    expect(s).toMatchObject({ h24: 10, minute: 45 });
  });

  it("finishes an hour that cannot take a second digit", () => {
    expect(typeDigit(at(7, 0), 3, false)).toMatchObject({ h24: 3, field: "minute" });
    expect(typeDigit(at(7, 0), 3, true)).toMatchObject({ h24: 3, field: "minute" });
    expect(typeDigit(typeDigit(at(7, 0), 2, true), 1, true)).toMatchObject({ h24: 21, field: "minute" });
    /* PM stays PM while the hour is typed */
    expect(typeDigit(at(19, 0), 9, false).h24).toBe(21);
  });

  it("switches between typing and the picker's own wheels or dial", () => {
    const dial = makeItem("timePicker");
    const scroll = { ...dial, layout: "scroll" as const };
    const inlineInput = { ...dial, layout: "input" as const, inline: true };
    expect(toggleMode(dial, { ...at(7, 0), layout: "dial" }).layout).toBe("input");
    expect(toggleMode(dial, at(7, 0)).layout).toBe("dial");
    expect(toggleMode(scroll, at(7, 0)).layout).toBe("scroll");
    expect(toggleMode(inlineInput, at(7, 0)).layout).toBe("scroll");
  });
});
