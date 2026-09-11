import { describe, expect, it } from "vitest";
import {
  Item,
  NavLabelMode,
  defaultTabsFor,
  navBadgeKind,
  navLabelVisible,
  tabCountPatch,
} from "./tokens";

const bar = (tabs: Item["tabs"], labelMode?: NavLabelMode): Item => ({
  id: "nav",
  kind: "bottomNav",
  label: "",
  icon: null,
  variant: "filled",
  tabs,
  selected: 0,
  labelMode,
});

describe("navLabelVisible", () => {
  it("shows every label unless a mode says otherwise", () => {
    expect(navLabelVisible(undefined, false)).toBe(true);
    expect(navLabelVisible(undefined, true)).toBe(true);
    expect(navLabelVisible("always", false)).toBe(true);
    expect(navLabelVisible("selected", false)).toBe(false);
    expect(navLabelVisible("selected", true)).toBe(true);
    expect(navLabelVisible("never", false)).toBe(false);
    expect(navLabelVisible("never", true)).toBe(false);
  });
});

describe("navBadgeKind", () => {
  it("maps a missing badge to none, an empty badge to a dot, and text to a count", () => {
    expect(navBadgeKind(undefined)).toBe("none");
    expect(navBadgeKind("")).toBe("dot");
    expect(navBadgeKind("3")).toBe("count");
    expect(navBadgeKind("99+")).toBe("count");
  });
});

describe("bottomNav badge and label-mode state", () => {
  it("keeps per-tab badges when the tab count changes", () => {
    const item = bar([
      { icon: "home", label: "Home", badge: "3" },
      { icon: "search", label: "Search", badge: "" },
      { icon: "settings", label: "Settings" },
    ]);
    const kept = tabCountPatch(item, 3, defaultTabsFor("bottomNav"));
    expect(kept.tabs?.map((t) => t.badge)).toEqual(["3", "", undefined]);
    const grown = tabCountPatch(item, 4, defaultTabsFor("bottomNav"));
    expect(grown.tabs?.slice(0, 3).map((t) => t.badge)).toEqual(["3", "", undefined]);
    expect(grown.tabs?.[3].badge).toBeUndefined();
  });

  it("leaves the label mode alone when the tab count changes", () => {
    const item = bar(
      [
        { icon: "home", label: "Home" },
        { icon: "search", label: "Search" },
      ],
      "selected",
    );
    expect(tabCountPatch(item, 3, defaultTabsFor("bottomNav")).tabs).toHaveLength(3);
    expect(item.labelMode).toBe("selected");
  });
});
