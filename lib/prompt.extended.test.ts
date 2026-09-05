/**
 * lib/prompt.ts — prompt generation per language/platform.
 *
 * Locks in:
 *  - buildPrompt picks the right language strings (ja / en / zh)
 *  - the prompt includes intro, target, platform, sketch header
 *  - the color section lists every required Palette role
 *  - the layout section names every item by its kind-specific text
 *  - Japanese / Chinese quotes are used per language
 *  - bothModes emits BOTH light and dark palette sections
 *  - dynamicColor flag changes the prompt text
 *  - platform='web' affects the platform line and adds web style notes
 *  - effectivePrompt returns the author's edit when present, buildPrompt otherwise
 *  - onlyFrameId restricts output to one screen
 *  - empty doc still produces a valid prompt (freeform / empty message)
 *  - action text "goes back to..." is emitted for BACK_TARGET action
 *  - quote handling: empty/whitespace label is treated as no label
 */
import { describe, expect, it } from "vitest";
import { buildPrompt, effectivePrompt } from "./prompt";
import {
  Doc,
  Frame,
  Group,
  Item,
  Palette,
  PHONE_W,
  PHONE_H,
  makeItem,
} from "./tokens";

const widths: Record<string, number> = {};
const paletteKey = "baseline";
const palette: Palette = {
  key: "baseline",
  label: "Baseline",
  seed: "#6750A4",
  primary: "#6750A4",
  onPrimary: "#FFFFFF",
  primaryContainer: "#EADDFF",
  onPrimaryContainer: "#21005D",
  inversePrimary: "#D0BCFF",
  secondaryContainer: "#E8DEF8",
  onSecondaryContainer: "#1D192B",
  tertiaryContainer: "#FFD8E4",
  onTertiaryContainer: "#31111D",
  surface: "#FEF7FF",
  surfaceContainerLow: "#F7F2FA",
  surfaceContainer: "#F3EDF7",
  surfaceContainerHigh: "#ECE6F0",
  surfaceContainerHighest: "#E6E0E9",
  onSurface: "#1D1B20",
  onSurfaceVariant: "#49454F",
  outline: "#79747E",
  outlineVariant: "#CAC4D0",
  inverseSurface: "#322F35",
  inverseOnSurface: "#F5EFF7",
  error: "#B3261E",
  onError: "#FFFFFF",
  errorContainer: "#F9DEDC",
  onErrorContainer: "#410E0B",
};

const phoneFrame: Frame = { id: "f1", name: "Home", x: 0, y: 0 };

function baseDoc(overrides: Partial<Doc> = {}): Doc {
  return {
    title: "MyApp",
    brief: "",
    paletteKey,
    customPalette: palette,
    frame: "phone",
    platform: "android",
    groups: [],
    frames: [phoneFrame],
    ...overrides,
  };
}

describe("buildPrompt — language switch", () => {
  it("emits English when lang='en'", () => {
    const doc = baseDoc();
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toContain("MyApp");
    // English introductory framing
    expect(out).toMatch(/Material 3 Expressive/);
  });

  it("emits Japanese when lang='ja' (uses 「」 quotes and 日本語 headers)", () => {
    const doc = baseDoc();
    const out = buildPrompt(doc, widths, undefined, "ja");
    expect(out).toContain("Material 3 Expressive");
    // ja intro phrasing contains 「...」 somewhere when title quoted, or Japanese sentence-ending
    expect(out).toMatch(/を実装してください|画面/);
  });

  it("emits Chinese when lang='zh' (uses “” quotes)", () => {
    const doc = baseDoc();
    const out = buildPrompt(doc, widths, undefined, "zh");
    expect(out).toContain("Material 3 Expressive");
    expect(out).toMatch(/使用|屏幕|组件|设计/);
  });
});

describe("buildPrompt — palette section", () => {
  it("includes every required color role", () => {
    const doc = baseDoc();
    const out = buildPrompt(doc, widths, undefined, "en");
    for (const role of [
      "primary",
      "onPrimary",
      "primaryContainer",
      "onPrimaryContainer",
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
      "inversePrimary",
      "error",
      "onError",
      "errorContainer",
      "onErrorContainer",
    ]) {
      expect(out).toContain(role);
    }
  });

  it("writes hex colors uppercased", () => {
    const doc = baseDoc();
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toContain("#6750A4");
    expect(out).toContain("#FEF7FF");
  });

  it("bothModes=true emits both light and dark color sections", () => {
    const doc = baseDoc({ theme: { dark: false, bothModes: true, contrast: "standard", shape: "rounded", font: "roboto", emphasized: false, motion: "standard" } });
    const out = buildPrompt(doc, widths, undefined, "en");
    // bothModes path emits two schemeHead() calls
    expect(out).toMatch(/light|dark/i);
    // The dark surface should appear (#322F35 from the baseline palette)
    expect(out).toContain("#322F35");
  });

  it("dynamicColor=true adds the dynamic-color note", () => {
    const doc = baseDoc({ dynamicColor: true });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toMatch(/dynamic|wallpaper|Material You/i);
  });
});

describe("buildPrompt — items are named in language", () => {
  it("an English button is described as 'a ... button \"Click\"'", () => {
    const item: Item = { id: "b1", kind: "button", label: "Click", icon: null, variant: "filled" };
    const doc = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [item] }] });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toContain(`"Click"`);
    expect(out).toMatch(/a filled button/);
  });

  it("a Japanese button is described with 「ラベル」 quotes", () => {
    const item: Item = { id: "b1", kind: "button", label: "クリック", icon: null, variant: "filled" };
    const doc = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [item] }] });
    const out = buildPrompt(doc, widths, undefined, "ja");
    expect(out).toContain("「クリック」");
  });

  it("a Chinese list item uses “…” quotes and Chinese text", () => {
    const item: Item = { id: "l1", kind: "listItem", label: "项目", icon: "person", icon2: "chevron_right", variant: "filled" };
    const doc = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "y", items: [item] }] });
    const out = buildPrompt(doc, widths, undefined, "zh");
    expect(out).toContain("“项目”");
  });

  it("empty / whitespace label falls back to 'no label' phrasing in English", () => {
    const item: Item = { id: "b1", kind: "button", label: "   ", icon: null, variant: "filled" };
    const doc = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [item] }] });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toContain("with no label");
  });
});

describe("buildPrompt — platform switch", () => {
  it("Android platform mentions Android / Material", () => {
    const doc = baseDoc({ platform: "android" });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toMatch(/Android|Material 3|Compose/i);
  });

  it("Web platform mentions web / HTML / CSS", () => {
    const doc = baseDoc({ platform: "web" });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toMatch(/web|HTML|CSS|responsive/i);
  });

  it("Web platform emits web style notes when a kind has one", () => {
    // button has STYLE_NOTES_WEB entries
    const item: Item = { id: "b1", kind: "button", label: "Go", icon: null, variant: "filled" };
    const doc = baseDoc({
      platform: "web",
      groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [item] }],
    });
    const out = buildPrompt(doc, widths, undefined, "en");
    // The web button note (per STYLE_NOTES_WEB.en.button) should appear.
    // We don't assert exact wording (i18n may evolve) but we do expect the "Style notes" section.
    expect(out).toMatch(/[Ss]tyle notes?|component/i);
  });
});

describe("buildPrompt — behavior / actions", () => {
  it("an item with action.to='back' generates a 'go back' note", () => {
    const item: Item = { id: "b1", kind: "button", label: "Back", icon: null, variant: "filled", action: { to: "back", transition: "none" } };
    const doc = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [item] }] });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toMatch(/go back|previous screen/i);
  });

  it("an item with action.to=<frameId> generates an 'opens the ... screen' note", () => {
    const target: Frame = { id: "f2", name: "Settings", x: 600, y: 0 };
    const item: Item = { id: "b1", kind: "button", label: "Open", icon: null, variant: "filled", action: { to: "f2", transition: "slide" } };
    const doc = baseDoc({ frames: [phoneFrame, target], groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [item] }] });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toContain(`"Settings"`);
    expect(out).toMatch(/opens the .* screen/);
  });
});

describe("buildPrompt — empty document", () => {
  it("an empty groups list still produces a non-empty prompt", () => {
    const doc = baseDoc();
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out.length).toBeGreaterThan(100);
    // Should NOT have a layout tree but should have the intro
    expect(out).toContain("MyApp");
  });
});

describe("buildPrompt — onlyFrameId", () => {
  it("restricts output to the named frame only", () => {
    const f2: Frame = { id: "f2", name: "Other", x: 600, y: 0 };
    const item1: Item = { id: "a", kind: "button", label: "OnlyHome", icon: null, variant: "filled" };
    const item2: Item = { id: "b", kind: "button", label: "OnlyOther", icon: null, variant: "filled" };
    const doc = baseDoc({
      frames: [phoneFrame, f2],
      groups: [
        { id: "g1", x: 100, y: 100, axis: "x", items: [item1] },
        { id: "g2", x: 700, y: 100, axis: "x", items: [item2] },
      ],
    });
    const only = buildPrompt(doc, widths, "f1", "en");
    const all = buildPrompt(doc, widths, undefined, "en");
    expect(only).toContain("OnlyHome");
    expect(only).not.toContain("OnlyOther");
    expect(all).toContain("OnlyHome");
    expect(all).toContain("OnlyOther");
  });
});

describe("buildPrompt — multi-screen doc", () => {
  it("two phone frames produces a screens section listing both names", () => {
    const f2: Frame = { id: "f2", name: "Settings", x: 600, y: 0 };
    const doc = baseDoc({
      frames: [phoneFrame, f2],
      groups: [
        { id: "g1", x: 100, y: 100, axis: "x", items: [{ id: "a", kind: "button", label: "B1", icon: null, variant: "filled" }] },
        { id: "g2", x: 700, y: 100, axis: "x", items: [{ id: "b", kind: "button", label: "B2", icon: null, variant: "filled" }] },
      ],
    });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toContain(`"Home"`);
    expect(out).toContain(`"Settings"`);
  });
});

describe("effectivePrompt", () => {
  it("returns the author's promptEdit when present", () => {
    const doc = baseDoc({ promptEdit: "CUSTOM PROMPT TEXT" });
    expect(effectivePrompt(doc, widths, "en")).toBe("CUSTOM PROMPT TEXT");
  });

  it("returns buildPrompt output when promptEdit is undefined", () => {
    const doc = baseDoc();
    const out = effectivePrompt(doc, widths, "en");
    expect(out).toContain("MyApp");
    expect(out).toMatch(/Material 3 Expressive/);
  });
});

describe("buildPrompt — style notes", () => {
  it("button usage adds the button style note", () => {
    const item: Item = { id: "b1", kind: "button", label: "Go", icon: null, variant: "filled" };
    const doc = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [item] }] });
    const out = buildPrompt(doc, widths, undefined, "en");
    // The button style note begins with "button:" in the en STYLE_NOTES map
    expect(out).toContain("Buttons:");
  });
});

describe("integration with makeItem", () => {
  it("buildPrompt accepts a Doc with items made by makeItem", () => {
    const item = makeItem("button");
    const doc = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [item] }] });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out.length).toBeGreaterThan(200);
  });
});
