import { describe, expect, it } from "vitest";
import { makeItem, removeTabPatch, reorderTabsPatch, tabCountPatch, type Kind } from "./tokens";

const tabs = [
  { icon: "home", label: "Home" },
  { icon: "search", label: "Search" },
  { icon: "favorite", label: "Saved" },
];

describe("selection when entries are reordered", () => {
  it.each<Kind>(["bottomNav", "navRail", "tabs"])("keeps the implicitly selected first destination in %s", (kind) => {
    const item = { ...makeItem(kind), tabs, actions: { "tab:0": { to: "home", transition: "fade" as const } } };
    expect(item.selected).toBeUndefined();
    const before = structuredClone(item);
    const patch = reorderTabsPatch(item, [1, 2, 0]);
    expect(patch.tabs?.[patch.selected ?? 0].label).toBe("Home");
    expect(patch.actions?.[`tab:${patch.selected ?? 0}`]?.to).toBe("home");
    expect(patch.selected).toBe(2);
    expect(patch.selectionImplicit).toBe(true);
    expect(item).toEqual(before);
    const restored = reorderTabsPatch({ ...item, ...patch }, [2, 0, 1]);
    expect(restored.tabs).toEqual(tabs);
    expect(restored.selected).toBeUndefined();
    expect(restored.selectionImplicit).toBeUndefined();
  });

  it.each<Kind>(["bottomNav", "navRail", "tabs", "select"])("keeps an explicitly selected destination in %s", (kind) => {
    const patch = reorderTabsPatch({ ...makeItem(kind), tabs, selected: 1 }, [1, 2, 0]);
    expect(patch.tabs?.[patch.selected!].label).toBe("Search");
    expect(patch.selected).toBe(0);
    expect(patch.selectionImplicit).toBeUndefined();
  });

  it.each<Kind>(["select", "splitButton", "toolbar", "fabMenu", "carousel"])("does not invent a selection for %s", (kind) => {
    const patch = reorderTabsPatch({ ...makeItem(kind), tabs }, [1, 2, 0]);
    expect(patch.selected).toBeUndefined();
    expect(patch.tabs?.map((tab) => tab.label)).toEqual(["Search", "Saved", "Home"]);
  });

  it("keeps the implicit marker with its entry when another entry is removed", () => {
    const moved = { ...makeItem("bottomNav"), tabs, selected: 2, selectionImplicit: true };
    const shifted = removeTabPatch(moved, 1);
    expect(shifted.selected).toBe(1);
    expect(shifted.selectionImplicit).toBe(true);
    const first = removeTabPatch({ ...moved, ...shifted }, 0);
    expect(first.selected).toBeUndefined();
    expect(first.selectionImplicit).toBeUndefined();
    const removed = removeTabPatch(moved, 2);
    expect(removed.selectionImplicit).toBeUndefined();
    expect(removed.selected).toBeUndefined();
  });

  it.each<Kind>(["bottomNav", "navRail", "tabs"])("keeps selection implicit after removing the tracked %s entry", (kind) => {
    for (const order of [[1, 0, 2, 3], [1, 2, 3, 0]]) {
      const original = { ...makeItem(kind), tabs: [...tabs, { icon: "settings", label: "Settings" }], actions: {
        "tab:0": { to: "home", transition: "fade" as const },
        "tab:1": { to: "search", transition: "fade" as const },
        "tab:2": { to: "saved", transition: "fade" as const },
        "tab:3": { to: "settings", transition: "fade" as const },
      } };
      const moved = { ...original, ...reorderTabsPatch(original, order) };
      const patch = removeTabPatch(moved, moved.selected!);
      expect(patch.selected).toBeUndefined();
      expect(patch.selectionImplicit).toBeUndefined();
      expect(patch.tabs?.map((tab) => tab.label)).toEqual(["Search", "Saved", "Settings"]);
      expect(patch.actions).toEqual({ "tab:0": original.actions["tab:1"], "tab:1": original.actions["tab:2"], "tab:2": original.actions["tab:3"] });
    }
  });

  it.each<Kind>(["bottomNav", "navRail", "tabs"])("keeps an explicit replacement selected after removing a %s entry", (kind) => {
    const patch = removeTabPatch({ ...makeItem(kind), tabs, selected: 2 }, 2);
    expect(patch.selected).toBe(1);
    expect(patch.selectionImplicit).toBeUndefined();
  });

  it("clears the implicit marker if a count change removes its entry", () => {
    const moved = { ...makeItem("bottomNav"), tabs, selected: 2, selectionImplicit: true };
    const patch = tabCountPatch(moved, 2, tabs);
    expect(patch.selected).toBeUndefined();
    expect(patch.selectionImplicit).toBeUndefined();
  });
});
