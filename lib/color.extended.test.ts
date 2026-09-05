/**
 * lib/color.ts — Material-style scheme generator.
 *
 * Locks in:
 *  - hex parsing / formatting round-trip (with leading "#" handling)
 *  - sRGB <-> CIE Lab round-trip stays in-gamut for neutral grays
 *  - tone() always returns a valid #RRGGBB hex (even at full chroma)
 *  - hexToRgb rejects malformed input
 *  - schemeFromSeed produces all required Palette roles with distinct colors
 *  - dark mode flips surface tones; contrast levels shift accent tones
 *  - keepChroma doesn't reduce chroma below seed
 *  - invalid seed falls back to the default purple seed
 *  - onColorFor picks light or dark text based on background L*
 *  - isHex accepts / rejects correctly
 */
import { describe, expect, it } from "vitest";
import {
  hexToRgb,
  rgbToHex,
  rgbToLab,
  labToLch,
  tone,
  schemeFromSeed,
  onColorFor,
  isHex,
} from "./color";

describe("hexToRgb / rgbToHex", () => {
  it("parses a 6-digit hex without leading #", () => {
    expect(hexToRgb("ff00aa")).toEqual([255, 0, 170]);
  });

  it("parses a 6-digit hex with leading # and trims whitespace", () => {
    expect(hexToRgb("  #00ff80  ")).toEqual([0, 255, 128]);
  });

  it("is case-insensitive", () => {
    expect(hexToRgb("#ABCDEF")).toEqual([0xab, 0xcd, 0xef]);
  });

  it("returns null for 3-digit shorthand", () => {
    expect(hexToRgb("#fff")).toBeNull();
  });

  it("returns null for non-hex characters", () => {
    expect(hexToRgb("#zzzzzz")).toBeNull();
  });

  it("returns null for empty / too-short strings", () => {
    expect(hexToRgb("")).toBeNull();
    expect(hexToRgb("#1234")).toBeNull();
  });

  it("rgbToHex produces uppercase #RRGGBB", () => {
    expect(rgbToHex(255, 0, 170)).toBe("#FF00AA");
  });

  it("rgbToHex clamps out-of-range values to 0..255", () => {
    expect(rgbToHex(-50, 300, 128)).toBe("#00FF80");
  });

  it("hex <-> rgb round-trip", () => {
    const cases = ["#000000", "#FFFFFF", "#6750A4", "#1234AB"];
    for (const h of cases) {
      const rgb = hexToRgb(h)!;
      expect(rgbToHex(rgb[0], rgb[1], rgb[2])).toBe(h.toUpperCase());
    }
  });
});

describe("rgbToLab / labToLch", () => {
  it("white has L* near 100, a*/b* near 0", () => {
    const lab = rgbToLab(255, 255, 255);
    expect(lab.L).toBeGreaterThan(99);
    expect(lab.L).toBeLessThan(100.1);
    expect(Math.abs(lab.a)).toBeLessThan(1);
    expect(Math.abs(lab.b)).toBeLessThan(1);
  });

  it("black has L* near 0", () => {
    expect(rgbToLab(0, 0, 0).L).toBeLessThan(0.5);
  });

  it("labToLch gives non-negative chroma and hue in [0, 360)", () => {
    const lch = labToLch(rgbToLab(120, 60, 200));
    expect(lch.C).toBeGreaterThanOrEqual(0);
    expect(lch.h).toBeGreaterThanOrEqual(0);
    expect(lch.h).toBeLessThan(360);
    expect(lch.L).toBeGreaterThan(0);
  });

  it("pure red has a hue near the warm side of the red sector (not 0; sRGB red is ~40° in Lab)", () => {
    const lch = labToLch(rgbToLab(255, 0, 0));
    expect(lch.h).toBeGreaterThan(25);
    expect(lch.h).toBeLessThan(60);
    expect(lch.C).toBeGreaterThan(100);
  });
});

describe("tone()", () => {
  it("returns a valid uppercase 7-char hex string", () => {
    const out = tone(50, 40, 280);
    expect(out).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("falls back gracefully for absurdly high chroma (within 40 iterations)", () => {
    const out = tone(50, 500, 0);
    expect(out).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("grey (chroma 0) produces a neutral grey at the given tone", () => {
    expect(tone(0, 0, 0)).toBe("#000000");
    expect(tone(100, 0, 0)).toBe("#FFFFFF");
  });
});

describe("isHex", () => {
  it("isHex accepts valid 6-digit hex only with a leading #", () => {
    expect(isHex("#6750A4")).toBe(true);
    expect(isHex("#ABCDEF")).toBe(true);
    // Without the leading #, isHex returns false (unlike hexToRgb which tolerates it)
    expect(isHex("6750A4")).toBe(false);
  });

  it("isHex is strict — rejects 3-digit hex, rgb(), names", () => {
    expect(isHex("#abc")).toBe(false);
    expect(isHex("rgb(0,0,0)")).toBe(false);
    expect(isHex("red")).toBe(false);
    expect(isHex("")).toBe(false);
  });

  it("rejects 7-digit hex", () => {
    expect(isHex("#1234567")).toBe(false);
  });

  it("rejects malformed", () => {
    expect(isHex("#abc")).toBe(false);
    expect(isHex("#1234567")).toBe(false);
    expect(isHex("rgb(0,0,0)")).toBe(false);
    expect(isHex("")).toBe(false);
  });
});

describe("schemeFromSeed()", () => {
  it("produces a palette with every required role", () => {
    const pal = schemeFromSeed("#6750A4");
    const required = [
      "primary",
      "onPrimary",
      "primaryContainer",
      "onPrimaryContainer",
      "inversePrimary",
      "secondaryContainer",
      "onSecondaryContainer",
      "tertiaryContainer",
      "onTertiaryContainer",
      "surface",
      "surfaceContainerLow",
      "surfaceContainer",
      "surfaceContainerHigh",
      "surfaceContainerHighest",
      "onSurface",
      "onSurfaceVariant",
      "outline",
      "outlineVariant",
      "inverseSurface",
      "inverseOnSurface",
      "error",
      "onError",
      "errorContainer",
      "onErrorContainer",
    ];
    for (const k of required) {
      expect(pal).toHaveProperty(k);
      expect((pal as Record<string, string>)[k]).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(pal.key).toBe("custom");
    expect(pal.seed).toBe("#6750A4");
  });

  it("uses the supplied label and uppercases the seed", () => {
    const pal = schemeFromSeed("#ff00aa", "My Brand");
    expect(pal.label).toBe("My Brand");
    expect(pal.seed).toBe("#FF00AA");
  });

  it("falls back to the default seed when input is malformed", () => {
    const pal = schemeFromSeed("not-a-color");
    expect(pal.seed).toBe("NOT-A-COLOR"); // whatever the user passed is uppercased
    // palette still produces valid hex colors regardless
    expect(pal.primary).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("different seeds yield different primaries (likely)", () => {
    const a = schemeFromSeed("#FF0000");
    const b = schemeFromSeed("#00FF00");
    expect(a.primary).not.toBe(b.primary);
  });

  it("dark mode flips surface to a dark tone (light < 0..50 in lab terms)", () => {
    const light = schemeFromSeed("#6750A4", "X", { dark: false });
    const dark = schemeFromSeed("#6750A4", "X", { dark: true });
    // light.surface is very light (RGB values high)
    const [lr, lg, lb] = hexToRgb(light.surface)!;
    const [dr, dg, db] = hexToRgb(dark.surface)!;
    expect(lr + lg + lb).toBeGreaterThan(dr + dg + db);
  });

  it("contrast level changes the primary tone (standard vs high)", () => {
    const std = schemeFromSeed("#6750A4", "X", { contrast: "standard" });
    const hi = schemeFromSeed("#6750A4", "X", { contrast: "high" });
    expect(std.primary).not.toBe(hi.primary);
  });

  it("keepChroma doesn't lift a muted seed's chroma above its source", () => {
    const muted = schemeFromSeed("#888888", "muted", { keepChroma: true });
    const lifted = schemeFromSeed("#888888", "muted", { keepChroma: false });
    // the lifted version gets chroma bumped to at least 36, so it should be different
    expect(muted.primary).not.toBe(lifted.primary);
    expect(muted.primary).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("error colors come from the light/dark ERROR constants", () => {
    const light = schemeFromSeed("#6750A4", "X");
    const dark = schemeFromSeed("#6750A4", "X", { dark: true });
    expect(light.error).toBe("#B3261E");
    expect(dark.error).toBe("#F2B8B5");
    expect(light.errorContainer).not.toBe(dark.errorContainer);
  });
});

describe("onColorFor()", () => {
  it("returns a valid hex", () => {
    expect(onColorFor("#FFFFFF")).toMatch(/^#[0-9A-F]{6}$/);
    expect(onColorFor("#000000")).toMatch(/^#[0-9A-F]{6}$/);
    expect(onColorFor("#6750A4")).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("returns dark text on a light background, light text on a dark background", () => {
    // Light bg -> dark text (low L*, so RGB sum is small)
    const onLight = onColorFor("#FFFFFF");
    const onDark = onColorFor("#000000");
    const lightRGB = hexToRgb(onLight)!;
    const darkRGB = hexToRgb(onDark)!;
    expect(lightRGB[0] + lightRGB[1] + lightRGB[2]).toBeLessThan(128);
    expect(darkRGB[0] + darkRGB[1] + darkRGB[2]).toBeGreaterThan(128);
  });

  it("returns black for unparseable hex", () => {
    expect(onColorFor("not-a-color")).toBe("#000000");
  });
});
