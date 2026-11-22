import { describe, expect, it } from "vitest";
import { buttonMetrics, chipMetrics, makeItem, type Group, type Item } from "./tokens";
import { estimatedWidth, estimatedWidths, textWidth } from "./widths";

const part = (kind: Item["kind"], patch: Partial<Item> = {}): Item => ({ ...makeItem(kind), ...patch });

describe("the width of a line of text", () => {
  it("grows with what is written, and with the size it is written at", () => {
    expect(textWidth("", 16)).toBe(0);
    expect(textWidth("Import", 16)).toBeLessThan(textWidth("Import bookings", 16));
    expect(textWidth("Import", 32)).toBeCloseTo(textWidth("Import", 16) * 2);
  });

  it("gives a narrow letter less room than a wide one, and a full-width one the whole square", () => {
    expect(textWidth("illicit", 16)).toBeLessThan(textWidth("mammoth", 16));
    for (const text of ["保存", "ほぞん", "ホゾン", "저장", "下一步"]) expect(textWidth(text, 20)).toBe([...text].length * 20);
  });

  it("sets a heavier face a little wider, and counts the letter spacing once a glyph", () => {
    expect(textWidth("Settings", 16, 500)).toBeGreaterThan(textWidth("Settings", 16, 400));
    expect(textWidth("Settings", 16, 700)).toBeGreaterThan(textWidth("Settings", 16, 500));
    expect(textWidth("Settings", 16, 400, 0.5)).toBeCloseTo(textWidth("Settings", 16) + 8 * 0.5);
  });
});

describe("the width of a part that is as wide as its text", () => {
  it("is put together the way the part is: padding, icon, gap and label", () => {
    const m = buttonMetrics(40);
    const plain = part("button", { label: "Import", icon: null, size: undefined, size2: 40, variant: "filled" });
    expect(estimatedWidth(plain)).toBe(Math.ceil(m.padX * 2 + textWidth("Import", m.font, 500, 0.1)));
    /* an icon brings itself and the gap after it */
    expect(estimatedWidth({ ...plain, icon: "add" })).toBe(Math.ceil(m.padX * 2 + m.icon + m.gap + textWidth("Import", m.font, 500, 0.1)));
    /* an outline is a hairline on either side */
    expect(estimatedWidth({ ...plain, variant: "outlined" })).toBe(estimatedWidth(plain)! + 2);
    /* with no label the icon is centred, which makes the button a circle */
    expect(estimatedWidth({ ...plain, label: "", icon: "add" })).toBe(m.h);
  });

  it("pads a chip more tightly on the side its icon or its tick stands", () => {
    const m = chipMetrics(32);
    const chip = part("chip", { label: "Upcoming", icon: null, checked: false, size2: 32, variant: "filled" });
    const words = textWidth("Upcoming", m.font, 500);
    expect(estimatedWidth(chip)).toBe(Math.ceil(m.padX * 2 + words));
    expect(estimatedWidth({ ...chip, icon: "star" })).toBe(Math.ceil(m.lead + m.icon + m.gap + words + m.padX));
    expect(estimatedWidth({ ...chip, checked: true })).toBe(estimatedWidth({ ...chip, icon: "star" }));
  });

  it("follows the label of every kind the editor measures", () => {
    for (const kind of ["button", "extendedFab", "chip", "switch", "checkbox", "text", "splitButton", "radio"] as const) {
      const short = estimatedWidth(part(kind, { label: "Go", size: kind === "text" ? 16 : undefined }));
      const long = estimatedWidth(part(kind, { label: "Go to the next step", size: kind === "text" ? 16 : undefined }));
      expect(short, kind).toBeGreaterThan(0);
      expect(long, kind).toBeGreaterThan(short!);
    }
  });

  it("leaves alone what is not a matter of the text", () => {
    /* a width the author set, a kind with a width of its own, and a menu standing open */
    expect(estimatedWidth(part("button", { label: "Import", size: 200 }))).toBeUndefined();
    expect(estimatedWidth(part("switch", { label: "Offline", size: 180 }))).toBeUndefined();
    expect(estimatedWidth(part("listItem", { label: "Tomato soup" }))).toBeUndefined();
    expect(estimatedWidth(part("topAppBar", { label: "Recipes" }))).toBeUndefined();
  });

  it("answers for a whole design by the ids of its parts", () => {
    const groups = [
      { id: "g1", x: 0, y: 0, axis: "x", items: [part("chip", { id: "a", label: "All" }), part("listItem", { id: "b", label: "Row" })] },
      { id: "g2", x: 0, y: 60, axis: "y", items: [part("text", { id: "c", label: "Where to next?" })] },
    ] as unknown as Group[];
    const widths = estimatedWidths(groups);
    expect(Object.keys(widths)).toEqual(["a", "c"]);
    expect(widths.a).toBe(estimatedWidth(groups[0].items[0]));
  });
});

describe("what the estimate takes from the theme and from the label as it is set", () => {
  it("sets labels wider under the emphasized type, where the part's weight follows it", () => {
    const button = part("button", { label: "Continue", size: undefined });
    expect(estimatedWidth(button, true)).toBeGreaterThan(estimatedWidth(button)!);
    const text = part("text", { label: "Where to next?", size: 28 });
    expect(estimatedWidth(text, true)).toBeGreaterThan(estimatedWidth(text)!);
    /* a chip's label has one weight whatever the theme says */
    const chip = part("chip", { label: "Upcoming" });
    expect(estimatedWidth(chip, true)).toBe(estimatedWidth(chip));
    const groups = [{ id: "g", x: 0, y: 0, axis: "x", items: [{ ...button, id: "b" }] }] as unknown as Group[];
    expect(estimatedWidths(groups, { emphasized: true }).b).toBe(estimatedWidth(button, true));
    expect(estimatedWidths(groups, { emphasized: "yes" }).b).toBe(estimatedWidth(button));
    expect(estimatedWidths(groups).b).toBe(estimatedWidth(button));
  });

  it("counts an outlined split button's hairlines on both of its segments", () => {
    const split = part("splitButton", { label: "Send", variant: "filled" });
    expect(estimatedWidth({ ...split, variant: "outlined" })).toBe(estimatedWidth(split)! + 4);
  });

  it("reads a label the way one line of it is set", () => {
    const chip = part("chip", { label: "Past trips" });
    expect(estimatedWidth({ ...chip, label: "  Past   trips \n" })).toBe(estimatedWidth(chip));
    /* an emoji made of several code points is one glyph */
    expect(textWidth("\u{1F468}\u200D\u{1F469}\u200D\u{1F467}", 20)).toBe(20);
    expect(textWidth("\u{1F600}\u{1F600}", 20)).toBe(40);
  });
});
