import { describe, expect, it } from "vitest";
import { checkDesign, problemLines } from "./check";
import { isProject } from "./project";

const sound = () => ({
  title: "Recipes",
  frame: "phone",
  paletteKey: "green",
  frames: [
    { id: "home", name: "Home", x: 0, y: 0, note: "Lists the saved recipes.", swipe: { left: "detail" } },
    { id: "detail", name: "Recipe", x: 492, y: 0, length: 1200 },
  ],
  groups: [
    { id: "g1", x: 0, y: 0, axis: "x", items: [{ id: "bar", kind: "topAppBar", label: "Recipes", icon: null, variant: "filled" }] },
    {
      id: "g2",
      x: 16,
      y: 112,
      axis: "y",
      items: [
        { id: "r1", kind: "listItem", label: "Tomato soup", supporting: "30 min", icon: "restaurant", variant: "filled", action: { to: "detail", transition: "slide" } },
        { id: "r2", kind: "listItem", label: "Pancakes", icon: "restaurant", variant: "filled" },
      ],
    },
    { id: "g3", x: 0, y: 788, axis: "x", items: [{ id: "nav", kind: "bottomNav", label: "", icon: null, variant: "filled", tabs: [{ icon: "home", label: "Home" }, { label: "Search" }], selected: 0, actions: { "tab:1": { to: "detail", transition: "fade" } } }] },
    { id: "g4", x: 492, y: 1000, axis: "x", items: [{ id: "back", kind: "button", label: "Back", icon: null, variant: "text", action: { to: "back", transition: "slide" } }] },
  ],
});

type Draft = ReturnType<typeof sound> & Record<string, unknown>;
/* every way the editor refuses a document, one slip at a time */
const SLIPS: [string, (d: Draft) => void, string][] = [
  ["frames is not a list", (d) => ((d as Record<string, unknown>).frames = {}), "frames"],
  ["groups is missing", (d) => delete (d as Record<string, unknown>).groups, "groups"],
  ["an unknown platform", (d) => (d.platform = "ios"), "platform"],
  ["promptOptions holds a number", (d) => (d.promptOptions = ["a", 1]), "promptOptions"],
  ["a screen without an id", (d) => delete (d.frames[0] as Record<string, unknown>).id, "frames[0].id"],
  ["a screen without a name", (d) => delete (d.frames[1] as Record<string, unknown>).name, "frames[1].name"],
  ["a screen whose x is text", (d) => ((d.frames[0] as Record<string, unknown>).x = "0"), "frames[0].x"],
  ["a screen of no width", (d) => ((d.frames[0] as Record<string, unknown>).w = 0), "frames[0].w"],
  ["a screen of negative length", (d) => ((d.frames[1] as Record<string, unknown>).length = -1), "frames[1].length"],
  ["a screen placed nowhere known", (d) => ((d.frames[0] as Record<string, unknown>).place = "middle"), "frames[0].place"],
  ["a screen whose note is a number", (d) => ((d.frames[0] as Record<string, unknown>).note = 3), "frames[0].note"],
  ["a screen that is a string", (d) => ((d.frames as unknown[])[1] = "detail"), "frames[1]"],
  ["a group without an id", (d) => delete (d.groups[0] as Record<string, unknown>).id, "groups[0].id"],
  ["a group without y", (d) => delete (d.groups[1] as Record<string, unknown>).y, "groups[1].y"],
  ["a group on axis z", (d) => ((d.groups[2] as Record<string, unknown>).axis = "z"), "groups[2].axis"],
  ["a group with no items", (d) => ((d.groups[0] as Record<string, unknown>).items = []), "groups[0].items"],
  ["a group locked with a word", (d) => ((d.groups[0] as Record<string, unknown>).locked = "yes"), "groups[0].locked"],
  ["an item without an id", (d) => delete (d.groups[1].items[0] as Record<string, unknown>).id, "groups[1].items[0].id"],
  ["an item of an unknown kind", (d) => ((d.groups[1].items[1] as Record<string, unknown>).kind = "listRow"), "groups[1].items[1].kind"],
  ["an item without a label", (d) => delete (d.groups[0].items[0] as Record<string, unknown>).label, "groups[0].items[0].label"],
  ["an item whose icon is left out", (d) => delete (d.groups[0].items[0] as Record<string, unknown>).icon, "groups[0].items[0].icon"],
  ["an item of an unknown variant", (d) => ((d.groups[0].items[0] as Record<string, unknown>).variant = "solid"), "groups[0].items[0].variant"],
  ["a supporting line that is a number", (d) => ((d.groups[1].items[0] as Record<string, unknown>).supporting = 30), "groups[1].items[0].supporting"],
  ["a size that is text", (d) => ((d.groups[3].items[0] as Record<string, unknown>).size = "380"), "groups[3].items[0].size"],
  ["a selected tab that is text", (d) => ((d.groups[2].items[0] as Record<string, unknown>).selected = "0"), "groups[2].items[0].selected"],
  ["hideOnScroll as a word", (d) => ((d.groups[2].items[0] as Record<string, unknown>).hideOnScroll = "true"), "groups[2].items[0].hideOnScroll"],
  ["a track too thick", (d) => ((d.groups[3].items[0] as Record<string, unknown>).trackThickness = 40), "groups[3].items[0].trackThickness"],
  ["an image of no size", (d) => ((d.groups[3].items[0] as Record<string, unknown>).imageSize = 0), "groups[3].items[0].imageSize"],
  ["an unknown layout", (d) => ((d.groups[3].items[0] as Record<string, unknown>).layout = "spiral"), "groups[3].items[0].layout"],
  ["corners missing one", (d) => ((d.groups[3].items[0] as Record<string, unknown>).corners = { tl: 1, tr: 1, bl: 1 }), "groups[3].items[0].corners"],
  ["tabs that are not a list", (d) => ((d.groups[2].items[0] as Record<string, unknown>).tabs = "home"), "groups[2].items[0].tabs"],
  ["a tab without a label", (d) => ((d.groups[2].items[0] as Record<string, unknown>).tabs = [{ icon: "home" }]), "groups[2].items[0].tabs[0].label"],
  ["a tab whose icon is a number", (d) => ((d.groups[2].items[0] as Record<string, unknown>).tabs = [{ icon: 1, label: "Home" }]), "groups[2].items[0].tabs[0].icon"],
  ["an item that is null", (d) => ((d.groups[1].items as unknown[])[1] = null), "groups[1].items[1]"],
];

describe("checkDesign", () => {
  it("finds nothing wrong with a sound design, which the editor opens", () => {
    expect(checkDesign(sound())).toEqual({ errors: [], warnings: [] });
    expect(isProject(sound())).toBe(true);
  });

  it.each(SLIPS)("names the field when there is %s", (_name, slip, path) => {
    const draft = sound() as Draft;
    slip(draft);
    /* the editor refuses it, and the report says where */
    expect(isProject(draft)).toBe(false);
    expect(checkDesign(draft).errors.map((e) => e.path)).toContain(path);
  });

  it("reports every slip at once, not just the first", () => {
    const draft = sound() as Draft;
    for (const [, slip] of SLIPS.slice(4, 8)) slip(draft);
    expect(checkDesign(draft).errors.length).toBeGreaterThanOrEqual(4);
  });

  it("refuses what is not an object at all", () => {
    for (const value of [null, "design", 3, []]) {
      expect(isProject(value)).toBe(false);
      expect(checkDesign(value).errors.length).toBeGreaterThan(0);
    }
  });

  it("agrees with the editor on a document with only the two lists", () => {
    expect(isProject({ frames: [], groups: [] })).toBe(true);
    const report = checkDesign({ frames: [], groups: [] });
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((w) => w.path)).toEqual(["frames"]);
  });
});

describe("checkDesign warnings", () => {
  const warningsOf = (edit: (d: Draft) => void) => {
    const draft = sound() as Draft;
    edit(draft);
    /* a warning never stands in the way: the editor still opens the document */
    expect(isProject(draft)).toBe(true);
    const report = checkDesign(draft);
    expect(report.errors).toEqual([]);
    return report.warnings;
  };

  it("an id used twice", () => {
    const warnings = warningsOf((d) => ((d.groups[3].items[0] as Record<string, unknown>).id = "bar"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].path).toBe("groups[3].items[0].id");
    expect(warnings[0].message).toContain("groups[0].items[0].id");
  });

  it("a tap that leads to no screen, with the screens there are", () => {
    const warnings = warningsOf((d) => ((d.groups[1].items[0] as { action: { to: string } }).action.to = "recipe"));
    expect(warnings.map((w) => w.path)).toEqual(["groups[1].items[0].action.to"]);
    expect(warnings[0].message).toContain('"home", "detail"');
  });

  it("leaves alone the targets the editor writes itself: back, a FAB's menu, a web address", () => {
    const warnings = warningsOf((d) => {
      (d.groups[1].items[0] as Record<string, unknown>).action = { to: "menu", transition: "none" };
      (d.groups[1].items[1] as Record<string, unknown>).action = { to: "link", transition: "none", url: "https://example.com" };
    });
    expect(warnings).toEqual([]);
  });

  it("a link with no address leads nowhere", () => {
    const warnings = warningsOf((d) => ((d.groups[1].items[1] as Record<string, unknown>).action = { to: "link", transition: "none" }));
    expect(warnings.map((w) => w.path)).toEqual(["groups[1].items[1].action.to"]);
  });

  it("a tab and a swipe that lead to no screen", () => {
    const warnings = warningsOf((d) => {
      (d.groups[2].items[0] as { actions: Record<string, { to: string }> }).actions["tab:1"].to = "search";
      (d.frames[0] as { swipe: Record<string, string> }).swipe.left = "gone";
    });
    expect(warnings.map((w) => w.path).sort()).toEqual(["frames[0].swipe.left", "groups[2].items[0].actions.tab:1.to"]);
  });

  it("a part placed as if its screen stood at the origin, off every screen", () => {
    const warnings = warningsOf((d) => {
      d.groups[3].x = 2000;
    });
    expect(warnings.map((w) => w.path)).toEqual(["groups[3]"]);
    expect(warnings[0].message).toContain("canvas coordinates");
  });

  it("a part far down a long screen is on that screen", () => {
    /* the second screen runs to 1200: y 1000 is inside it, and would be outside the first */
    expect(checkDesign(sound()).warnings).toEqual([]);
    expect(warningsOf((d) => (d.groups[3].x = 0)).map((w) => w.path)).toEqual(["groups[3]"]);
  });

  it("a document too large for a link", () => {
    const warnings = warningsOf((d) => ((d.frames[0] as Record<string, unknown>).note = "x".repeat(120_000)));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("KB");
  });

  it("does not count a picked image, which a link leaves out", () => {
    const warnings = warningsOf((d) => ((d.groups[0].items[0] as Record<string, unknown>).src = `data:image/png;base64,${"A".repeat(300_000)}`));
    expect(warnings).toEqual([]);
  });

  it("writes one line to a problem", () => {
    expect(problemLines([{ path: "frames[0].id", message: "missing" }, { path: "", message: "too large" }])).toEqual(["- frames[0].id: missing", "- too large"]);
  });
});
