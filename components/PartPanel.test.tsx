import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeItem, PALETTES, type Item, type Kind } from "../lib/tokens";
import { EntryList } from "./PartPanel";

const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], cursor: 0 }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useRef: (current: unknown) => hooks.refs[hooks.cursor++] ?? (hooks.refs[hooks.cursor - 1] = { current }),
  useState: (initial: unknown) => [initial, vi.fn()],
}));
vi.mock("motion/react", () => ({ Reorder: { Group: "reorder-group", Item: "reorder-item" }, useDragControls: vi.fn() }));
vi.mock("@/lib/tokens", () => import("../lib/tokens"));
vi.mock("@/lib/i18n", async () => ({ ...await import("../lib/i18n"), useLang: () => "en" }));
vi.mock("./M3Node", () => ({ Icon: "icon", boxStyle: vi.fn() }));
vi.mock("./IconPicker", () => ({ IconPicker: "icon-picker" }));
vi.mock("./Inspector", () => ({ variantsOf: vi.fn() }));
vi.mock("./TapStage", () => ({ LinkStage: "link-stage", TapStage: "tap-stage" }));
vi.mock("./ui", () => ({ CornerIcon: "icon", Field: "field", IconBtn: "button", RUN_CELL: 40, Section: "section", Segmented: "segmented", Select: "select", Slider: "slider" }));

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children)];
}
const tabs = [{ icon: "home", label: "Home" }, { icon: "search", label: "Search" }, { icon: "favorite", label: "Saved" }];
function dragList(kind: Kind, selected?: number) {
  let item: Item = { ...makeItem(kind), tabs, selected, actions: { "tab:0": { to: "home", transition: "fade" }, "tab:1": { to: "search", transition: "fade" } } };
  const original = structuredClone(item);
  const render = () => {
    hooks.cursor = 0;
    return elements(EntryList({ item, onChange: (patch) => { item = { ...item, ...patch }; }, p: PALETTES[0], selectable: true }));
  };
  const group = () => render().find((e) => e.type === "reorder-group")!;
  const names = [...group().props.values as string[]];
  const row = (index: number) => render().find((e) => e.props.id === names[index] && e.props.tab)!;
  return {
    get item() { return item; }, original,
    start: (index: number) => (row(index).props.onDragStart as () => void)(),
    swap: (order: number[]) => (group().props.onReorder as (next: string[]) => void)(order.map((index) => names[index])),
    end: (index: number) => (row(index).props.onDragEnd as (e: { clientX: number; clientY: number }) => void)({ clientX: -1, clientY: -1 }),
    select: (index: number) => (render().find((e) => e.props.tab === item.tabs?.[index])?.props.onSelect as () => void)(),
  };
}

// Exercise the actual EntryList callbacks across rerenders. Browser checks cover Motion's pointer events.
describe("entry selection through a whole drag", () => {
  beforeEach(() => { hooks.refs = []; hooks.cursor = 0; });
  it.each<Kind>(["bottomNav", "navRail", "tabs"])("leaves implicit selection unset when other %s entries move", (kind) => {
    const list = dragList(kind);
    list.start(1); list.swap([0, 2, 1]); list.end(1);
    expect(list.item.selected).toBeUndefined();
    expect(list.item.selectionImplicit).toBeUndefined();
    expect(list.item.tabs?.map((t) => t.label)).toEqual(["Home", "Saved", "Search"]);
    expect(list.item.actions?.["tab:2"].to).toBe("search");
  });
  it.each<Kind>(["bottomNav", "navRail", "tabs"])("restores implicit selection after dragging a %s entry away and back", (kind) => {
    const list = dragList(kind);
    list.start(0); list.swap([1, 0, 2]);
    expect(list.item.selected).toBe(1);
    expect(list.item.selectionImplicit).toBe(true);
    list.swap([1, 2, 0]);
    expect(list.item.selected).toBe(2);
    expect(list.item.selectionImplicit).toBe(true);
    list.swap([1, 0, 2]); list.swap([0, 1, 2]); list.end(0);
    expect(list.item).toEqual(list.original);
  });
  it.each<Kind>(["bottomNav", "navRail", "tabs"])("retains the moved default and its target at the end of a %s drag", (kind) => {
    const list = dragList(kind);
    list.start(0); list.swap([1, 0, 2]); list.swap([1, 2, 0]); list.end(0);
    expect(list.item.selected).toBe(2);
    expect(list.item.selectionImplicit).toBe(true);
    expect(list.item.tabs?.[2].label).toBe("Home");
    expect(list.item.actions?.["tab:2"].to).toBe("home");
  });
  it("keeps an explicit first selection explicit after a round trip", () => {
    const list = dragList("bottomNav", 0);
    list.start(0); list.swap([1, 2, 0]); list.swap([0, 1, 2]); list.end(0);
    expect(list.item.selected).toBe(0);
    expect(list.item.selectionImplicit).toBeUndefined();
  });
  it("starts the next drag from the selection saved by the preceding drag", () => {
    const list = dragList("bottomNav");
    list.start(0); list.swap([1, 2, 0]); list.end(0);
    list.start(0); list.swap([0, 1, 2]); list.end(0);
    expect(list.item.selected).toBeUndefined();
    expect(list.item.selectionImplicit).toBeUndefined();
  });
  it("makes a moved default explicit when the author selects it", () => {
    const list = dragList("bottomNav");
    list.start(0); list.swap([1, 2, 0]); list.end(0);
    expect(list.item.selectionImplicit).toBe(true);
    list.select(2);
    expect(list.item.selected).toBe(2);
    expect(list.item.selectionImplicit).toBeUndefined();
  });
});
